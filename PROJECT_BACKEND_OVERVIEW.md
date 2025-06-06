# Interspace Backend Overview

This document provides a concise overview of the Interspace backend for the MVP wallet. It focuses on how the server manages profiles, session wallets, and Orby chain abstraction.

## Architecture Highlights

- **Node.js + TypeScript** using Express for the HTTP API.
- **Prisma ORM** with SQLite (dev) or PostgreSQL (prod).
- **Thirdweb** for wallet management and EIP‑7702 session wallets.
- **Orby** integration for cross‑chain transactions and gas abstraction.
- **Socket.IO** for real-time updates to the React Native app.
- **JWT authentication** with multi-device support and refresh tokens.

## Key Concepts

### SmartProfiles

A SmartProfile groups multiple accounts under one context (e.g., Trading, Gaming). Each profile automatically gets a session wallet (ERC‑7702 proxy) that acts as the transaction delegate.

- Linked EOAs can be MetaMask, Coinbase Wallet, etc.
- Users approve token allowances to the session wallet so it can act without extra prompts.
- Profiles are stored in the `SmartProfile` table and related tables for linked accounts, apps, and folders.

### Session Wallet Service

Implemented in `src/blockchain/sessionWalletService.ts`, this service manages creation of session wallets and executing transactions through them. It supports mainnets and testnets defined in the configuration.

### Orby Chain Abstraction

The backend integrates Orby (see `src/services/orbyService.ts`) to handle gas abstraction and cross-chain routing. Profiles are associated with an Orby account cluster that unifies all linked accounts. The `/intent` endpoint builds operations for transfers or swaps, which the frontend signs with the session wallet.

### API Structure

Routes are prefixed with `/api/v1` and include:

- `/auth` – wallet authentication via Thirdweb.
- `/profiles` – create, update, and delete SmartProfiles.
- `/profiles/:profileId/apps` – manage bookmarked apps and folders.
- `/profiles/:profileId/accounts` – link or remove external accounts.
- `/profiles/:profileId/intent` – create transaction intents via Orby.

See `src/index.ts` for full route registration.

### Security Features

- Helmet and CORS configured for React Native clients.
- Rate limiting middleware to prevent abuse.
- All responses follow a typed `ApiResponse` format for consistency.

### Development Workflow

1. Install dependencies with `npm install`.
2. Run `npm run prisma:migrate` to apply database migrations.
3. Start the server with `npm run dev`.
4. Automated tests can be run via `npm test` (unit and integration).

## Useful Files

- `README.md` – main quick-start guide.
- `ORBY_INTEGRATION_COMPLETE.md` – detailed explanation of Orby features.
- `src/services/` – core business logic (profiles, apps, accounts, Orby).

This backend is production ready and designed specifically for a React Native front end.
