# Backend Code Review

This document summarizes an in-depth review of the existing TypeScript backend. Key areas of interest include authentication, profile creation, app bookmarking, and overall security and privacy practices.

## Authentication Flow

- **JWT Handling** – Access and refresh tokens are generated in `src/utils/jwt.ts`. Tokens include the user ID and optional device ID and are signed with secrets from the environment. Verification throws `AuthenticationError` on failure.
- **Device Registration** – `src/services/authService.ts` registers each device in the `device_registrations` table. Refresh tokens are bound to a device ID so sessions can be revoked per device.
- **Thirdweb Auth** – Wallet and social logins are processed in `src/services/thirdwebAuthService.ts`. The token verification is currently a placeholder and should be replaced with a real check.
- **Rate Limiting** – The middleware in `src/middleware/rateLimiter.ts` is disabled (`createNoOpRateLimitMiddleware`). This leaves the API unprotected against brute force attempts.

## SmartProfile Creation

- Profiles are stored in Prisma model `SmartProfile` with a unique `sessionWalletAddress` generated using `sessionWalletService`【F:src/services/smartProfileService.ts†L22-L70】.
- Each profile creation logs an audit entry and attempts to create an Orby account cluster. If Orby fails the profile is still created, which is good for resiliency.
- A profile can only be deleted if all linked accounts are removed first, preventing orphaned data.

## App Bookmarking

- Bookmarked apps are stored in `BookmarkedApp` with optional `folderId` and `position` fields【F:prisma/schema.prisma†L115-L127】.
- The service verifies folder and profile ownership before creating or updating apps. Positions are recalculated when apps are reordered to mimic iOS drag‑and‑drop【F:src/services/appsService.ts†L173-L215】【F:src/services/appsService.ts†L321-L374】.
- Deleting a folder moves its apps to the root level to avoid accidental data loss【F:src/services/foldersService.ts†L230-L263】.

## Security & Privacy Observations

1. **Rate Limiting Disabled** – All rate‑limit middleware functions currently pass through. Enabling real limits is recommended to protect authentication and transaction endpoints.
2. **Signature Verification** – `verifyAccountOwnership` accepts any signature in development mode and lacks real signature checks in production【F:src/services/linkedAccountService.ts†L370-L399】. A proper `eth_sign` or `personal_sign` verification should be implemented.
3. **Sensitive Token Storage** – Social profile access tokens are stored in plaintext in the database【F:prisma/schema.prisma†L174-L189】. These should be encrypted or avoided if not strictly necessary.
4. **Audit Trail** – Actions such as profile creation, account linking, and folder operations create records in `audit_logs`, which is a good practice for tracing user activity.
5. **Session Wallet Addresses** – Session wallets are generated with Thirdweb’s in‑app wallet and stored per profile. The helper `isValidSessionWalletAddress` enforces a simple regex check【F:src/blockchain/sessionWalletService.ts†L259-L265】.
6. **CORS Configuration** – Allowed origins come from `CORS_ORIGINS` in the environment. In development any origin is accepted, but production should restrict this list.
7. **Input Validation** – Controllers mostly validate required fields before calling services. Additional Joi or zod validation could provide stronger guarantees.

## Suggestions for Improvement

- Implement real rate limiting using a persistent or in-memory store.
- Replace placeholder Thirdweb token verification with an actual API call.
- Add Ethereum signature verification when linking wallets.
- Encrypt OAuth tokens stored in `social_profiles` or consider not storing refresh tokens at all.
- Expand unit tests to cover failure cases around Orby integration and session wallet operations.
- Review error logging to avoid leaking sensitive data in production logs.

Overall the codebase is well structured with clear separation between controllers, services, and data access layers. Privacy considerations such as device‑scoped tokens and audit logging are in place, but several security features are disabled or stubbed and should be completed before production use.
