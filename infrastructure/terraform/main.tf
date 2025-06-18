# Terraform configuration for Interspace Backend Infrastructure
# This file defines the GCP resources needed for the application

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# Variables
variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Environment (dev or prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be either 'dev' or 'prod'."
  }
}

# Providers
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Data sources
data "google_project" "project" {
  project_id = var.project_id
}

# Local values
locals {
  environment_suffix = var.environment == "prod" ? "prod" : "dev"
  db_tier           = var.environment == "prod" ? "db-g1-small" : "db-f1-micro"
  min_instances     = var.environment == "prod" ? 1 : 0
  max_instances     = var.environment == "prod" ? 100 : 5
  cpu_limit         = var.environment == "prod" ? "2" : "1"
  memory_limit      = var.environment == "prod" ? "2Gi" : "1Gi"
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com"
  ])

  service = each.value
  project = var.project_id

  disable_on_destroy = false
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "interspace-vpc"
  auto_create_subnetworks = false
  mtu                     = 1460

  depends_on = [google_project_service.required_apis]
}

# Subnet
resource "google_compute_subnetwork" "subnet" {
  name          = "interspace-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id

  private_ip_google_access = true
}

# VPC Connector for Cloud Run
resource "google_vpc_access_connector" "connector" {
  provider = google-beta
  
  name          = "interspace-connector"
  region        = var.region
  ip_cidr_range = "10.1.0.0/28"
  network       = google_compute_network.vpc.name

  min_instances = 2
  max_instances = 10

  depends_on = [google_project_service.required_apis]
}

# Reserve IP for Cloud SQL
resource "google_compute_global_address" "private_ip_address" {
  name          = "interspace-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

# Private connection for Cloud SQL
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]

  depends_on = [google_project_service.required_apis]
}

# Cloud SQL Instance
resource "google_sql_database_instance" "instance" {
  name             = "interspace-${local.environment_suffix}-db"
  database_version = "POSTGRES_15"
  region           = var.region

  deletion_protection = var.environment == "prod" ? true : false

  settings {
    tier              = local.db_tier
    availability_type = var.environment == "prod" ? "ZONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.environment == "prod" ? 100 : 20

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.environment == "prod" ? 30 : 7
      }
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 4
      update_track = "stable"
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }
  }

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
    google_project_service.required_apis
  ]
}

# Database
resource "google_sql_database" "database" {
  name     = "interspace_${local.environment_suffix}"
  instance = google_sql_database_instance.instance.name
}

# Database User
resource "google_sql_user" "user" {
  name     = "interspace_${local.environment_suffix}"
  instance = google_sql_database_instance.instance.name
  password = random_password.db_password.result
}

# Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Service Accounts
resource "google_service_account" "backend_sa" {
  account_id   = "interspace-backend-${local.environment_suffix}-sa"
  display_name = "Interspace Backend ${title(var.environment)} Service Account"
}

resource "google_service_account" "migration_sa" {
  account_id   = "interspace-migration-${local.environment_suffix}-sa"
  display_name = "Interspace Migration ${title(var.environment)} Service Account"
}

# IAM bindings
resource "google_project_iam_member" "backend_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

resource "google_project_iam_member" "backend_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

resource "google_project_iam_member" "migration_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migration_sa.email}"
}

resource "google_project_iam_member" "migration_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.migration_sa.email}"
}

# Secrets
resource "google_secret_manager_secret" "secrets" {
  for_each = toset([
    "interspace-${local.environment_suffix}-database-url",
    "interspace-${local.environment_suffix}-jwt-secret",
    "interspace-${local.environment_suffix}-jwt-refresh-secret",
    "interspace-${local.environment_suffix}-encryption-secret",
    "interspace-${local.environment_suffix}-silence-admin-token",
    "interspace-${local.environment_suffix}-google-client-id",
    "interspace-${local.environment_suffix}-apple-client-id",
    "interspace-${local.environment_suffix}-orby-private-key",
    "interspace-${local.environment_suffix}-orby-public-key"
  ])

  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

# Database URL secret version
resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.secrets["interspace-${local.environment_suffix}-database-url"].id
  secret_data = "postgresql://${google_sql_user.user.name}:${google_sql_user.user.password}@/${google_sql_database.database.name}?host=/cloudsql/${google_sql_database_instance.instance.connection_name}"
}

# JWT Secret
resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.secrets["interspace-${local.environment_suffix}-jwt-secret"].id
  secret_data = random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

# JWT Refresh Secret
resource "google_secret_manager_secret_version" "jwt_refresh_secret" {
  secret      = google_secret_manager_secret.secrets["interspace-${local.environment_suffix}-jwt-refresh-secret"].id
  secret_data = random_password.jwt_refresh_secret.result
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = true
}

# Encryption Secret
resource "google_secret_manager_secret_version" "encryption_secret" {
  secret      = google_secret_manager_secret.secrets["interspace-${local.environment_suffix}-encryption-secret"].id
  secret_data = random_password.encryption_secret.result
}

resource "random_password" "encryption_secret" {
  length  = 64
  special = true
}

# Outputs
output "project_id" {
  description = "The project ID"
  value       = var.project_id
}

output "region" {
  description = "The deployment region"
  value       = var.region
}

output "database_instance_name" {
  description = "The Cloud SQL instance name"
  value       = google_sql_database_instance.instance.name
}

output "database_connection_name" {
  description = "The Cloud SQL connection name"
  value       = google_sql_database_instance.instance.connection_name
}

output "vpc_connector_name" {
  description = "The VPC connector name"
  value       = google_vpc_access_connector.connector.name
}

output "backend_service_account_email" {
  description = "The backend service account email"
  value       = google_service_account.backend_sa.email
}

output "migration_service_account_email" {
  description = "The migration service account email"
  value       = google_service_account.migration_sa.email
}