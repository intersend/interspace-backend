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