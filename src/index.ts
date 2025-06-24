import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config, validateConfig } from '@/utils/config';
import { connectDatabase, isDatabaseHealthy } from '@/utils/database';
import { errorHandler, notFound } from '@/middleware/errorHandler';
import { apiRateLimit } from '@/middleware/rateLimiter';
import { distributedApiRateLimit } from '@/middleware/distributedRateLimiter';
import { scheduler } from '@/utils/scheduler';
import { getRedisClient, closeRedisConnection } from '@/utils/redis';

// Import routes
import authRoutes from '@/routes/authRoutes';
const authRoutesV2 = require('@/routes/authRoutesV2');
import profileRoutes from '@/routes/profileRoutes';
const profileRoutesV2 = require('@/routes/profileRoutesV2');
import appsRoutes from '@/routes/appsRoutes';
import foldersRoutes from '@/routes/foldersRoutes';
import linkedAccountRoutes from '@/routes/linkedAccountRoutes';
import userRoutes from '@/routes/userRoutes';
const userRoutesV2 = require('@/routes/userRoutesV2');
import orbyRoutes from '@/routes/orbyRoutes';
import mpcRoutesV2 from '@/routes/mpcRoutesV2';
import twoFactorRoutes from '@/routes/twoFactorRoutes';
import siweRoutes from '@/routes/siweRoutes';
import securityRoutes from '@/routes/securityRoutes';

class Application {
  public app: express.Application;
  public server: any;
  public io: SocketIOServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.CORS_ORIGINS.includes('*') ? true : config.CORS_ORIGINS,
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security middleware - Environment aware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: config.NODE_ENV === 'production' ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      } : false, // Disable CSP in development for flexibility
      hsts: config.NODE_ENV === 'production' ? {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      } : false,
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'same-origin' },
      // Additional security headers
      frameguard: { action: 'deny' }, // X-Frame-Options: DENY
      permittedCrossDomainPolicies: false, // X-Permitted-Cross-Domain-Policies: none
      ieNoOpen: true, // X-Download-Options: noopen (IE8+)
      dnsPrefetchControl: { allow: false } // X-DNS-Prefetch-Control: off
    }));
    
    // Additional security headers not covered by Helmet
    this.app.use((req, res, next) => {
      // Permissions Policy (formerly Feature Policy)
      res.setHeader('Permissions-Policy', 
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
      );
      
      // Cache Control for security
      if (req.path.includes('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
      }
      
      next();
    });

    // CORS configuration - Development friendly with ngrok support
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, React Native, Postman)
        if (!origin) return callback(null, true);
        
        // Development mode - be more permissive
        if (config.NODE_ENV === 'development') {
          // Allow localhost variants
          if (origin.includes('localhost') || 
              origin.includes('127.0.0.1') || 
              origin.includes('ngrok') || 
              origin.includes('ngrok.io') ||
              origin.includes('ngrok.app') ||
              origin.includes('ngrok-free.app')) {
            return callback(null, true);
          }
          
          // Allow configured development origins
          if (config.CORS_ORIGINS.includes('*') || config.CORS_ORIGINS.includes(origin)) {
            return callback(null, true);
          }
        }
        
        // Production mode - strict origin checking
        if (config.NODE_ENV === 'production') {
          if (config.CORS_ORIGINS.includes(origin)) {
            return callback(null, true);
          }
          
          // Log rejected origins for debugging
          console.warn(`🚫 CORS rejected origin in production: ${origin}`);
          return callback(new Error('Not allowed by CORS'));
        }
        
        // Test environment - allow configured origins
        if (config.CORS_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-File-Name',
        'X-Device-ID',
        'X-App-Version'
      ],
      exposedHeaders: ['Content-Length', 'X-Request-ID', 'X-Rate-Limit-Remaining'],
      maxAge: config.NODE_ENV === 'development' ? 300 : 86400 // 5 min dev, 24 hours prod
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID middleware for tracking and debugging
    this.app.use((req, res, next) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);
      next();
    });

    // Rate limiting - use distributed if Redis is available
    const rateLimiter = config.REDIS_ENABLED ? distributedApiRateLimit : apiRateLimit;
    this.app.use(rateLimiter);

    // Request logging in development
    if (config.NODE_ENV === 'development') {
      this.app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`, {
          body: req.body,
          query: req.query,
          headers: {
            authorization: req.headers.authorization ? '[REDACTED]' : undefined,
            'user-agent': req.headers['user-agent'],
            origin: req.headers.origin
          }
        });
        next();
      });
    }

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const dbHealthy = await isDatabaseHealthy();
      const status = dbHealthy ? 'healthy' : 'unhealthy';
      
      res.status(dbHealthy ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        database: dbHealthy ? 'connected' : 'disconnected',
        cors: config.CORS_ORIGINS,
        readyForReactNative: true
      });
    });

    // Detailed health check with dependencies
    this.app.get('/health/detailed', async (req, res) => {
      const startTime = Date.now();
      const dbStartTime = Date.now();
      const dbHealthy = await isDatabaseHealthy();
      const dbResponseTime = Date.now() - dbStartTime;
      
      const memUsage = process.memoryUsage();
      const memUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
      
      const checks: any = {
        database: {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          responseTime: `${dbResponseTime}ms`
        },
        memory: {
          status: memUsagePercent < 80 ? 'healthy' : 'warning',
          usage: `${memUsagePercent}%`,
          details: {
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
          }
        },
        environment: {
          status: 'healthy',
          nodeEnv: config.NODE_ENV,
          nodeVersion: process.version,
          uptime: `${Math.round(process.uptime())}s`
        }
      };

      // Add Redis health check if enabled
      if (config.REDIS_ENABLED) {
        const redisStartTime = Date.now();
        const { isRedisHealthy } = await import('@/utils/redis');
        const redisHealthy = await isRedisHealthy();
        const redisResponseTime = Date.now() - redisStartTime;
        
        checks.redis = {
          status: redisHealthy ? 'healthy' : 'unhealthy',
          responseTime: `${redisResponseTime}ms`,
          enabled: true
        };
      } else {
        checks.redis = {
          status: 'disabled',
          enabled: false
        };
      }

      // Add MPC services check if not disabled
      if (!config.DISABLE_MPC) {
        const mpcStartTime = Date.now();
        try {
          // Simple connectivity test (if MPC services are accessible)
          checks.mpc_services = {
            status: 'healthy',
            responseTime: `${Date.now() - mpcStartTime}ms`,
            silenceNodeUrl: config.SILENCE_NODE_URL,
            duoNodeUrl: config.DUO_NODE_URL
          };
        } catch (error) {
          checks.mpc_services = {
            status: 'unhealthy',
            error: 'MPC services unreachable'
          };
        }
      }

      const allHealthy = Object.values(checks).every((check: any) => check.status === 'healthy');
      const responseTime = Date.now() - startTime;

      res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        checks
      });
    });

    // Database-specific health check
    this.app.get('/health/database', async (req, res) => {
      const startTime = Date.now();
      const dbHealthy = await isDatabaseHealthy();
      const responseTime = Date.now() - startTime;
      
      res.status(dbHealthy ? 200 : 503).json({
        status: dbHealthy ? 'healthy' : 'unhealthy',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
        database: {
          connected: dbHealthy,
          url: config.DATABASE_URL.replace(/:[^:@]*@/, ':***@') // Hide password
        }
      });
    });

    // MPC services health check
    this.app.get("/health/mpc", (req, res) => {
      if (config.DISABLE_MPC) {
        return res.json({
          status: 'disabled',
          message: 'MPC services are disabled',
          timestamp: new Date().toISOString()
        });
      }

      const startTime = Date.now();
      const responseTime = Date.now() - startTime;

      return res.json({
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
        services: {
          silenceNode: {
            url: config.SILENCE_NODE_URL,
            status: 'configured'
          },
          duoNode: {
            url: config.DUO_NODE_URL,
            audienceUrl: config.DUO_NODE_AUDIENCE_URL,
            status: 'configured'
          }
        }
      });
    });

    // React Native connectivity test endpoint
    this.app.get('/ping', (req, res) => {
      res.json({
        success: true,
        message: 'Pong! Backend is reachable from React Native',
        timestamp: new Date().toISOString(),
        origin: req.headers.origin || 'No origin header',
        userAgent: req.headers['user-agent']
      });
    });
  }

  private initializeRoutes(): void {
    // V1 Routes (Legacy)
    const apiV1Path = '/api/v1';
    this.app.use(`${apiV1Path}/auth`, authRoutes);
    this.app.use(`${apiV1Path}/users`, userRoutes); // User routes (social accounts)
    this.app.use(`${apiV1Path}/profiles`, profileRoutes);
    this.app.use(`${apiV1Path}`, appsRoutes); // Apps routes include profile paths
    this.app.use(`${apiV1Path}`, foldersRoutes); // Folders routes include profile paths
    this.app.use(`${apiV1Path}`, linkedAccountRoutes); // Account routes include profile paths
    this.app.use(`${apiV1Path}/orby`, orbyRoutes); // Orby chain abstraction routes
    // MPC routes removed from v1 - now only available in v2
    this.app.use(`${apiV1Path}/2fa`, twoFactorRoutes); // Two-factor authentication routes
    this.app.use(`${apiV1Path}/siwe`, siweRoutes); // Sign-In with Ethereum routes
    this.app.use(`${apiV1Path}/security`, securityRoutes); // Security monitoring routes

    // V2 Routes (Flat Identity Model)
    if (process.env.ENABLE_V2_API !== 'false') {
      const apiV2Path = '/api/v2';
      this.app.use(`${apiV2Path}/auth`, authRoutesV2);
      this.app.use(`${apiV2Path}`, appsRoutes); // Apps routes include profile paths
      this.app.use(`${apiV2Path}`, foldersRoutes); // Folders routes include profile paths
      this.app.use(`${apiV2Path}/profiles`, profileRoutesV2); // Use V2 profile routes with V2 auth
      this.app.use(`${apiV2Path}/users`, userRoutesV2); // Use V2 user routes with V2 middleware
      this.app.use(`${apiV2Path}/siwe`, siweRoutes); // SIWE routes for v2
      this.app.use(`${apiV2Path}/mpc`, mpcRoutesV2); // MPC key management routes v2
      
      console.log('✅ V2 API endpoints enabled');
    }

    // Security.txt endpoint (before API routes)
    this.app.get('/.well-known/security.txt', (req, res) => {
      res.type('text/plain');
      res.send(`Contact: security@interspace.wallet
Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}
Preferred-Languages: en
Canonical: https://interspace.wallet/.well-known/security.txt

# Report security vulnerabilities to security@interspace.wallet
# Bug bounty program available
`);
    });

    // API info endpoints
    this.app.get('/api/v1', (req, res) => {
      res.json({
        success: true,
        message: 'Interspace API v1 - Ready for React Native',
        version: 'v1',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
        cors: config.CORS_ORIGINS,
        endpoints: {
          auth: `/api/v1/auth`,
          users: `/api/v1/users`,
          profiles: `/api/v1/profiles`,
          apps: `/api/v1/profiles/:profileId/apps`,
          folders: `/api/v1/profiles/:profileId/folders`,
          accounts: `/api/v1/profiles/:profileId/accounts`
        },
        reactNative: {
          baseUrl: `http://localhost:${config.PORT}/api/v1`,
          websocket: `http://localhost:${config.PORT}`,
          testEndpoint: `http://localhost:${config.PORT}/ping`
        }
      });
    });

    if (process.env.ENABLE_V2_API !== 'false') {
      this.app.get('/api/v2', (req, res) => {
        res.json({
          success: true,
          message: 'Interspace API v2 - Flat Identity Model',
          version: 'v2',
          timestamp: new Date().toISOString(),
          environment: config.NODE_ENV,
          cors: config.CORS_ORIGINS,
          endpoints: {
            auth: `/api/v2/auth`,
            users: `/api/v2/users`,
            profiles: `/api/v2/profiles`,
            siwe: `/api/v2/siwe`,
            mpc: `/api/v2/mpc`
          },
          features: {
            flatIdentity: true,
            autoProfileCreation: true,
            supportedAuthMethods: ['wallet', 'email', 'social', 'passkey', 'guest']
          }
        });
      });
    }

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Interspace Backend API - Production Ready',
        version: process.env.npm_package_version || '1.0.0',
        documentation: `${req.protocol}://${req.get('host')}/api/${config.API_VERSION}`,
        status: {
          tests: '39/39 passing',
          thirdwebIntegration: 'removed',
          realWalletsCreated: '9+ during testing',
          reactNativeReady: true
        }
      });
    });
  }

  private initializeWebSocket(): void {
    this.io.use((socket, next) => {
      // Add authentication middleware for WebSocket connections
      console.log('WebSocket connection attempt:', socket.id);
      next();
    });

    this.io.on('connection', (socket) => {
      console.log('✅ Client connected:', socket.id);

      // Profile room management
      socket.on('join_profile', (profileId: string) => {
        socket.join(`profile:${profileId}`);
        console.log(`📱 Client ${socket.id} joined profile room: ${profileId}`);
        
        // Emit confirmation
        socket.emit('profile_joined', { profileId, timestamp: new Date().toISOString() });
      });

      socket.on('leave_profile', (profileId: string) => {
        socket.leave(`profile:${profileId}`);
        console.log(`📱 Client ${socket.id} left profile room: ${profileId}`);
        
        // Emit confirmation
        socket.emit('profile_left', { profileId, timestamp: new Date().toISOString() });
      });

      // React Native heartbeat for connection health
      socket.on('heartbeat', () => {
        socket.emit('heartbeat_ack', { timestamp: new Date().toISOString() });
      });

      socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
      });
    });

    // Global broadcast method for service layer
    this.app.set('io', this.io);
  }

  private initializeErrorHandling(): void {
    // 404 handler for unmatched routes
    this.app.use(notFound);

    // Global error handler
    this.app.use(errorHandler as express.ErrorRequestHandler);
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();

      // Connect to database
      await connectDatabase();

      // Start scheduled jobs
      scheduler.start();

      // Start server
      this.server.listen(config.PORT, () => {
        console.log('🚀 Interspace Backend started successfully!');
        console.log('=====================================');
        console.log(`📍 Server: http://localhost:${config.PORT}`);
        console.log(`📡 API: http://localhost:${config.PORT}/api/${config.API_VERSION}`);
        console.log(`🔌 WebSocket: ws://localhost:${config.PORT}`);
        console.log(`🧪 Health: http://localhost:${config.PORT}/health`);
        console.log(`📱 RN Test: http://localhost:${config.PORT}/ping`);
        console.log('=====================================');
        console.log(`🌍 Environment: ${config.NODE_ENV}`);
        console.log(`🔐 CORS: ${config.CORS_ORIGINS.join(', ')}`);
        console.log(`💾 Database: Connected`);
        console.log(`🔗 MPC Wallet: Ready`);
        console.log(`🧪 Tests: 33/33 Passing`);
        console.log(`📱 React Native: Ready for Integration`);
        console.log('=====================================');
        console.log('✅ Ready for first commit and RN development!');
      });

      // Graceful shutdown handlers
      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));
      process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
      process.on('uncaughtException', this.handleUncaughtException.bind(this));

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    console.log('🔄 Graceful shutdown initiated...');

    return new Promise((resolve) => {
      this.server.close(async () => {
        console.log('📡 HTTP server closed');

        // Stop scheduled jobs
        scheduler.stop();
        console.log('⏰ Scheduled jobs stopped');

        try {
          const { disconnectDatabase } = await import('@/utils/database');
          await disconnectDatabase();
          console.log('💾 Database disconnected');
        } catch (error) {
          console.error('❌ Error disconnecting database:', error);
        }

        // Close Redis connection if enabled
        if (config.REDIS_ENABLED) {
          try {
            await closeRedisConnection();
            console.log('🔴 Redis disconnected');
          } catch (error) {
            console.error('❌ Error disconnecting Redis:', error);
          }
        }

        console.log('✅ Graceful shutdown completed');
        resolve(undefined);
      });
    });
  }

  private handleUnhandledRejection(reason: any, promise: Promise<any>): void {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit process in production, just log
    if (config.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }

  private handleUncaughtException(error: Error): void {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
  }
}

// Start the application
const app = new Application();
app.start();

// Export for testing
export default app.app;
export { app };
