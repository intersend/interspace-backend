const { logger } = require('../utils/logger');
const axios = require('axios');

/**
 * OAuth Callback Controller
 * Handles OAuth callbacks from providers that don't support custom URL schemes
 * Exchanges authorization code for access token and redirects to the mobile app
 */

/**
 * Exchange authorization code for access token based on provider
 */
const exchangeCodeForToken = async (provider, code) => {
  switch (provider) {
    case 'github': {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('GitHub OAuth credentials not configured');
      }
      
      try {
        const response = await axios.post('https://github.com/login/oauth/access_token', {
          client_id: clientId,
          client_secret: clientSecret,
          code: code
        }, {
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (response.data.error) {
          throw new Error(response.data.error_description || response.data.error);
        }
        
        return {
          access_token: response.data.access_token,
          token_type: response.data.token_type,
          scope: response.data.scope
        };
      } catch (error) {
        logger.error('GitHub token exchange failed:', error);
        throw error;
      }
    }
    
    // Add other providers that need server-side token exchange here
    
    default:
      // For providers that don't need server-side token exchange,
      // just return null and let the mobile app handle it
      return null;
  }
};

/**
 * Generic OAuth callback handler
 * Providers like GitHub redirect here, then we redirect to the app
 */
const handleOAuthCallback = async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    const provider = req.params.provider || 'unknown';
    
    logger.info(`OAuth callback received for ${provider}`, {
      hasCode: !!code,
      hasError: !!error,
      state
    });

    // Build the redirect URL to the app
    let redirectUrl = `com.interspace.ios://oauth2redirect/${provider}`;
    
    // Add query parameters
    const params = new URLSearchParams();
    
    if (error) {
      params.append('error', error);
      if (error_description) {
        params.append('error_description', error_description);
      }
    } else if (code) {
      // For certain providers, exchange code for token on the backend
      const providersNeedingTokenExchange = ['github', 'facebook'];
      
      if (providersNeedingTokenExchange.includes(provider.toLowerCase())) {
        try {
          const tokenData = await exchangeCodeForToken(provider, code);
          
          if (tokenData && tokenData.access_token) {
            // Pass the access token to the app
            params.append('access_token', tokenData.access_token);
            if (tokenData.token_type) {
              params.append('token_type', tokenData.token_type);
            }
            if (tokenData.scope) {
              params.append('scope', tokenData.scope);
            }
          } else {
            // If token exchange failed or not needed, pass the code
            params.append('code', code);
          }
        } catch (tokenError) {
          // If token exchange fails, return error
          params.append('error', 'token_exchange_failed');
          params.append('error_description', tokenError.message);
        }
      } else {
        // For other providers, just pass the code
        params.append('code', code);
      }
      
      if (state) {
        params.append('state', state);
      }
    }
    
    const queryString = params.toString();
    if (queryString) {
      redirectUrl += `?${queryString}`;
    }

    // For development/testing, you can also show a page with the redirect
    if (process.env.NODE_ENV === 'development') {
      // Return HTML page that redirects
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Redirecting to Interspace...</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 {
              color: #333;
              margin-bottom: 1rem;
            }
            p {
              color: #666;
              margin-bottom: 2rem;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #007AFF;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 500;
            }
            .error {
              color: #d32f2f;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${error ? 
              `<h1>Authentication Failed</h1>
               <p class="error">${error_description || error}</p>
               <a href="${redirectUrl}" class="button">Return to App</a>` :
              `<h1>Authentication Successful</h1>
               <p>Redirecting you back to Interspace...</p>
               <a href="${redirectUrl}" class="button">Open App</a>`
            }
          </div>
          <script>
            // Auto-redirect after a short delay
            setTimeout(function() {
              window.location.href = '${redirectUrl}';
            }, 1000);
          </script>
        </body>
        </html>
      `);
    }

    // Production: Direct redirect
    res.redirect(redirectUrl);
    
  } catch (error) {
    logger.error('OAuth callback error:', error);
    
    // Redirect with error
    const errorUrl = `com.interspace.ios://oauth2redirect/${req.params.provider || 'unknown'}?error=server_error&error_description=${encodeURIComponent(error.message)}`;
    res.redirect(errorUrl);
  }
};

module.exports = {
  handleOAuthCallback
};