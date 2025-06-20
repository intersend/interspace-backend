-- Clean Database Script
-- Drops all tables in the correct order to avoid foreign key constraints

-- Drop tables that depend on accounts
DROP TABLE IF EXISTS account_sessions CASCADE;
DROP TABLE IF EXISTS profile_accounts CASCADE;
DROP TABLE IF EXISTS identity_links CASCADE;

-- Drop new flat identity tables
DROP TABLE IF EXISTS accounts CASCADE;

-- Drop tables that depend on smart_profiles
DROP TABLE IF EXISTS drag_operations CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS bookmarked_apps CASCADE;
DROP TABLE IF EXISTS folders CASCADE;
DROP TABLE IF EXISTS linked_accounts CASCADE;
DROP TABLE IF EXISTS token_allowances CASCADE;
DROP TABLE IF EXISTS orby_transactions CASCADE;
DROP TABLE IF EXISTS orby_operations CASCADE;
DROP TABLE IF EXISTS orby_virtual_nodes CASCADE;
DROP TABLE IF EXISTS preferred_gas_tokens CASCADE;
DROP TABLE IF EXISTS mpc_key_mappings CASCADE;
DROP TABLE IF EXISTS mpc_key_shares CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Drop smart_profiles
DROP TABLE IF EXISTS smart_profiles CASCADE;

-- Drop tables that depend on users
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS social_profiles CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS blacklisted_tokens CASCADE;
DROP TABLE IF EXISTS device_registrations CASCADE;

-- Drop users table
DROP TABLE IF EXISTS users CASCADE;

-- Drop standalone tables
DROP TABLE IF EXISTS session_wallet_factories CASCADE;
DROP TABLE IF EXISTS app_metadata CASCADE;
DROP TABLE IF EXISTS siwe_nonces CASCADE;
DROP TABLE IF EXISTS passkey_credentials CASCADE;

-- Drop Prisma migration tracking table
DROP TABLE IF EXISTS _prisma_migrations CASCADE;

-- Verify all tables are dropped
SELECT tablename FROM pg_tables WHERE schemaname = 'public';