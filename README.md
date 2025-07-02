# Interspace Backend

A modern backend API for multi-profile wallet management with blockchain integration.

## 🚀 Features

- **Multi-Profile Management**: Create and manage multiple user profiles
- **Multi-Chain Support**: Ethereum, Polygon, Arbitrum, Optimism, Base and testnets
- **Authentication**: Email OTP, Passkeys, and Sign-In with Ethereum (SIWE)
- **Session Wallets**: ERC-7702 proxy wallets for seamless transactions
- **Real-time Updates**: WebSocket support for live synchronization
- **App Management**: Organize blockchain apps with folders and bookmarks

## 📋 Prerequisites

- Node.js 18+ or 20+
- PostgreSQL 14+
- Docker & Docker Compose (optional)

## 🛠️ Installation

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/interspace-backend.git
cd interspace-backend

# Copy environment variables
cp .env.example .env

# Start with Docker Compose
docker-compose -f docker-compose.local.yml up --build
```

### Manual Installation

```bash
# Install dependencies
npm install

# Set up PostgreSQL database
createdb interspace

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev
```

The server will start on `http://localhost:3000`.

## 🔧 Configuration

Create a `.env` file based on `.env.example`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/interspace"

# Authentication
JWT_SECRET="your-secure-jwt-secret-min-32-chars"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Server
PORT=3000
NODE_ENV="development"
API_VERSION="v1"

# CORS Configuration
CORS_ORIGINS="*"

# Blockchain
DEFAULT_CHAIN_ID=11155111
SUPPORTED_CHAINS="1,137,42161,10,8453,11155111"
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

#### POST `/auth/authenticate`
Authenticate a user with various strategies.

```json
{
  "authToken": "provider_token",
  "authStrategy": "email",
  "deviceId": "unique_device_id",
  "deviceName": "My Device",
  "deviceType": "web"
}
```

### Profiles

#### GET `/profiles`
Get all user profiles.

#### POST `/profiles`
Create a new profile.

```json
{
  "name": "My Profile"
}
```

### Linked Accounts

#### POST `/profiles/:profileId/accounts`
Link an external wallet.

```json
{
  "address": "0x1234...abcd",
  "walletType": "metamask",
  "customName": "My Wallet"
}
```

For complete API documentation, see [API Documentation](./docs/technical/API_DOCUMENTATION.md).

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## 🏗️ Architecture

The backend follows a layered architecture:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and data processing
- **Prisma ORM**: Database interactions
- **Middleware**: Authentication, validation, rate limiting

## 🔐 Security

- JWT-based authentication with refresh tokens
- Rate limiting on all endpoints
- Input validation and sanitization
- Encrypted sensitive data storage
- CORS configuration for web security

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct and development process.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/your-org/interspace-backend/issues) page.

## 🙏 Acknowledgments

- Built with [Express.js](https://expressjs.com/) and [TypeScript](https://www.typescriptlang.org/)
- Database ORM by [Prisma](https://www.prisma.io/)
- Authentication powered by [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)