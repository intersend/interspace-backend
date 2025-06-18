#!/bin/bash

# Local development helper script
# Usage: ./scripts/local-dev.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}Warning: .env.local not found${NC}"
    echo "Creating .env.local from .env.local.example..."
    cp .env.local.example .env.local
    echo -e "${GREEN}Created .env.local - Please update with your values${NC}"
fi

# Function to start local development
start_local() {
    echo -e "${GREEN}Starting local development environment...${NC}"
    
    # Check if database needs initialization
    if ! docker-compose -f docker-compose.local.yml --profile local ps | grep -q "interspace-postgres-local"; then
        echo -e "${YELLOW}First time setup detected. Database will be initialized with migrations.${NC}"
    fi
    
    # Use docker-compose.local.yml with local profile
    docker-compose -f docker-compose.local.yml --profile local up --build "$@"
}

# Function to stop local development
stop_local() {
    echo -e "${YELLOW}Stopping local development environment...${NC}"
    docker-compose -f docker-compose.local.yml --profile local down "$@"
}

# Function to view logs
logs_local() {
    docker-compose -f docker-compose.local.yml --profile local logs "$@"
}

# Function to run database migrations
migrate_local() {
    echo -e "${GREEN}Running database migrations...${NC}"
    docker-compose -f docker-compose.local.yml --profile local exec app npm run prisma:migrate
}

# Function to reset database
reset_db() {
    echo -e "${RED}Warning: This will reset your local database!${NC}"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose -f docker-compose.local.yml --profile local down -v
        echo -e "${GREEN}Database volumes removed${NC}"
    fi
}

# Main command handler
case "${1:-start}" in
    start)
        start_local "${@:2}"
        ;;
    stop)
        stop_local "${@:2}"
        ;;
    restart)
        stop_local
        start_local "${@:2}"
        ;;
    logs)
        logs_local "${@:2}"
        ;;
    migrate)
        migrate_local
        ;;
    reset-db)
        reset_db
        ;;
    shell)
        docker-compose -f docker-compose.local.yml --profile local exec app sh
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|migrate|reset-db|shell}"
        echo ""
        echo "Commands:"
        echo "  start       Start local development environment"
        echo "  stop        Stop local development environment"
        echo "  restart     Restart local development environment"
        echo "  logs        View logs (optional: service name)"
        echo "  migrate     Run database migrations"
        echo "  reset-db    Reset local database (WARNING: destroys data)"
        echo "  shell       Open shell in app container"
        exit 1
        ;;
esac