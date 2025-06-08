# Storage Architecture and Security

This document explains how user and profile data is stored following the removal of Thirdweb.

## Key Points
- **Profiles are isolated**: each SmartProfile acts as its own enclave. Only the owning user ID is stored alongside minimal metadata.
- **Account data encryption**: OAuth tokens and sensitive account information are encrypted in the database using AES‑256‑GCM. The encryption key is provided via `ENCRYPTION_SECRET`.
- **MPC key shares**: The server stores only its share of the MPC wallet. The client share lives on the device. Public addresses are derived from the key shares and stored, but the shares themselves never leave their respective environments.
- **No plaintext public keys**: Wallet addresses and provider identifiers are stored as lowercase strings, while any secret material is encrypted before persistence.
- **Audit logging**: All account link/unlink and profile operations are recorded in the `audit_logs` table for traceability.

This design minimizes the risk of data leaks while still allowing the backend to perform necessary lookups and operations.
