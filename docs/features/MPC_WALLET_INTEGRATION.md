# MPC Design Requirements

This document outlines how multi‑party computation (MPC) is used within the Interspace backend. It defines where key shares are generated and stored, and highlights the security expectations for any deployment.

## Phone-based Client Share Generation
- Each user device creates its MPC share locally using the Silence Labs SDK.
- The share never leaves the device and is stored using the mobile OS keychain or secure enclave.

## Server Share Storage
- The server generates and stores its corresponding MPC share.
- Storage can be either a database table or a self-hosted Silence Labs MPC node.
- Shares are encrypted at rest using AES‑256‑GCM and protected with a key from the environment.

## Delegated Custody vs. Self-Hosting
- **Delegated custody**: The server holds its share in the database and participates in signing.
- **Self-hosted**: Organizations may run their own MPC node and store the share outside the main database.
- Both options use TLS for transport and encrypted storage for persistence.

## Quorum Requirements
- Default quorum is **2-of-2**: the phone share plus the server share are both required to sign.
- The design can expand to **2-of-3** by adding a recovery share held by a separate service.

## Transport & At-rest Security
- All MPC messages and API calls are performed over TLS.
- Server storage (database or node volume) must be encrypted at rest.

These requirements ensure that private key material remains split between devices and the backend while still allowing the backend to assist in transaction signing.

## Session Wallet Key Rotation

Session wallet MPC shares can be rotated without changing the public address. Use the API endpoint `POST /api/v1/profiles/:id/rotate-wallet` to request a new client share. Mobile apps should call this periodically—such as once per month—to limit the lifetime of any compromised share.
