# Wallet Portfolio Fix Documentation

## Overview
This document outlines the fixes applied to ensure proper wallet portfolio display and account cluster management.

## Issues Addressed

### 1. Account Cluster Completeness
- **Problem**: MPC wallets might not be included in Orby account clusters
- **Solution**: Ensure MPC wallets are created as LinkedAccounts and included in clusters

### 2. Frontend Token Display
- **Problem**: Complex expandable token view with chain details
- **Solution**: Simplified Apple-style design showing only essential information

## Backend Fixes

### MPC Wallet Integration
The MPC webhook controller now properly:
1. Creates a LinkedAccount entry for the MPC wallet when generated
2. Updates the Orby account cluster to include the new wallet
3. Ensures all active linked accounts are included in clusters

### Account Cluster Management
- `orbyService.createOrGetAccountCluster()` includes ALL active linked accounts
- `orbyService.updateAccountCluster()` recreates clusters when accounts change
- No filtering by wallet type - includes EOAs, MPC wallets, etc.

## Frontend Changes

### Simplified Token Display
Both `WalletView.swift` and `WalletViewRedesigned.swift` now show:
- Token logo (simple circle with symbol)
- Token symbol (e.g., "ETH")
- Token name (e.g., "Ethereum")
- USD value (formatted with commas)

Removed:
- Expandable chain details
- Network count display
- Complex scrolling interactions
- Token amount in native units

## Utility Scripts

### Check Account Clusters
```bash
npm run check:clusters [profileId]
```
Verifies that account clusters include all linked accounts, including MPC wallets.

### Fix Missing MPC Links
```bash
npm run fix:mpc-links [--dry-run]
```
Creates missing LinkedAccount entries for MPC wallets that aren't properly linked.

## Testing

1. Run `npm run check:clusters` to identify any profiles with missing MPC links
2. Run `npm run fix:mpc-links --dry-run` to see what would be fixed
3. Run `npm run fix:mpc-links` to apply the fixes
4. Verify portfolio displays correctly in the iOS app

## Portfolio Data Flow

1. iOS app requests balance from `/api/v1/profiles/{profileId}/balance`
2. Backend fetches portfolio from Orby using account cluster
3. Orby returns balances for all accounts in the cluster
4. Backend formats and returns unified balance
5. iOS displays tokens in simplified list format