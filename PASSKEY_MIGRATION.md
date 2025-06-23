# Passkey Support Migration

## Database Migration Required

The passkey implementation requires database schema changes. Run the following command to create and apply the migration:

```bash
# Create a new migration
npx prisma migrate dev --name add_passkey_support

# Or if you want to review first
npx prisma migrate dev --name add_passkey_support --create-only
npx prisma migrate dev
```

## Schema Changes

The following changes were made to the Prisma schema:

1. **Updated PasskeyCredential model**:
   - Added `userId` field with relation to User
   - Added `deviceName` field (optional)
   - Added `transports` field (optional, JSON array)
   - Added `lastUsedAt` field (optional DateTime)
   - Added unique constraint on `[userId, credentialId]`

2. **Updated User model**:
   - Added `passkeyCredentials` relation field

## Environment Variables

Add these to your `.env` file:

```env
# Passkey Configuration
PASSKEY_RP_ID=interspace.app
PASSKEY_ORIGIN=https://interspace.app
APPLE_TEAM_ID=YOUR_APPLE_TEAM_ID
```

## Next Steps

1. Run the migration
2. Update environment variables
3. Deploy the backend changes
4. Update iOS app with proper team ID
5. Test passkey registration and authentication