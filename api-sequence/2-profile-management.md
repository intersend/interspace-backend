# Profile Management

## Table of Contents
1. [Automatic Profile Creation](#automatic-profile-creation)
2. [Get All Profiles](#get-all-profiles)
3. [Create Additional Profile](#create-additional-profile)
4. [Get Specific Profile](#get-specific-profile)
5. [Update Profile](#update-profile)
6. [Switch Active Profile](#switch-active-profile)
7. [Delete Profile](#delete-profile)
8. [Rotate Session Wallet](#rotate-session-wallet)

---

## Automatic Profile Creation

This happens automatically during first-time authentication for any strategy.

### Internal Flow (Not a direct API call)
```
Authentication Process          Backend Logic                   Database
  |                               |                                |
  |-- User authenticates -------->|                                |
  |   (first time)                |-- Check profiles count ------->|
  |                               |   profiles.length === 0        |
  |                               |-- Create SessionWallet ------->|
  |                               |   {isDevelopment: true}        |
  |                               |-- Create SmartProfile -------->|
  |                               |   {                            |
  |                               |     name: "My Smartprofile",   |
  |                               |     userId: user.id,           |
  |                               |     sessionWalletAddress,      |
  |                               |     isActive: true,            |
  |                               |     isDevelopmentWallet: true, |
  |                               |     createdByAccountId         |
  |                               |   }                            |
  |                               |-- Create ProfileAccount ------>|
  |                               |   {                            |
  |                               |     profileId,                 |
  |                               |     accountId,                 |
  |                               |     isPrimary: true            |
  |                               |   }                            |
```

### Key Points
- Only happens when user has no profiles
- Always named "My Smartprofile"
- Always uses development wallet (no MPC)
- Automatically set as active profile
- Linked as primary to the creating account

---

## Get All Profiles

### Request
```
GET /api/v2/profiles
Headers:
  Authorization: Bearer <accessToken>
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- GET /api/v2/profiles ------>|                                |
  |   Authorization: Bearer ...   |-- Extract accountId from JWT ->|
  |                               |-- Get linked accounts -------->|
  |                               |   via identity graph           |
  |                               |-- Get ProfileAccounts -------->|
  |                               |   for all linked accounts      |
  |                               |-- Load full profiles --------->|
  |                               |   with counts and folders      |
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    data: [                    |                                |
  |      {id, name, isActive,     |                                |
  |       sessionWalletAddress,   |                                |
  |       linkedAccountsCount,    |                                |
  |       appsCount,              |                                |
  |       foldersCount,           |                                |
  |       isDevelopmentWallet,    |                                |
  |       createdAt, updatedAt}   |                                |
  |    ]}                         |                                |
```

### Privacy Mode Impact
- **linked**: Returns all profiles from all linked accounts
- **partial**: May filter based on permissions
- **isolated**: Only returns profiles from current account

---

## Create Additional Profile

### Request
```
POST /api/v2/profiles
Headers:
  Authorization: Bearer <accessToken>
Body:
{
  "name": "Work Profile",
  "isDevelopmentWallet": true,  // optional, defaults to true
  "clientShare": "..."          // optional, for production wallets
}
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/profiles ----->|                                |
  |   {name: "Work Profile"}      |-- Validate name length ------->|
  |                               |   (1-50 characters)            |
  |                               |-- Get account from JWT ------->|
  |                               |-- Find/create User ----------->|
  |                               |   (for backward compatibility) |
  |                               |-- Create SessionWallet ------->|
  |                               |   {isDevelopment: true}        |
  |                               |-- Create SmartProfile -------->|
  |                               |   {                            |
  |                               |     name: "Work Profile",      |
  |                               |     userId,                    |
  |                               |     sessionWalletAddress,      |
  |                               |     isActive: false,           |
  |                               |     isDevelopmentWallet: true  |
  |                               |   }                            |
  |                               |-- Link to account ------------>|
  |                               |   ProfileAccount.create()      |
  |<-- 201 Created ---------------|                                |
  |   {success: true,             |                                |
  |    data: {                    |                                |
  |      id: "profile456",        |                                |
  |      name: "Work Profile",    |                                |
  |      sessionWalletAddress,    |                                |
  |      isActive: false,         |                                |
  |      isDevelopmentWallet: true|                                |
  |    }}                         |                                |
```

### Validation Rules
- Name: 1-50 characters, required
- isDevelopmentWallet: boolean, optional (defaults to true in V2)
- clientShare: string, only used if isDevelopmentWallet is false

---

## Get Specific Profile

### Request
```
GET /api/v2/profiles/:profileId
Headers:
  Authorization: Bearer <accessToken>
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- GET /api/v2/profiles/123 -->|                                |
  |                               |-- Get accessible profiles ----->|
  |                               |-- Check if profileId in list ->|
  |                               |-- Return 404 if not found ---->|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    data: {                    |                                |
  |      id, name, ...            |                                |
  |    }}                         |                                |
```

### Access Control
- Only returns profiles accessible to the current account
- Respects privacy mode boundaries
- Returns 404 if profile not found OR not accessible

---

## Update Profile

### Request
```
PUT /api/v2/profiles/:profileId
Headers:
  Authorization: Bearer <accessToken>
Body:
{
  "name": "Updated Profile Name"
}
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- PUT /api/v2/profiles/123 -->|                                |
  |   {name: "New Name"}          |-- Check profile access ------->|
  |                               |-- Validate new name ---------->|
  |                               |-- Update SmartProfile -------->|
  |                               |   {name: "New Name"}          |
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    data: {updated profile}}   |                                |
```

### Currently Updatable Fields
- `name`: The only field that can be updated via API
- Session wallet rotation is a separate endpoint

---

## Switch Active Profile

### Request
```
POST /api/v2/auth/switch-profile/:profileId
Headers:
  Authorization: Bearer <accessToken>
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   switch-profile/456 -------->|                                |
  |                               |-- Verify profile access ------>|
  |                               |-- Update AccountSession ------>|
  |                               |   {activeProfileId: 456}       |
  |                               |-- Update SmartProfiles ------->|
  |                               |   old: {isActive: false}       |
  |                               |   new: {isActive: true}        |
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    activeProfile: {           |                                |
  |      id: "456",               |                                |
  |      name: "Work Profile",    |                                |
  |      sessionWalletAddress     |                                |
  |    }}                         |                                |
```

### Effects
- Changes activeProfileId in current session
- Updates isActive flag on profiles
- New tokens will include the new activeProfileId
- Subsequent API calls use the new active profile

---

## Delete Profile

### Request
```
DELETE /api/v2/profiles/:profileId
Headers:
  Authorization: Bearer <accessToken>
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- DELETE /api/v2/profiles/456>|                                |
  |                               |-- Check profile access ------->|
  |                               |-- Count total profiles ------->|
  |                               |-- If count === 1:              |
  |                               |   Return 400 error             |
  |                               |-- If count > 1:                |
  |                               |   - Delete ProfileAccounts --->|
  |                               |   - Delete SmartProfile ------>|
  |                               |   - Delete related data ------>|
  |<-- 200 OK or 400 Error -------|                                |
```

### Deletion Rules
- **Cannot delete last profile** - Returns 400 error
- Deletes all ProfileAccount links
- Cascades to delete apps, folders, etc.
- If deleted profile was active, user must switch

### Error Response (Last Profile)
```json
{
  "success": false,
  "error": "Cannot delete the last profile"
}
```

---

## Rotate Session Wallet

### Request
```
POST /api/v2/profiles/:profileId/rotate-wallet
Headers:
  Authorization: Bearer <accessToken>
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/profiles/123/  |                                |
  |   rotate-wallet ------------->|                                |
  |                               |-- Check profile access ------->|
  |                               |-- Create new SessionWallet --->|
  |                               |-- Update SmartProfile -------->|
  |                               |   {sessionWalletAddress: new}  |
  |                               |-- Migrate necessary data ----->|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    data: {                    |                                |
  |      id: "123",               |                                |
  |      name: "...",             |                                |
  |      sessionWalletAddress:    |                                |
  |        "0xNEW_ADDRESS",       |                                |
  |      message: "Session wallet |                                |
  |        rotated successfully"   |                                |
  |    }}                         |                                |
```

### Important Notes
- Only rotates the session wallet address
- Does not affect MPC keys or shares
- Existing apps may need to update their references
- Development wallets can be rotated freely

---

## Profile Access Matrix

| Operation | Own Profiles | Linked Account Profiles | Privacy Mode Impact |
|-----------|--------------|------------------------|-------------------|
| Get All | ✅ Always | ✅ If linked mode | Based on mode |
| Get One | ✅ Always | ✅ If accessible | Based on mode |
| Create | ✅ Always | ❌ Never | N/A |
| Update | ✅ Always | ✅ If accessible | Based on mode |
| Delete | ✅ Always | ✅ If accessible | Based on mode |
| Switch To | ✅ Always | ✅ If accessible | Based on mode |
| Rotate Wallet | ✅ Always | ✅ If accessible | Based on mode |

---

## State Management

### Profile States
```
SmartProfile:
- isActive: boolean (only one active per user)
- isDevelopmentWallet: boolean (V2 defaults to true)
- sessionWalletAddress: string (unique per profile)

ProfileAccount:
- isPrimary: boolean (first profile is primary)
- permissions: JSON (for future permission system)
```

### Session State
```
AccountSession:
- activeProfileId: string (current active profile)
- Updates on switch-profile calls
```

---

## Common Errors

### 400 Bad Request
- Invalid name length (not 1-50 chars)
- Trying to delete last profile
- Missing required fields

### 401 Unauthorized
- Invalid or expired token
- No Authorization header

### 404 Not Found
- Profile doesn't exist
- Profile not accessible to account

### 403 Forbidden
- Trying to modify profile without access
- Privacy mode restrictions