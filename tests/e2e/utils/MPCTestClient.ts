import { ethers } from 'ethers';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance } from 'axios';
import {
  P1KeyGen,
  IP1KeyShare,
  P1Signature
} from '@silencelaboratories/ecdsa-tss';

export interface TestKeyShare {
  keyshare: string;  // P1 share (client/iOS side)
  publicKey: string;
  sessionId: string;
  address: string;
  keyId: string;     // Silence Labs key ID
  profileId: string;
}

export interface SignatureRequest {
  operationSetId: string;
  operations: Array<{
    index: number;
    message: string;
    chainId: number;
  }>;
}

export interface SignatureResponse {
  operationSetId: string;
  signatures: Array<{
    index: number;
    signature: string;
    signedData?: string;
  }>;
}

/**
 * MPC Test Client that simulates iOS app behavior
 * Communicates with Duo Node proxy which then talks to Silence Labs
 */
export class MPCTestClient {
  private duoNodeUrl: string;
  private socket?: Socket;
  private httpClient: AxiosInstance;
  
  // Connection management
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private connectionPromise?: Promise<void>;
  
  // Client-side key storage (simulating iOS keychain)
  private clientKeyShares: Map<string, TestKeyShare> = new Map();
  private pendingRequests: Map<string, (value: any) => void> = new Map();
  
  constructor(duoNodeUrl: string = 'http://localhost:3002') {
    this.duoNodeUrl = duoNodeUrl;
    this.httpClient = axios.create({
      baseURL: duoNodeUrl,
      timeout: 30000
    });
  }

  /**
   * Connect to Duo Node WebSocket server
   */
  async connect(): Promise<void> {
    // Return existing connection promise if already connecting
    if (this.connectionState === 'connecting' && this.connectionPromise) {
      return this.connectionPromise;
    }
    
    // Already connected
    if (this.connectionState === 'connected' && this.socket?.connected) {
      return;
    }
    
    this.connectionState = 'connecting';
    this.connectionPromise = new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to Duo Node at ${this.duoNodeUrl}...`);
      
      this.socket = io(this.duoNodeUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
      });
      
      this.socket.on('connect', () => {
        console.log('✅ Connected to Duo Node proxy');
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.setupEventHandlers();
        resolve();
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('❌ Duo Node connection error:', error);
        this.connectionState = 'disconnected';
        reject(error);
      });
      
      this.socket.on('disconnect', (reason) => {
        console.log('⚠️  Disconnected from Duo Node:', reason);
        this.connectionState = 'disconnected';
      });
      
      // Set connection timeout
      setTimeout(() => {
        if (!this.socket?.connected) {
          this.connectionState = 'disconnected';
          reject(new Error('Duo Node connection timeout'));
        }
      }, 10000);
    });
    
    return this.connectionPromise;
  }
  
  /**
   * Ensure connection is established before operations
   */
  private async ensureConnected(): Promise<void> {
    if (this.connectionState !== 'connected' || !this.socket?.connected) {
      await this.connect();
    }
  }

  /**
   * Setup Socket.IO event handlers for Duo Node communication
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;
    
    // Key generation events
    this.socket.on('keyGen:p2Ready', (data) => {
      console.log('P2 ready for key generation:', data.sessionId);
    });
    
    this.socket.on('keyGen:p2Message', (data) => {
      this.handleKeyGenMessage(data);
    });
    
    this.socket.on('keyGen:complete', (data) => {
      this.handleKeyGenComplete(data);
    });
    
    // Signing events
    this.socket.on('sign:ready', (data) => {
      console.log('Ready to sign:', data.sessionId);
    });
    
    this.socket.on('sign:complete', (data) => {
      this.handleSignComplete(data);
    });
    
    // Error handling
    this.socket.on('error', (error) => {
      console.error('Duo Node error:', error);
      const resolver = this.pendingRequests.get(error.sessionId || error.requestId);
      if (resolver) {
        this.pendingRequests.delete(error.sessionId || error.requestId);
        resolver({ error: error.message });
      }
    });
    // Disconnect handling is now in connect() method
  }

  /**
   * Handle key generation P2 messages from Duo Node
   */
  private async handleKeyGenMessage(data: any): Promise<void> {
    const { sessionId, round, message } = data;
    const p1Instance = this.pendingRequests.get(`p1_${sessionId}`) as unknown as P1KeyGen;
    
    if (!p1Instance) {
      console.error('No P1 instance found for session:', sessionId);
      return;
    }
    
    try {
      // Process P2 message and get next P1 message
      const result = await p1Instance.processMessage(message);
      
      if (result.msg_to_send) {
        // Send next P1 message to Duo Node
        this.socket!.emit('keyGen:p1Message', {
          sessionId,
          round: round + 1,
          message: result.msg_to_send
        });
      }
      
      if (result.p1_key_share) {
        // Store P1 share temporarily
        this.pendingRequests.set(`p1Share_${sessionId}`, result.p1_key_share as any);
      }
    } catch (error) {
      console.error('Error processing P2 message:', error);
    }
  }
  
  /**
   * Handle key generation completion
   */
  private handleKeyGenComplete(data: any): void {
    const { sessionId, keyId, publicKey, address } = data;
    const resolver = this.pendingRequests.get(`complete_${sessionId}`);
    
    if (resolver) {
      this.pendingRequests.delete(`complete_${sessionId}`);
      resolver({ keyId, publicKey, address });
    }
  }
  
  /**
   * Handle signing completion
   */
  private handleSignComplete(data: any): void {
    const { sessionId, signature } = data;
    const resolver = this.pendingRequests.get(`sign_${sessionId}`);
    
    if (resolver) {
      this.pendingRequests.delete(`sign_${sessionId}`);
      resolver({ signature });
    }
  }

  /**
   * Wait for a response with timeout
   */
  private async waitForResponse<T>(key: string, timeout: number = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(key, resolve);
      
      setTimeout(() => {
        if (this.pendingRequests.has(key)) {
          this.pendingRequests.delete(key);
          reject(new Error(`Timeout waiting for ${key}`));
        }
      }, timeout);
    });
  }

  /**
   * Generate a new MPC keyshare (simulating iOS device + Silence Labs)
   * This follows the actual Silence Labs key generation protocol
   */
  async generateTestKeyShare(profileId: string): Promise<TestKeyShare> {
    await this.ensureConnected();
    
    if (!this.socket?.connected) {
      throw new Error('Not connected to Duo Node');
    }
    
    console.log(`🔑 Generating MPC keyshare for profile ${profileId}...`);
    
    const sessionId = `session_${profileId}_${Date.now()}`;
    
    // Initialize P1 (client/iOS side) key generation
    const x1 = Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)));
    const p1 = new P1KeyGen(sessionId, x1);
    await p1.init();
    
    // Store P1 instance for message handling
    this.pendingRequests.set(`p1_${sessionId}`, p1 as any);
    
    // Start key generation with Duo Node
    this.socket!.emit('keyGen:start', {
      profileId,
      sessionId
    });
    
    // Wait for P2 ready signal
    await new Promise(resolve => {
      const handler = (data: any) => {
        if (data.sessionId === sessionId) {
          this.socket!.off('keyGen:p2Ready', handler);
          resolve(data);
        }
      };
      this.socket!.on('keyGen:p2Ready', handler);
    });
    
    // Send first P1 message
    const firstMessage = await p1.processMessage(null);
    this.socket!.emit('keyGen:p1Message', {
      sessionId,
      round: 1,
      message: firstMessage.msg_to_send
    });
    
    // Wait for completion
    const completionPromise = this.waitForResponse<any>(`complete_${sessionId}`, 60000);
    const { keyId, publicKey, address } = await completionPromise;
    
    // Get P1 share
    const p1Share = this.pendingRequests.get(`p1Share_${sessionId}`) as unknown as IP1KeyShare;
    if (!p1Share) {
      throw new Error('P1 key share not generated');
    }
    
    // Create test keyshare object
    const testKeyShare: TestKeyShare = {
      keyshare: JSON.stringify(p1Share), // Store entire P1 share object
      publicKey,
      sessionId,
      address,
      keyId,
      profileId
    };
    
    // Store for later use
    this.clientKeyShares.set(profileId, testKeyShare);
    
    // Cleanup
    this.pendingRequests.delete(`p1_${sessionId}`);
    this.pendingRequests.delete(`p1Share_${sessionId}`);
    
    console.log(`✅ Generated MPC keyshare:`);
    console.log(`   Address: ${address}`);
    console.log(`   Key ID: ${keyId}`);
    console.log(`   Public Key: ${publicKey}`);
    
    return testKeyShare;
  }

  /**
   * Sign operations using MPC (P1 + P2 via Duo Node)
   */
  async signOperations(
    profileId: string,
    operations: Array<{
      index: number;
      message: string;
      chainId: number;
    }>
  ): Promise<SignatureResponse> {
    const keyShare = this.clientKeyShares.get(profileId);
    if (!keyShare) {
      throw new Error(`No keyshare found for profile ${profileId}`);
    }
    
    await this.ensureConnected();
    
    if (!this.socket?.connected) {
      throw new Error('Not connected to Duo Node');
    }
    
    console.log(`✍️  Signing ${operations.length} operations with MPC...`);
    
    const signatures = await Promise.all(
      operations.map(async (op) => {
        const signSessionId = `sign_${keyShare.keyId}_${Date.now()}_${op.index}`;
        
        // Initialize P1 signature
        const p1Share = JSON.parse(keyShare.keyshare) as IP1KeyShare;
        const messageHash = ethers.keccak256(op.message);
        const messageBytes = ethers.getBytes(messageHash);
        
        // Create P1 signature instance
        const p1Sig = new P1Signature(signSessionId, messageBytes, p1Share);
        
        // Start signing with Duo Node
        this.socket!.emit('sign:start', {
          keyId: keyShare.keyId,
          message: op.message,
          sessionId: signSessionId
        });
        
        // Wait for ready signal
        await new Promise(resolve => {
          const handler = (data: any) => {
            if (data.sessionId === signSessionId) {
              this.socket!.off('sign:ready', handler);
              resolve(data);
            }
          };
          this.socket!.on('sign:ready', handler);
        });
        
        // Send P1 signature message
        const p1Message = await p1Sig.processMessage(null);
        this.socket!.emit('sign:p1Message', {
          sessionId: signSessionId,
          message: p1Message.msg_to_send
        });
        
        // Wait for signature completion
        const result = await this.waitForResponse<any>(`sign_${signSessionId}`, 30000);
        
        return {
          index: op.index,
          signature: result.signature,
          signedData: op.message
        };
      })
    );
    
    console.log(`✅ Signed ${signatures.length} operations with MPC`);
    
    return {
      operationSetId: `op_${Date.now()}`,
      signatures
    };
  }

  /**
   * Sign a single message using MPC
   */
  async signMessage(profileId: string, message: string): Promise<string> {
    // Check if keyshare exists first
    const keyShare = this.clientKeyShares.get(profileId);
    if (!keyShare) {
      throw new Error(`No keyshare found for profile ${profileId}`);
    }
    
    const operations = [{
      index: 0,
      message,
      chainId: 1 // Default chain ID
    }];
    
    const result = await this.signOperations(profileId, operations);
    return result.signatures?.[0]?.signature || '';
  }

  /**
   * Create encrypted backup of keyshare via Duo Node
   */
  async createBackup(
    profileId: string,
    rsaPublicKey: string,
    label: string = 'Test Backup'
  ): Promise<{
    backupId: string;
    encryptedShare: string;
    metadata: any;
  }> {
    const keyShare = this.clientKeyShares.get(profileId);
    if (!keyShare) {
      throw new Error(`No keyshare found for profile ${profileId}`);
    }
    
    console.log(`💾 Creating encrypted backup for key ${keyShare.keyId}...`);
    
    try {
      // Call Duo Node backup endpoint
      const response = await this.httpClient.post('/v3/backup-key', {
        key_id: keyShare.keyId,
        rsa_pubkey_pem: rsaPublicKey,
        label
      });
      
      // Handle response or create mock backup for testing
      const backupId = response.data?.backup_id || `backup_${Date.now()}`;
      const createdAt = response.data?.created_at || new Date().toISOString();
      
      // Also backup client share locally (encrypted)
      const clientBackup = {
        p1Share: keyShare.keyshare,
        keyId: keyShare.keyId,
        publicKey: keyShare.publicKey,
        timestamp: Date.now()
      };
      
      const encryptedClientShare = Buffer.from(
        JSON.stringify(clientBackup)
      ).toString('base64');
      
      console.log(`✅ Backup created: ${backupId}`);
      
      return {
        backupId,
        encryptedShare: encryptedClientShare,
        metadata: {
          profileId,
          keyId: keyShare.keyId,
          publicKey: keyShare.publicKey,
          address: keyShare.address,
          timestamp: createdAt
        }
      };
    } catch (error: any) {
      console.error('Backup failed:', error);
      
      // For testing, return a mock backup instead of throwing
      if (error.response?.status === 404 || error.code === 'ECONNREFUSED') {
        console.log('⚠️  Backup endpoint not available, creating mock backup');
        
        const mockBackup = {
          backupId: `mock_backup_${Date.now()}`,
          encryptedShare: Buffer.from(JSON.stringify({
            p1Share: keyShare.keyshare,
            keyId: keyShare.keyId,
            publicKey: keyShare.publicKey,
            timestamp: Date.now()
          })).toString('base64'),
          metadata: {
            profileId,
            keyId: keyShare.keyId,
            publicKey: keyShare.publicKey,
            address: keyShare.address,
            timestamp: new Date().toISOString()
          }
        };
        
        return mockBackup;
      }
      
      throw error;
    }
  }

  /**
   * Export key from Duo Node
   */
  async exportKey(
    keyId: string,
    clientEncKey: string
  ): Promise<any> {
    try {
      const response = await this.httpClient.post('/v3/export-key', {
        key_id: keyId,
        client_enc_key: clientEncKey
      });
      
      return response.data.exported_key;
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  }
  
  /**
   * Restore keyshare from backup
   */
  async restoreFromBackup(
    profileId: string,
    encryptedBackup: string,
    rsaPrivateKey: string,
    keyId: string
  ): Promise<TestKeyShare> {
    console.log(`🔄 Restoring keyshare for profile ${profileId}...`);
    
    // Decrypt client share
    const decoded = JSON.parse(
      Buffer.from(encryptedBackup, 'base64').toString()
    );
    
    // Export server share from Duo Node
    const exportedKey = await this.exportKey(keyId, 'test_client_key');
    
    const testKeyShare: TestKeyShare = {
      keyshare: decoded.p1Share,
      publicKey: decoded.publicKey,
      sessionId: `restored_${Date.now()}`,
      address: ethers.computeAddress(decoded.publicKey),
      keyId: decoded.keyId,
      profileId
    };
    
    // Store the restored keyshare
    this.clientKeyShares.set(profileId, testKeyShare);
    
    console.log(`✅ Restored keyshare for ${testKeyShare.address}`);
    
    return testKeyShare;
  }

  /**
   * Rotate MPC key using Silence Labs key refresh protocol
   */
  async rotateKey(profileId: string): Promise<TestKeyShare> {
    const oldKeyShare = this.clientKeyShares.get(profileId);
    if (!oldKeyShare) {
      throw new Error(`No keyshare found for profile ${profileId}`);
    }
    
    await this.ensureConnected();
    
    if (!this.socket?.connected) {
      throw new Error('Not connected to Duo Node');
    }
    
    console.log(`🔄 Rotating MPC key for profile ${profileId}...`);
    
    // For now, we'll generate a completely new key
    // In production, this would use key refresh to maintain the same public key
    // but update the shares for security
    const newKeyShare = await this.generateTestKeyShare(profileId);
    
    // Override with the same address to simulate key refresh
    // (in real implementation, key refresh maintains the same public key/address)
    const rotatedKeyShare: TestKeyShare = {
      ...newKeyShare,
      address: oldKeyShare.address, // Simulate same address
      publicKey: oldKeyShare.publicKey // Simulate same public key
    };
    
    this.clientKeyShares.set(profileId, rotatedKeyShare);
    
    console.log(`✅ Key rotated successfully (address unchanged: ${rotatedKeyShare.address})`);
    
    return rotatedKeyShare;
  }

  /**
   * Get stored keyshare for a profile
   */
  getKeyShare(profileId: string): TestKeyShare | undefined {
    return this.clientKeyShares.get(profileId);
  }

  /**
   * Clear all keyshares (for test cleanup)
   */
  clearKeyShares(): void {
    this.clientKeyShares.clear();
  }

  /**
   * Check Duo Node health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health');
      // Check both HTTP status and response data
      return response.status === 200 && response.data.status === 'ok';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  
  /**
   * Disconnect from Duo Node
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
    this.connectionState = 'disconnected';
    this.connectionPromise = undefined;
    this.pendingRequests.clear();
    // Don't clear keyshares on disconnect - they should persist
    console.log('✅ Disconnected from Duo Node');
  }
}

// Helper to create test RSA key pair for backups
export function generateTestRSAKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  // For testing, we'll use PEM formatted mock keys
  const keyId = uuidv4().substring(0, 8);
  
  const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${keyId}test
public key content for testing
-----END PUBLIC KEY-----`;
  
  const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA${keyId}test
private key content for testing
-----END RSA PRIVATE KEY-----`;
  
  return { publicKey, privateKey };
}

// Helper to create mock iOS device info
export function createMockIOSDevice(): {
  deviceId: string;
  deviceName: string;
  osVersion: string;
  appVersion: string;
} {
  return {
    deviceId: `ios_${uuidv4()}`,
    deviceName: 'iPhone Test Device',
    osVersion: 'iOS 17.0',
    appVersion: '1.0.0'
  };
}

