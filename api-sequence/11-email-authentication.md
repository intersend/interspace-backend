# Email Authentication

## Table of Contents
1. [Overview](#overview)
2. [Request Verification Code](#request-verification-code)
3. [Verify Code](#verify-code)
4. [Resend Code](#resend-code)
5. [Development Endpoints](#development-endpoints)
6. [Email Authentication Flow](#email-authentication-flow)
7. [Security Considerations](#security-considerations)

---

## Overview

The Email Authentication API provides passwordless authentication using one-time verification codes sent to users' email addresses. This system offers a secure and user-friendly alternative to traditional password-based authentication.

### Key Features
- 6-digit secure verification codes
- Bcrypt hashing for code storage
- Rate limiting and attempt tracking
- Automatic code expiration
- Development mode helpers
- Integration with unified authentication system

### Authentication
Email authentication endpoints are public but include strict rate limiting.

### Base URL
```
/api/v2/email-auth
```

---

## Request Verification Code

Sends a 6-digit verification code to the specified email address.

### Request
```
POST /api/v2/email-auth/request-code
Content-Type: application/json
```

#### Request Body
```json
{
  "email": "user@example.com"
}
```

#### Validation Rules
- `email`: Required, valid email format, normalized to lowercase

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Verification code sent to your email",
  "expiresInMinutes": 10
}
```

#### Error Responses
- **400 Bad Request**: Invalid email format
- **429 Too Many Requests**: Rate limit exceeded (3 requests per hour)

### Email Content
The user receives an email with:
```
Subject: Your Interspace verification code

Your verification code is: 123456

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.
```

### Security Features
- Codes are cryptographically secure random numbers
- Hashed with bcrypt before storage
- Old codes automatically cleaned up
- Rate limited to prevent abuse

---

## Verify Code

Verifies the 6-digit code sent to the user's email address.

### Request
```
POST /api/v2/email-auth/verify-code
Content-Type: application/json
```

#### Request Body
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

#### Validation Rules
- `email`: Required, valid email format, normalized to lowercase
- `code`: Required, exactly 6 digits

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Email verified successfully",
  "email": "user@example.com"
}
```

#### Error Responses
- **400 Bad Request**: Invalid email or code format
- **401 Unauthorized**: Invalid or expired verification code

### Verification Process
1. Find active verifications for the email
2. Compare provided code with hashed codes
3. Track failed attempts
4. Delete used verification
5. Create/update user with verified email status

### Side Effects
- Creates new user if email doesn't exist
- Marks email as verified for existing users
- Adds 'email' to user's auth strategies
- Cleans up all verifications for the email

---

## Resend Code

Resends a verification code if one is already active.

### Request
```
POST /api/v2/email-auth/resend-code
Content-Type: application/json
```

#### Request Body
```json
{
  "email": "user@example.com"
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "New verification code sent to your email",
  "expiresInMinutes": 10
}
```

#### Error Responses
- **404 Not Found**: No active verification found
- **429 Too Many Requests**: Must wait 1 minute between resends

### Resend Logic
- Checks for existing active verification
- Enforces 1-minute cooldown between resends
- Deletes old verification
- Generates new code with fresh expiration

---

## Development Endpoints

### Get Last Code (Development Only)

Retrieves the last verification code sent to an email address. **Only available when NODE_ENV=development**.

#### Request
```
GET /api/v2/email-auth/dev/last-code?email=user@example.com
```

#### Response

##### Success (200 OK) - Code Available
```json
{
  "success": true,
  "code": "123456",
  "message": "Development mode: Actual verification code returned"
}
```

##### Success (200 OK) - Code Hashed
```json
{
  "success": true,
  "message": "Code found but hashed. Check server logs for the actual code.",
  "hint": "Look for the log message with the verification code in your terminal"
}
```

##### Error (404 Not Found)
```json
{
  "success": false,
  "message": "No active verification code found for this email"
}
```

#### Security Note
This endpoint is completely disabled in production environments.

---

## Email Authentication Flow

### Complete Authentication Process

1. **Request Code**
```javascript
await fetch('/api/v2/email-auth/request-code', {
  method: 'POST',
  body: JSON.stringify({ email: 'user@example.com' })
});
```

2. **User Receives Email**
- Check email for 6-digit code
- Code expires in 10 minutes

3. **Verify Code**
```javascript
await fetch('/api/v2/email-auth/verify-code', {
  method: 'POST',
  body: JSON.stringify({
    email: 'user@example.com',
    code: '123456'
  })
});
```

4. **Authenticate with Unified Endpoint**
```javascript
await fetch('/api/v2/auth/authenticate', {
  method: 'POST',
  body: JSON.stringify({
    strategy: 'email',
    email: 'user@example.com',
    verificationCode: '123456'
  })
});
```

### Integration with V2 Authentication

Email authentication is integrated with the unified authentication system:

```
POST /api/v2/auth/send-email-code
POST /api/v2/auth/verify-email-code
POST /api/v2/auth/authenticate (with strategy: "email")
```

See [Authentication Flows Documentation](./1-authentication-flows.md#email-authentication---new-user) for complete flow.

---

## Security Considerations

### Code Security
- **Generation**: Cryptographically secure random 6-digit codes
- **Storage**: Bcrypt hashed with cost factor 8
- **Expiration**: 10-minute validity window
- **Attempts**: Maximum 5 attempts per code

### Rate Limiting
- **Request Code**: 3 requests per hour per email
- **Verify Code**: Tracked attempts with lockout
- **Resend Code**: 1-minute cooldown between resends

### Email Security
- Codes sent over secure email transport
- No sensitive data in email content
- Clear expiration warnings
- Phishing prevention text

### Database Security
- Automatic cleanup of expired codes
- No plaintext code storage
- Attempt tracking per verification
- IP and timestamp logging

---

## Error Handling

### Common Error Scenarios

#### Invalid Email Format
```json
{
  "success": false,
  "error": "Invalid email address"
}
```

#### Expired Code
```json
{
  "success": false,
  "error": "Invalid or expired verification code"
}
```

#### Too Many Attempts
```json
{
  "success": false,
  "error": "Too many failed attempts. Please request a new code."
}
```

#### Rate Limited
```json
{
  "success": false,
  "error": "Too many verification requests. Please try again later."
}
```

---

## Best Practices

1. **User Experience**
   - Clear instructions in email
   - Show countdown timer in UI
   - Provide resend option after cooldown
   - Handle errors gracefully

2. **Security**
   - Never log verification codes in production
   - Implement proper rate limiting in UI
   - Clear sensitive data after use
   - Monitor for abuse patterns

3. **Development**
   - Use development endpoint for testing
   - Check server logs for codes in dev mode
   - Test expiration and rate limiting
   - Verify email delivery configuration