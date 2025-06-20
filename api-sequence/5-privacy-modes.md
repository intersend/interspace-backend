# Privacy Modes

## Table of Contents
1. [Overview](#overview)
2. [Privacy Mode Types](#privacy-mode-types)
3. [Setting Privacy Mode](#setting-privacy-mode)
4. [Privacy Mode Effects](#privacy-mode-effects)
5. [Implementation Details](#implementation-details)
6. [Use Cases](#use-cases)

---

## Overview

Privacy modes control how data is shared across linked accounts in the identity graph. They provide users with granular control over their digital identity boundaries.

### Key Concepts
- **Applied per session**: Each login can have different privacy
- **Affects profile access**: Controls which profiles are visible
- **Identity graph traversal**: Determines link following behavior
- **Default mode**: "linked" for full compatibility

---

## Privacy Mode Types

### 1. Linked Mode (Default)
```
privacyMode: "linked"
```
- **Full sharing** across all linked accounts
- **All profiles visible** from any linked account
- **Bidirectional access** to data
- **Changes sync** across all sessions
- **Use case**: Personal accounts fully integrated

### 2. Partial Mode
```
privacyMode: "partial"
```
- **Selective sharing** based on permissions
- **Limited profile visibility**
- **Read-only access** to some data
- **Controlled sync** of changes
- **Use case**: Work/personal separation

### 3. Isolated Mode
```
privacyMode: "isolated"
```
- **No sharing** with linked accounts
- **Only own profiles** visible
- **Independent session**
- **No data sync**
- **Use case**: Complete privacy/testing

---

## Setting Privacy Mode

### During Authentication
```
POST /api/v2/auth/authenticate
Body:
{
  "strategy": "email",
  "email": "user@example.com",
  "verificationCode": "123456",
  "privacyMode": "partial"  // Set mode for this session
}
```

### Privacy Mode in Response
```json
{
  "success": true,
  "account": { ... },
  "profiles": [ ... ],  // Filtered by privacy mode
  "privacyMode": "partial",  // Confirms active mode
  "sessionId": "session123"
}
```

### Changing Privacy Mode (Per Link)
```
PUT /api/v2/auth/link-privacy
Headers:
  Authorization: Bearer <accessToken>
Body:
{
  "targetAccountId": "account456",
  "privacyMode": "isolated"
}
```

---

## Privacy Mode Effects

### Profile Access Query Logic
```javascript
// Simplified getAccessibleProfiles logic
function getAccessibleProfiles(accountId, sessionPrivacyMode) {
  // Step 1: Get direct profiles
  const directProfiles = ProfileAccount.where({ accountId });
  
  // Step 2: Check session privacy mode
  if (sessionPrivacyMode === 'isolated') {
    return directProfiles; // Stop here
  }
  
  // Step 3: Get linked accounts
  const linkedAccounts = IdentityLink.where({
    OR: [
      { accountAId: accountId },
      { accountBId: accountId }
    ],
    privacyMode: { not: 'isolated' }  // Respect link privacy
  });
  
  // Step 4: Apply mode-specific rules
  if (sessionPrivacyMode === 'partial') {
    // Filter based on permissions
    linkedAccounts = filterByPermissions(linkedAccounts);
  }
  
  // Step 5: Get profiles from linked accounts
  const linkedProfiles = ProfileAccount.where({
    accountId: { in: linkedAccounts.map(a => a.id) }
  });
  
  return [...directProfiles, ...linkedProfiles];
}
```

### Access Matrix by Privacy Mode

| Operation | Linked | Partial | Isolated |
|-----------|--------|---------|----------|
| View own profiles | ✅ | ✅ | ✅ |
| View linked profiles | ✅ | ✅ Limited | ❌ |
| Create profile | ✅ | ✅ | ✅ |
| Modify own profiles | ✅ | ✅ | ✅ |
| Modify linked profiles | ✅ | ❌ | ❌ |
| Switch to linked profile | ✅ | ✅ Limited | ❌ |
| Access linked apps | ✅ | ✅ Read-only | ❌ |

---

## Implementation Details

### Database Schema Impact

#### AccountSession Table
```
AccountSession {
  sessionToken: string
  accountId: string
  privacyMode: "linked" | "partial" | "isolated"  // Per-session setting
  activeProfileId: string
  // ... other fields
}
```

#### IdentityLink Table
```
IdentityLink {
  accountAId: string
  accountBId: string
  privacyMode: "linked" | "partial" | "isolated"  // Per-link setting
  // ... other fields
}
```

### Privacy Resolution Logic
```
Effective Privacy = MIN(SessionPrivacy, LinkPrivacy)

Examples:
- Session: "linked" + Link: "partial" = Effective: "partial"
- Session: "partial" + Link: "linked" = Effective: "partial"
- Session: "linked" + Link: "isolated" = Effective: "isolated"
```

### API Response Filtering
```javascript
// All API responses filter data based on privacy mode
function filterResponseByPrivacy(data, privacyMode) {
  switch (privacyMode) {
    case 'linked':
      return data; // No filtering
      
    case 'partial':
      return {
        ...data,
        profiles: data.profiles.filter(p => p.permissions.read),
        // Redact sensitive fields
        apps: data.apps.map(a => ({ id: a.id, name: a.name }))
      };
      
    case 'isolated':
      return {
        ...data,
        profiles: data.profiles.filter(p => p.accountId === currentAccountId),
        linkedAccounts: []
      };
  }
}
```

---

## Use Cases

### 1. Work/Personal Separation
```
User has:
- Personal email account
- Work email account
- Link with privacyMode: "partial"

Behavior:
- Work session sees only work profiles
- Personal session sees all profiles
- No work data leaks to personal apps
```

### 2. Temporary Isolation for Testing
```
POST /api/v2/auth/authenticate
{
  "strategy": "email",
  "email": "user@example.com",
  "verificationCode": "123456",
  "privacyMode": "isolated"
}

Use: Test new features without affecting main profiles
```

### 3. Progressive Privacy
```
// Start with full sharing
Initial link: privacyMode = "linked"

// User wants more privacy
PUT /api/v2/auth/link-privacy
{ privacyMode: "partial" }

// Complete separation if needed
PUT /api/v2/auth/link-privacy
{ privacyMode: "isolated" }
```

### 4. Multi-Device Privacy
```
Phone: privacyMode = "linked"    // Full access
Laptop: privacyMode = "partial"  // Work only
Public PC: privacyMode = "isolated" // Minimal exposure
```

---

## Privacy Mode Interactions

### With Profile Operations
```
// Create profile - always succeeds
POST /api/v2/profiles
→ Creates under current account
→ Visible based on privacy mode

// Switch profile - filtered by mode
POST /api/v2/auth/switch-profile/:id
→ Only to accessible profiles
→ 404 if profile not visible due to privacy
```

### With Account Linking
```
// Linking respects current privacy
POST /api/v2/auth/link-accounts
{
  "targetType": "wallet",
  "targetIdentifier": "0x...",
  "privacyMode": "partial"  // Sets link privacy
}

// Session privacy still applies
Even if link is "linked", session "isolated" blocks access
```

### With Token Refresh
```
// Privacy mode preserved
POST /api/v2/auth/refresh
→ New tokens maintain same privacy mode
→ No database lookup needed
```

---

## Best Practices

### For Applications
1. **Respect privacy boundaries** - Don't assume full access
2. **Handle filtered responses** - Profiles list may vary
3. **Clear privacy indicators** - Show users their mode
4. **Graceful degradation** - Work with limited data

### For Users
1. **Default to linked** for convenience
2. **Use partial** for work/personal separation  
3. **Use isolated** for testing or public devices
4. **Review linked accounts** regularly

### Security Considerations
```javascript
// Always check privacy mode in backend
if (session.privacyMode === 'isolated') {
  throw new Error('Operation not allowed in isolated mode');
}

// Filter sensitive operations
if (session.privacyMode === 'partial' && operation.type === 'write') {
  throw new Error('Write operations not allowed in partial mode');
}
```

---

## Error Handling

### Privacy-Related Errors

#### 403 Forbidden
```json
{
  "error": "Operation not allowed in current privacy mode",
  "code": "PRIVACY_MODE_RESTRICTION",
  "currentMode": "partial",
  "requiredMode": "linked"
}
```

#### 404 Not Found (Due to Privacy)
```json
{
  "error": "Profile not found or not accessible",
  "code": "PROFILE_NOT_ACCESSIBLE"
}
```

### Client Handling
```javascript
// Detect privacy restrictions
if (error.code === 'PRIVACY_MODE_RESTRICTION') {
  showMessage('This operation requires full access mode');
  promptForPrivacyModeChange();
}
```