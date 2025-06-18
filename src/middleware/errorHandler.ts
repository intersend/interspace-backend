import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '@/types';
import { isDevelopment } from '@/utils/config';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  // Log error for debugging with request correlation
  const errorLog = {
    requestId,
    message: error.message,
    name: error.name,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')?.slice(0, 100), // Truncate long user agents
    userId: req.user?.userId,
    timestamp: new Date().toISOString()
  };

  // Only include stack trace in development
  if (isDevelopment) {
    (errorLog as any).stack = error.stack;
  }

  console.error('❌ Request error:', errorLog);

  // Handle known application errors
  if (error instanceof AppError) {
    const errorResponse: any = {
      success: false,
      error: error.message,
      code: error.code,
      requestId
    };

    // Add validation errors if present
    if (error instanceof ValidationError && error.details) {
      errorResponse.errors = error.details;
    }

    res.status(error.statusCode).json(errorResponse);
    return;
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    handlePrismaError(error as any, res, requestId);
    return;
  }

  // Handle JWT errors (fallback)
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTHENTICATION_ERROR',
      requestId
    });
    return;
  }

  // Handle validation errors from Joi
  if (error.name === 'ValidationError' && 'details' in error) {
    const validationErrors = (error as any).details.map((detail: any) => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: validationErrors,
      requestId
    });
    return;
  }

  // Handle unexpected errors
  const unexpectedErrorResponse: any = {
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId
  };

  // Only include stack trace in development
  if (isDevelopment) {
    unexpectedErrorResponse.stack = error.stack;
  }

  res.status(500).json(unexpectedErrorResponse);
}

function handlePrismaError(error: any, res: Response, requestId: string): void {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = error.meta?.target?.[0] || 'field';
      res.status(409).json({
        success: false,
        error: `${field} already exists`,
        code: 'DUPLICATE_ERROR',
        requestId
      });
      return;

    case 'P2025':
      // Record not found
      res.status(404).json({
        success: false,
        error: 'Record not found',
        code: 'NOT_FOUND_ERROR',
        requestId
      });
      return;

    case 'P2003':
      // Foreign key constraint violation
      res.status(400).json({
        success: false,
        error: 'Invalid reference',
        code: 'REFERENCE_ERROR',
        requestId
      });
      return;

    default:
      res.status(500).json({
        success: false,
        error: 'Database error',
        code: 'DATABASE_ERROR',
        requestId
      });
      return;
  }
}

// Handle 404 errors for unmatched routes
export function notFound(req: Request, res: Response): void {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.url} not found`,
    code: 'NOT_FOUND_ERROR',
    requestId
  });
}

// Async error wrapper to catch async errors in route handlers
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
