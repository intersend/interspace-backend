# Wallet Auto-Linking Fix for Existing Users

## Problem
When existing users authenticate with a wallet, the wallet was not being automatically linked as a LinkedAccount in their profile. This caused:
- `linkedAccountsCount` showing as 0
- Wallet not appearing in Orby cluster
- Wallet unable to perform transactions

## Solution
Added auto-linking logic for existing users during authentication in `authControllerV2.js`.

## Changes Made

### 1. **authControllerV2.js** - Added Auto-Linking for Existing Users
```javascript
// For existing users (lines 879-915)
} else {
  // Use the most recently active profile
  activeProfile = profiles.find(p => p.isActive) || profiles[0];
  
  // For existing users, ensure their auth account is auto-linked to the profile
  // This is especially important for wallet accounts that need transaction capabilities
  if (activeProfile) {
    try {
      await accountLinkingService.autoLinkAccountToProfile(account, activeProfile);
      logger.info(`Ensured account ${account.id} (${account.type}) is properly linked to profile ${activeProfile.id}`);
      
      // Refresh the profile data to include the newly linked account
      const updatedProfiles = await accountService.getAccessibleProfiles(account.id);
      const updatedActiveProfile = updatedProfiles.find(p => p.id === activeProfile.id);
      if (updatedActiveProfile) {
        activeProfile = updatedActiveProfile;
        // Update the profiles array with refreshed data
        profiles.length = 0;
        profiles.push(...updatedProfiles);
      }
    } catch (error) {
      // Don't fail authentication if auto-linking fails
      logger.error(`Failed to auto-link account for existing user:`, error);
    }
  }
}
```

### 2. **Response Structure Updates** - Added Profile Counts
Updated authentication responses to include actual counts instead of hardcoded 0s:
```javascript
profiles: profiles.map(p => ({
  id: p.id,
  displayName: p.name,
  // ... other fields ...
  linkedAccountsCount: p.linkedAccounts?.length || 0,
  appsCount: p.folders?.reduce((total, folder) => total + (folder.apps?.length || 0), 0) || 0,
  foldersCount: p.folders?.length || 0
}))
```

### 3. **Test Script** - Created Verification Tool
Created `scripts/test-wallet-auto-linking.js` to verify the implementation and check wallet linking status.

## How It Works

1. **New Users**: When a new user authenticates with a wallet, `createAutomaticProfile` already handles auto-linking (existing functionality)

2. **Existing Users**: When an existing user authenticates with a wallet:
   - The `accountLinkingService.autoLinkAccountToProfile` method is called
   - It checks if the wallet is already linked
   - If not, it creates a LinkedAccount entry
   - The Orby cluster is updated to include the wallet
   - Profile data is refreshed to reflect the new linked account

3. **Account Linking Service**: Uses the existing `accountLinkingService` which:
   - Handles different account types (wallet, social, email, etc.)
   - Creates LinkedAccount entries with proper metadata
   - Updates Orby clusters
   - Logs audit trails

## Benefits

1. **Consistent Behavior**: Both new and existing users get their wallets auto-linked
2. **Transaction Capability**: Linked wallets can perform transactions through Orby
3. **Accurate Counts**: `linkedAccountsCount` reflects actual linked accounts
4. **Non-Breaking**: Failures in auto-linking don't break authentication

## Testing

Run the test script to verify wallet linking:
```bash
node scripts/test-wallet-auto-linking.js
```

This will show:
- Profiles without the test wallet linked
- Profiles with the wallet already linked
- Wallet account status
- ProfileAccount links

## Related Files

- `/src/controllers/authControllerV2.js` - Main authentication controller
- `/src/services/accountLinkingService.js` - Handles account linking logic
- `/src/services/accountService.js` - Account management service
- `/src/services/orbyService.js` - Updates Orby clusters