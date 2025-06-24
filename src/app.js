const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { errorHandler } = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const { logger } = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const authRoutesV2 = require('./routes/authRoutesV2');
const profileRoutes = require('./routes/profileRoutes');
const profileRoutesV2 = require('./routes/profileRoutesV2');
const userRoutes = require('./routes/userRoutes');
const mpcRoutes = require('./routes/mpcRoutes');
const orbyRoutes = require('./routes/orbyRoutes');
const siweRoutes = require('./routes/siweRoutes').default;
const wellKnownRoutes = require('./routes/wellKnownRoutes').default;
const appsRoutes = require('./routes/appsRoutes').default;
const foldersRoutes = require('./routes/foldersRoutes').default;

// Create Express app
const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for development
}));
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '2.0.0'
  });
});

// Well-known routes (for app associations, passkeys, etc.)
app.use('/.well-known', wellKnownRoutes);

// API routes
const apiV1Router = express.Router();
const apiV2Router = express.Router();

// V1 Routes (Legacy)
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/profiles', profileRoutes);
apiV1Router.use('/users', userRoutes);
apiV1Router.use('/mpc', mpcRoutes);
apiV1Router.use('/orby', orbyRoutes);
apiV1Router.use('/siwe', siweRoutes);
apiV1Router.use('/', appsRoutes); // Apps routes are mounted at root because they include /profiles/:id/apps
apiV1Router.use('/', foldersRoutes); // Folders routes are mounted at root because they include /profiles/:id/folders

// V2 Routes (Flat Identity Model)
if (process.env.ENABLE_V2_API !== 'false') {
  const userRoutesV2 = require('./routes/userRoutesV2');
  
  apiV2Router.use('/auth', authRoutesV2);
  apiV2Router.use('/', appsRoutes); // Apps routes mounted BEFORE profiles to avoid route conflicts
  apiV2Router.use('/', foldersRoutes); // Folders routes mounted BEFORE profiles to avoid route conflicts
  apiV2Router.use('/profiles', profileRoutesV2); // Use V2 profile routes
  apiV2Router.use('/users', userRoutesV2); // Use V2 user routes
  apiV2Router.use('/siwe', siweRoutes); // SIWE routes for v2
  
  // Apply V2 routes
  app.use('/api/v2', rateLimiter.apiLimiter, apiV2Router);
  
  logger.info('V2 API endpoints enabled');
}

// Apply V1 routes
app.use('/api/v1', rateLimiter.apiLimiter, apiV1Router);

// Root redirect
app.get('/', (req, res) => {
  res.json({
    name: 'Interspace Backend API',
    version: '2.0.0',
    endpoints: {
      v1: '/api/v1',
      v2: '/api/v2',
      health: '/health',
      docs: '/docs'
    },
    features: {
      flatIdentity: true,
      autoProfileCreation: true,
      privacyModes: ['linked', 'partial', 'isolated'],
      supportedAuthMethods: ['wallet', 'email', 'social', 'passkey', 'guest']
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    availableVersions: ['/api/v1', '/api/v2']
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info('Socket.IO client connected', { socketId: socket.id });

  socket.on('join_profile', (profileId) => {
    socket.join(`profile:${profileId}`);
    logger.info('Socket joined profile room', { socketId: socket.id, profileId });
  });

  socket.on('leave_profile', (profileId) => {
    socket.leave(`profile:${profileId}`);
    logger.info('Socket left profile room', { socketId: socket.id, profileId });
  });

  socket.on('disconnect', () => {
    logger.info('Socket.IO client disconnected', { socketId: socket.id });
  });
});

// Attach io to app for use in routes
app.set('io', io);

// Export for testing
module.exports = app;

// Start server if not in test environment
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Interspace Backend v2 running on port ${PORT}`);
    logger.info(`📍 V1 API: http://localhost:${PORT}/api/v1`);
    logger.info(`📍 V2 API: http://localhost:${PORT}/api/v2`);
    logger.info(`🏗️  Flat Identity Model: ${process.env.ENABLE_V2_API !== 'false' ? 'Enabled' : 'Disabled'}`);
    logger.info(`🤖 Auto Profile Creation: ${process.env.AUTO_CREATE_PROFILE !== 'false' ? 'Enabled' : 'Disabled'}`);
  });
}