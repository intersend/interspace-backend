# Session Management

## Table of Contents
1. [Token Structure](#token-structure)
2. [Token Refresh Flow](#token-refresh-flow)
3. [Logout Flow](#logout-flow)
4. [Session Expiry](#session-expiry)
5. [Token Blacklisting](#token-blacklisting)
6. [Device Management](#device-management)

---

## Token Structure

### Access Token (JWT)
```javascript
// Decoded payload
{
  // V2 fields
  "accountId": "cmc5bsinw0001mr2n5f09oj7h",
  "sessionToken": "uuid-v4-session-token",
  "activeProfileId": "profile123",
  "version": "v2",
  
  // Legacy support
  "userId": "user123",  // Optional, for backward compatibility
  "deviceId": "device-uuid",
  
  // Standard JWT claims
  "type": "access",
  "iat": 1703001234,  // Issued at
  "exp": 1703002134   // Expires (15 minutes)
}
```

### Refresh Token (JWT)
```javascript
{
  // Same fields as access token
  "accountId": "cmc5bsinw0001mr2n5f09oj7h",
  "sessionToken": "uuid-v4-session-token",
  "activeProfileId": "profile123",
  "version": "v2",
  
  "userId": "user123",
  "deviceId": "device-uuid",
  
  "type": "refresh",
  "iat": 1703001234,
  "exp": 1703606034   // Expires (7 days)
}
```

### Token Generation
```javascript
// Internal process during authentication
const { accessToken, refreshToken } = await generateTokens({
  accountId: account.id,
  sessionToken: session.sessionToken,
  activeProfileId: activeProfile.id,
  deviceId: deviceInfo.deviceId,
  userId: account.userId  // For backward compatibility
});
```

---

## Token Refresh Flow

### Request
```
POST /api/v2/auth/refresh
Body:
{
  "refreshToken": "eyJ..."
}
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/refresh ->|                                |
  |   {refreshToken: "eyJ..."}    |-- Verify refresh token ------->|
  |                               |   - Check signature            |
  |                               |   - Check expiry               |
  |                               |   - Check blacklist ---------->|
  |                               |-- Extract claims:              |
  |                               |   - accountId                  |
  |                               |   - sessionToken               |
  |                               |   - activeProfileId            |
  |                               |-- Generate new tokens -------->|
  |                               |   - New access token (15min)   |
  |                               |   - New refresh token (7days)  |
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    tokens: {                  |                                |
  |      accessToken: "eyJ...",   |                                |
  |      refreshToken: "eyJ..."   |                                |
  |    }}                         |                                |
```

### Key Points
- Old refresh token remains valid until expiry
- New tokens have fresh timestamps
- Session state (activeProfileId) is preserved
- No database lookup needed (all info in token)

### Error Cases
```json
// 401 - Invalid token
{
  "success": false,
  "error": "Invalid refresh token"
}

// 401 - Expired token
{
  "success": false,
  "error": "Token expired"
}
```

---

## Logout Flow

### Request
```
POST /api/v2/auth/logout
Headers:
  Authorization: Bearer <accessToken>
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/logout -->|                                |
  |   Authorization: Bearer ...   |-- Extract sessionToken ------->|
  |                               |-- Delete AccountSession ------>|
  |                               |   WHERE sessionToken = ...     |
  |                               |-- Blacklist access token ----->|
  |                               |   BlacklistedToken.create()    |
  |                               |   {token, type: "access",      |
  |                               |    reason: "logout",           |
  |                               |    expiresAt: token.exp}       |
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    message: "Logged out"}     |                                |
```

### Logout Effects
1. **Session Deletion**: AccountSession record removed
2. **Token Blacklisting**: Access token added to blacklist
3. **Immediate Effect**: Token rejected on next use
4. **Refresh Token**: Implicitly invalidated (session gone)

### Error Handling
- Always returns success (even if issues)
- Logs errors internally
- Prevents logout loops

---

## Session Expiry

### Token Lifetimes
```
Access Token:  15 minutes
Refresh Token: 7 days
Session:       7 days (matches refresh token)
```

### Expiry Scenarios

#### 1. Access Token Expires (Normal)
```
Client                          Backend
  |-- API call with expired ----->|
  |   access token                |-- Returns 401 ---------------->|
  |<-- 401 Token Expired ---------|   "Token expired"              |
  |                               |                                |
  |-- POST /api/v2/auth/refresh ->|                                |
  |   with valid refresh token    |-- Issue new tokens ----------->|
  |<-- 200 OK with new tokens ----|                                |
  |                               |                                |
  |-- Retry API call with ------->|                                |
  |   new access token            |-- Success -------------------->|
```

#### 2. Session Expires (7 days)
```
AccountSession.expiresAt < now
→ Session rejected
→ Must re-authenticate
→ Returns to login screen
```

#### 3. Forced Expiry (Security)
```
Admin action or security event
→ Blacklist all tokens
→ Delete session
→ Force re-authentication
```

---

## Token Blacklisting

### Blacklist Triggers
1. **Logout**: User-initiated
2. **Security**: Suspicious activity
3. **Password Change**: Invalidate old sessions
4. **Token Rotation**: Replace compromised tokens

### Blacklist Check Flow
```
Every API Request
  |
  ├─→ Extract token from Authorization header
  |
  ├─→ Verify JWT signature and expiry
  |
  ├─→ Check BlacklistedToken table
  |    WHERE token = ... AND expiresAt > now
  |
  ├─→ If blacklisted: Return 401
  |
  └─→ If clean: Continue request
```

### Blacklist Record
```javascript
{
  token: "full-jwt-token",
  tokenType: "access" | "refresh",
  userId: "user-or-account-id",
  reason: "logout" | "security" | "rotation" | "password_change",
  expiresAt: Date  // Matches token expiry
}
```

### Cleanup
- Expired blacklist entries can be deleted
- Prevents table from growing indefinitely
- Cleanup job runs periodically

---

## Device Management

### Device Tracking
```javascript
// Included in authentication request
{
  "deviceId": "unique-device-id",  // Client-generated UUID
  "deviceName": "iPhone 14",        // Optional
  "deviceType": "ios"               // ios, android, web
}
```

### Session with Device Info
```
AccountSession {
  sessionToken: "uuid",
  accountId: "account123",
  deviceId: "device-uuid",
  ipAddress: "1.2.3.4",
  userAgent: "Mozilla/5.0...",
  privacyMode: "linked",
  activeProfileId: "profile123",
  expiresAt: Date,
  lastActiveAt: Date
}
```

### Device-Specific Operations

#### List Active Sessions
```
GET /api/v2/auth/sessions
Headers:
  Authorization: Bearer <accessToken>

Response:
{
  "sessions": [{
    "sessionId": "session123",
    "deviceId": "device-uuid",
    "deviceName": "iPhone 14",
    "ipAddress": "1.2.3.4",
    "lastActiveAt": "2024-01-01T12:00:00Z",
    "current": true
  }]
}
```

#### Logout Specific Device
```
POST /api/v2/auth/logout-device
Headers:
  Authorization: Bearer <accessToken>
Body:
{
  "deviceId": "device-uuid"
}
```

#### Logout All Devices
```
POST /api/v2/auth/logout-all
Headers:
  Authorization: Bearer <accessToken>

Effects:
- Deletes all AccountSessions for account
- Blacklists all active tokens
- Forces re-authentication everywhere
```

---

## Session State Management

### What's Stored in Session
```
AccountSession {
  // Identity
  accountId: string
  sessionToken: string (unique)
  
  // State
  activeProfileId: string
  privacyMode: "linked" | "partial" | "isolated"
  
  // Device/Location
  deviceId: string
  ipAddress: string
  userAgent: string
  
  // Timestamps
  createdAt: DateTime
  expiresAt: DateTime
  lastActiveAt: DateTime
}
```

### Session Updates
- **lastActiveAt**: Updated on each authenticated request
- **activeProfileId**: Changed via switch-profile endpoint
- **privacyMode**: Can be changed per session

### Session Security
1. **Unique Tokens**: UUID v4 for session tokens
2. **IP Validation**: Optional IP pinning
3. **User Agent**: Detect device changes
4. **Activity Monitoring**: Track lastActiveAt

---

## Best Practices for Clients

### Token Storage
```javascript
// Secure storage
localStorage.setItem('accessToken', token);     // Web
AsyncStorage.setItem('accessToken', token);     // React Native
Keychain.setItem('refreshToken', token);        // iOS Keychain

// Never store in:
// - Cookies (CSRF risk)
// - URL parameters
// - Non-secure storage
```

### Automatic Token Refresh
```javascript
// Axios interceptor example
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401 && 
        error.response?.data?.error === 'Token expired') {
      
      const newTokens = await refreshTokens();
      error.config.headers.Authorization = `Bearer ${newTokens.accessToken}`;
      return axios.request(error.config);
    }
    return Promise.reject(error);
  }
);
```

### Logout Best Practices
```javascript
async function logout() {
  try {
    // 1. Call logout endpoint
    await api.post('/api/v2/auth/logout');
  } catch (error) {
    // Continue even if fails
  }
  
  // 2. Clear local storage
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  
  // 3. Redirect to login
  window.location.href = '/login';
}
```

### Session Monitoring
```javascript
// Check token expiry
function isTokenExpired(token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.exp * 1000 < Date.now();
}

// Preemptive refresh
setInterval(async () => {
  if (shouldRefreshToken()) {
    await refreshTokens();
  }
}, 60000); // Check every minute
```