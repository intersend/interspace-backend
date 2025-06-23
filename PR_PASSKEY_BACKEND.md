# feat: Add WebAuthn/passkey authentication support

## Summary
This PR implements WebAuthn/FIDO2 passkey support for passwordless authentication, enabling users to sign in with biometric authentication on supported devices.

## Changes Made

### Database Schema
- 📊 Updated PasskeyCredential model with user relations
- 🔗 Added userId, deviceName, transports, lastUsedAt fields
- 👤 Added passkeyCredentials relation to User model

### Core Services
- 🎯 Created challengeService for secure challenge generation
- 🔐 Rewrote passkeyService with @simplewebauthn/server
- ⏱️ Implemented challenge TTL and replay attack prevention
- 🔑 Added generateTokensForUser to authService

### API Endpoints
- 📝 POST `/api/auth/passkey/register-options` - Registration flow
- ✅ POST `/api/auth/passkey/register-verify` - Verify registration
- 🔓 POST `/api/auth/passkey/authenticate-options` - Auth flow
- ✔️ POST `/api/auth/passkey/authenticate-verify` - Verify auth
- 📋 GET `/api/auth/passkey/credentials` - List passkeys
- 🗑️ DELETE `/api/auth/passkey/credentials/:id` - Delete passkey

### Apple Integration
- 🍎 Added apple-app-site-association file
- 🌐 Created well-known routes for app association
- 📱 Support for iOS webcredentials

### Configuration
- ⚙️ Added PASSKEY_RP_ID configuration
- 🔗 Added PASSKEY_ORIGIN configuration
- 🏢 Added APPLE_TEAM_ID support

## Testing Plan
- [x] Unit tests for challenge service
- [x] Integration tests for passkey endpoints
- [x] Tested with iOS client
- [ ] Load testing for concurrent registrations

## Security Considerations
- ✅ Challenge expiration (5 minutes)
- ✅ One-time use challenges
- ✅ Replay attack prevention
- ✅ Proper origin validation
- ✅ User verification requirements

## Migration Required
```bash
# Run this migration before deployment
npx prisma migrate dev --name add_passkey_support
```

## Environment Variables
```env
# Add these to .env
PASSKEY_RP_ID=interspace.app
PASSKEY_ORIGIN=https://interspace.app
APPLE_TEAM_ID=YOUR_APPLE_TEAM_ID
```

## Documentation
- 📚 Added PASSKEY_SETUP.md with complete setup guide
- 📖 Added migration instructions
- 🔧 Updated API documentation

## Related PRs
- iOS PR: interspace-ios#[NUMBER]

## Checklist
- [x] Database migration created
- [x] Environment variables documented
- [x] Security review completed
- [x] Error handling implemented
- [x] API documentation updated
- [x] No breaking changes to existing auth

🤖 Generated with Claude Code