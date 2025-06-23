# Passkey Setup Guide

This guide explains how to configure passkeys for Interspace.

## Backend Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```env
# Passkey Configuration
PASSKEY_RP_ID=interspace.app  # Your domain (without https://)
PASSKEY_ORIGIN=https://interspace.app  # Full origin URL
APPLE_TEAM_ID=YOUR_TEAM_ID  # Apple Developer Team ID
```

### Apple App Site Association

The backend automatically serves the Apple App Site Association file at:
`https://yourdomain.com/.well-known/apple-app-site-association`

This file is required for:
- Passkey authentication
- Universal Links
- Associated domains

## iOS Configuration

### 1. Update Entitlements

The `Interspace.entitlements` file should include:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
    <string>webcredentials:interspace.app</string>
    <string>applinks:interspace.app</string>
</array>
```

### 2. Update Info.plist

Ensure your bundle identifier matches what's configured in the backend.

### 3. Deployment Requirements

- iOS 16.0+ for passkey support
- Valid Apple Developer account
- Proper provisioning profiles with Associated Domains capability

## Testing

### Local Development

For local testing, you can:
1. Use a local domain with SSL (e.g., using ngrok)
2. Update `PASSKEY_RP_ID` to match your local domain
3. Configure your iOS app to use the local backend

### Production

1. Ensure your domain serves the apple-app-site-association file
2. Verify HTTPS is properly configured
3. Test on real devices (simulators have limitations)

## API Endpoints

### Registration Flow

1. **GET** `/api/auth/passkey/register-options` - Get registration options
2. **POST** `/api/auth/passkey/register-verify` - Verify registration

### Authentication Flow

1. **POST** `/api/auth/passkey/authenticate-options` - Get authentication options
2. **POST** `/api/auth/passkey/authenticate-verify` - Verify authentication

### Management

- **GET** `/api/auth/passkey/credentials` - List user's passkeys
- **DELETE** `/api/auth/passkey/credentials/:id` - Delete a passkey

## Troubleshooting

### Common Issues

1. **"Associated domain failed to download"**
   - Verify the apple-app-site-association file is accessible
   - Check HTTPS certificate is valid
   - Ensure no authentication is required to access the file

2. **"Passkey not available"**
   - Verify iOS 16.0+ is being used
   - Check entitlements are properly configured
   - Ensure provisioning profile includes Associated Domains

3. **"Invalid RP ID"**
   - Verify PASSKEY_RP_ID matches your domain
   - Don't include protocol (https://) in RP ID
   - Ensure consistency between backend and iOS configuration

## Security Considerations

1. Always use HTTPS in production
2. Keep challenge TTL short (5 minutes default)
3. Validate all inputs on the backend
4. Use secure token storage on iOS (Keychain)
5. Implement rate limiting on passkey endpoints