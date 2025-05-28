import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '@/types';
import { isDevelopment } from '@/utils/config';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error for debugging
  console.error('Error occurred:', {
    message: error.message,
    stack: isDevelopment ? error.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId
  });

  // Handle known application errors
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      ...(error instanceof ValidationError && { errors: error.details })
    });
    return;
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    handlePrismaError(error as any, res);
    return;
  }

  // Handle JWT errors (fallback)
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTHENTICATION_ERROR'
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
      errors: validationErrors
    });
    return;
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: error.stack })
  });
}

function handlePrismaError(error: any, res: Response): void {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = error.meta?.target?.[0] || 'field';
      res.status(409).json({
        success: false,
        error: `${field} already exists`,
        code: 'DUPLICATE_ERROR'
      });
      return;

    case 'P2025':
      // Record not found
      res.status(404).json({
        success: false,
        error: 'Record not found',
        code: 'NOT_FOUND_ERROR'
      });
      return;

    case 'P2003':
      // Foreign key constraint violation
      res.status(400).json({
        success: false,
        error: 'Invalid reference',
        code: 'REFERENCE_ERROR'
      });
      return;

    default:
      res.status(500).json({
        success: false,
        error: 'Database error',
        code: 'DATABASE_ERROR'
      });
      return;
  }
}

// Handle 404 errors for unmatched routes
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.url} not found`,
    code: 'NOT_FOUND_ERROR'
  });
}

// Async error wrapper to catch async errors in route handlers
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
