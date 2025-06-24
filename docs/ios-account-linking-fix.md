# iOS Account Linking Fix

## Problem
When users try to add an email account to their existing wallet profile, a new profile is being created instead of linking the email to the existing account.

## Root Cause
The iOS app is calling `/api/v2/auth/authenticate` (which creates new accounts) instead of `/api/v2/auth/link-accounts` (which links accounts together).

## Correct Implementation

### 1. When User Wants to Add Email Account

```swift
// Step 1: Send verification code
POST /api/v2/auth/send-email-code
{
  "email": "user@example.com"
}

// Step 2: After user enters code, link the account
POST /api/v2/auth/link-accounts
Authorization: Bearer {current_access_token}
{
  "targetType": "email",
  "targetIdentifier": "user@example.com",
  "linkType": "direct",
  "privacyMode": "linked"
}
```

### 2. Key Differences

#### Wrong (Current) Flow:
- `/api/v2/auth/authenticate` with email strategy
- Creates NEW account and profile
- User loses access to original wallet profile

#### Correct Flow:
- `/api/v2/auth/link-accounts` with current auth token
- Links email to existing wallet account
- User keeps same profile with multiple login methods

### 3. Response Format

Successful link response:
```json
{
  "success": true,
  "link": {
    "id": "link_id",
    "accountAId": "wallet_account_id",
    "accountBId": "email_account_id",
    "linkType": "direct",
    "privacyMode": "linked"
  },
  "linkedAccount": {
    "id": "email_account_id",
    "type": "email",
    "identifier": "user@example.com",
    "verified": true
  },
  "accessibleProfiles": [
    {
      "id": "profile_id",
      "name": "My Smartprofile",
      "linkedAccountsCount": 2
    }
  ]
}
```

### 4. Implementation Notes

- The `/api/v2/auth/link-accounts` endpoint requires authentication (Bearer token)
- The email verification code is handled internally by the backend when linking
- After successful linking, the user can log in with either wallet OR email to access the same profile
- The `privacyMode` parameter controls data sharing between linked accounts:
  - `"linked"` - Full data sharing
  - `"partial"` - Limited sharing
  - `"isolated"` - No sharing

### 5. Error Handling

Common errors:
- 401: "Authentication required" - Missing or invalid access token
- 409: "Accounts are already linked" - Email already linked to this account
- 409: "Target account is already linked to another identity" - Email linked to different user

## Testing

To test the fix:
1. Log in with wallet
2. Go to profile settings
3. Add email account
4. Verify the same profile is maintained (no new profile created)
5. Log out and log back in with email - should see same profile