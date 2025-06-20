# Fresh Start Guide - V2 Flat Identity Model

## Overview

This guide explains how to start fresh with the new flat identity architecture, completely removing the old hierarchical model.

## Prerequisites

- PostgreSQL installed and running
- Node.js 18+ or 20+
- Access to the database with appropriate permissions

## Step-by-Step Instructions

### 1. Backup Current Data (Optional)

If you want to preserve any data:

```bash
pg_dump $DATABASE_URL > backup_before_v2_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Clean the Database

#### Option A: Using Reset Script (Recommended)

```bash
cd interspace-backend
./scripts/reset-database-v2.sh
```

This script will:
- Drop the existing database
- Create a new empty database
- Apply the new schema with flat identity model
- Generate Prisma client

#### Option B: Manual Clean

```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Run the clean script
\i scripts/clean-database.sql

# Exit
\q

# Remove old migrations
rm -rf prisma/migrations

# Create new migration
npx prisma migrate dev --name init_flat_identity

# Generate client
npx prisma generate
```

### 3. Update Environment Variables

Add these to your `.env` file:

```env
# V2 API Settings
ENABLE_V2_API=true
DEFAULT_PRIVACY_MODE=linked
AUTO_CREATE_PROFILE=true

# Existing settings remain the same
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
# etc...
```

### 4. Install/Update Dependencies

```bash
npm install
```

### 5. Start the Backend

```bash
npm run dev
```

The server will start with:
- Empty database
- V2 endpoints enabled at `/api/v2/*`
- V1 endpoints still available for compatibility
- Automatic profile creation for new users

## Testing the Fresh Setup

### 1. Test New User Registration

```bash
# Test wallet authentication (creates account + profile automatically)
curl -X POST http://localhost:3000/api/v2/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "wallet",
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "signature": "0xsignature",
    "message": "Sign this message",
    "walletType": "metamask"
  }'
```

Expected response:
```json
{
  "success": true,
  "account": {
    "id": "acc_...",
    "type": "wallet",
    "identifier": "0x1234...",
    "verified": true
  },
  "profiles": [{
    "id": "prof_...",
    "name": "My Smartprofile",
    "isActive": true,
    "sessionWalletAddress": "0x..."
  }],
  "isNewUser": true,
  "privacyMode": "linked"
}
```

### 2. Test Email Authentication

```bash
# First, send verification code
curl -X POST http://localhost:3000/api/v2/auth/send-email-code \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Then authenticate with the code
curl -X POST http://localhost:3000/api/v2/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "email",
    "email": "test@example.com",
    "verificationCode": "123456"
  }'
```

### 3. Test Account Linking

```bash
# Link another account (requires auth token from previous step)
curl -X POST http://localhost:3000/api/v2/auth/link-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "targetType": "email",
    "targetIdentifier": "another@example.com",
    "privacyMode": "linked"
  }'
```

## Database Schema Overview

The fresh database includes these new tables:

### Core Identity Tables
- `accounts` - Primary identity entities
- `identity_links` - Account relationships
- `profile_accounts` - Profile access control
- `account_sessions` - Account-based sessions

### Existing Tables (Updated)
- `smart_profiles` - Now includes `created_by_account_id`
- `users` - Kept for backward compatibility
- All other tables remain compatible

## Key Differences from V1

1. **No Manual Profile Creation**
   - Profiles are created automatically
   - First profile is always "My Smartprofile"

2. **Account-Centric Auth**
   - Any account type can authenticate
   - Accounts are primary entities

3. **Privacy Controls**
   - Linked (default) - full sharing
   - Partial - selective sharing
   - Isolated - no sharing

4. **Identity Graph**
   - Visual representation of linked accounts
   - Flexible relationship management

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT version();"

# Check if tables were created
psql $DATABASE_URL -c "\dt"
```

### Migration Issues

```bash
# Reset migrations
npx prisma migrate reset --force

# Check migration status
npx prisma migrate status
```

### Permission Issues

```sql
-- Grant permissions if needed
GRANT ALL PRIVILEGES ON DATABASE interspace TO your_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

## Next Steps

1. **Update Frontend**
   - Deploy iOS app with `AuthenticationManagerV2`
   - Remove profile creation flows
   - Update to V2 endpoints

2. **Monitor Performance**
   - Check query performance
   - Monitor account creation rate
   - Track session management

3. **Enable Features**
   - Privacy mode UI
   - Identity graph visualization
   - Account linking flows

## Support

For issues or questions:
- Check logs: `tail -f logs/app.log`
- Review error responses for debugging info
- Ensure all environment variables are set correctly