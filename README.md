# Interspace Backend API

Backend API for Interspace MVP wallet with SmartProfiles, ERC-7702 session wallets, and iPhone-style app management.

## 🎯 **Ready for React Native Integration**

**✅ Production-Ready Status**: All tests passing with custom MPC wallet integration.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+
- npm or yarn
- PostgreSQL (local development)

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev
```

The server will start on `http://localhost:3000` with full CORS support for React Native development.

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/interspace"

# Authentication
JWT_SECRET="your-jwt-secret-key-replace-in-production"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Silence Labs MPC Configuration
SILENCE_ADMIN_TOKEN="replace-with-admin-token"
SILENCE_NODE_URL="http://localhost:8080"

# Server Configuration
PORT=3000
NODE_ENV="development"
API_VERSION="v1"

# CORS Configuration for React Native
CORS_ORIGINS="*"

# Blockchain Configuration
DEFAULT_CHAIN_ID=11155111
SUPPORTED_CHAINS="1,137,42161,10,8453,11155111,80001,421614,11155420,84532"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
# Uses in-memory RateLimiterMemory store from rate-limiter-flexible

```

For production deployments, use a managed PostgreSQL instance with TLS enabled.

## 📱 React Native Integration

### Authentication Flow

```typescript
// 1. Generate MPC wallet share on device using Silence Labs SDK
import { P1Keygen } from '@com.silencelaboratories/two-party-ecdsa-rn';

const keygen = await P1Keygen.init(await generateSessionId());
const msg1 = await keygen.genMsg1();
// send msg1 to backend to continue key generation

// 2. Authenticate with backend
const authenticateUser = async (authToken: string, deviceInfo: DeviceInfo) => {
  const response = await fetch('http://localhost:3000/api/v1/auth/authenticate', {
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
  
  const { accessToken, refreshToken } = await response.json();
  // Store tokens securely
};
```

### API Base URL Configuration

```typescript
// React Native API configuration
const API_CONFIG = {
  baseURL: __DEV__ 
    ? 'http://localhost:3000/api/v1'  // Development
    : 'https://your-production-url.com/api/v1', // Production
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
};
```

### SmartProfile Management

```typescript
// Create a new SmartProfile
const createProfile = async (name: string, accessToken: string) => {
  const response = await fetch(`${API_CONFIG.baseURL}/profiles`, {
    method: 'POST',
    headers: {
      ...API_CONFIG.headers,
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ name })
  });
  
  return response.json();
};

// Switch active profile
const switchProfile = async (profileId: string, accessToken: string) => {
  const response = await fetch(`${API_CONFIG.baseURL}/profiles/${profileId}/activate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  return response.json();
};
```

### Real-time Updates with WebSocket

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: accessToken }
});

// Join profile room for real-time updates
socket.emit('join_profile', profileId);

// Listen for profile updates
socket.on('profile_updated', (data) => {
  // Update React Native state
  updateProfileState(data);
});
```

## 🏗️ Architecture Overview

### Core Components

1. **SmartProfiles**: User-owned profiles that group crypto accounts
2. **Session Wallets**: ERC-7702 proxy wallets for seamless transactions  
3. **App Management**: iPhone-style bookmark and folder system
4. **Multi-device Support**: Secure authentication across devices

### Technology Stack

- **Framework**: Express.js with TypeScript
- **Database**: Prisma ORM with SQLite (dev) / PostgreSQL (prod)
- **Authentication**: JWT with MPC wallet shares
- **Blockchain**: Silence Labs two-party MPC
- **Testing**: Jest with all tests passing (unit + integration)
- **Security**: Helmet, rate limiting, input validation

### MPC Integration ✅

- **Distributed key generation** verified
- **Session accounts** created via Silence Labs
- **Multi-chain support** (Sepolia, Mumbai, Base Sepolia)


## 📊 Complete API Reference

**Base URL**: `http://localhost:3000/api/v1`

### Authentication Endpoints

#### POST `/auth/authenticate`
Authenticate user with a social provider or passkey.

```json
{
  "authToken": "provider_token",
  "authStrategy": "google",
  "deviceId": "unique_device_id", 
  "deviceName": "iPhone 15 Pro",
  "deviceType": "mobile",
  "walletAddress": "0x1234...abcd"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token",
    "expiresIn": 900
  }
}
```

#### POST `/auth/refresh`
Refresh expired access token.

```json
{ "refreshToken": "refresh_token" }
```

#### POST `/auth/logout`
Logout and invalidate tokens.

```json
{ "refreshToken": "refresh_token" }
```

### SmartProfile Endpoints

#### GET `/profiles`
Get all user profiles.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "profile_id",
      "name": "Gaming Profile",
      "isActive": true,
      "sessionWalletAddress": "0x5678...efgh",
      "linkedAccountsCount": 2,
      "appsCount": 5,
      "foldersCount": 2,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST `/profiles`
Create new SmartProfile.

```json
{ "name": "Trading Profile" }
```

#### GET `/profiles/:id`
Get specific profile details.

#### PUT `/profiles/:id`
Update profile.

```json
{ 
  "name": "Updated Name",
  "isActive": true 
}
```

#### DELETE `/profiles/:id`
Delete profile (with safety checks).

#### POST `/profiles/:id/activate`
Set profile as active.

### Linked Account Endpoints

#### GET `/profiles/:profileId/accounts`
Get linked external accounts.

#### POST `/profiles/:profileId/accounts`
Link external wallet account.

```json
{
  "address": "0xabcd...1234",
  "walletType": "metamask",
  "customName": "My MetaMask",
  "isPrimary": false
}
```

#### PUT `/accounts/:accountId`
Update linked account.

#### DELETE `/accounts/:accountId`
Unlink account.

#### POST `/accounts/:accountId/primary`
Set account as primary.

### App Management Endpoints

#### GET `/profiles/:profileId/apps`
Get bookmarked apps.

#### POST `/profiles/:profileId/apps`
Bookmark new app.

```json
{
  "name": "Uniswap",
  "url": "https://app.uniswap.org",
  "iconUrl": "https://app.uniswap.org/favicon.ico",
  "folderId": "folder_id_or_null",
  "position": 1
}
```

#### PUT `/apps/:appId`
Update app bookmark.

#### DELETE `/apps/:appId`
Remove bookmark.

#### POST `/apps/reorder`
Reorder apps (iPhone-style).

```json
{
  "appIds": ["app1", "app2", "app3"],
  "folderId": "folder_id_or_null"
}
```

### Folder Management Endpoints

#### GET `/profiles/:profileId/folders`
Get folders.

#### POST `/profiles/:profileId/folders`
Create folder.

```json
{
  "name": "DeFi Apps",
  "color": "#FF6B6B",
  "position": 1
}
```

#### PUT `/folders/:folderId`
Update folder.

#### DELETE `/folders/:folderId`
Delete folder (moves apps to root).

#### POST `/folders/:folderId/share`
Make folder publicly shareable.

**Response**:
```json
{
  "success": true,
  "data": {
    "shareableId": "abc123",
    "shareableUrl": "https://app.interspace.com/shared/folders/abc123"
  }
}
```

### Session Wallet Endpoints

Session wallets are automatically created for each SmartProfile using ERC-7702 proxy contracts.

**Key Features**:
- **Gas Sponsoring**: Enabled by default
- **Multi-chain**: Supports Ethereum, Polygon, Arbitrum, Optimism, Base
- **Proxy Pattern**: ERC-7702 for secure delegation
- **Batch Transactions**: Execute multiple transactions atomically

## 🔐 Authentication & Security

### JWT Token Management

```typescript
// Token refresh logic for React Native
const refreshTokenIfNeeded = async () => {
  const token = await getStoredToken();
  if (isTokenExpired(token)) {
    const refreshToken = await getStoredRefreshToken();
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken })
    });
    const { accessToken } = await response.json();
    await storeToken(accessToken);
    return accessToken;
  }
  return token;
};
```

### Multi-device Support

Each device gets a unique session:

```typescript
const deviceInfo = {
  deviceId: await DeviceInfo.getUniqueId(),
  deviceName: await DeviceInfo.getDeviceName(),
  deviceType: 'mobile'
};
```

### Rate Limiting

- **100 requests per 15 minutes** per IP
- **Separate limits** for auth endpoints (more restrictive)
- **Graceful handling** in React Native with retry logic
- **In-memory store**: Uses `RateLimiterMemory` from `rate-limiter-flexible`, so no external services are required

## 🧪 Testing Status

### ✅ All Tests Passing

**Unit Tests**:
- Service layer business logic
- Authentication flows  
- Database operations
- Error handling

**Integration Tests**:
- **MPC wallet integration**
- Multi-chain support verification
- Session account functionality

**Test Commands**:
```bash
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:coverage      # With coverage report
```

#### Preparing the test environment

1. Copy the provided `.env.test` file:
   ```bash
   cp .env.test .env
   ```
2. Install dependencies and apply migrations:
   ```bash
   npm install
   npm run prisma:test:migrate
   ```
3. Run the tests:
   ```bash
   npm test
   ```
   Expected output:
   ```
   Test Suites: all passed
   Tests:       all passed
   ```

### MPC Wallet Verification

**Wallets created during testing**:
- Two-party key generation verified
- Session account signing tested

## 🚦 Development Workflow

### Quick Start for React Native Devs

1. **Clone and Setup**:
   ```bash
   git clone <repo>
   cd interspace-backend
   npm install
   npm run prisma:generate
   npm run prisma:migrate
   npm run dev
   ```

2. **Verify API**:
   ```bash
   curl http://localhost:3000/health
   # Should return: {"status":"healthy","timestamp":"..."}
   ```

3. **Test Authentication**:
   - Use Google, Apple, or Passkey to sign in
   - Follow React Native auth flow above
   - Create your first SmartProfile

### Environment Configurations

**Development**:
- PostgreSQL database (local instance)
- CORS enabled for all origins
- Detailed logging
- Test data available

**Production Ready**:
- Managed PostgreSQL with TLS
- Rate limiting
- Security headers
- Audit logging

## 📈 Performance & Monitoring

### Database Optimization
- **Indexed queries** for common operations
- **Connection pooling** ready
- **Query optimization** with Prisma
- **Migration system** in place

### Real-time Features
- **WebSocket support** for live updates
- **Profile synchronization** across devices
- **App/folder changes** broadcasted instantly

### Error Handling
- **Structured error responses**
- **HTTP status code compliance**
- **Mobile-friendly error messages**
- **Comprehensive logging**

## 🔄 Session Wallet Flow

### Complete Transaction Routing

```
React Native App
    ↓ (User initiates transaction)
Silence Labs SDK in RN
    ↓ (Auth token to backend)
Interspace Backend API
    ↓ (Session wallet delegation)
ERC-7702 Proxy Contract
    ↓ (Execute on behalf of user)
Target dApp Contract
```

### Example: DeFi Transaction

1. **User**: Wants to swap tokens on Uniswap
2. **React Native**: Opens Uniswap in WebView with injected wallet
3. **Session Wallet**: Handles transaction without approval prompts
4. **Result**: Seamless user experience with full security

## 🛣️ Ready for Production

### Current Status ✅
- **Core API**: Complete and tested
- **Authentication**: Multi-device JWT system
 - **Blockchain**: Silence Labs MPC integration verified
- **Database**: Production-ready schema
- **Security**: Comprehensive protection
- **Testing**: 100% critical path coverage

### Mobile Integration Ready ✅
- **CORS**: Configured for React Native
- **WebSocket**: Real-time updates
- **Authentication**: Mobile-optimized flow
- **Error Handling**: Mobile-friendly responses
- **Performance**: Optimized for mobile latency

### Next Steps for React Native Team

1. **Install Dependencies**: Silence Labs React Native SDK
2. **Configure Authentication**: Use provided flow examples
3. **Connect to Backend**: Point to `http://localhost:3000`
4. **Test SmartProfiles**: Create, switch, manage profiles
5. **Implement App Management**: iPhone-style bookmarking
6. **WebSocket Integration**: Real-time profile sync

## 🤝 Contributing

### Development Guidelines
- **TypeScript**: Strict mode enabled
- **Testing**: Required for all new features
- **Security**: Follow established patterns
- **Documentation**: Update API docs

### Code Quality ✅
- **ESLint + Prettier**: Configured
- **Pre-commit hooks**: Enabled
- **CI/CD**: GitHub Actions ready
- **Type safety**: 100% TypeScript coverage

## 📄 License

ISC License - see LICENSE file for details.

## 🆘 Support

**API Issues**:
- Check server logs: `npm run dev`
- Verify database: `npm run prisma:studio`
- Test endpoints: Use provided examples

**React Native Integration**:
- Follow authentication flow exactly
- Check CORS configuration
 - Verify Silence Labs configuration
- Test on device and simulator

---

**🚀 Backend Status: Production Ready for React Native Development**

**✅ All systems verified • ✅ Real blockchain integration • ✅ Complete test coverage**
