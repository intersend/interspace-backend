# Authentication Flows

## Table of Contents
1. [Email Authentication - New User](#email-authentication---new-user)
2. [Email Authentication - Returning User](#email-authentication---returning-user)
3. [Wallet (SIWE) Authentication](#wallet-siwe-authentication)
4. [Social Authentication (Google/Apple)](#social-authentication)
5. [Guest Authentication](#guest-authentication)
6. [Privacy Mode Selection](#privacy-mode-selection)

---

## Email Authentication - New User

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/         |                                |
  |   send-email-code ----------->|                                |
  |   {email: "user@example.com"} |                                |
  |                               |-- Generate 6-digit code ------>|
  |                               |-- Hash code with bcrypt ------>|
  |                               |-- Store EmailVerification ---->|
  |                               |-- Send email (or log in dev)->|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    expiresInMinutes: 10}     |                                |
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   authenticate --------------->|                                |
  |   {strategy: "email",         |                                |
  |    email: "user@example.com", |                                |
  |    verificationCode: "123456"}|                                |
  |                               |-- Verify code against hash --->|
  |                               |-- Delete EmailVerification --->|
  |                               |-- Create Account ------------->|
  |                               |   {type: "email",             |
  |                               |    identifier: email,          |
  |                               |    verified: true}             |
  |                               |-- Create User (legacy) ------->|
  |                               |-- Create SessionWallet ------->|
  |                               |-- Create SmartProfile -------->|
  |                               |   {name: "My Smartprofile",    |
  |                               |    isDevelopmentWallet: true}  |
  |                               |-- Create ProfileAccount ------>|
  |                               |   {isPrimary: true}            |
  |                               |-- Create AccountSession ------>|
  |                               |-- Generate JWT tokens --------->|
  |                               |-- Audit log ------------------>|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    account: {...},            |                                |
  |    profiles: [{               |                                |
  |      name: "My Smartprofile", |                                |
  |      isActive: true           |                                |
  |    }],                        |                                |
  |    tokens: {                  |                                |
  |      accessToken: "...",      |                                |
  |      refreshToken: "..."      |                                |
  |    },                         |                                |
  |    isNewUser: true}           |                                |
```

### State Changes
- **Account** created with `verified: true`
- **User** created for backward compatibility
- **SmartProfile** created with development wallet
- **ProfileAccount** links profile to account as primary
- **AccountSession** created with 7-day expiry
- **EmailVerification** deleted after successful verification

### Security Validations
- Email normalized to lowercase
- Verification code expires in 10 minutes
- Maximum 5 attempts per code
- Rate limited to 3 requests per hour per email
- Bcrypt hash comparison for code verification

---

## Email Authentication - Returning User

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/         |                                |
  |   send-email-code ----------->|                                |
  |   {email: "user@example.com"} |                                |
  |                               |-- Check existing account ----->|
  |                               |-- Generate & store code ------>|
  |<-- 200 OK --------------------|                                |
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   authenticate --------------->|                                |
  |   {strategy: "email",         |                                |
  |    email: "user@example.com", |                                |
  |    verificationCode: "654321"}|                                |
  |                               |-- Verify code ---------------->|
  |                               |-- Find existing Account ------>|
  |                               |-- Get linked Profiles -------->|
  |                               |-- Find active Profile --------->|
  |                               |-- Create new Session --------->|
  |                               |-- Generate tokens ------------>|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    account: {...},            |                                |
  |    profiles: [                |                                |
  |      {name: "My Smartprofile"},                               |
  |      {name: "Work Profile"}   |                                |
  |    ],                         |                                |
  |    activeProfile: {...},      |                                |
  |    tokens: {...},             |                                |
  |    isNewUser: false}          |                                |
```

### Key Differences from New User
- No new Account/Profile creation
- Returns all accessible profiles
- Maintains previous active profile selection
- `isNewUser: false` in response

---

## Wallet (SIWE) Authentication

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- GET /api/v1/siwe/nonce ---->|                                |
  |                               |-- Generate nonce ------------->|
  |                               |-- Store with 5min expiry ----->|
  |<-- 200 OK --------------------|                                |
  |   {nonce: "abc123..."}        |                                |
  |                               |                                |
  |-- Create SIWE message -------->|                                |
  |-- Sign with wallet ----------->|                                |
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   authenticate --------------->|                                |
  |   {strategy: "wallet",        |                                |
  |    walletAddress: "0x...",    |                                |
  |    message: "...",            |                                |
  |    signature: "0x...",        |                                |
  |    walletType: "metamask"}    |                                |
  |                               |-- Verify SIWE signature ------>|
  |                               |-- Verify nonce validity ------>|
  |                               |-- Create/find Account -------->|
  |                               |   {type: "wallet",            |
  |                               |    identifier: address.lower(),|
  |                               |    verified: true}             |
  |                               |-- Auto-create profile if new ->|
  |                               |-- Create session ------------->|
  |                               |-- Generate tokens ------------>|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    account: {                 |                                |
  |      type: "wallet",          |                                |
  |      verified: true           |                                |
  |    },                         |                                |
  |    profiles: [...],           |                                |
  |    tokens: {...}}             |                                |
```

### SIWE Message Structure
```javascript
{
  domain: 'localhost',
  address: wallet.address,
  statement: 'Sign in to Interspace',
  uri: 'http://localhost:3000',
  version: '1',
  chainId: 1,
  nonce: nonce,
  issuedAt: new Date().toISOString()
}
```

### Security Validations
- Nonce must be valid and not expired (5 minutes)
- Signature must match the message and address
- Address recovered from signature must match provided address
- Wallet addresses normalized to lowercase
- Wallet accounts auto-verified (ownership proven by signature)

---

## Social Authentication

### Google Authentication
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   authenticate --------------->|                                |
  |   {strategy: "google",        |                                |
  |    idToken: "eyJ..."}        |                                |
  |                               |-- Verify with Google SDK ----->|
  |                               |-- Extract user info:           |
  |                               |   - sub (Google ID)            |
  |                               |   - email                      |
  |                               |   - name                       |
  |                               |   - picture                    |
  |                               |-- Create/find Account -------->|
  |                               |   {type: "social",            |
  |                               |    identifier: sub,            |
  |                               |    provider: "google",         |
  |                               |    metadata: {email, ...}}     |
  |                               |-- Auto-verify if email verified|
  |                               |-- Create profile if new ------>|
  |<-- 200 OK --------------------|                                |
```

### Apple Authentication
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   authenticate --------------->|                                |
  |   {strategy: "apple",         |                                |
  |    idToken: "eyJ..."}        |                                |
  |                               |-- Verify with Apple lib ------>|
  |                               |-- Extract user info:           |
  |                               |   - sub (Apple ID)             |
  |                               |   - email (if shared)          |
  |                               |-- Create/find Account -------->|
  |                               |   {type: "social",            |
  |                               |    identifier: sub,            |
  |                               |    provider: "apple"}          |
  |<-- 200 OK --------------------|                                |
```

### Key Points
- Social accounts use provider's user ID as identifier
- Email stored in metadata if available
- Automatic verification if provider verifies email
- Profile picture and name stored when available

---

## Guest Authentication

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   authenticate --------------->|                                |
  |   {strategy: "guest"}         |                                |
  |                               |-- Generate unique ID --------->|
  |                               |   guest_[timestamp]_[random]   |
  |                               |-- Create Account ------------->|
  |                               |   {type: "guest",             |
  |                               |    identifier: guestId,        |
  |                               |    verified: false}            |
  |                               |-- Create profile ------------->|
  |                               |-- Create session ------------->|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    account: {                 |                                |
  |      type: "guest",           |                                |
  |      verified: false          |                                |
  |    },                         |                                |
  |    profiles: [...],           |                                |
  |    tokens: {...},             |                                |
  |    isNewUser: true}           |                                |
```

### Guest Account Features
- No verification required
- Can be upgraded later by linking other auth methods
- Limited functionality based on app requirements
- Sessions expire normally (7 days)

---

## Privacy Mode Selection

Privacy mode can be specified during any authentication:

### Request
```json
POST /api/v2/auth/authenticate
{
  "strategy": "email",
  "email": "user@example.com",
  "verificationCode": "123456",
  "privacyMode": "linked"  // or "partial" or "isolated"
}
```

### Privacy Mode Effects

#### linked (default)
- Full profile sharing across linked accounts
- All linked accounts see all profiles
- Changes sync across all sessions

#### partial
- Selective data sharing
- Limited profile visibility
- Some operations restricted

#### isolated
- No sharing between accounts
- Independent session
- No access to profiles from other sessions

### Database Impact
```
AccountSession record includes:
- privacyMode: "linked" | "partial" | "isolated"
- Affects getAccessibleProfiles() results
- Influences identity graph traversal
```

---

## Common Response Structure

All authentication endpoints return:

### Success Response
```json
{
  "success": true,
  "account": {
    "id": "cmc5bsinw0001mr2n5f09oj7h",
    "type": "email",
    "identifier": "user@example.com",
    "verified": true
  },
  "profiles": [{
    "id": "profile123",
    "name": "My Smartprofile",
    "isActive": true,
    "sessionWalletAddress": "0x...",
    "linkedAccountsCount": 1
  }],
  "activeProfile": {
    "id": "profile123",
    "name": "My Smartprofile",
    "sessionWalletAddress": "0x..."
  },
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  },
  "isNewUser": true,
  "sessionId": "session123",
  "privacyMode": "linked"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Invalid verification code"
}
```

---

## Rate Limiting

All authentication endpoints use V2-specific rate limiting:

- **Email code requests**: 3 per hour per email
- **Authentication attempts**: Stricter limits based on identifier
- **Development mode**: 5x higher limits
- **Key generation**: By email/wallet/IP combination

## Security Events

All authentication attempts trigger audit logs:

### Success
```json
{
  "action": "authenticate",
  "resource": "account",
  "details": {
    "accountId": "...",
    "strategy": "email",
    "isNewUser": true,
    "privacyMode": "linked"
  }
}
```

### Failure
```json
{
  "type": "AUTH_FAILED",
  "details": {
    "strategy": "email",
    "reason": "invalid_code",
    "email": "user@example.com",
    "ipAddress": "..."
  }
}
```

---

## Additional Authentication Endpoints

### Link Accounts

Links two accounts together in the identity graph.

#### Request
```
POST /api/v2/auth/link-accounts
Authorization: Bearer <access_token>
```

```json
{
  "targetType": "email",  // "email" | "wallet" | "social"
  "targetIdentifier": "user@example.com",
  "targetProvider": "google",  // optional, for social accounts
  "linkType": "direct",  // "direct" | "inferred", default: "direct"
  "privacyMode": "linked"  // "linked" | "partial" | "isolated", default: "linked"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "sourceAccountId": "account123",
    "targetAccountId": "account456",
    "linkType": "direct",
    "privacyMode": "linked",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

---

### Update Link Privacy Mode

Updates the privacy mode for an existing account link.

#### Request
```
PUT /api/v2/auth/link-privacy
Authorization: Bearer <access_token>
```

```json
{
  "targetAccountId": "account456",
  "privacyMode": "partial"  // "linked" | "partial" | "isolated"
}
```

#### Response
```json
{
  "success": true,
  "message": "Privacy mode updated successfully"
}
```

---

### Get Identity Graph

Retrieves the identity graph for the current account, showing all linked accounts and their relationships.

#### Request
```
GET /api/v2/auth/identity-graph
Authorization: Bearer <access_token>
```

#### Response
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": "account123",
        "type": "email",
        "identifier": "user@example.com",
        "verified": true,
        "createdAt": "2024-01-01T00:00:00Z"
      },
      {
        "id": "account456",
        "type": "wallet",
        "identifier": "0x123...abc",
        "verified": true,
        "createdAt": "2024-01-02T00:00:00Z"
      }
    ],
    "links": [
      {
        "sourceAccountId": "account123",
        "targetAccountId": "account456",
        "linkType": "direct",
        "privacyMode": "linked",
        "createdAt": "2024-01-03T00:00:00Z"
      }
    ]
  }
}
```

---

### Switch Profile

Switches the active profile for the current session.

#### Request
```
POST /api/v2/auth/switch-profile/:profileId
Authorization: Bearer <access_token>
```

#### Response
```json
{
  "success": true,
  "data": {
    "activeProfile": {
      "id": "profile456",
      "name": "Work Profile",
      "sessionWalletAddress": "0x...",
      "isActive": true
    }
  }
}
```

---

### Resend Email Code

Resends the email verification code to the specified email address.

#### Request
```
POST /api/v2/auth/resend-email-code
```

```json
{
  "email": "user@example.com"
}
```

#### Response
```json
{
  "success": true,
  "message": "Verification code resent successfully",
  "expiresInMinutes": 10
}
```

#### Rate Limiting
- Same rate limits as send-email-code: 3 requests per hour per email

---

### Verify Email Code

Verifies an email code without authenticating (useful for pre-validation).

#### Request
```
POST /api/v2/auth/verify-email-code
```

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

#### Response
```json
{
  "success": true,
  "message": "Code verified successfully"
}
```

---

### Refresh Token

Refreshes an expired access token using a valid refresh token.

#### Request
```
POST /api/v2/auth/refresh
```

```json
{
  "refreshToken": "eyJ..."
}
```

#### Response
```json
{
  "success": true,
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

### Logout

Invalidates the current session and blacklists tokens.

#### Request
```
POST /api/v2/auth/logout
Authorization: Bearer <access_token>
```

#### Response
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### Effects
- Deletes the current session from database
- Blacklists the access token
- Always returns success even if session already expired

---

### Development Endpoints

#### Get Last Email Code (Development Only)

Retrieves the last email verification code sent (for testing purposes).

#### Request
```
GET /api/v2/auth/dev/last-email-code
```

#### Response
```json
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "code": "123456",
    "expiresAt": "2024-01-01T00:10:00Z"
  }
}
```

**Note**: This endpoint is only available when `NODE_ENV=development`