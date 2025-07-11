/**
 * Middleware to bypass authentication for public endpoints
 * This should be applied before authentication middleware
 */

import { Request, Response, NextFunction } from 'express';

interface PublicEndpoint {
  method: string;
  path: string;
}

const PUBLIC_ENDPOINTS: PublicEndpoint[] = [
  // V2 public endpoints
  { method: 'GET', path: '/api/v2/siwe/nonce' },
  { method: 'POST', path: '/api/v2/auth/send-email-code' },
  { method: 'POST', path: '/api/v2/auth/resend-email-code' },
  { method: 'POST', path: '/api/v2/auth/verify-email-code' },
  { method: 'POST', path: '/api/v2/auth/authenticate' },
  { method: 'POST', path: '/api/v2/auth/refresh' },
  { method: 'POST', path: '/api/v2/auth/logout' },
  
  // App Store public endpoints
  { method: 'GET', path: '/api/v2/app-store/categories' },
  { method: 'GET', path: '/api/v2/app-store/apps' },
  { method: 'GET', path: '/api/v2/app-store/featured' },
  { method: 'GET', path: '/api/v2/app-store/search' },
  // Dynamic app store endpoints (handled separately)
  
  // V1 public endpoints (for backward compatibility)
  { method: 'GET', path: '/api/v1/siwe/nonce' },
  { method: 'POST', path: '/api/v1/auth/send-email-code' },
  { method: 'POST', path: '/api/v1/auth/email/verify-code' },
  { method: 'POST', path: '/api/v1/auth/email/resend-code' },
  { method: 'POST', path: '/api/v1/siwe/authenticate' },
  { method: 'POST', path: '/api/v1/auth/authenticate' },
  { method: 'POST', path: '/api/v1/auth/refresh' },
  
  // Health and info endpoints
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/' },
];

/**
 * Check if the current request is for a public endpoint
 */
export function isPublicEndpoint(req: Request): boolean {
  const method = req.method;
  // Use originalUrl to get the full path, not the relative path
  const fullPath = req.originalUrl || req.path;
  // Remove query string for comparison
  const path = fullPath.split('?')[0];
  
  // Check static endpoints
  const isStaticPublic = PUBLIC_ENDPOINTS.some(endpoint => 
    endpoint.method === method && path === endpoint.path
  );
  
  if (isStaticPublic) return true;
  
  // Check dynamic app store endpoints
  if (method === 'GET' && path && path.match(/^\/api\/v2\/app-store\/apps\/[^/]+$/)) {
    return true; // GET /api/v2/app-store/apps/:id
  }
  
  if (method === 'GET' && path && path.match(/^\/api\/v2\/app-store\/apps\/share\/[^/]+$/)) {
    return true; // GET /api/v2/app-store/apps/share/:shareableId
  }
  
  return false;
}

/**
 * Middleware that marks public endpoints
 */
export function markPublicEndpoints(req: Request, res: Response, next: NextFunction): void {
  (req as any).isPublicEndpoint = isPublicEndpoint(req);
  next();
}