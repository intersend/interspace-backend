# Flat Identity Migration Guide

## Overview

This guide walks through migrating from the hierarchical User → SmartProfile → Account model to the flat identity architecture where accounts are primary entities.

## Pre-Migration Checklist

- [ ] Backup production database
- [ ] Test migration on staging environment
- [ ] Review current user/profile/account counts
- [ ] Notify team of migration window
- [ ] Prepare rollback procedure

## Migration Steps

### 1. Database Backup

```bash
# Create timestamped backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
pg_restore --list backup_*.sql | head -20
```

### 2. Apply Database Schema Changes

```bash
# Apply new schema migration
npm run prisma:migrate deploy

# This creates:
# - accounts table
# - identity_links table  
# - profile_accounts table
# - account_sessions table
```

### 3. Run Data Migration Script

```bash
# Execute migration script
node scripts/migrate-to-flat-identity.js

# Monitor progress
tail -f logs/migration.log
```

### 4. Validate Migration

```bash
# Run validation queries
psql $DATABASE_URL < scripts/validate-migration.sql

# Check counts match
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM accounts;
SELECT COUNT(*) FROM smart_profiles;
SELECT COUNT(*) FROM profile_accounts;
```

### 5. Test Both API Versions

```bash
# Test V1 endpoints (should still work)
curl -X POST http://localhost:3000/api/v1/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{"authToken": "test", "authStrategy": "google"}'

# Test V2 endpoints
curl -X POST http://localhost:3000/api/v2/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{"strategy": "email", "email": "test@example.com", "verificationCode": "123456"}'
```

### 6. Update Environment Variables

```env
# Add to .env
ENABLE_V2_API=true
DEFAULT_PRIVACY_MODE=linked
AUTO_CREATE_PROFILE=true
```

### 7. Deploy Backend Changes

```bash
# Deploy with V2 endpoints enabled
npm run deploy:production

# Monitor logs
pm2 logs interspace-backend --lines 100
```

### 8. Update Frontend Applications

- Deploy iOS app with AuthenticationManagerV2
- Update web app to use V2 endpoints
- Ensure backward compatibility maintained

## Migration Details

### Account Creation Rules

1. **Email Users**: 
   - Create account with type='email', identifier=email
   
2. **Wallet Users**:
   - Create account with type='wallet', identifier=address
   
3. **Social Users**:
   - Create account with type='social', identifier=providerId
   - Set provider field (google, apple, etc.)

4. **Multiple Auth Methods**:
   - Users with both email and wallet get separate accounts
   - Accounts are linked via identity_links table

### Identity Linking

```sql
-- Example: Link wallet and email accounts
INSERT INTO identity_links (account_a_id, account_b_id, link_type, privacy_mode)
VALUES ('wallet_account_id', 'email_account_id', 'direct', 'linked');
```

### Profile Account Mapping

```sql
-- Map accounts to profiles
INSERT INTO profile_accounts (profile_id, account_id, is_primary)
SELECT 
  sp.id as profile_id,
  a.id as account_id,
  true as is_primary
FROM smart_profiles sp
JOIN accounts a ON a.metadata->>'userId' = sp.user_id;
```

## Rollback Procedure

If issues arise, follow these steps:

### 1. Stop Application

```bash
pm2 stop interspace-backend
```

### 2. Restore Database

```bash
# Drop migrated tables
psql $DATABASE_URL -c "DROP TABLE IF EXISTS profile_accounts CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS identity_links CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS account_sessions CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS accounts CASCADE;"

# Restore from backup
pg_restore -d $DATABASE_URL backup_*.sql
```

### 3. Revert Code

```bash
git checkout main
npm install
npm run build
```

### 4. Restart Application

```bash
pm2 start interspace-backend
```

## Performance Considerations

### Indexes Created

- `accounts(type, identifier)` - Unique constraint
- `identity_links(account_a_id, account_b_id)` - Composite index
- `profile_accounts(profile_id, account_id)` - Unique constraint
- `account_sessions(session_token)` - Unique index

### Query Performance

The flat model may initially show slightly slower performance for:
- Getting all profiles for a user (requires join through accounts)
- Session validation (additional account lookup)

Mitigations:
- Add caching for frequently accessed account data
- Use connection pooling
- Monitor slow query log

## Post-Migration Tasks

### 1. Monitor Application

```bash
# Check error rates
grep ERROR logs/app.log | tail -100

# Monitor response times
npm run metrics:response-time

# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
```

### 2. Update Documentation

- [ ] Update API documentation
- [ ] Update developer guides
- [ ] Update deployment procedures
- [ ] Update troubleshooting guides

### 3. Communicate Changes

- [ ] Notify frontend teams
- [ ] Update API consumers
- [ ] Document breaking changes
- [ ] Provide migration support

## Troubleshooting

### Common Issues

1. **Duplicate Accounts**
   ```sql
   -- Find duplicates
   SELECT type, identifier, COUNT(*) 
   FROM accounts 
   GROUP BY type, identifier 
   HAVING COUNT(*) > 1;
   ```

2. **Missing Profile Links**
   ```sql
   -- Find profiles without linked accounts
   SELECT sp.* 
   FROM smart_profiles sp
   LEFT JOIN profile_accounts pa ON pa.profile_id = sp.id
   WHERE pa.id IS NULL;
   ```

3. **Orphaned Sessions**
   ```sql
   -- Clean up old sessions
   DELETE FROM account_sessions 
   WHERE expires_at < NOW();
   ```

### Debug Queries

```sql
-- View account relationships
SELECT 
  a1.type || ':' || a1.identifier as account_1,
  a2.type || ':' || a2.identifier as account_2,
  il.privacy_mode
FROM identity_links il
JOIN accounts a1 ON a1.id = il.account_a_id
JOIN accounts a2 ON a2.id = il.account_b_id;

-- Check profile access
SELECT 
  p.name as profile_name,
  a.type || ':' || a.identifier as account,
  pa.is_primary
FROM profile_accounts pa
JOIN smart_profiles p ON p.id = pa.profile_id
JOIN accounts a ON a.id = pa.account_id
ORDER BY p.name, pa.is_primary DESC;
```

## Success Criteria

Migration is successful when:

1. All existing users can authenticate via V1 and V2 APIs
2. New users get automatic profile creation
3. Account linking works correctly
4. No data loss occurred
5. Performance remains acceptable
6. Error rates stay below threshold

## Support

For migration support:
- Check logs in `/logs/migration.log`
- Review error details in application logs
- Contact backend team for assistance