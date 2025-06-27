# Linked Accounts Management

## Table of Contents
1. [Overview](#overview)
2. [Link Wallet Account](#link-wallet-account)
3. [Get Profile Accounts](#get-profile-accounts)
4. [Update Linked Account](#update-linked-account)
5. [Unlink Account](#unlink-account)
6. [Search Account by Address](#search-account-by-address)
7. [Grant Token Allowance](#grant-token-allowance)
8. [Get Account Allowances](#get-account-allowances)
9. [Account Linking in Authentication](#account-linking-in-authentication)

---

## Overview

The Linked Accounts API allows users to link external wallets to their profiles, manage those connections, and grant token allowances for gasless transactions. This system works alongside the identity graph to provide flexible account management.

### Key Features
- Link multiple wallet addresses to a single profile
- Designate primary accounts
- Custom naming for easy identification
- Token allowance management for session wallets
- Signature verification for secure linking

### Authentication
All endpoints require authentication using `authenticateAccount` middleware with:
- V2 authentication adapter for backward compatibility
- Standard user rate limiting

### Base URL
```
/api/v2
```

---

## Link Wallet Account

Links an external wallet address to a profile after signature verification.

### Request
```
POST /api/v2/profiles/:profileId/accounts
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile to link the account to

#### Request Body
```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "walletType": "metamask",  // "metamask" | "walletconnect" | "coinbase" | "other"
  "customName": "My Hardware Wallet",  // optional
  "isPrimary": false,  // optional, default: false
  "chainId": 1,  // optional
  "signature": "0xabc123...",  // required in production
  "message": "Link wallet to Interspace profile..."  // required in production
}
```

#### Validation Rules
- `address`: Required, valid Ethereum address
- `walletType`: Required, must be one of the allowed values
- `customName`: Optional, max 50 characters
- `isPrimary`: Optional boolean, defaults to false
- `signature` & `message`: Required in production, optional in development

### Response

#### Success (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "account123",
    "userId": "user456",
    "profileId": "profile789",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "authStrategy": "wallet",
    "walletType": "metamask",
    "customName": "My Hardware Wallet",
    "isPrimary": false,
    "isActive": true,
    "chainId": 1,
    "metadata": {
      "linkedAt": "2024-01-01T00:00:00.000Z",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Account linked successfully",
  "requestId": "req_1234567890_abc123"
}
```

#### Error Responses
- **400 Bad Request**: Missing required fields or invalid signature
- **401 Unauthorized**: Authentication required
- **409 Conflict**: Address already linked to this profile

### Security Notes
- Production requires signature verification
- Development mode allows bypassing signature for testing
- All linking operations are audit logged

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/profiles/      |                                |
  |   :profileId/accounts ------->|                                |
  |                               |-- Verify profile ownership --->|
  |                               |-- Verify signature ----------->|
  |                               |-- Check duplicate address ---->|
  |                               |-- Create LinkedAccount ------->|
  |                               |-- Update primary if needed --->|
  |                               |-- Audit log ------------------>|
  |<-- 201 Created ---------------|                                |
```

---

## Get Profile Accounts

Retrieves all linked accounts for a specific profile.

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
      "profileId": "profile789",
      "address": "0x1234567890abcdef1234567890abcdef12345678",
      "authStrategy": "wallet",
      "walletType": "metamask",
      "customName": "My Hardware Wallet",
      "isPrimary": true,
      "isActive": true,
      "chainId": 1,
      "metadata": {
        "linkedAt": "2024-01-01T00:00:00.000Z"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "account456",
      "userId": "user456",
      "profileId": "profile789",
      "address": "0xabcdef1234567890abcdef1234567890abcdef12",
      "authStrategy": "wallet",
      "walletType": "walletconnect",
      "customName": null,
      "isPrimary": false,
      "isActive": true,
      "chainId": 1,
      "createdAt": "2024-01-02T00:00:00.000Z",
      "updatedAt": "2024-01-02T00:00:00.000Z"
    }
  ]
}
```

#### Notes
- Returns all wallet accounts linked to the profile
- Includes metadata and primary status
- Sorted by creation date (newest first)

---

## Update Linked Account

Updates properties of a linked account (custom name or primary status).

### Request
```
PUT /api/v2/accounts/:accountId
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `accountId` (string, required): The ID of the linked account

#### Request Body
```json
{
  "customName": "My New Wallet Name",  // optional, can be null to clear
  "isPrimary": true  // optional
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "account123",
    "userId": "user456",
    "profileId": "profile789",
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "authStrategy": "wallet",
    "walletType": "metamask",
    "customName": "My New Wallet Name",
    "isPrimary": true,
    "isActive": true,
    "chainId": 1,
    "updatedAt": "2024-01-03T00:00:00.000Z"
  },
  "message": "Account updated successfully"
}
```

#### Error Responses
- **404 Not Found**: Account not found or not owned by user
- **400 Bad Request**: Invalid update parameters

#### Notes
- Setting `isPrimary: true` will unset primary status on other accounts
- Custom name can be cleared by passing null or empty string

---

## Unlink Account

Removes a linked account from a profile.

### Request
```
DELETE /api/v2/accounts/:accountId
Authorization: Bearer <access_token>
```

#### Path Parameters
- `accountId` (string, required): The ID of the linked account to remove

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Account unlinked successfully"
}
```

#### Error Responses
- **404 Not Found**: Account not found or not owned by user
- **400 Bad Request**: Cannot unlink the last account

#### Important Notes
- Cannot unlink the primary account if it's the only one
- Unlinking removes all associated token allowances
- This action cannot be undone

---

## Search Account by Address

Searches for profiles that have a specific wallet address linked.

### Request
```
POST /api/v2/accounts/search
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678"
}
```

### Response

#### Success (200 OK) - Found
```json
{
  "success": true,
  "data": {
    "profileId": "profile789",
    "profileName": "John's Profile",
    "accountId": "account123",
    "isPrimary": true,
    "customName": "My Hardware Wallet"
  }
}
```

#### Success (200 OK) - Not Found
```json
{
  "success": true,
  "data": null
}
```

#### Error Responses
- **400 Bad Request**: Invalid Ethereum address format

#### Notes
- Useful for discovering which profile owns a specific address
- Only returns results for addresses the user has access to

---

## Grant Token Allowance

Grants a token allowance from a linked account to the profile's session wallet.

### Request
```
POST /api/v2/profiles/:profileId/accounts/:accountId/allowances
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `profileId` (string, required): The profile ID
- `accountId` (string, required): The linked account ID

#### Request Body
```json
{
  "spender": "0xsessionwallet...",  // Session wallet address
  "amount": "1000000000000000000",  // Amount in wei
  "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  // USDC
  "chainId": 1
}
```

### Response

#### Success (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "allowance123",
    "accountId": "account123",
    "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "spender": "0xsessionwallet...",
    "amount": "1000000000000000000",
    "chainId": 1,
    "status": "pending",
    "transactionHash": null,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Token allowance granted successfully"
}
```

#### Error Responses
- **400 Bad Request**: Missing required fields
- **404 Not Found**: Account or profile not found

#### Notes
- Enables gasless transactions from session wallet
- Allowance transactions are tracked and can be revoked
- Status transitions: pending → confirmed → used/revoked

---

## Get Account Allowances

Retrieves all token allowances for a linked account.

### Request
```
GET /api/v2/profiles/:profileId/accounts/:accountId/allowances
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The profile ID
- `accountId` (string, required): The linked account ID

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "allowance123",
      "accountId": "account123",
      "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "tokenSymbol": "USDC",
      "spender": "0xsessionwallet...",
      "amount": "1000000000000000000",
      "remainingAmount": "500000000000000000",
      "chainId": 1,
      "status": "confirmed",
      "transactionHash": "0x123...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Notes
- Shows all active and pending allowances
- Includes remaining amounts for tracking usage
- Useful for allowance management UI

---

## Account Linking in Authentication

The authentication system also provides account linking functionality through the identity graph:

### Link Accounts (Auth Endpoint)
```
POST /api/v2/auth/link-accounts
```
See [Authentication Flows Documentation](./1-authentication-flows.md#link-accounts) for details.

### Update Link Privacy Mode
```
PUT /api/v2/auth/link-privacy
```
See [Authentication Flows Documentation](./1-authentication-flows.md#update-link-privacy-mode) for details.

### Get Identity Graph
```
GET /api/v2/auth/identity-graph
```
See [Authentication Flows Documentation](./1-authentication-flows.md#get-identity-graph) for details.

---

## Common Response Structure

### Success Response
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "message": "Optional success message",
  "requestId": "req_1234567890_abc123"  // For tracking
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "requestId": "req_1234567890_abc123",
  "debugInfo": { /* Development only */ }
}
```

---

## Security & Best Practices

1. **Signature Verification**: Always required in production
2. **Address Validation**: Ethereum address format is validated
3. **Duplicate Prevention**: Same address cannot be linked twice to a profile
4. **Primary Account**: Only one account can be primary at a time
5. **Audit Logging**: All linking/unlinking operations are logged
6. **Rate Limiting**: Standard user rate limits apply

---

## Development Mode

In development mode (`NODE_ENV=development`):
- Signature verification can be bypassed
- Additional debug information in error responses
- Test wallet types are accepted
- Default values provided for missing signatures