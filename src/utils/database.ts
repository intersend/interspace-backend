import { PrismaClient, Prisma } from '@prisma/client';

export { Prisma };

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('📦 Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  console.log('📦 Database disconnected');
}

// Health check function
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Transaction options interface
interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

// Default transaction options
const DEFAULT_TRANSACTION_OPTIONS: TransactionOptions = {
  maxWait: 5000, // Max time to wait for a transaction slot (5s)
  timeout: 30000, // Transaction timeout (30s) - increased from default 5s
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable // Highest isolation level for consistency
};

// Transaction wrapper for complex operations with configurable timeout
export async function withTransaction<T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const transactionOptions = {
    ...DEFAULT_TRANSACTION_OPTIONS,
    ...options
  };

  try {
    return await prisma.$transaction(fn, transactionOptions);
  } catch (error) {
    // Log transaction errors with context
    console.error('Transaction failed:', {
      error: error instanceof Error ? error.message : error,
      options: transactionOptions
    });
    throw error;
  }
}

// Specialized transaction wrapper for long-running operations
export async function withLongTransaction<T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
): Promise<T> {
  return withTransaction(fn, {
    timeout: 60000 // 60 seconds for very long operations
  });
}

// Helper to execute retryable transactions
export async function withRetryableTransaction<T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
  options?: TransactionOptions & { maxRetries?: number; retryDelay?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries || 3;
  const retryDelay = options?.retryDelay || 1000;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTransaction(fn, options);
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      const isRetryable = 
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2024', 'P2034'].includes(error.code); // Timeout or transaction conflict errors

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      console.warn(`Transaction attempt ${attempt} failed, retrying in ${retryDelay}ms...`, {
        error: error instanceof Error ? error.message : error,
        attempt,
        maxRetries
      });

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }

  throw lastError!;
}
