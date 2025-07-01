# MPC Architecture

## Overview

The Interspace MPC (Multi-Party Computation) wallet system uses Silence Labs SDK for secure key generation and signing operations. This document describes the architecture and communication flow.

## Components

### 1. iOS Client (Silence Labs SDK)
- Holds P1 (Party 1) key share
- Connects directly to Sigpair for MPC operations
- Uses WebSocket binary protocol for communication

### 2. Sigpair (Silence Labs Duo Server)
- Holds P2 (Party 2) key share  
- Runs on port 8080
- Handles WebSocket connections from iOS SDK
- Manages MPC protocols (key generation, signing)

### 3. Duo-Node Service
- REST API proxy for backend operations
- Handles key backup and export operations
- Communicates with Sigpair via HTTP
- Runs on port 3001

### 4. Backend Service
- Manages user profiles and MPC key mappings
- Communicates with Duo-Node via Socket.IO
- Handles authentication and authorization

## Communication Flow

### Key Generation
```
1. Backend → Returns cloud public key to iOS
2. iOS SDK → WebSocket connection to Sigpair:8080
3. iOS SDK ↔ Sigpair: MPC key generation protocol (binary messages)
4. Backend ← Webhook from Duo-Node with key details
```

### Signing
```
1. iOS SDK → WebSocket connection to Sigpair:8080
2. iOS SDK ↔ Sigpair: MPC signing protocol (binary messages)
3. iOS SDK ← Signature from completed protocol
```

### Key Backup/Export
```
1. Backend → REST API call to Duo-Node
2. Duo-Node → HTTP request to Sigpair
3. Duo-Node ← Response from Sigpair
4. Backend ← Response from Duo-Node
```

## Network Configuration

### Local Development
- iOS Simulator/Device: Use Mac's IP address (e.g., 192.168.2.77)
- Sigpair: Port 8080
- Duo-Node: Port 3001
- Backend: Port 3000

### Production
- iOS: Direct connection to Sigpair Cloud Run URL
- All services deployed on Google Cloud Run

## Key Points

1. **Direct WebSocket Connection**: iOS SDK connects directly to Sigpair, not through a proxy
2. **Binary Protocol**: The SDK handles binary WebSocket frames internally
3. **REST API Proxy**: Duo-Node acts as a REST API proxy for backend operations only
4. **Socket.IO**: Backend uses Socket.IO to communicate with Duo-Node for server-side operations

## Security Considerations

1. All MPC operations require authenticated users
2. Key shares are never exposed - P1 stays on device, P2 stays on server
3. Backup and export operations require additional authentication (2FA)
4. All communication uses secure protocols in production