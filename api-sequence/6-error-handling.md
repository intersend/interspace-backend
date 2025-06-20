# Error Handling

## Table of Contents
1. [Error Response Format](#error-response-format)
2. [Authentication Errors](#authentication-errors)
3. [Profile Management Errors](#profile-management-errors)
4. [Account Linking Errors](#account-linking-errors)
5. [Session/Token Errors](#sessiontoken-errors)
6. [Validation Errors](#validation-errors)
7. [Rate Limiting Errors](#rate-limiting-errors)
8. [Server Errors](#server-errors)

---

## Error Response Format

### Standard Error Response
```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",  // Optional, for specific errors
  "details": {}          // Optional, additional context
}
```

### Validation Error Response
```json
{
  "errors": [
    {
      "type": "field",
      "msg": "Invalid value",
      "path": "email",
      "location": "body"
    }
  ]
}
```

---

## Authentication Errors

### 400 Bad Request - Missing Required Fields
```json
// Request
POST /api/v2/auth/authenticate
{
  "strategy": "email"
  // Missing email and verificationCode
}

// Response
{
  "success": false,
  "error": "Email and verification code required"
}
```

### 401 Unauthorized - Invalid Credentials

#### Email - Invalid Verification Code
```json
// Request
POST /api/v2/auth/authenticate
{
  "strategy": "email",
  "email": "user@example.com",
  "verificationCode": "000000"
}

// Response
{
  "success": false,
  "error": "Invalid or expired verification code"
}

// Side Effects
- Increments attempt counter
- Logs security event
- After 5 attempts, code is invalidated
```

#### Wallet - Invalid Signature
```json
// Request
POST /api/v2/auth/authenticate
{
  "strategy": "wallet",
  "walletAddress": "0x123...",
  "message": "...",
  "signature": "0x000..."  // Invalid
}

// Response
{
  "success": false,
  "error": "Invalid signature"
}

// Possible Error Messages
- "Invalid signature"
- "Signature address mismatch"
- "Message format invalid"
- "Nonce expired or invalid"
```

#### Social - Token Verification Failed
```json
// Response
{
  "success": false,
  "error": "Google authentication failed"
}

// Possible Causes
- Invalid or expired ID token
- Token audience mismatch
- Network error verifying with provider
```

### 429 Too Many Requests - Rate Limit
```json
// Response
{
  "success": false,
  "error": "Too many verification requests. Please try again later."
}

// Email specific
- Limit: 3 code requests per hour per email
```

---

## Profile Management Errors

### 400 Bad Request - Validation Failed

#### Name Too Long
```json
// Request
POST /api/v2/profiles
{
  "name": "This profile name is way too long and exceeds the fifty character limit"
}

// Response
{
  "errors": [{
    "type": "field",
    "msg": "Profile name must be between 1 and 50 characters",
    "path": "name",
    "location": "body"
  }]
}
```

#### Cannot Delete Last Profile
```json
// Request
DELETE /api/v2/profiles/profile123

// Response
{
  "success": false,
  "error": "Cannot delete the last profile"
}
```

### 401 Unauthorized - No Token
```json
// Request without Authorization header
GET /api/v2/profiles

// Response
{
  "error": "No token provided"
}
```

### 404 Not Found - Profile Not Found or Not Accessible
```json
// Request
GET /api/v2/profiles/nonexistent

// Response
{
  "success": false,
  "error": "Profile not found or not accessible"
}

// This error occurs when:
- Profile doesn't exist
- Profile exists but not accessible due to privacy mode
- Profile belongs to unlinked account
```

---

## Account Linking Errors

### 400 Bad Request - Invalid Link Request
```json
// Request
POST /api/v2/auth/link-accounts
{
  "targetType": "email"
  // Missing targetIdentifier
}

// Response
{
  "success": false,
  "error": "Target account type and identifier required"
}
```

### 403 Forbidden - Unverified Account
```json
// Request from unverified account
POST /api/v2/auth/link-accounts
{ ... }

// Response
{
  "success": false,
  "error": "Please verify your account before linking other accounts"
}
```

### 409 Conflict - Already Linked
```json
// Attempting to link already linked accounts
{
  "success": false,
  "error": "Accounts are already linked"
}

// Attempting to link account linked elsewhere
{
  "success": false,
  "error": "Target account is already linked to another identity"
}
```

---

## Session/Token Errors

### 401 Unauthorized - Token Issues

#### Expired Token
```json
{
  "error": "Token expired"
}

// Client should refresh token
```

#### Invalid Token
```json
{
  "error": "Invalid token"
}

// Causes:
- Malformed JWT
- Invalid signature
- Wrong secret key
```

#### Blacklisted Token
```json
{
  "error": "Token has been revoked"
}

// Token was logout or security revoked
```

#### Invalid Session
```json
{
  "error": "Invalid session"
}

// Session doesn't exist or doesn't match token
```

### 401 Unauthorized - Refresh Token Failed
```json
// Request
POST /api/v2/auth/refresh
{
  "refreshToken": "invalid-or-expired"
}

// Response
{
  "success": false,
  "error": "Invalid refresh token"
}
```

---

## Validation Errors

### Field Validation Failed
```json
// Request
POST /api/v2/auth/send-email-code
{
  "email": "not-an-email"
}

// Response
{
  "errors": [
    {
      "type": "field",
      "value": "not-an-email",
      "msg": "Invalid value",
      "path": "email",
      "location": "body"
    }
  ]
}
```

### Multiple Validation Errors
```json
{
  "errors": [
    {
      "type": "field",
      "msg": "Invalid authentication strategy",
      "path": "strategy",
      "location": "body"
    },
    {
      "type": "field",
      "msg": "Invalid value",
      "path": "email",
      "location": "body"
    }
  ]
}
```

---

## Rate Limiting Errors

### 429 Too Many Requests
```json
// Standard rate limit
{
  "error": "Too many requests - please try again later"
}

// Authentication rate limit
{
  "error": "Too many authentication attempts, please try again later."
}

// Headers included
Retry-After: 60  // Seconds until retry
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1703001234
```

---

## Server Errors

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}

// In development mode, may include:
{
  "error": "Internal server error",
  "message": "Database connection failed",
  "stack": "..."  // Stack trace
}
```

### 503 Service Unavailable
```json
// During maintenance or overload
{
  "error": "Service temporarily unavailable",
  "message": "Please try again later"
}
```

---

## Error Handling Best Practices

### Client-Side Error Handling
```javascript
try {
  const response = await api.post('/api/v2/auth/authenticate', data);
  // Handle success
} catch (error) {
  if (error.response) {
    // Server responded with error
    switch (error.response.status) {
      case 400:
        handleValidationError(error.response.data);
        break;
      case 401:
        handleAuthError(error.response.data);
        break;
      case 429:
        handleRateLimit(error.response.headers['retry-after']);
        break;
      default:
        showGenericError();
    }
  } else {
    // Network error
    handleNetworkError();
  }
}
```

### Retry Logic
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = error.response.headers['retry-after'] || 60;
        await sleep(retryAfter * 1000);
      } else if (error.response?.status >= 500) {
        // Server error - exponential backoff
        await sleep(Math.pow(2, i) * 1000);
      } else {
        // Client error - don't retry
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

### User-Friendly Error Messages
```javascript
const errorMessages = {
  'Invalid or expired verification code': 'The code you entered is incorrect or has expired. Please request a new one.',
  'Cannot delete the last profile': 'You must have at least one profile. Create a new profile before deleting this one.',
  'Token expired': 'Your session has expired. Please log in again.',
  'Too many requests': 'You\'re doing that too often. Please wait a moment and try again.'
};

function getDisplayMessage(error) {
  return errorMessages[error.message] || 'Something went wrong. Please try again.';
}
```

---

## Security Considerations

### Error Information Disclosure
```javascript
// Bad - Reveals too much
{
  "error": "User with email user@example.com not found in database"
}

// Good - Generic message
{
  "error": "Invalid credentials"
}
```

### Timing Attack Prevention
```javascript
// Backend should take consistent time for:
- Valid vs invalid email during login
- Existing vs non-existing accounts
- Use constant-time comparison for sensitive data
```

### Audit Trail for Errors
```javascript
// All authentication errors logged
{
  type: 'AUTH_FAILED',
  details: {
    strategy: 'email',
    reason: 'invalid_code',
    ipAddress: '1.2.3.4',
    timestamp: '2024-01-01T12:00:00Z'
  }
}

// Monitor for:
- Repeated failures from same IP
- Attempts on multiple accounts
- Unusual patterns
```