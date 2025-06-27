# Two-Factor Authentication (2FA)

## Table of Contents
1. [Overview](#overview)
2. [Get 2FA Status](#get-2fa-status)
3. [Enable 2FA](#enable-2fa)
4. [Verify Setup](#verify-setup)
5. [Verify Token](#verify-token)
6. [Disable 2FA](#disable-2fa)
7. [Regenerate Backup Codes](#regenerate-backup-codes)
8. [2FA in Critical Operations](#2fa-in-critical-operations)

---

## Overview

The Two-Factor Authentication API provides enhanced security for user accounts by requiring a second form of verification beyond passwords. The system uses Time-based One-Time Passwords (TOTP) compatible with authenticator apps like Google Authenticator or Authy.

### Key Features
- TOTP-based authentication (RFC 6238)
- QR code generation for easy setup
- Backup codes for account recovery
- Password verification for sensitive operations
- Integration with critical operations (MPC key management, etc.)

### Authentication
All endpoints require authentication using `authenticateAccount` middleware with:
- V2 authentication adapter for backward compatibility
- Auth rate limiting for security

### Base URL
```
/api/v2/2fa
```

---

## Get 2FA Status

Checks whether two-factor authentication is enabled for the current user.

### Request
```
GET /api/v2/2fa/status
Authorization: Bearer <access_token>
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "isEnabled": true
  }
}
```

#### Notes
- Simple boolean check for 2FA status
- Useful for UI conditional rendering
- No sensitive information exposed

---

## Enable 2FA

Initiates the two-factor authentication setup process. Returns a secret key, QR code URL, and backup codes.

### Request
```
POST /api/v2/2fa/enable
Authorization: Bearer <access_token>
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeUrl": "otpauth://totp/Interspace:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Interspace",
    "backupCodes": [
      "ABCD-EFGH-IJKL",
      "MNOP-QRST-UVWX",
      "YZAB-CDEF-GHIJ",
      "KLMN-OPQR-STUV",
      "WXYZ-1234-5678",
      "9012-3456-7890",
      "ABCD-1234-WXYZ",
      "EFGH-5678-STUV"
    ]
  }
}
```

#### Important Notes
- **Secret**: Base32-encoded secret key for manual entry
- **QR Code URL**: Can be converted to QR code for scanning
- **Backup Codes**: One-time use codes for account recovery
- 2FA is not yet active until verified (see Verify Setup)
- Store backup codes securely - they cannot be retrieved again

### Setup Flow
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/2fa/enable --->|                                |
  |                               |-- Generate TOTP secret ------->|
  |                               |-- Generate backup codes ------>|
  |                               |-- Store pending setup -------->|
  |<-- 200 OK (secret, QR, codes) |                                |
  |                               |                                |
  |-- User scans QR code -------->|                                |
  |-- User enters token ---------->|                                |
  |                               |                                |
  |-- POST /api/v2/2fa/           |                                |
  |   verify-setup --------------->|                                |
```

---

## Verify Setup

Completes the 2FA setup by verifying the user has successfully configured their authenticator app.

### Request
```
POST /api/v2/2fa/verify-setup
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "token": "123456"  // 6-digit code from authenticator app
}
```

#### Validation Rules
- `token`: Required, exactly 6 digits

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "2FA has been successfully enabled"
}
```

#### Error Responses
- **400 Bad Request**: Invalid or missing token
- **401 Unauthorized**: Invalid token or setup expired

#### Notes
- Must be called after Enable 2FA
- Token must be from the authenticator app (not a backup code)
- Once verified, 2FA is active for the account

---

## Verify Token

Verifies a 2FA token for authentication or authorization purposes.

### Request
```
POST /api/v2/2fa/verify
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "token": "123456"  // 6-digit code or backup code
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "isValid": true
  }
}
```

#### Notes
- Accepts either TOTP codes or backup codes
- Backup codes are single-use and marked as used
- Used for step-up authentication in critical operations

---

## Disable 2FA

Disables two-factor authentication for the account. Requires password verification.

### Request
```
POST /api/v2/2fa/disable
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "password": "userPassword123"  // Account password for verification
}
```

#### Validation Rules
- `password`: Required, user's account password

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "2FA has been disabled"
}
```

#### Error Responses
- **400 Bad Request**: Missing password
- **401 Unauthorized**: Invalid password
- **404 Not Found**: 2FA not enabled

#### Security Notes
- Password verification prevents unauthorized disabling
- All 2FA data is permanently deleted
- User must re-enable from scratch if desired

---

## Regenerate Backup Codes

Generates a new set of backup codes, invalidating all previous codes. Requires password verification.

### Request
```
POST /api/v2/2fa/regenerate-backup-codes
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "password": "userPassword123"  // Account password for verification
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "NEW1-CODE-HERE",
      "NEW2-CODE-HERE",
      "NEW3-CODE-HERE",
      "NEW4-CODE-HERE",
      "NEW5-CODE-HERE",
      "NEW6-CODE-HERE",
      "NEW7-CODE-HERE",
      "NEW8-CODE-HERE"
    ]
  }
}
```

#### Error Responses
- **400 Bad Request**: Missing password
- **401 Unauthorized**: Invalid password
- **404 Not Found**: 2FA not enabled

#### Use Cases
- User lost backup codes
- Suspicion of compromise
- Regular security rotation

---

## 2FA in Critical Operations

Two-factor authentication is required for various critical operations throughout the system:

### MPC Key Operations
- **Backup Key**: `/api/v2/mpc/backup` requires `twoFactorCode`
- **Export Key**: `/api/v2/mpc/export` requires `twoFactorCode`
- **Rotate Key**: `/api/v2/mpc/rotate` requires `twoFactorCode`

### Example Integration
```json
// MPC Backup Request
{
  "profileId": "profile123",
  "rsaPubkeyPem": "...",
  "label": "Backup Label",
  "twoFactorCode": "123456"  // 2FA code required
}
```

### Verification Flow
```
Client                          Backend                         
  |                               |
  |-- POST /api/v2/mpc/backup --->|
  |   (with twoFactorCode)        |
  |                               |-- Verify 2FA token
  |                               |-- If valid: proceed
  |                               |-- If invalid: 403 error
  |<-- Response ------------------|
```

---

## Security Considerations

### Token Security
- TOTP tokens are time-based with 30-second windows
- Tokens are valid for current and previous window (60 seconds total)
- Each backup code can only be used once
- Failed attempts are rate-limited

### Storage Security
- Secrets are encrypted at rest
- Backup codes are hashed before storage
- No plaintext secrets are logged or stored

### Session Security
- 2FA verification creates a temporary elevation
- Elevation expires after a configurable period
- Critical operations check for recent 2FA verification

---

## Error Handling

All endpoints follow consistent error response format:
```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

Common error scenarios:
- **Token Invalid**: Wrong code or expired
- **2FA Not Enabled**: Trying to verify when not set up
- **Already Enabled**: Trying to enable when already active
- **Rate Limited**: Too many failed attempts

---

## Best Practices

1. **Setup Flow**: Always verify setup immediately after enabling
2. **Backup Codes**: Store securely and treat as passwords
3. **Regular Verification**: Test 2FA periodically
4. **Account Recovery**: Have backup codes accessible
5. **Password Security**: Keep account password secure (needed for 2FA management)