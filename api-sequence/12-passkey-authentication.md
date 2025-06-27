# Passkey Authentication

## Table of Contents
1. [Overview](#overview)
2. [Registration Flow](#registration-flow)
   - [Generate Registration Options](#generate-registration-options)
   - [Verify Registration](#verify-registration)
3. [Authentication Flow](#authentication-flow)
   - [Generate Authentication Options](#generate-authentication-options)
   - [Verify Authentication](#verify-authentication)
4. [Passkey Management](#passkey-management)
   - [Get User Passkeys](#get-user-passkeys)
   - [Delete Passkey](#delete-passkey)
5. [Implementation Guide](#implementation-guide)
6. [Security Considerations](#security-considerations)

---

## Overview

The Passkey Authentication API implements WebAuthn/FIDO2 standards for passwordless authentication using biometric authenticators, security keys, or platform authenticators. This provides phishing-resistant, user-friendly authentication.

### Key Features
- WebAuthn/FIDO2 compliant
- Biometric authentication support
- Platform authenticator support (Touch ID, Face ID, Windows Hello)
- Security key support (YubiKey, etc.)
- Multiple passkeys per user
- Device name tracking

### Authentication Requirements
- Registration endpoints require authenticated user
- Authentication endpoints are public
- All endpoints include auth rate limiting

### Base URL
```
/api/v2/auth/passkey
```

---

## Registration Flow

### Generate Registration Options

Creates WebAuthn registration options for adding a new passkey to an authenticated user's account.

#### Request
```
POST /api/v2/auth/passkey/register-options
Authorization: Bearer <access_token>
Content-Type: application/json
```

##### Request Body
```json
{
  "deviceName": "MacBook Pro"  // optional
}
```

#### Response

##### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "challenge": "base64url_encoded_challenge",
    "rp": {
      "name": "Interspace",
      "id": "interspace.fi"
    },
    "user": {
      "id": "base64url_encoded_user_id",
      "name": "user@example.com",
      "displayName": "user@example.com"
    },
    "pubKeyCredParams": [
      {
        "alg": -7,
        "type": "public-key"
      },
      {
        "alg": -257,
        "type": "public-key"
      }
    ],
    "authenticatorSelection": {
      "authenticatorAttachment": "platform",
      "requireResidentKey": false,
      "userVerification": "preferred"
    },
    "timeout": 60000,
    "attestation": "none"
  }
}
```

#### WebAuthn Options Explained
- **challenge**: Random challenge to prevent replay attacks
- **rp**: Relying party (your application) information
- **user**: User information for the authenticator
- **pubKeyCredParams**: Supported public key algorithms
- **authenticatorSelection**: Requirements for the authenticator
- **timeout**: Registration timeout in milliseconds
- **attestation**: Level of attestation required

---

### Verify Registration

Verifies the registration response from the authenticator and saves the passkey.

#### Request
```
POST /api/v2/auth/passkey/register-verify
Authorization: Bearer <access_token>
Content-Type: application/json
```

##### Request Body
```json
{
  "response": {
    "id": "credential_id",
    "rawId": "base64url_encoded_raw_id",
    "response": {
      "clientDataJSON": "base64url_encoded_client_data",
      "attestationObject": "base64url_encoded_attestation"
    },
    "type": "public-key",
    "authenticatorAttachment": "platform",
    "clientExtensionResults": {}
  },
  "challenge": "original_challenge_from_options",
  "deviceName": "MacBook Pro"  // optional
}
```

#### Response

##### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "verified": true,
    "credentialId": "stored_credential_id"
  },
  "message": "Passkey registered successfully"
}
```

##### Error Responses
- **400 Bad Request**: Invalid registration response
- **401 Unauthorized**: User not authenticated

---

## Authentication Flow

### Generate Authentication Options

Creates WebAuthn authentication options for signing in with a passkey.

#### Request
```
POST /api/v2/auth/passkey/authenticate-options
Content-Type: application/json
```

##### Request Body
```json
{
  "username": "user@example.com"  // optional, for conditional UI
}
```

#### Response

##### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "challenge": "base64url_encoded_challenge",
    "timeout": 60000,
    "rpId": "interspace.fi",
    "userVerification": "preferred",
    "allowCredentials": [
      {
        "id": "base64url_credential_id",
        "type": "public-key",
        "transports": ["internal", "usb", "nfc", "ble"]
      }
    ]
  }
}
```

#### Authentication Options
- **challenge**: Random challenge for this authentication
- **allowCredentials**: List of acceptable credentials (empty for conditional UI)
- **userVerification**: Whether user verification is required
- **rpId**: Relying party identifier

---

### Verify Authentication

Verifies the authentication response and creates a session.

#### Request
```
POST /api/v2/auth/passkey/authenticate-verify
Content-Type: application/json
```

##### Request Body
```json
{
  "response": {
    "id": "credential_id",
    "rawId": "base64url_encoded_raw_id",
    "response": {
      "clientDataJSON": "base64url_encoded_client_data",
      "authenticatorData": "base64url_encoded_auth_data",
      "signature": "base64url_encoded_signature",
      "userHandle": "base64url_encoded_user_handle"
    },
    "type": "public-key",
    "clientExtensionResults": {}
  },
  "challenge": "original_challenge_from_options",
  "deviceId": "device123",  // optional
  "deviceName": "iPhone 15",  // optional
  "deviceType": "ios"  // optional: "ios" | "android" | "web"
}
```

#### Response

##### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "userEmail": "user@example.com",
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "deviceId": "device123"
  },
  "message": "Authentication successful"
}
```

##### Error Responses
- **400 Bad Request**: Invalid authentication response
- **401 Unauthorized**: Authentication failed

---

## Passkey Management

### Get User Passkeys

Retrieves all passkeys registered to the authenticated user.

#### Request
```
GET /api/v2/auth/passkey/credentials
Authorization: Bearer <access_token>
```

#### Response

##### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "credential123",
      "credentialId": "base64url_credential_id",
      "deviceName": "MacBook Pro",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastUsedAt": "2024-01-15T12:00:00.000Z",
      "counter": 42
    },
    {
      "id": "credential456",
      "credentialId": "base64url_credential_id_2",
      "deviceName": "iPhone 15",
      "createdAt": "2024-01-05T00:00:00.000Z",
      "lastUsedAt": "2024-01-20T08:00:00.000Z",
      "counter": 15
    }
  ]
}
```

---

### Delete Passkey

Removes a passkey from the user's account.

#### Request
```
DELETE /api/v2/auth/passkey/credentials/:credentialId
Authorization: Bearer <access_token>
```

##### Path Parameters
- `credentialId`: The ID of the passkey to delete

#### Response

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Passkey deleted successfully"
}
```

##### Error Responses
- **404 Not Found**: Passkey not found or not owned by user

---

## Implementation Guide

### Client-Side Registration Flow

```javascript
// 1. Get registration options
const optionsResponse = await fetch('/api/v2/auth/passkey/register-options', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ deviceName: 'My Device' })
});
const options = await optionsResponse.json();

// 2. Create credential using WebAuthn API
const credential = await navigator.credentials.create({
  publicKey: options.data
});

// 3. Verify registration
const verifyResponse = await fetch('/api/v2/auth/passkey/register-verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    response: credential,
    challenge: options.data.challenge,
    deviceName: 'My Device'
  })
});
```

### Client-Side Authentication Flow

```javascript
// 1. Get authentication options
const optionsResponse = await fetch('/api/v2/auth/passkey/authenticate-options', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'user@example.com' })
});
const options = await optionsResponse.json();

// 2. Get credential using WebAuthn API
const credential = await navigator.credentials.get({
  publicKey: options.data
});

// 3. Verify authentication
const verifyResponse = await fetch('/api/v2/auth/passkey/authenticate-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    response: credential,
    challenge: options.data.challenge,
    deviceType: 'web'
  })
});

// 4. Store tokens
const { accessToken, refreshToken } = verifyResponse.data;
```

---

## Security Considerations

### Challenge Security
- Challenges are cryptographically random
- Single-use to prevent replay attacks
- Time-limited validity (60 seconds)
- Stored server-side during authentication flow

### Credential Security
- Public keys stored, private keys never leave device
- Counter tracking prevents credential cloning
- Device binding through authenticator attachment
- Origin validation prevents phishing

### Session Security
- Standard JWT tokens issued after authentication
- Device tracking for security monitoring
- IP and user agent logging
- Audit trail for all passkey operations

### Best Practices
1. **User Education**: Explain passkeys to users
2. **Backup Options**: Maintain alternative auth methods
3. **Multiple Passkeys**: Encourage multiple device registration
4. **Recovery Flow**: Implement account recovery process
5. **Cross-Platform**: Support both platform and roaming authenticators

---

## Browser Support

Passkeys are supported in:
- Safari 16+ (macOS 13+, iOS 16+)
- Chrome 108+ (Windows, macOS, Android)
- Edge 108+
- Firefox 119+ (limited support)

### Platform Support
- **macOS**: Touch ID, Face ID (on supported Macs)
- **iOS**: Face ID, Touch ID
- **Windows**: Windows Hello (face, fingerprint, PIN)
- **Android**: Fingerprint, face unlock

### Fallback Options
Always provide fallback authentication methods for:
- Unsupported browsers
- Lost devices
- Broken biometric sensors
- Corporate environments with restrictions