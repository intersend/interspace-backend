#!/bin/bash
#
# Monitoring Setup Script - Interspace Production
# Sets up monitoring, alerts, and dashboards for production deployment
#

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="intersend"
REGION="us-central1"
SERVICE_NAME="interspace-backend-prod"
NOTIFICATION_CHANNEL_EMAIL="${1:-alerts@interspace.fi}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create notification channel
create_notification_channel() {
    log_info "Creating notification channel for $NOTIFICATION_CHANNEL_EMAIL..."
    
    CHANNEL_JSON=$(cat <<EOF
{
  "type": "email",
  "displayName": "Interspace Alerts",
  "description": "Email notifications for Interspace production alerts",
  "labels": {
    "email_address": "$NOTIFICATION_CHANNEL_EMAIL"
  },
  "enabled": true
}
EOF
)
    
    # Create the channel and capture the ID
    CHANNEL_ID=$(gcloud alpha monitoring channels create \
        --channel-content="$CHANNEL_JSON" \
        --format="value(name)" 2>/dev/null || echo "")
    
    if [ -n "$CHANNEL_ID" ]; then
        log_success "Notification channel created: $CHANNEL_ID"
        echo "$CHANNEL_ID"
    else
        # Try to find existing channel
        CHANNEL_ID=$(gcloud alpha monitoring channels list \
            --filter="displayName:'Interspace Alerts'" \
            --format="value(name)" | head -1)
        
        if [ -n "$CHANNEL_ID" ]; then
            log_info "Using existing notification channel: $CHANNEL_ID"
            echo "$CHANNEL_ID"
        else
            log_error "Failed to create notification channel"
            return 1
        fi
    fi
}

# Create uptime check
create_uptime_check() {
    log_info "Creating uptime check..."
    
    cat > /tmp/uptime-check.yaml <<EOF
displayName: "Interspace Backend Health Check"
monitoredResource:
  type: "uptime_url"
  labels:
    project_id: "$PROJECT_ID"
    host: "$SERVICE_NAME-784862970473.uc.r.appspot.com"
httpCheck:
  path: "/health"
  port: 443
  requestMethod: GET
  useSsl: true
  validateSsl: true
period: "60s"
timeout: "10s"
selectedRegions:
  - USA
  - EUROPE
EOF
    
    if gcloud alpha monitoring uptime create \
        --config-from-file=/tmp/uptime-check.yaml; then
        log_success "Uptime check created"
    else
        log_warning "Uptime check may already exist"
    fi
    
    rm -f /tmp/uptime-check.yaml
}

# Create alert policies
create_alert_policies() {
    local CHANNEL_ID=$1
    
    log_info "Creating alert policies..."
    
    # High error rate alert
    cat > /tmp/error-rate-alert.yaml <<EOF
displayName: "High Error Rate - Interspace Backend"
conditions:
  - displayName: "Error rate > 5%"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "$SERVICE_NAME"
        AND metric.type = "run.googleapis.com/request_count"
        AND metric.labels.response_code_class != "2xx"
      comparison: COMPARISON_GT
      thresholdValue: 0.05
      duration: "60s"
      aggregations:
        - alignmentPeriod: "60s"
          perSeriesAligner: ALIGN_RATE
alertStrategy:
  notificationRateLimit:
    period: "300s"
notificationChannels:
  - "$CHANNEL_ID"
documentation:
  content: |
    The error rate for Interspace Backend has exceeded 5%.
    
    Check the logs: https://console.cloud.google.com/logs/query?project=$PROJECT_ID
    
    Common causes:
    - Database connection issues
    - Authentication failures
    - External service outages
EOF
    
    gcloud alpha monitoring policies create --policy-from-file=/tmp/error-rate-alert.yaml || true
    
    # High latency alert
    cat > /tmp/latency-alert.yaml <<EOF
displayName: "High Latency - Interspace Backend"
conditions:
  - displayName: "95th percentile latency > 2s"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "$SERVICE_NAME"
        AND metric.type = "run.googleapis.com/request_latencies"
      comparison: COMPARISON_GT
      thresholdValue: 2000
      duration: "300s"
      aggregations:
        - alignmentPeriod: "60s"
          perSeriesAligner: ALIGN_PERCENTILE_95
notificationChannels:
  - "$CHANNEL_ID"
documentation:
  content: |
    The 95th percentile latency has exceeded 2 seconds.
    
    Check performance metrics: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/metrics?project=$PROJECT_ID
EOF
    
    gcloud alpha monitoring policies create --policy-from-file=/tmp/latency-alert.yaml || true
    
    # Database connection alert
    cat > /tmp/database-alert.yaml <<EOF
displayName: "Database Connection Failure - Interspace"
conditions:
  - displayName: "Database health check failing"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "$SERVICE_NAME"
        AND metric.type = "logging.googleapis.com/user/database_health_check_failed"
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: "60s"
notificationChannels:
  - "$CHANNEL_ID"
documentation:
  content: |
    Database health checks are failing.
    
    Check database status: https://console.cloud.google.com/sql/instances?project=$PROJECT_ID
EOF
    
    gcloud alpha monitoring policies create --policy-from-file=/tmp/database-alert.yaml || true
    
    # Memory usage alert
    cat > /tmp/memory-alert.yaml <<EOF
displayName: "High Memory Usage - Interspace Backend"
conditions:
  - displayName: "Memory utilization > 90%"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_revision"
        AND resource.labels.service_name = "$SERVICE_NAME"
        AND metric.type = "run.googleapis.com/container/memory/utilizations"
      comparison: COMPARISON_GT
      thresholdValue: 0.9
      duration: "300s"
notificationChannels:
  - "$CHANNEL_ID"
EOF
    
    gcloud alpha monitoring policies create --policy-from-file=/tmp/memory-alert.yaml || true
    
    # Clean up temporary files
    rm -f /tmp/*-alert.yaml
    
    log_success "Alert policies created"
}

# Create custom dashboard
create_dashboard() {
    log_info "Creating monitoring dashboard..."
    
    cat > /tmp/dashboard.json <<EOF
{
  "displayName": "Interspace Production Dashboard",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Rate",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\\"cloud_run_revision\\" resource.labels.service_name=\\"$SERVICE_NAME\\" metric.type=\\"run.googleapis.com/request_count\\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE"
                  }
                }
              }
            }]
          }
        }
      },
      {
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Error Rate",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\\"cloud_run_revision\\" resource.labels.service_name=\\"$SERVICE_NAME\\" metric.type=\\"run.googleapis.com/request_count\\" metric.labels.response_code_class!=\\"2xx\\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_RATE"
                  }
                }
              }
            }]
          }
        }
      },
      {
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Latency (95th percentile)",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\\"cloud_run_revision\\" resource.labels.service_name=\\"$SERVICE_NAME\\" metric.type=\\"run.googleapis.com/request_latencies\\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_PERCENTILE_95"
                  }
                }
              }
            }]
          }
        }
      },
      {
        "xPos": 6,
        "yPos": 4,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Memory Utilization",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "resource.type=\\"cloud_run_revision\\" resource.labels.service_name=\\"$SERVICE_NAME\\" metric.type=\\"run.googleapis.com/container/memory/utilizations\\"",
                  "aggregation": {
                    "alignmentPeriod": "60s",
                    "perSeriesAligner": "ALIGN_MEAN"
                  }
                }
              }
            }]
          }
        }
      },
      {
        "yPos": 8,
        "width": 12,
        "height": 4,
        "widget": {
          "title": "Recent Logs",
          "logsPanel": {
            "filter": "resource.type=\\"cloud_run_revision\\" resource.labels.service_name=\\"$SERVICE_NAME\\" severity>=ERROR"
          }
        }
      }
    ]
  }
}
EOF
    
    if gcloud monitoring dashboards create --config-from-file=/tmp/dashboard.json; then
        log_success "Dashboard created"
        
        # Get dashboard URL
        DASHBOARD_ID=$(gcloud monitoring dashboards list \
            --filter="displayName:'Interspace Production Dashboard'" \
            --format="value(name)" | head -1)
        
        if [ -n "$DASHBOARD_ID" ]; then
            DASHBOARD_NAME=$(basename "$DASHBOARD_ID")
            log_info "Dashboard URL: https://console.cloud.google.com/monitoring/dashboards/custom/$DASHBOARD_NAME?project=$PROJECT_ID"
        fi
    else
        log_warning "Dashboard may already exist"
    fi
    
    rm -f /tmp/dashboard.json
}

# Create log-based metrics
create_log_metrics() {
    log_info "Creating log-based metrics..."
    
    # Authentication failure metric
    gcloud logging metrics create auth_failures \
        --description="Count of authentication failures" \
        --log-filter='
            resource.type="cloud_run_revision"
            resource.labels.service_name="'$SERVICE_NAME'"
            jsonPayload.message=~"Authentication failed"
        ' || true
    
    # Email send failure metric
    gcloud logging metrics create email_failures \
        --description="Count of email send failures" \
        --log-filter='
            resource.type="cloud_run_revision"
            resource.labels.service_name="'$SERVICE_NAME'"
            jsonPayload.message=~"Failed to send email"
        ' || true
    
    # Database error metric
    gcloud logging metrics create database_errors \
        --description="Count of database errors" \
        --log-filter='
            resource.type="cloud_run_revision"
            resource.labels.service_name="'$SERVICE_NAME'"
            jsonPayload.error=~"database|Database|CONNECTION|connection"
        ' || true
    
    log_success "Log-based metrics created"
}

# Main function
main() {
    echo "Setting up monitoring for Interspace Production"
    echo "Alert email: $NOTIFICATION_CHANNEL_EMAIL"
    echo ""
    
    # Create notification channel
    CHANNEL_ID=$(create_notification_channel)
    
    if [ -z "$CHANNEL_ID" ]; then
        log_error "Failed to create notification channel"
        exit 1
    fi
    
    # Create monitoring components
    create_uptime_check
    create_alert_policies "$CHANNEL_ID"
    create_dashboard
    create_log_metrics
    
    echo ""
    log_success "Monitoring setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Verify alerts are working by checking the notification channel"
    echo "2. Customize alert thresholds based on your requirements"
    echo "3. Add team members to the notification channel"
    echo "4. Test the uptime check is working"
    echo ""
    echo "Monitoring console: https://console.cloud.google.com/monitoring?project=$PROJECT_ID"
}

# Run main
main