# MPC Environment Setup Guide

This guide explains how to set up and switch between local and cloud MPC environments.

## Overview

The MPC (Multi-Party Computation) wallet system consists of three main components:
1. **Backend** - The main API server
2. **Duo-node** - Authentication proxy and MPC coordinator
3. **Sigpair** - Silence Labs Duo Server that holds P2 key shares

## Local Development Setup

### Quick Start

```bash
# Start all services locally
docker-compose -f docker-compose.local.yml --profile local up -d

# Check service health
node scripts/test-mpc-complete-flow.js

# View logs
docker-compose -f docker-compose.local.yml logs -f
```

### Service URLs
- Backend: http://localhost:3000
- Duo-node: http://localhost:3001
- Sigpair: http://localhost:8080
- Adminer (DB GUI): http://localhost:8082

### Environment Configuration

The default `.env` file is configured for local development:
```env
DUO_NODE_URL=http://localhost:3001
DUO_NODE_AUDIENCE_URL=http://localhost:3001
SILENCE_NODE_URL=http://localhost:8080
```

## Cloud Development Setup

To use cloud services instead of local:

1. Copy the cloud environment file:
```bash
cp .env.cloud .env
```

2. Update with your credentials:
```env
# Set path to your service account key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Update with actual admin token
SILENCE_ADMIN_TOKEN=your-cloud-admin-token
```

3. Restart the backend:
```bash
docker restart interspace-backend-local
```

## Switching Between Environments

### Use Local Services (Default)
```bash
# Already configured in .env
docker-compose -f docker-compose.local.yml --profile local up -d
```

### Use Cloud Services
```bash
# Copy cloud config
cp .env.cloud .env

# Only start local database and redis
docker-compose -f docker-compose.local.yml up -d postgres redis

# Start backend with cloud config
docker-compose -f docker-compose.local.yml up -d app
```

## iOS App Configuration

The iOS app is configured to:
- Use HTTP-based MPC implementation (no SDK required)
- Connect to backend at http://localhost:3000
- Automatically generate MPC wallets for new profiles

## Testing MPC Wallet Creation

1. **Create a profile in iOS app**
   - The app will automatically call the MPC generation endpoint
   - Watch the logs: `docker-compose logs -f`

2. **Check database for keyshares**
   ```bash
   node scripts/check-mpc-keyshares.js
   ```

3. **Monitor the flow**
   - Backend receives request from iOS
   - Backend calls duo-node to start key generation
   - Duo-node coordinates with sigpair
   - Keyshares are stored in database

## Troubleshooting

### Sigpair won't start
- Check logs: `docker logs interspace-sigpair-local`
- Ensure port 8080 is free
- The image may need platform emulation on M1 Macs

### Duo-node can't reach sigpair
- Ensure sigpair is running: `docker ps | grep sigpair`
- Check duo-node logs: `docker logs interspace-duo-node-local`
- Verify network connectivity between containers

### Backend can't connect to duo-node
- Check if all services are on the same network
- Verify environment variables are loaded
- Restart backend after changing .env

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│   iOS App   │─────▶│   Backend   │─────▶│  Duo-node   │─────▶│   Sigpair    │
│             │ HTTP │             │ HTTP │             │ HTTP │              │
│ (P1 share)  │      │             │      │   (Auth)    │      │  (P2 share)  │
└─────────────┘      └─────────────┘      └─────────────┘      └──────────────┘
```

## Security Notes

- The local setup uses test tokens and passwords
- Never use local configuration in production
- Cloud setup requires proper service account authentication
- Keyshares are encrypted before storage in the database