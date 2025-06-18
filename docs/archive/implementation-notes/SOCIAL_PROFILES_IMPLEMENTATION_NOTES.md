# Social Profiles Implementation Notes for Frontend Team

## ✅ What's Been Implemented

### 1. **Database Schema** (Already existed)
- `SocialProfile` model with all required fields
- Unique constraints on `profileId + provider` and `provider + providerId`

### 2. **New API Endpoints**
```typescript
// Get all social profiles for a SmartProfile
GET /profiles/:profileId/social-profiles
Response: {
  success: true,
  data: [
    {
      id: "social_profile_id",
      provider: "discord",
      username: "user#1234",
      displayName: "User Name",
      avatarUrl: "https://...",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    }
  ]
}

// Delete a specific social profile
DELETE /profiles/:profileId/social-profiles/:socialProfileId
Response: {
  success: true,
  message: "Social profile deleted successfully"
}

// Existing sync endpoint (improved)
POST /profiles/:profileId/sync-social
Body: {
  thirdwebProfiles: [
    {
      type: "discord",
      details: {
        id: "discord_user_id",         // Now properly handled
        email: "user@example.com",
        username: "user#1234",
        name: "User Name",
        avatarUrl: "https://..."
      }
    }
  ]
}
```

### 3. **Profile Response Updates**
All profile endpoints now include `socialProfilesCount`:
```typescript
{
  id: "profile_id",
  name: "Trading",
  sessionWalletAddress: "0x...",
  isActive: true,
  linkedAccountsCount: 2,
  appsCount: 5,
  foldersCount: 3,
  socialProfilesCount: 2,  // NEW
  createdAt: "...",
  updatedAt: "..."
}
```

### 4. **Provider ID Handling**
The sync endpoint now intelligently determines provider IDs in this priority order:
1. `details.id` (if available)
2. `details.userId` (fallback)
3. `details.email` (fallback)
4. `details.username` (fallback)
5. `${provider}_${timestamp}` (last resort)

This ensures compatibility with different social providers that may use different ID fields.

### 5. **Security & Audit**
- All endpoints verify profile ownership
- All operations are logged in audit table
- Proper error handling with appropriate HTTP status codes

## 📝 Migration Notes

- **No migration needed** - The database already has the `SocialProfile` table
- **Existing sync endpoint** still works but now handles provider IDs better
- **Backward compatible** - All existing functionality remains unchanged

## 🔧 Example Usage

```javascript
// Get social profiles for a SmartProfile
const response = await fetch('/profiles/profile123/social-profiles', {
  headers: { 'Authorization': 'Bearer ...' }
});

// Delete a social profile
await fetch('/profiles/profile123/social-profiles/social456', {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer ...' }
});

// Sync social profiles from Thirdweb
await fetch('/profiles/profile123/sync-social', {
  method: 'POST',
  headers: { 
    'Authorization': 'Bearer ...',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    thirdwebProfiles: [
      {
        type: 'discord',
        details: { 
          id: 'discord123',
          username: 'user#1234',
          // ... other fields
        }
      }
    ]
  })
});
```

## ✅ Summary

The backend now fully supports storing social profiles per SmartProfile as requested. The frontend can:
1. Sync social profiles from Thirdweb using the existing endpoint (with improved ID handling)
2. Retrieve all social profiles for a SmartProfile
3. Delete individual social profiles
4. See social profile counts in all profile responses

No changes needed for authentication flow or session wallet management.
