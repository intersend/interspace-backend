import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface SigpairUser {
  userId: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface SigpairKeyShare {
  keyId: string;
  userId: string;
  publicKey: string;
  p2Share: any;
  createdAt: string;
}

/**
 * Admin client for managing users and keys on the Sigpair server
 * This is used for testing to set up and manage P2 shares
 */
export class SigpairAdminClient {
  private httpClient: AxiosInstance;
  private adminToken: string;

  constructor(sigpairUrl: string, adminToken: string) {
    this.adminToken = adminToken;
    this.httpClient = axios.create({
      baseURL: sigpairUrl,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create a new user on the sigpair server
   */
  async createUser(username: string, email?: string): Promise<SigpairUser> {
    try {
      const response = await this.httpClient.post('/admin/users', {
        username,
        email: email || `${username}@test.local`,
        password: uuidv4() // Random password for test users
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to create sigpair user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<SigpairUser> {
    try {
      const response = await this.httpClient.get(`/admin/users/${userId}`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to get sigpair user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Delete a user and all their keys
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      await this.httpClient.delete(`/admin/users/${userId}`);
    } catch (error: any) {
      console.error('Failed to delete sigpair user:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * List all keys for a user
   */
  async listUserKeys(userId: string): Promise<SigpairKeyShare[]> {
    try {
      const response = await this.httpClient.get(`/admin/users/${userId}/keys`);
      return response.data.keys || [];
    } catch (error: any) {
      console.error('Failed to list user keys:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get a specific key share
   */
  async getKeyShare(keyId: string): Promise<SigpairKeyShare> {
    try {
      const response = await this.httpClient.get(`/admin/keys/${keyId}`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to get key share:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Delete a key share
   */
  async deleteKeyShare(keyId: string): Promise<void> {
    try {
      await this.httpClient.delete(`/admin/keys/${keyId}`);
    } catch (error: any) {
      console.error('Failed to delete key share:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Store a P2 share for a user (used during key generation)
   */
  async storeP2Share(userId: string, keyId: string, p2Share: any, publicKey: string): Promise<void> {
    try {
      await this.httpClient.post(`/admin/users/${userId}/keys`, {
        keyId,
        p2Share,
        publicKey
      });
    } catch (error: any) {
      console.error('Failed to store P2 share:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Health check the sigpair server
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize database schema (if needed)
   */
  async initializeDatabase(): Promise<void> {
    try {
      await this.httpClient.post('/admin/db/initialize');
      console.log('✅ Sigpair database initialized');
    } catch (error: any) {
      // Ignore if already initialized
      if (error.response?.status !== 409) {
        console.error('Failed to initialize database:', error.response?.data || error.message);
        throw error;
      }
    }
  }

  /**
   * Clean up all test data
   */
  async cleanupTestData(userPrefix: string = 'test_'): Promise<void> {
    try {
      // List all users and delete test users
      const response = await this.httpClient.get('/admin/users');
      const users = response.data.users || [];
      
      for (const user of users) {
        if (user.username.startsWith(userPrefix)) {
          await this.deleteUser(user.userId);
          console.log(`🧹 Deleted test user: ${user.username}`);
        }
      }
    } catch (error: any) {
      console.error('Failed to cleanup test data:', error.response?.data || error.message);
    }
  }
}

// Factory function for creating admin client
export function createSigpairAdminClient(): SigpairAdminClient {
  const sigpairUrl = process.env.SIGPAIR_URL || 'http://localhost:8080';
  const adminToken = process.env.SILENCE_ADMIN_TOKEN || 'test-admin-token';
  
  return new SigpairAdminClient(sigpairUrl, adminToken);
}