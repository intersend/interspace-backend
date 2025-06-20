import { authenticator } from 'otplib';
import { ethers } from 'ethers';
import { SiweMessage } from 'siwe';
import { TestContext, TestUser, ApiClient } from '../types';
import { assertResponse, getErrorMessage } from './ApiClient';
import { logger } from './logger';

export class AuthHelper {
  private context: TestContext;

  constructor(context: TestContext) {
    this.context = context;
  }

  /**
   * Perform email/password authentication
   */
  async authenticateWithEmail(
    email: string,
    password: string,
    client: ApiClient
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await client.post('/api/v1/auth/authenticate', {
      email,
      password,
      type: 'email'
    });

    assertResponse(response, 200);
    
    const { accessToken, refreshToken } = response.data.data;
    
    // Update client with new token
    client.setAccessToken(accessToken);
    
    return { accessToken, refreshToken };
  }

  /**
   * Perform wallet authentication with SIWE
   */
  async authenticateWithWallet(
    walletAddress: string,
    client: ApiClient
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Step 1: Get nonce
    const nonceResponse = await client.post('/api/v1/siwe/nonce', {
      address: walletAddress
    });
    
    assertResponse(nonceResponse, 200);
    const { nonce } = nonceResponse.data.data;

    // Step 2: Create and sign message
    const wallet = ethers.Wallet.createRandom();
    const message = new SiweMessage({
      domain: 'localhost',
      address: walletAddress,
      statement: 'Sign in to Test Hub',
      uri: 'http://localhost:3001',
      version: '1',
      chainId: 1,
      nonce,
      issuedAt: new Date().toISOString()
    });

    const signature = await wallet.signMessage(message.prepareMessage());

    // Step 3: Verify signature
    const verifyResponse = await client.post('/api/v1/siwe/verify', {
      message: message.prepareMessage(),
      signature,
      nonce
    });

    assertResponse(verifyResponse, 200);
    
    const { accessToken, refreshToken } = verifyResponse.data.data;
    
    // Update client with new token
    client.setAccessToken(accessToken);
    
    return { accessToken, refreshToken };
  }

  /**
   * Perform 2FA verification
   */
  async verify2FA(
    user: TestUser,
    client: ApiClient
  ): Promise<void> {
    if (!user.totpSecret) {
      throw new Error('User does not have 2FA enabled');
    }

    const token = authenticator.generate(user.totpSecret);
    
    const response = await client.post('/api/v1/2fa/verify', {
      token,
      userId: user.id
    });

    assertResponse(response, 200);
  }

  /**
   * Setup 2FA for a user
   */
  async setup2FA(
    password: string,
    client: ApiClient
  ): Promise<{ secret: string; qrCode: string; backupCodes: string[] }> {
    const response = await client.post('/api/v1/2fa/setup', {
      password
    });

    assertResponse(response, 200);
    
    return response.data.data;
  }

  /**
   * Enable 2FA with verification token
   */
  async enable2FA(
    token: string,
    client: ApiClient
  ): Promise<void> {
    const response = await client.post('/api/v1/2fa/enable', {
      token
    });

    assertResponse(response, 200);
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshToken: string,
    client: ApiClient
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await client.post('/api/v1/auth/refresh', {
      refreshToken
    });

    assertResponse(response, 200);
    
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;
    
    // Update client with new token
    client.setAccessToken(accessToken);
    
    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout user
   */
  async logout(client: ApiClient): Promise<void> {
    const response = await client.post('/api/v1/auth/logout');
    assertResponse(response, 200);
    
    // Clear token from client
    client.clearAccessToken();
  }

  /**
   * Logout all devices
   */
  async logoutAllDevices(client: ApiClient): Promise<void> {
    const response = await client.post('/api/v1/auth/logout-all');
    assertResponse(response, 200);
    
    // Clear token from client
    client.clearAccessToken();
  }

  /**
   * Get current user info
   */
  async getCurrentUser(client: ApiClient): Promise<any> {
    const response = await client.get('/api/v1/auth/me');
    assertResponse(response, 200);
    
    return response.data.data;
  }

  /**
   * Get user devices
   */
  async getUserDevices(client: ApiClient): Promise<any[]> {
    const response = await client.get('/api/v1/auth/devices');
    assertResponse(response, 200);
    
    return response.data.data;
  }

  /**
   * Deactivate a device
   */
  async deactivateDevice(
    deviceId: string,
    client: ApiClient
  ): Promise<void> {
    const response = await client.delete(`/api/v1/auth/devices/${deviceId}`);
    assertResponse(response, 200);
  }

  /**
   * Test authentication flow end-to-end
   */
  async testCompleteAuthFlow(
    user: TestUser,
    client: ApiClient
  ): Promise<void> {
    logger.info('Testing complete authentication flow', { userId: user.id });

    // 1. Authenticate
    const { accessToken, refreshToken } = await this.authenticateWithEmail(
      user.email!,
      user.password!,
      client
    );

    // 2. Verify tokens are valid
    const userInfo = await this.getCurrentUser(client);
    if (userInfo.id !== user.id) {
      throw new Error('User ID mismatch after authentication');
    }

    // 3. Test refresh token
    const { accessToken: newAccessToken } = await this.refreshToken(refreshToken, client);
    
    // 4. Verify new token works
    const devices = await this.getUserDevices(client);
    if (devices.length === 0) {
      throw new Error('No devices found after authentication');
    }

    // 5. Logout
    await this.logout(client);

    // 6. Verify token is invalidated
    try {
      await this.getCurrentUser(client);
      throw new Error('Token should be invalid after logout');
    } catch (error) {
      // Expected error
      const message = getErrorMessage(error);
      if (!message.includes('Unauthorized') && !message.includes('401')) {
        throw error;
      }
    }

    logger.info('Authentication flow test completed successfully');
  }

  /**
   * Test rate limiting on auth endpoints
   */
  async testAuthRateLimiting(client: ApiClient): Promise<void> {
    const requests = [];
    const email = 'ratelimit@test.com';
    
    // Make multiple rapid requests
    for (let i = 0; i < 10; i++) {
      requests.push(
        client.post('/api/v1/auth/authenticate', {
          email,
          password: 'wrong-password',
          type: 'email'
        }).catch(e => e)
      );
    }

    const results = await Promise.all(requests);
    
    // Check that some requests were rate limited
    const rateLimited = results.filter(r => r.status === 429);
    if (rateLimited.length === 0) {
      throw new Error('Rate limiting not working on auth endpoints');
    }

    logger.info(`Rate limiting test: ${rateLimited.length}/10 requests rate limited`);
  }

  /**
   * Test authentication with invalid credentials
   */
  async testInvalidCredentials(client: ApiClient): Promise<void> {
    try {
      await this.authenticateWithEmail(
        'nonexistent@test.com',
        'wrong-password',
        client
      );
      throw new Error('Authentication should fail with invalid credentials');
    } catch (error) {
      const message = getErrorMessage(error);
      if (!message.includes('Invalid') && !message.includes('401')) {
        throw error;
      }
    }
  }

  /**
   * Test token expiration
   */
  async testTokenExpiration(
    expiredToken: string,
    client: ApiClient
  ): Promise<void> {
    client.setAccessToken(expiredToken);
    
    try {
      await this.getCurrentUser(client);
      throw new Error('Expired token should be rejected');
    } catch (error) {
      const message = getErrorMessage(error);
      if (!message.includes('expired') && !message.includes('401')) {
        throw error;
      }
    }
  }
}