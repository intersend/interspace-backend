import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  // Server
  NODE_ENV: string;
  PORT: number;
  API_VERSION: string;
  
  // Database
  DATABASE_URL: string;
  
  // JWT
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  ENCRYPTION_SECRET: string;
  
  

  // Silence Labs MPC
  DISABLE_MPC: boolean;
  BYPASS_LOGIN: boolean;
  SILENCE_ADMIN_TOKEN: string;
  SILENCE_NODE_URL: string;
  DUO_NODE_URL: string;
  DUO_NODE_AUDIENCE_URL: string;

  // Social Providers
  GOOGLE_CLIENT_ID?: string;
  APPLE_CLIENT_ID?: string;
  
  // Blockchain
  DEFAULT_CHAIN_ID: number;
  SUPPORTED_CHAINS: number[];
  
  // Security
  CORS_ORIGINS: string[];
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  
  // Redis (Optional - for distributed features)
  REDIS_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_PASSWORD?: string;
  REDIS_DB?: number;
  REDIS_ENABLED?: boolean;
  
  // Social OAuth (Optional)
  FARCASTER_CLIENT_ID?: string;
  FARCASTER_CLIENT_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  
  // File Storage (Optional)
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_S3_BUCKET?: string;
  AWS_REGION?: string;
  
  // Orby Configuration
  ORBY_INSTANCE_PRIVATE_API_KEY: string;
  ORBY_INSTANCE_PUBLIC_API_KEY: string;
  ORBY_APP_NAME: string;
  ORBY_PRIVATE_INSTANCE_URL: string;

  // Frontend URL
  FRONTEND_URL: string;

  // Google Cloud Platform (Optional)
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  K_SERVICE?: string; // Cloud Run service name
  K_REVISION?: string; // Cloud Run revision
  K_CONFIGURATION?: string; // Cloud Run configuration
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Environment variable ${name} is required`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
}

function getEnvArray(name: string, defaultValue: string[] = []): string[] {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim());
}

function getEnvNumberArray(name: string, defaultValue: number[] = []): number[] {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.split(',').map(item => {
    const num = parseInt(item.trim(), 10);
    if (isNaN(num)) {
      throw new Error(`Invalid number in ${name}: ${item}`);
    }
    return num;
  });
}

function getEnvBoolean(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const config: Config = {
  // Server
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  PORT: getEnvNumber('PORT', 3000),
  API_VERSION: getEnvVar('API_VERSION', 'v1'),
  
  // Database
  DATABASE_URL: getEnvVar('DATABASE_URL'),
  
  // JWT
  JWT_SECRET: getEnvVar('JWT_SECRET'),
  JWT_REFRESH_SECRET: getEnvVar('JWT_REFRESH_SECRET'),
  JWT_EXPIRES_IN: getEnvVar('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnvVar('JWT_REFRESH_EXPIRES_IN', '7d'),
  ENCRYPTION_SECRET: getEnvVar('ENCRYPTION_SECRET'),

  DISABLE_MPC: getEnvBoolean('DISABLE_MPC', false),
  BYPASS_LOGIN: getEnvBoolean('BYPASS_LOGIN', false),

  // Silence Labs MPC
  SILENCE_ADMIN_TOKEN: getEnvVar('SILENCE_ADMIN_TOKEN'),
  SILENCE_NODE_URL: getEnvVar('SILENCE_NODE_URL'),
  DUO_NODE_URL: getEnvVar('DUO_NODE_URL', 'http://localhost:3001'), // Default to localhost for local development
  DUO_NODE_AUDIENCE_URL: getEnvVar('DUO_NODE_AUDIENCE_URL', 'http://localhost:3001'), // Default to localhost for local development

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
  
  // Blockchain
  DEFAULT_CHAIN_ID: getEnvNumber('DEFAULT_CHAIN_ID', 1),
  SUPPORTED_CHAINS: getEnvNumberArray('SUPPORTED_CHAINS', [1, 137, 42161, 10, 8453]),
  
  // Security
  CORS_ORIGINS: getEnvArray('CORS_ORIGINS', ['http://localhost:3000', 'http://localhost:19006']),
  RATE_LIMIT_WINDOW_MS: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  
  // Redis (Optional - for distributed features)
  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT ? getEnvNumber('REDIS_PORT') : undefined,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: process.env.REDIS_DB ? getEnvNumber('REDIS_DB') : undefined,
  REDIS_ENABLED: getEnvBoolean('REDIS_ENABLED', false),
  
  // Social OAuth (Optional)
  FARCASTER_CLIENT_ID: process.env.FARCASTER_CLIENT_ID,
  FARCASTER_CLIENT_SECRET: process.env.FARCASTER_CLIENT_SECRET,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  
  // File Storage (Optional)
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
  AWS_REGION: process.env.AWS_REGION,
  
  // Orby Configuration
  ORBY_INSTANCE_PRIVATE_API_KEY: getEnvVar('ORBY_INSTANCE_PRIVATE_API_KEY'),
  ORBY_INSTANCE_PUBLIC_API_KEY: getEnvVar('ORBY_INSTANCE_PUBLIC_API_KEY'),
  ORBY_APP_NAME: getEnvVar('ORBY_APP_NAME', 'interspace'),
  ORBY_PRIVATE_INSTANCE_URL: getEnvVar('ORBY_PRIVATE_INSTANCE_URL'),

  // Frontend URL
  FRONTEND_URL: getEnvVar('FRONTEND_URL', 'http://localhost:3000'),

  // Google Cloud Platform (Optional)
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  K_SERVICE: process.env.K_SERVICE, // Cloud Run service name
  K_REVISION: process.env.K_REVISION, // Cloud Run revision
  K_CONFIGURATION: process.env.K_CONFIGURATION, // Cloud Run configuration
};

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
export const isCloudRun = !!config.K_SERVICE; // Cloud Run sets K_SERVICE automatically

// Validate critical configuration on startup
export function validateConfig(): void {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_SECRET',
    'ORBY_INSTANCE_PRIVATE_API_KEY',
    'ORBY_INSTANCE_PUBLIC_API_KEY',
    'ORBY_PRIVATE_INSTANCE_URL',
    'FRONTEND_URL'
  ];

  if (!config.DISABLE_MPC) {
    requiredVars.push('SILENCE_ADMIN_TOKEN', 'SILENCE_NODE_URL', 'DUO_NODE_URL', 'DUO_NODE_AUDIENCE_URL');
  }

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  // Validate chain configuration
  if (!config.SUPPORTED_CHAINS.includes(config.DEFAULT_CHAIN_ID)) {
    console.error('❌ DEFAULT_CHAIN_ID must be included in SUPPORTED_CHAINS');
    process.exit(1);
  }

  // Production security validations
  if (config.NODE_ENV === 'production') {
    // Critical: BYPASS_LOGIN must be false in production
    if (config.BYPASS_LOGIN) {
      console.error('❌ SECURITY VIOLATION: BYPASS_LOGIN must be false in production environment');
      console.error('This flag allows authentication bypass and is only for development');
      process.exit(1);
    }

    // Critical: CORS must not include wildcard in production
    if (config.CORS_ORIGINS.includes('*')) {
      console.error('❌ SECURITY VIOLATION: CORS_ORIGINS cannot include "*" in production');
      console.error('Please specify exact domain origins for production deployment');
      process.exit(1);
    }

    // Warning: Ensure strong JWT secrets in production
    if (config.JWT_SECRET.length < 32 || config.JWT_REFRESH_SECRET.length < 32) {
      console.warn('⚠️  WARNING: JWT secrets should be at least 32 characters in production');
    }

    // Critical: Ensure encryption secret is properly formatted
    if (config.ENCRYPTION_SECRET.length !== 64) {
      console.error('❌ SECURITY VIOLATION: ENCRYPTION_SECRET must be exactly 64 hex characters (32 bytes)');
      console.error('Generate with: openssl rand -hex 32');
      process.exit(1);
    }
    
    // Validate it's valid hex
    if (!/^[0-9a-fA-F]{64}$/.test(config.ENCRYPTION_SECRET)) {
      console.error('❌ SECURITY VIOLATION: ENCRYPTION_SECRET must be a valid hex string');
      console.error('Generate with: openssl rand -hex 32');
      process.exit(1);
    }

    console.log('🔒 Production security validations passed');
  }

  // Development-specific validations
  if (config.NODE_ENV === 'development') {
    if (config.BYPASS_LOGIN) {
      console.warn('⚠️  DEVELOPMENT: BYPASS_LOGIN is enabled - authentication will be bypassed');
    }

    if (config.CORS_ORIGINS.includes('*')) {
      console.warn('⚠️  DEVELOPMENT: CORS allows all origins - this is OK for development');
    }

    console.log('🔧 Development configuration validated');
  }

  // Google Cloud Run specific validations
  if (isCloudRun) {
    console.log('☁️  Running on Google Cloud Run');
    
    if (!config.GOOGLE_CLOUD_PROJECT) {
      console.warn('⚠️  GOOGLE_CLOUD_PROJECT not detected in Cloud Run environment');
    }

    // Validate internal service URLs for MPC communication
    if (!config.DISABLE_MPC) {
      if (config.SILENCE_NODE_URL.includes('localhost') || config.DUO_NODE_URL.includes('localhost')) {
        console.warn('⚠️  WARNING: MPC service URLs contain localhost in Cloud Run environment');
        console.warn('   This may indicate incorrect configuration for internal service communication');
      }
    }

    console.log('☁️  Cloud Run environment validations completed');
  }

  console.log('✅ Configuration validated successfully');
}
