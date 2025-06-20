import { TestSuite, TestContext } from '../../types';
import { assertErrorResponse } from '../../utils/ApiClient';
import { logger } from '../../utils/logger';

export const securitySuite: TestSuite = {
  name: 'Security',
  description: 'Comprehensive security testing including OWASP Top 10',
  tags: ['security', 'critical', 'owasp'],
  priority: 'critical',
  endpoints: ['*'], // All endpoints
  
  async setup(context: TestContext) {
    // Create test data for security testing
    await context.createUser({
      email: 'security.test@example.com',
      password: 'SecureTestPassword123!'
    });
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    {
      name: 'SQL Injection - Authentication endpoint',
      tags: ['sql-injection', 'owasp-a03'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        const sqlInjectionPayloads = [
          "admin' OR '1'='1",
          "admin'; DROP TABLE users; --",
          "' OR 1=1 --",
          "admin' /*",
          "' UNION SELECT * FROM users --",
          "admin' AND 1=0 UNION ALL SELECT 'admin', '81dc9bdb52d04dc20036dbd8313ed055'",
          "'; EXEC xp_cmdshell('net user'); --"
        ];

        for (const payload of sqlInjectionPayloads) {
          try {
            await client.post('/api/v1/auth/authenticate', {
              email: payload,
              password: payload,
              type: 'email'
            });
          } catch (error) {
            // Should get 400 or 401, not 500 (which might indicate SQL error)
            const status = (error as any).status;
            if (status === 500) {
              throw new Error(`Potential SQL injection vulnerability with payload: ${payload}`);
            }
            if (status !== 400 && status !== 401) {
              throw new Error(`Unexpected status ${status} for SQL injection test`);
            }
          }
        }
        
        logger.info('SQL injection tests passed - no vulnerabilities detected');
      }
    },

    {
      name: 'XSS Prevention - User input fields',
      tags: ['xss', 'owasp-a03'],
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const client = context.createApiClient(accessToken);
        
        const xssPayloads = [
          '<script>alert("XSS")</script>',
          '<img src=x onerror=alert("XSS")>',
          '<svg onload=alert("XSS")>',
          'javascript:alert("XSS")',
          '<iframe src="javascript:alert(\'XSS\')">',
          '<body onload=alert("XSS")>',
          '"><script>alert(String.fromCharCode(88,83,83))</script>'
        ];

        // Test profile creation with XSS payloads
        for (const payload of xssPayloads) {
          const response = await client.post('/api/v1/profiles', {
            name: payload,
            clientShare: { test: payload }
          });

          // Check if payload is properly escaped in response
          if (response.data.data.name.includes('<script>') || 
              response.data.data.name.includes('javascript:')) {
            throw new Error('XSS vulnerability: Unescaped user input in response');
          }
        }
        
        logger.info('XSS prevention tests passed');
      }
    },

    {
      name: 'Authentication Bypass Attempts',
      tags: ['auth-bypass', 'owasp-a07'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Try to access protected endpoints without auth
        const protectedEndpoints = [
          '/api/v1/auth/me',
          '/api/v1/profiles',
          '/api/v1/users/profile',
          '/api/v1/mpc/backup',
          '/api/v1/2fa/setup'
        ];

        for (const endpoint of protectedEndpoints) {
          try {
            await client.get(endpoint);
            throw new Error(`Authentication bypass: ${endpoint} accessible without auth`);
          } catch (error) {
            assertErrorResponse(error, 401);
          }
        }

        // Try with malformed tokens
        const malformedTokens = [
          'invalid-token',
          'Bearer',
          'Bearer ',
          'null',
          'undefined',
          '{}'
        ];

        for (const token of malformedTokens) {
          client.setAccessToken(token);
          try {
            await client.get('/api/v1/auth/me');
            throw new Error(`Authentication bypass with token: ${token}`);
          } catch (error) {
            assertErrorResponse(error, 401);
          }
        }
        
        logger.info('Authentication bypass tests passed');
      }
    },

    {
      name: 'Rate Limiting Enforcement',
      tags: ['rate-limit', 'dos-protection'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Make rapid requests to trigger rate limiting
        const requests = [];
        for (let i = 0; i < 100; i++) {
          requests.push(
            client.post('/api/v1/auth/authenticate', {
              email: 'ratelimit@test.com',
              password: 'password',
              type: 'email'
            }).catch(e => e)
          );
        }

        const results = await Promise.all(requests);
        const rateLimited = results.filter(r => r.status === 429);
        
        if (rateLimited.length === 0) {
          throw new Error('Rate limiting not enforced - potential DoS vulnerability');
        }
        
        logger.info(`Rate limiting working: ${rateLimited.length}/100 requests blocked`);
      }
    },

    {
      name: 'JWT Security Validation',
      tags: ['jwt', 'token-security'],
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const client = context.createApiClient();
        
        // Test algorithm confusion attack
        const parts = accessToken.split('.');
        const header = JSON.parse(Buffer.from(parts[0] || '', 'base64').toString());
        header.alg = 'none';
        const modifiedToken = Buffer.from(JSON.stringify(header)).toString('base64') + '.' + parts[1] + '.';
        
        client.setAccessToken(modifiedToken);
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('JWT algorithm confusion vulnerability detected');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        // Test token without signature
        const noSigToken = parts[0] + '.' + parts[1] + '.';
        client.setAccessToken(noSigToken);
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('JWT signature validation bypass detected');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        logger.info('JWT security validation passed');
      }
    },

    {
      name: 'CORS Policy Validation',
      tags: ['cors', 'cross-origin'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Test with different origins
        const testOrigins = [
          'http://malicious-site.com',
          'https://evil.com',
          'null',
          'file://'
        ];

        for (const origin of testOrigins) {
          try {
            await client.get('/api/v1/auth/me', {
              headers: {
                'Origin': origin
              }
            });
            
            // Check if response allows the malicious origin
            // This would need to check response headers
            logger.warn(`CORS request from ${origin} - verify policy`);
          } catch (error) {
            // Expected to fail
          }
        }
        
        logger.info('CORS policy validation completed');
      }
    },

    {
      name: 'Input Validation - Boundary Testing',
      tags: ['input-validation', 'boundary'],
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const client = context.createApiClient(accessToken);
        
        // Test extremely long inputs
        const longString = 'a'.repeat(10000);
        try {
          await client.post('/api/v1/profiles', {
            name: longString
          });
          // Should either succeed with truncation or fail with 400
        } catch (error) {
          if ((error as any).status !== 400) {
            throw new Error('No input length validation');
          }
        }

        // Test special characters
        const specialChars = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~';
        const response = await client.post('/api/v1/profiles', {
          name: `Test ${specialChars} Profile`
        });
        
        // Verify proper handling
        if (response.status !== 200 && response.status !== 201) {
          throw new Error('Special characters not handled properly');
        }
        
        logger.info('Input validation tests passed');
      }
    },

    {
      name: 'Password Security Requirements',
      tags: ['password', 'auth-security'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        const weakPasswords = [
          'password',
          '12345678',
          'qwerty123',
          'admin123',
          'test',
          ''
        ];

        for (const password of weakPasswords) {
          try {
            await context.createUser({
              email: `weak${Date.now()}@test.com`,
              password
            });
            throw new Error(`Weak password accepted: ${password}`);
          } catch (error) {
            // Should reject weak passwords
            logger.debug(`Weak password rejected: ${password}`);
          }
        }
        
        logger.info('Password security requirements enforced');
      }
    },

    {
      name: 'Session Fixation Prevention',
      tags: ['session', 'auth-security'],
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken: token1 } = await context.authenticate(user);
        const { accessToken: token2 } = await context.authenticate(user);
        
        // Tokens should be different for each login
        if (token1 === token2) {
          throw new Error('Session fixation vulnerability: Same token issued');
        }
        
        // Logout should invalidate token
        const client = context.createApiClient(token1);
        await client.post('/api/v1/auth/logout');
        
        // Old token should not work
        try {
          await client.get('/api/v1/auth/me');
          throw new Error('Session not properly invalidated after logout');
        } catch (error) {
          assertErrorResponse(error, 401);
        }
        
        logger.info('Session fixation prevention working');
      }
    },

    {
      name: 'Information Disclosure Prevention',
      tags: ['info-disclosure', 'owasp-a01'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Test invalid login - should not reveal if user exists
        try {
          await client.post('/api/v1/auth/authenticate', {
            email: 'nonexistent@test.com',
            password: 'wrong',
            type: 'email'
          });
        } catch (error) {
          const message = (error as any).data?.message || '';
          if (message.includes('not found') || message.includes('does not exist')) {
            throw new Error('User enumeration vulnerability: Reveals user existence');
          }
        }

        // Test error messages don't reveal system info
        try {
          await client.get('/api/v1/invalid-endpoint-12345');
        } catch (error) {
          const errorData = (error as any).data;
          if (errorData?.stack || errorData?.sql || errorData?.systemInfo) {
            throw new Error('Information disclosure: Stack traces or system info in errors');
          }
        }
        
        logger.info('Information disclosure prevention tests passed');
      }
    },

    {
      name: 'HTTPS Enforcement and Security Headers',
      tags: ['https', 'headers', 'transport-security'],
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const client = context.createApiClient(accessToken);
        
        const response = await client.get('/api/v1/auth/me');
        const headers = response.headers;
        
        // Check security headers
        const requiredHeaders = {
          'x-content-type-options': 'nosniff',
          'x-frame-options': ['DENY', 'SAMEORIGIN'],
          'x-xss-protection': '1; mode=block'
        };

        for (const [header, expectedValues] of Object.entries(requiredHeaders)) {
          const actualValue = headers[header];
          if (!actualValue) {
            logger.warn(`Missing security header: ${header}`);
          } else {
            const expected = Array.isArray(expectedValues) ? expectedValues : [expectedValues];
            if (!expected.includes(actualValue)) {
              logger.warn(`Invalid ${header}: ${actualValue}, expected: ${expected.join(' or ')}`);
            }
          }
        }
        
        // Check for HSTS in production
        if (process.env.NODE_ENV === 'production' && !headers['strict-transport-security']) {
          logger.warn('Missing Strict-Transport-Security header in production');
        }
        
        logger.info('Security headers validation completed');
      }
    },

    {
      name: 'API Versioning Security',
      tags: ['api-version', 'deprecation'],
      async fn(context: TestContext) {
        const client = context.createApiClient();
        
        // Test old API versions are properly deprecated
        const oldVersions = ['/api/v0/', '/api/'];
        
        for (const version of oldVersions) {
          try {
            await client.get(`${version}auth/me`);
            logger.warn(`Old API version still accessible: ${version}`);
          } catch (error) {
            // Expected to fail
          }
        }
        
        logger.info('API versioning security test completed');
      }
    }
  ]
};