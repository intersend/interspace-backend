#!/bin/bash

# Script to start local MPC development environment

echo "🚀 Starting local MPC development environment..."

# Stop any running containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.local.yml --profile local down

# Build and start all services
echo "🔨 Building and starting services..."
docker-compose -f docker-compose.local.yml --profile local up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service status
echo "📊 Service status:"
docker-compose -f docker-compose.local.yml --profile local ps

# Show logs for duo-node to verify connection
echo -e "\n📋 Duo-node logs:"
docker-compose -f docker-compose.local.yml --profile local logs duo-node --tail=20

echo -e "\n✅ Local MPC environment is ready!"
echo "   - Backend: http://localhost:3000"
echo "   - Duo-node: http://localhost:3001"
echo "   - Sigpair: http://localhost:8080"
echo "   - Database: postgresql://postgres:postgres@localhost:5432/interspace_local"
echo -e "\n📝 To view logs: docker-compose -f docker-compose.local.yml --profile local logs -f"
echo "🛑 To stop: docker-compose -f docker-compose.local.yml --profile local down"