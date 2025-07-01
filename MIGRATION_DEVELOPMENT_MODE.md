# Migration: isDevelopmentWallet to developmentMode

This migration standardizes the parameter name from `isDevelopmentWallet` to `developmentMode` across the entire system.

## Changes Made

### 1. Database Schema
- Updated `prisma/schema.prisma`: Renamed field from `isDevelopmentWallet` to `developmentMode`
- Created migration SQL in `prisma/migrations/20250701_rename_development_mode/`

### 2. Configuration
- Added `DISABLE_MPC` to `src/utils/config.ts` as a boolean configuration option
- Updated `sessionWalletService.js` to properly check for `DISABLE_MPC`

### 3. API Parameter Standardization
- **Controllers**: Updated to use `developmentMode` parameter
  - `profileControllerV2.js`: Uses `developmentMode` from request body (defaults to `false`)
  - `smartProfileController.ts`: Accepts and validates `developmentMode`
  - `authControllerV2.js`: Returns `developmentMode` in responses (defaults to `false`)

- **Services**: Updated to use `developmentMode` internally
  - `smartProfileService.ts`: Uses `developmentMode` parameter and field
  - `accountService.js`: Uses `developmentMode` when creating profiles
  - `sessionWalletService.js`: Checks `developmentMode` parameter

- **Types**: Updated TypeScript interfaces
  - `CreateSmartProfileRequest`: Uses `developmentMode?: boolean`
  - `SmartProfileResponse`: Returns `developmentMode?: boolean`

- **Routes**: Updated validation
  - `profileRoutesV2.js`: Validates `developmentMode` as boolean parameter

### 4. Default Behavior
- **IMPORTANT**: Changed default from `true` to `false` for production safety
- Development mode must be explicitly requested
- Production deployments default to real MPC wallets

## Migration Steps

1. **Check current database state**:
   ```bash
   node scripts/migrate-development-mode.js
   ```

2. **Run database migration**:
   ```bash
   # If using Prisma migrations
   npx prisma migrate deploy

   # Or run SQL directly
   psql -d your_database -c 'ALTER TABLE "smart_profiles" RENAME COLUMN "isDevelopmentWallet" TO "developmentMode";'
   ```

3. **Generate Prisma client**:
   ```bash
   npx prisma generate
   ```

4. **Update environment variables** (if needed):
   ```bash
   # Add to .env if you want to disable MPC globally
   DISABLE_MPC=true
   ```

## API Changes

### Before
```json
{
  "name": "My Profile",
  "isDevelopmentWallet": true
}
```

### After
```json
{
  "name": "My Profile",
  "developmentMode": true
}
```

## iOS App Compatibility
The iOS app already sends `developmentMode` parameter, so this change ensures compatibility.

## Backwards Compatibility
The system no longer accepts `isDevelopmentWallet` parameter. All clients must use `developmentMode`.

## Security Notes
- Development mode defaults to `false` (production mode)
- MPC is enabled by default unless explicitly disabled
- Development wallets are only created when `developmentMode: true` is explicitly passed