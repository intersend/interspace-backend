# MPC Wallet Generation - iOS Integration Guide

## Overview

This document explains how iOS should integrate with the backend for MPC wallet generation using Silence Labs SDK.

## Architecture

- **iOS App**: Holds P1 (Party 1) key share using Silence Labs SDK
- **Duo-Node (Sigpair)**: Holds P2 (Party 2) key share
- **Backend**: Manages profile creation and MPC wallet mapping
- **MPC Structure**: 2-2 threshold signature scheme

## Flow Diagram

```
iOS App                    Backend                     Duo-Node
   |                          |                           |
   |------ Create Profile --->|                           |
   |<----- Profile Response --|                           |
   |     (needsMpcGeneration) |                           |
   |                          |                           |
   |--- /mpc/generate ------->|                           |
   |<-- Cloud Public Key -----|                           |
   |                          |                           |
   |------------ WebSocket Connection ------------------->|
   |<----------- MPC Protocol Exchange ------------------>|
   |                          |                           |
   |-- /mpc/key-generated --->|                           |
   |    (address, keyId)      |                           |
   |<---- Success ------------|                           |
```

## Implementation Steps for iOS

### 1. Profile Creation Response

When creating a profile, check the response for MPC requirements:

```json
{
  "success": true,
  "data": {
    "id": "profile123",
    "name": "My Profile",
    "sessionWalletAddress": "0x...", // Placeholder address
    "isDevelopmentWallet": false,
    "needsMpcGeneration": true,  // NEW: Indicates MPC is needed
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### 2. WebSocket Events

Join the account room to receive real-time events:

```swift
// After login, join account room
socket.emit("join_account", accountId)

// Listen for profile creation events
socket.on("profile_created") { data in
    let profileData = data["data"] as? [String: Any]
    let needsMpc = profileData["needsMpcGeneration"] as? Bool ?? false
    
    if needsMpc {
        // Trigger MPC generation flow
        startMpcGeneration(profile: profileData["profile"])
    }
}
```

### 3. MPC Generation Flow

```swift
func startMpcGeneration(profile: Profile) {
    // Step 1: Get cloud public key from backend
    let response = await api.post("/api/v2/mpc/generate", body: [
        "profileId": profile.id
    ])
    
    let cloudPublicKey = response.data.cloudPublicKey
    let duoNodeUrl = response.data.duoNodeUrl
    
    // Step 2: Initialize Silence Labs SDK
    let mpcClient = SilenceLabsSDK.initialize(
        cloudPublicKey: cloudPublicKey,
        party: .P1
    )
    
    // Step 3: Connect to duo-node WebSocket
    let duoSocket = WebSocket(url: duoNodeUrl)
    duoSocket.connect()
    
    // Step 4: Perform MPC key generation
    let keyGenResult = await mpcClient.generateKey(
        socket: duoSocket,
        profileId: profile.id
    )
    
    // Step 5: Notify backend of completion
    await api.post("/api/v2/mpc/key-generated", body: [
        "profileId": profile.id,
        "keyId": keyGenResult.keyId,
        "publicKey": keyGenResult.publicKey,
        "address": keyGenResult.address
    ])
}
```

### 4. Checking MPC Status

To check if a profile has an MPC wallet:

```swift
// Check the needsMpcGeneration flag
if profile.needsMpcGeneration {
    // Profile needs MPC wallet generation
    startMpcGeneration(profile: profile)
}

// Or check MPC status endpoint
let status = await api.get("/api/v2/mpc/\(profileId)/status")
if !status.data.hasKey {
    // Profile needs MPC wallet generation
}
```

## API Endpoints

### Generate MPC Key
```
POST /api/v2/mpc/generate
Body: {
  "profileId": "string"
}
Response: {
  "success": true,
  "data": {
    "profileId": "string",
    "cloudPublicKey": "string",
    "algorithm": "ecdsa|eddsa",
    "duoNodeUrl": "string"
  }
}
```

### Key Generation Complete
```
POST /api/v2/mpc/key-generated
Body: {
  "profileId": "string",
  "keyId": "string",
  "publicKey": "string",
  "address": "string"
}
Response: {
  "success": true,
  "data": {
    "profile": { ... }
  }
}
```

### Check MPC Status
```
GET /api/v2/mpc/:profileId/status
Response: {
  "success": true,
  "data": {
    "profileId": "string",
    "hasKey": boolean,
    "keyAlgorithm": "ecdsa|eddsa",
    "publicKey": "string",
    "createdAt": "string"
  }
}
```

## Best Practices

1. **Automatic Trigger**: Check `needsMpcGeneration` flag after profile creation
2. **WebSocket Events**: Listen for `profile_created` events for real-time updates
3. **Error Handling**: Implement retry logic for MPC generation failures
4. **User Experience**: Show progress during MPC generation (it can take 10-30 seconds)
5. **Security**: Never expose or log the P1 key share

## Error Scenarios

1. **MPC Generation Timeout**: Retry with exponential backoff
2. **Network Issues**: Store pending MPC generation and retry on reconnection
3. **Duplicate Key**: Check if profile already has MPC wallet before generating

## Testing

1. Create a profile with `developmentMode: false`
2. Verify `needsMpcGeneration: true` in response
3. Complete MPC generation flow
4. Verify profile has real MPC address (not placeholder)
5. Verify `needsMpcGeneration: false` on subsequent fetches