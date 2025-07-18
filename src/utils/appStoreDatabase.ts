import { PrismaClient as AppStorePrismaClient } from '@prisma/client-appstore';

// Separate Prisma client for the public app store database
// This uses a different database with public IP access
let appStoreDB: AppStorePrismaClient;

// Singleton pattern for app store database client
export function getAppStoreDB(): AppStorePrismaClient {
  if (!appStoreDB) {
    appStoreDB = new AppStorePrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: process.env.APPSTORE_DATABASE_URL
        }
      }
    });

    // Handle shutdown gracefully
    process.on('beforeExit', async () => {
      await appStoreDB.$disconnect();
    });
  }

  return appStoreDB;
}

// Export a ready-to-use instance
export const appStorePrisma = getAppStoreDB();

// Health check for app store database
export async function checkAppStoreDBConnection(): Promise<boolean> {
  try {
    await appStorePrisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('App Store DB connection failed:', error);
    return false;
  }
}