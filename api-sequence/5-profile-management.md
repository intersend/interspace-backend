# Profile Management

## Table of Contents
1. [Overview](#overview)
2. [Get All Profiles](#get-all-profiles)
3. [Create Profile](#create-profile)
4. [Get Profile by ID](#get-profile-by-id)
5. [Update Profile](#update-profile)
6. [Delete Profile](#delete-profile)
7. [Rotate Session Wallet](#rotate-session-wallet)
8. [Activate Profile](#activate-profile)
9. [Get Profile Accounts](#get-profile-accounts)
10. [Get Profile Balance](#get-profile-balance)

---

## Overview

The Profile Management API allows users to create and manage smart profiles within the Interspace ecosystem. Each profile represents a distinct identity with its own session wallet, apps, folders, and linked accounts.

### Key Concepts
- **Smart Profiles**: User identities with their own session wallets and settings
- **Session Wallets**: Temporary wallets used for gasless transactions
- **Development Mode**: Profiles can operate in development mode with simplified key management
- **Identity Graph**: Profiles are accessible based on the account's identity graph

### Authentication
All endpoints require authentication using `authenticateAccount` middleware and include user rate limiting.

### Base URL
```
/api/v2/profiles
```

---

## Get All Profiles

Retrieves all profiles accessible to the current account based on the identity graph.

### Request
```
GET /api/v2/profiles
Authorization: Bearer <access_token>
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "profile123",
      "name": "My Main Profile",
      "sessionWalletAddress": "0x1234...abcd",
      "isActive": true,
      "linkedAccountsCount": 3,
      "appsCount": 15,
      "foldersCount": 4,
      "isDevelopmentWallet": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "profile456",
      "name": "Work Profile",
      "sessionWalletAddress": "0x5678...efgh",
      "isActive": false,
      "linkedAccountsCount": 1,
      "appsCount": 8,
      "foldersCount": 2,
      "isDevelopmentWallet": false,
      "createdAt": "2024-01-02T00:00:00.000Z",
      "updatedAt": "2024-01-02T00:00:00.000Z"
    }
  ]
}
```

#### Notes
- Returns all profiles accessible through the account's identity graph
- Includes counts for linked accounts, apps, and folders
- Shows which profile is currently active

---

## Create Profile

Creates a new smart profile for the authenticated account.

### Request
```
POST /api/v2/profiles
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "name": "My New Profile",
  "isDevelopmentWallet": true,  // optional, defaults to true
  "clientShare": "encrypted_client_share"  // required only if isDevelopmentWallet is false
}
```

#### Validation Rules
- `name`: Required, 1-50 characters after trimming
- `isDevelopmentWallet`: Optional boolean, defaults to true
- `clientShare`: Required string when `isDevelopmentWallet` is false

### Response

#### Success (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "profile789",
    "name": "My New Profile",
    "sessionWalletAddress": "0x9abc...def0",
    "isActive": false,
    "isDevelopmentWallet": true,
    "createdAt": "2024-01-03T00:00:00.000Z",
    "updatedAt": "2024-01-03T00:00:00.000Z"
  }
}
```

#### Error Responses
- **400 Bad Request**: Validation errors
- **401 Unauthorized**: Account ID required

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/profiles ----->|                                |
  |                               |-- Get/Create User ------------>|
  |                               |-- Create SmartProfile -------->|
  |                               |-- Create SessionWallet ------->|
  |                               |-- Link to Account ------------>|
  |<-- 201 Created ---------------|                                |
```

---

## Get Profile by ID

Retrieves a specific profile by its ID.

### Request
```
GET /api/v2/profiles/:profileId
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "profile123",
    "name": "My Main Profile",
    "sessionWalletAddress": "0x1234...abcd",
    "isActive": true,
    "linkedAccountsCount": 3,
    "appsCount": 15,
    "foldersCount": 4,
    "isDevelopmentWallet": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Error Responses
- **404 Not Found**: Profile not found or not accessible
- **401 Unauthorized**: Account ID required

---

## Update Profile

Updates profile metadata (currently only the name).

### Request
```
PUT /api/v2/profiles/:profileId
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

#### Request Body
```json
{
  "name": "Updated Profile Name"  // optional
}
```

#### Validation Rules
- `name`: Optional, 1-50 characters after trimming

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "profile123",
    "name": "Updated Profile Name",
    "sessionWalletAddress": "0x1234...abcd",
    "isActive": true,
    "isDevelopmentWallet": true,
    "updatedAt": "2024-01-03T12:00:00.000Z"
  }
}
```

#### Error Responses
- **404 Not Found**: Profile not found or not accessible
- **401 Unauthorized**: Account ID required

---

## Delete Profile

Deletes a profile. Cannot delete the last remaining profile.

### Request
```
DELETE /api/v2/profiles/:profileId
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Profile deleted successfully"
}
```

#### Error Responses
- **400 Bad Request**: Cannot delete the last profile
- **404 Not Found**: Profile not found or not accessible
- **401 Unauthorized**: Account ID required

#### Important Notes
- Users must have at least one profile at all times
- Deleting a profile removes all associated apps, folders, and settings
- This action cannot be undone

---

## Rotate Session Wallet

Generates a new session wallet for the profile, replacing the existing one.

### Request
```
POST /api/v2/profiles/:profileId/rotate-wallet
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "profile123",
    "name": "My Main Profile",
    "sessionWalletAddress": "0xnew1...2345",
    "message": "Session wallet rotated successfully"
  }
}
```

#### Error Responses
- **404 Not Found**: Profile not found or not accessible
- **401 Unauthorized**: Account ID required

#### Use Cases
- Security: Rotate wallet if session key is compromised
- Privacy: Generate new wallet for enhanced privacy
- Development: Reset wallet state during testing

---

## Activate Profile

Switches the active profile for the current session. This is an alias for `/api/v2/auth/switch-profile/:profileId`.

### Request
```
POST /api/v2/profiles/:profileId/activate
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile to activate

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "activeProfile": {
      "id": "profile456",
      "name": "Work Profile",
      "sessionWalletAddress": "0x5678...efgh",
      "isActive": true
    }
  }
}
```

#### Error Responses
- **404 Not Found**: Profile not found or not accessible
- **401 Unauthorized**: Account ID required

---

## Get Profile Accounts

Retrieves all accounts linked to a specific profile. Currently returns only wallet accounts for iOS compatibility.

### Request
```
GET /api/v2/profiles/:profileId/accounts
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "account123",
      "userId": "user456",
      "profileId": "profile123",
      "address": "0x1234...abcd",
      "authStrategy": "wallet",
      "walletType": "metamask",
      "customName": "My MetaMask",
      "isPrimary": true,
      "isActive": true,
      "chainId": 1,
      "metadata": {
        "walletType": "metamask",
        "customName": "My MetaMask"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Notes
- Currently filters to only return wallet accounts
- Format is compatible with iOS LinkedAccount model
- Includes wallet metadata and primary status

---

## Get Profile Balance

Retrieves the unified balance for a profile across multiple chains. This endpoint delegates to the Orby service.

### Request
```
GET /api/v2/profiles/:profileId/balance
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "totalBalanceUSD": 1234.56,
    "balances": [
      {
        "chainId": 1,
        "chainName": "Ethereum",
        "nativeBalance": "1.5",
        "nativeBalanceUSD": 3000.00,
        "tokens": [
          {
            "symbol": "USDC",
            "balance": "1000",
            "balanceUSD": 1000.00,
            "decimals": 6
          }
        ]
      }
    ]
  }
}
```

#### Notes
- Aggregates balances across all linked wallets
- Includes native token and ERC-20 token balances
- Provides USD values when available

---

## Common Response Structure

### Success Response
All successful responses follow this structure:
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "message": "Optional success message"
}
```

### Error Response
All error responses follow this structure:
```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "errors": [ /* Optional validation errors array */ ]
}
```

---

## Security & Access Control

1. **Authentication**: All endpoints require valid access token
2. **Profile Access**: Based on identity graph traversal
3. **Account Ownership**: Profiles are accessible to all linked accounts
4. **Minimum Profile Rule**: Users must maintain at least one profile
5. **Development Mode**: Simplified key management for development profiles

---

## Rate Limiting

All endpoints use the standard user rate limit configuration:
- Authenticated users: Standard rate limits based on user tier
- Profile operations are considered standard operations (not high-risk)