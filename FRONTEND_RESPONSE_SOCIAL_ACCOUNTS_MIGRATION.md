# Backend Architecture Update Complete - Social Accounts Migration

## ✅ Migration Status: COMPLETE

The backend has been successfully updated to move social accounts from profile-level to user-level management. This aligns with the requested architecture where authentication methods (social accounts) are separated from transaction wallets (EOAs).

## 🔄 Summary of Changes

### Database Schema
- ✅ `SocialProfile` model updated: `profileId` → `userId`
- ✅ Relationship changed from SmartProfile → User
- ✅ New migration created and applied

### API Endpoints

#### ❌ Removed (Deprecated)
```
DELETE /api/v1/profiles/:profileId/sync-social
DELETE /api/v1/profiles/:profileId/social-profiles  
DELETE /api/v1/profiles/:profileId/social-profiles/:socialProfileId
```

#### ✅ Added (New)
```
GET    /api/v1/users/me                      # Includes socialAccounts in response
GET    /api/v1/users/me/social-accounts      # Get all social accounts for current user
POST   /api/v1/users/me/social-accounts      # Link new social account to user
DELETE /api/v1/users/me/social-accounts/:id  # Unlink social account from user
```

## 📋 API Usage Examples

### 1. Get Current User (includes social accounts)
```typescript
GET /api/v1/users/me

Response:
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "authStrategies": ["telegram", "google"],
    "isGuest": false,
    "profilesCount": 3,
    "linkedAccountsCount": 2,
    "activeDevicesCount": 1,
    "socialAccounts": [
      {
        "id": "social_123",
        "provider": "telegram",
        "username": "@username",
        "displayName": "User Name",
        "avatarUrl": "https://...",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      },
      {
        "id": "social_456",
        "provider": "google",
        "username": "user@gmail.com",
        "displayName": "Google User",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### 2. Get User's Social Accounts Only
```typescript
GET /api/v1/users/me/social-accounts

Response:
{
  "success": true,
  "data": [
    {
      "id": "social_123",
      "provider": "telegram",
      "username": "@username",
      "displayName": "User Name",
      "avatarUrl": "https://...",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 3. Link New Social Account
```typescript
POST /api/v1/users/me/social-accounts
{
  "provider": "farcaster",
  "oauthCode": "oauth_code_from_provider",
  "redirectUri": "https://app.interspace.com/callback" // optional
}

Response:
{
  "success": true,
  "data": {
    "id": "social_789",
    "provider": "farcaster",
    "username": "farcaster_user",
    "displayName": "Farcaster User",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "message": "farcaster account linked successfully"
}
```

### 4. Unlink Social Account
```typescript
DELETE /api/v1/users/me/social-accounts/:id

Response:
{
  "success": true,
  "message": "Social account unlinked successfully"
}
```

### 5. Profile Endpoints (NO social data)
```typescript
GET /api/v1/profiles/:profileId

Response:
{
  "success": true,
  "data": {
    "id": "profile_123",
    "name": "Trading",
    "sessionWalletAddress": "0x...",
    "isActive": true,
    "linkedAccountsCount": 2,      // EOA wallets only
    "appsCount": 5,
    "foldersCount": 3,
    // NO socialProfilesCount field
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

## 🔑 Key Implementation Notes

### 1. Authentication Flow
- Social accounts now authenticate at the **user level**
- One social login provides access to **all profiles**
- Social accounts are **not** profile-specific

### 2. Profile Cards UI
- Should only display **EOA wallets** (linkedAccounts)
- Remove any social account options from profile-level UI
- Social accounts should only appear in **Account Settings**

### 3. Type Updates
```typescript
// SmartProfileResponse no longer includes socialProfilesCount
interface SmartProfileResponse {
  id: string;
  name: string;
  sessionWalletAddress: string;
  isActive: boolean;
  linkedAccountsCount: number;  // EOA wallets only
  appsCount: number;
  foldersCount: number;
  // socialProfilesCount removed
  createdAt: string;
  updatedAt: string;
}

// New UserResponse type includes social accounts
interface UserResponse {
  id: string;
  email?: string;
  authStrategies: string[];
  isGuest: boolean;
  profilesCount: number;
  linkedAccountsCount: number;
  activeDevicesCount: number;
  socialAccounts: SocialAccountResponse[];  // NEW
  createdAt: string;
  updatedAt: string;
}

// Social account type (user level)
interface SocialAccountResponse {
  id: string;
  provider: SocialProvider;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

type SocialProvider = 'farcaster' | 'telegram' | 'twitter' | 'discord' | 'google';
```

## ✨ Benefits Confirmed

1. **Clearer Mental Model**: ✅ Social logins = authentication, wallets = transactions
2. **Simplified Permissions**: ✅ One social login gives access to all profiles
3. **Better Security**: ✅ Social accounts at user level reduces attack surface
4. **Easier Account Recovery**: ✅ Multiple social accounts can be linked for recovery
5. **Profile Portability**: ✅ Profiles are purely functional groupings of wallets

## 🚀 Next Steps for Frontend

1. Update API calls to use new user endpoints for social accounts
2. Remove social account UI from profile cards
3. Update Account Settings to show user-level social accounts
4. Update types to match new response formats
5. Test authentication flow with new endpoints

## ⚠️ Important Notes

- **No backwards compatibility** - old endpoints have been removed
- **No data migration needed** - starting fresh (not in production)
- **Authentication unchanged** - Still uses Thirdweb auth tokens
- **Profile functionality unchanged** - Only social accounts moved

## 📞 Support

If you encounter any issues or need clarification:
- Check the updated type definitions in `src/types/index.ts`
- Review the new user service implementation
- The authentication flow through Thirdweb remains the same

---

**Backend Team**  
*Updated: December 4, 2024*
