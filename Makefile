# Makefile for Interspace Backend
.PHONY: help start stop restart logs migrate test build clean

# Default target
help:
	@echo "Interspace Backend - Make Commands"
	@echo ""
	@echo "Local Development:"
	@echo "  make start          - Start local development environment"
	@echo "  make stop           - Stop local development environment"
	@echo "  make restart        - Restart local development environment"
	@echo "  make logs           - View application logs"
	@echo "  make migrate        - Run database migrations"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Start development server (no Docker)"
	@echo "  make test           - Run all tests"
	@echo "  make lint           - Run linter"
	@echo "  make typecheck      - Run TypeScript type checking"
	@echo ""
	@echo "Production:"
	@echo "  make build          - Build production image"
	@echo "  make prod           - Start production environment"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean          - Clean up containers and volumes"
	@echo "  make shell          - Open shell in app container"
	@echo "  make db-shell       - Open PostgreSQL shell"

# Local development with Docker
start:
	@./scripts/local-dev.sh start

stop:
	@./scripts/local-dev.sh stop

restart:
	@./scripts/local-dev.sh restart

logs:
	@./scripts/local-dev.sh logs -f

migrate:
	@./scripts/local-dev.sh migrate

shell:
	@./scripts/local-dev.sh shell

# Development without Docker
dev:
	npm run dev

test:
	npm test

lint:
	npm run lint

typecheck:
	npm run typecheck

# Production
build:
	docker-compose build app

prod:
	docker-compose up -d

# Database utilities
db-shell:
	docker-compose -f docker-compose.local.yml --profile local exec postgres psql -U postgres -d interspace_local

# Cleanup
clean:
	docker-compose -f docker-compose.local.yml --profile local down -v
	docker-compose -f docker-compose.dev.yml down -v
	docker-compose down -v

# Quick setup for new developers
setup:
	@echo "Setting up local development environment..."
	@[ -f .env.local ] || cp .env.local.example .env.local
	@echo "Environment file created. Starting services..."
	@make start