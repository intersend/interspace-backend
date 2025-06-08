# Frontend Update: Custom Auth and MPC Wallets

The backend now uses a first‑party authentication system and Silence Labs MPC wallets.

## What Changed
- Thirdweb has been removed. Use Google, Apple, or Passkey for social login.
- Session wallets are created with Silence Labs two‑party MPC.
- Access and refresh tokens are issued by our backend and must be stored securely on device.

## New Authentication Flow
1. **Obtain provider token** from Google/Apple or WebAuthn passkey.
2. **POST** `/api/v1/auth/authenticate` with:
   ```json
   {
     "authToken": "<provider token>",
     "authStrategy": "google" | "apple" | "passkey" | "wallet",
     "deviceId": "unique id",
     "deviceName": "device name",
     "deviceType": "ios" | "android" | "web",
     "walletAddress": "0x..." // only for wallet strategy
   }
   ```
3. Backend returns `accessToken` and `refreshToken`.
4. Use Silence Labs React Native SDK to generate the device share of the MPC wallet during onboarding. Pass the share to the backend to complete key generation when creating a profile.

## Session Wallet Usage
- Each SmartProfile has a unique MPC session wallet address.
- Signing of Orby transactions should happen on device whenever possible using Silence Labs RN bindings.
- The backend provides a fallback signing path for recovery.

Keep your tokens in secure storage (e.g., Keychain/Keystore) and rotate MPC keys regularly.
