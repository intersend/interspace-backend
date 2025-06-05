import dotenv from 'dotenv';

dotenv.config();

interface Config {
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
  
  // Redis
  REDIS_URL: string;
  REDIS_PASSWORD?: string;
  
  // Thirdweb
  THIRDWEB_CLIENT_ID: string;
  THIRDWEB_SECRET_KEY: string;
  
  // Blockchain
  DEFAULT_CHAIN_ID: number;
  SUPPORTED_CHAINS: number[];
  SESSION_WALLET_FACTORY_ADDRESS?: string;
  DEPLOYER_PRIVATE_KEY?: string;
  
  // Security
  CORS_ORIGINS: string[];
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  
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
  
  // Redis
  REDIS_URL: getEnvVar('REDIS_URL'),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  
  // Thirdweb
  THIRDWEB_CLIENT_ID: getEnvVar('THIRDWEB_CLIENT_ID'),
  THIRDWEB_SECRET_KEY: getEnvVar('THIRDWEB_SECRET_KEY'),
  
  // Blockchain
  DEFAULT_CHAIN_ID: getEnvNumber('DEFAULT_CHAIN_ID', 1),
  SUPPORTED_CHAINS: getEnvNumberArray('SUPPORTED_CHAINS', [1, 137, 42161, 10, 8453]),
  SESSION_WALLET_FACTORY_ADDRESS: process.env.SESSION_WALLET_FACTORY_ADDRESS,
  DEPLOYER_PRIVATE_KEY: process.env.DEPLOYER_PRIVATE_KEY,
  
  // Security
  CORS_ORIGINS: getEnvArray('CORS_ORIGINS', ['http://localhost:3000', 'http://localhost:19006']),
  RATE_LIMIT_WINDOW_MS: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  
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
};

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// Validate critical configuration on startup
export function validateConfig(): void {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'REDIS_URL',
    'THIRDWEB_CLIENT_ID',
    'THIRDWEB_SECRET_KEY'
  ];

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

  console.log('✅ Configuration validated successfully');
}
