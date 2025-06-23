/**
 * Middleware to bypass authentication for public endpoints
 * This should be applied before authentication middleware
 */

const PUBLIC_ENDPOINTS = [
  // V2 public endpoints
  { method: 'GET', path: '/api/v2/siwe/nonce' },
  { method: 'POST', path: '/api/v2/auth/send-email-code' },
  { method: 'POST', path: '/api/v2/auth/resend-email-code' },
  { method: 'POST', path: '/api/v2/auth/verify-email-code' },
  { method: 'POST', path: '/api/v2/auth/authenticate' },
  { method: 'POST', path: '/api/v2/auth/refresh' },
  
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
function isPublicEndpoint(req) {
  const method = req.method;
  // Use originalUrl to get the full path, not the relative path
  const path = req.originalUrl || req.path;
  
  return PUBLIC_ENDPOINTS.some(endpoint => 
    endpoint.method === method && path === endpoint.path
  );
}

/**
 * Middleware that marks public endpoints
 */
function markPublicEndpoints(req, res, next) {
  req.isPublicEndpoint = isPublicEndpoint(req);
  next();
}

module.exports = {
  isPublicEndpoint,
  markPublicEndpoints
};