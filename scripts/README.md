# Interspace Backend - Scripts Directory

This directory contains utility scripts for local development, testing, and deployment preparation.

## 📋 Script Categories

### 🚀 Setup Scripts

#### `setup-local.sh`
Main setup script that orchestrates the complete local environment setup.
```bash
./scripts/setup-local.sh
```
- Checks prerequisites
- Creates environment configuration  
- Starts Docker services
- Sets up database
- Installs dependencies
- Runs initial tests

#### `check-prerequisites.sh`
Verifies all required tools are installed.
```bash
./scripts/check-prerequisites.sh
```
- Checks Node.js version (18+)
- Verifies Docker installation
- Checks port availability
- Lists optional tools

#### `generate-secrets.sh`
Generates secure secrets for local development.
```bash
./scripts/generate-secrets.sh
```
- Creates JWT secrets
- Generates encryption keys
- Sets secure defaults
- Updates .env file

#### `setup-database.sh`
Initializes PostgreSQL database.
```bash
./scripts/setup-database.sh
```
- Creates main database
- Creates test database
- Sets permissions
- Shows connection info

### 🧪 Testing Scripts

#### `test-deployment.sh`
Comprehensive deployment testing suite.
```bash
./scripts/test-deployment.sh
```
- Runs all test suites
- Generates test report
- Validates deployment readiness

#### `smoke-test.sh`
Quick functionality check.
```bash
./scripts/smoke-test.sh
```
- Tests basic endpoints
- Checks health status
- Validates API responses

#### `test-health-endpoints.sh`
Tests all health check endpoints.
```bash
./scripts/test-health-endpoints.sh
```
- Basic health check
- Detailed health status
- Database connectivity
- Performance metrics

#### `test-auth-flow.sh`
Tests authentication workflows.
```bash
./scripts/test-auth-flow.sh
```
- Login flows
- Token generation
- Token refresh
- Logout process

#### `test-database-operations.sh`
Tests database functionality.
```bash
./scripts/test-database-operations.sh
```
- Connection pooling
- Migration status
- Query performance
- Schema validation

#### `test-docker-build.sh`
Tests Docker build process.
```bash
./scripts/test-docker-build.sh
```
- Builds Docker image
- Tests container runtime
- Validates Dockerfile
- Security scanning

#### `load-test.sh`
Performance and load testing.
```bash
./scripts/load-test.sh
```
- Concurrent user simulation
- Response time analysis
- Throughput testing
- Stress testing (optional)

### 🛠️ Utility Scripts

#### `validate-env.sh`
Validates environment configuration.
```bash
./scripts/validate-env.sh
```
- Checks required variables
- Validates formats
- Security warnings
- Configuration tips

#### `cleanup-local.sh`
Cleans up local development environment.
```bash
./scripts/cleanup-local.sh
```
- Stops services
- Removes Docker resources
- Cleans build artifacts
- Optional git reset

#### `reset-database.sh`
Resets database to clean state.
```bash
./scripts/reset-database.sh
```
- Backs up current data (optional)
- Drops and recreates database
- Runs migrations
- Seeds test data (optional)

### 🏗️ Infrastructure Scripts

#### `migrate.sh`
Database migration script for containers.
```bash
./scripts/migrate.sh
```
- Used in Docker containers
- Applies Prisma migrations
- Validates database connection

## 📝 Script Conventions

### Exit Codes
- `0`: Success
- `1`: General failure
- `2`: Missing prerequisites
- `3`: Configuration error

### Color Coding
- 🔵 Blue: Information
- 🟡 Yellow: Warning
- 🟢 Green: Success
- 🔴 Red: Error

### Environment Variables
Scripts respect these environment variables:
- `API_BASE_URL`: Override API URL (default: http://localhost:3000)
- `NODE_ENV`: Environment mode
- `SKIP_TESTS`: Skip test execution
- `VERBOSE`: Enable verbose output

## 🔧 Creating New Scripts

### Template Structure
```bash
#!/bin/bash
set -e

# Script description

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Script Purpose${NC}"
echo "==============="

# Script logic here

if [ $SUCCESS ]; then
    echo -e "${GREEN}✅ Success message${NC}"
    exit 0
else
    echo -e "${RED}❌ Error message${NC}"
    exit 1
fi
```

### Best Practices
1. Always use `set -e` for error handling
2. Include help/usage information
3. Validate inputs and environment
4. Provide clear output messages
5. Clean up resources on exit
6. Make scripts idempotent

## 🚨 Troubleshooting

### Script Won't Execute
```bash
# Make executable
chmod +x scripts/*.sh

# Check shebang line
head -1 script-name.sh
```

### Path Issues
```bash
# Always use absolute paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
```

### Permission Denied
```bash
# Check file permissions
ls -la scripts/

# Run with explicit shell
bash scripts/script-name.sh
```

## 📚 Examples

### Running Multiple Tests
```bash
# Run all test scripts
for script in scripts/test-*.sh; do
    echo "Running $script..."
    $script || echo "Failed: $script"
done
```

### Custom Environment
```bash
# Override environment
API_BASE_URL=http://localhost:4000 ./scripts/smoke-test.sh
```

### Verbose Output
```bash
# Enable debug mode
VERBOSE=true ./scripts/setup-local.sh
```

---

These scripts are designed to make local development and testing as smooth as possible. If you encounter issues or have suggestions for new scripts, please contribute!