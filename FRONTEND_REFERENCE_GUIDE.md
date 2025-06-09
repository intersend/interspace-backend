# Frontend Integration Reference

This guide outlines the main API calls and data shapes used by the React Native application.

## Authentication

1. Obtain a provider token using our custom auth flow (Google, Apple, passkey, or wallet with Silence Labs).
2. POST the token to `/api/v1/auth/authenticate` along with device information.

```javascript
await fetch('http://localhost:3000/api/v1/auth/authenticate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    authToken,
    authStrategy: 'wallet',
    deviceId: deviceInfo.deviceId,
    deviceName: deviceInfo.deviceName,
    deviceType: deviceInfo.deviceType,
    walletAddress: account.address
  })
});
```

A successful response returns:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "expiresIn": 900
  }
}
```

Use the access token in the `Authorization` header for all other requests.

## Profile Lifecycle

- **Create:** `POST /api/v1/profiles` with `{ name: string }`.
- **List:** `GET /api/v1/profiles` returns an array of `SmartProfileResponse` objects.
- **Activate:** `POST /api/v1/profiles/:id/activate` to switch the active profile.
- **Session Wallet:** `GET /api/v1/profiles/:id/session-wallet` returns `{ address: string }`.

`SmartProfileResponse` fields:

```ts
{
  id: string;
  name: string;
  sessionWalletAddress: string;
  isActive: boolean;
  linkedAccountsCount: number;
  appsCount: number;
  foldersCount: number;
  createdAt: string;
  updatedAt: string;
}
```

## App & Folder Management

Endpoints follow the pattern `/profiles/:profileId/apps` and `/profiles/:profileId/folders`.

- Bookmark an app: `POST /profiles/:profileId/apps` with `{ name, url, iconUrl?, folderId?, position? }`.
- Update or move an app: `PUT /apps/:appId` with optional fields to rename or reposition.
- Reorder apps within a folder: `POST /profiles/:profileId/apps/reorder` `{ appIds: string[], folderId? }`.
- Create folders: `POST /profiles/:profileId/folders` `{ name, color?, position? }`.
- Reorder folders: `POST /profiles/:profileId/folders/reorder` `{ folderIds: string[] }`.

`BookmarkedAppResponse` example:

```ts
{
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  position: number;
  folderId?: string;
  folderName?: string;
  createdAt: string;
  updatedAt: string;
}
```

## Transaction Intents (Orby)

1. Create an intent via `POST /profiles/:id/intent` with a body describing the action (`transfer` or `swap`).
2. Sign the returned `unsignedOperations` with the profile's session wallet.
3. Submit the signatures to `/api/v1/operations/:operationSetId/submit`.
4. Poll `/api/v1/operations/:operationSetId/status` for progress.

The Orby guide in this repo (`FRONTEND_ORBY_INTEGRATION_GUIDE.md`) provides detailed examples.

## WebSocket Usage

Connect to `ws://<server>:3000` using Socket.IO. After authenticating, join rooms named `profile:<id>` to receive events when apps or folders change.

```ts
const socket = io('http://localhost:3000', { auth: { token: accessToken } });

socket.emit('join_profile', activeProfileId);

// Later when switching profiles
socket.emit('leave_profile', oldId);
socket.emit('join_profile', newId);
```

## Helpful Endpoints

- `GET /health` – server status and environment details
- `GET /ping` – simple connectivity check for mobile clients

Refer to `PROJECT_BACKEND_OVERVIEW.md` for a high-level view of the backend architecture.
