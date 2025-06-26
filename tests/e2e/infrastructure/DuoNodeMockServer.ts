import { Server as HttpServer } from 'http';
import express, { Application } from 'express';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import crypto from 'crypto';

interface KeyGenSession {
  sessionId: string;
  profileId: string;
  p1Messages: any[];
  p2Messages: any[];
  publicKey?: string;
  keyId?: string;
  status: 'pending' | 'completed' | 'failed';
}

interface SignSession {
  sessionId: string;
  keyId: string;
  message: string;
  signature?: string;
  status: 'pending' | 'completed' | 'failed';
}

/**
 * Mock Duo Node server that simulates the proxy to Silence Labs
 * This handles the MPC operations for testing
 */
export class DuoNodeMockServer {
  private app: Application;
  private server?: HttpServer;
  private io?: SocketIOServer;
  private port: number;
  
  // Storage for sessions and keys
  private keyGenSessions: Map<string, KeyGenSession> = new Map();
  private signSessions: Map<string, SignSession> = new Map();
  private keyStorage: Map<string, any> = new Map(); // keyId -> key data
  private backups: Map<string, any> = new Map(); // backupId -> encrypted backup
  
  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    
    // Mock Google Auth validation
    this.app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // In production, this would validate the Google ID token
        req.body.authenticated = true;
      }
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'duo-node-mock',
        timestamp: new Date().toISOString()
      });
    });

    // Key backup endpoint
    this.app.post('/v3/backup-key', (req, res) => {
      const { key_id, rsa_pubkey_pem, label } = req.body;
      
      console.log(`📦 Backing up key ${key_id} with label: ${label}`);
      
      const keyData = this.keyStorage.get(key_id);
      if (!keyData) {
        return res.status(404).json({ 
          success: false, 
          message: 'Key not found' 
        });
      }
      
      // Simulate RSA encryption of the key
      const backupId = `backup_${uuidv4()}`;
      const encryptedBackup = {
        backupId,
        keyId: key_id,
        label,
        encryptedData: Buffer.from(JSON.stringify(keyData)).toString('base64'),
        timestamp: new Date().toISOString()
      };
      
      this.backups.set(backupId, encryptedBackup);
      
      res.json({
        success: true,
        backup_id: backupId,
        created_at: encryptedBackup.timestamp
      });
    });

    // Key export endpoint
    this.app.post('/v3/export-key', (req, res) => {
      const { key_id, client_enc_key } = req.body;
      
      console.log(`📤 Exporting key ${key_id}`);
      
      const keyData = this.keyStorage.get(key_id);
      if (!keyData) {
        return res.status(404).json({ 
          success: false, 
          message: 'Key not found' 
        });
      }
      
      // Simulate client-side encryption
      const exportedData = {
        keyId: key_id,
        encryptedShare: Buffer.from(JSON.stringify(keyData)).toString('base64'),
        publicKey: keyData.publicKey,
        algorithm: 'ecdsa'
      };
      
      res.json({
        success: true,
        exported_key: exportedData
      });
    });

    // WebSocket endpoints for key generation and signing
    this.app.get('/ws', (req, res) => {
      res.send('WebSocket endpoint - connect using Socket.IO');
    });
  }

  private setupWebSocket(): void {
    if (!this.server) return;
    
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: true,
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket: Socket) => {
      console.log(`🔌 Duo Node: Client connected ${socket.id}`);
      
      // Handle key generation
      socket.on('keyGen:start', async (data) => {
        const { profileId, sessionId } = data;
        console.log(`🔑 Starting key generation for profile ${profileId}`);
        
        const session: KeyGenSession = {
          sessionId,
          profileId,
          p1Messages: [],
          p2Messages: [],
          status: 'pending'
        };
        
        this.keyGenSessions.set(sessionId, session);
        
        // Simulate P2 initialization
        socket.emit('keyGen:p2Ready', { sessionId });
      });
      
      socket.on('keyGen:p1Message', async (data) => {
        const { sessionId, message, round } = data;
        const session = this.keyGenSessions.get(sessionId);
        
        if (!session) {
          return socket.emit('error', { 
            message: 'Session not found',
            sessionId 
          });
        }
        
        session.p1Messages.push({ round, message });
        
        // Simulate Silence Labs P2 response
        const p2Response = await this.simulateP2Response(session, round);
        session.p2Messages.push({ round, message: p2Response });
        
        socket.emit('keyGen:p2Message', {
          sessionId,
          round,
          message: p2Response
        });
        
        // Complete key generation after round 4
        if (round === 4) {
          await this.completeKeyGeneration(session, socket);
        }
      });
      
      // Handle signing
      socket.on('sign:start', async (data) => {
        const { keyId, message, sessionId } = data;
        console.log(`✍️  Starting signature for key ${keyId}`);
        
        const keyData = this.keyStorage.get(keyId);
        if (!keyData) {
          return socket.emit('error', { 
            message: 'Key not found',
            keyId 
          });
        }
        
        const signSession: SignSession = {
          sessionId,
          keyId,
          message,
          status: 'pending'
        };
        
        this.signSessions.set(sessionId, signSession);
        socket.emit('sign:ready', { sessionId });
      });
      
      socket.on('sign:p1Message', async (data) => {
        const { sessionId, message } = data;
        const session = this.signSessions.get(sessionId);
        
        if (!session) {
          return socket.emit('error', { 
            message: 'Sign session not found',
            sessionId 
          });
        }
        
        // Simulate signature generation
        const signature = await this.generateSignature(
          session.keyId,
          session.message
        );
        
        session.signature = signature;
        session.status = 'completed';
        
        socket.emit('sign:complete', {
          sessionId,
          signature
        });
      });
      
      socket.on('disconnect', () => {
        console.log(`❌ Duo Node: Client disconnected ${socket.id}`);
      });
    });
  }

  private async simulateP2Response(session: KeyGenSession, round: number): Promise<any> {
    // Simulate Silence Labs P2 key generation messages
    // In reality, this would be complex cryptographic operations
    
    const mockResponse = {
      round,
      data: Buffer.from(`p2_round_${round}_${session.sessionId}`).toString('base64'),
      timestamp: Date.now()
    };
    
    // Add delay to simulate network/processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return mockResponse;
  }

  private async completeKeyGeneration(session: KeyGenSession, socket: Socket): Promise<void> {
    // Generate a deterministic key for testing
    const privateKey = ethers.Wallet.createRandom().privateKey;
    const publicKey = ethers.computePublicKey(privateKey, true);
    const address = ethers.computeAddress(publicKey);
    const keyId = `sl_key_${uuidv4()}`;
    
    // Store key data
    const keyData = {
      keyId,
      profileId: session.profileId,
      publicKey,
      address,
      p2Share: Buffer.from(privateKey.slice(2), 'hex').toString('base64'),
      algorithm: 'ecdsa',
      createdAt: new Date().toISOString()
    };
    
    this.keyStorage.set(keyId, keyData);
    
    // Update session
    session.publicKey = publicKey;
    session.keyId = keyId;
    session.status = 'completed';
    
    console.log(`✅ Key generation completed: ${address}`);
    
    // Send completion message
    socket.emit('keyGen:complete', {
      sessionId: session.sessionId,
      keyId,
      publicKey,
      address
    });
  }

  private async generateSignature(keyId: string, message: string): Promise<string> {
    const keyData = this.keyStorage.get(keyId);
    if (!keyData) {
      throw new Error('Key not found');
    }
    
    // Reconstruct private key from P2 share
    const privateKey = '0x' + Buffer.from(keyData.p2Share, 'base64').toString('hex');
    const signingKey = new ethers.SigningKey(privateKey);
    
    // Sign the message
    const messageHash = ethers.keccak256(message);
    const signature = signingKey.sign(messageHash);
    
    return signature.serialized;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 Mock Duo Node server running on port ${this.port}`);
        this.setupWebSocket();
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.io) {
      this.io.close();
    }
    
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('✅ Mock Duo Node server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Test helpers
  getStoredKey(keyId: string): any {
    return this.keyStorage.get(keyId);
  }
  
  getAllKeys(): Map<string, any> {
    return new Map(this.keyStorage);
  }
  
  clearAllData(): void {
    this.keyGenSessions.clear();
    this.signSessions.clear();
    this.keyStorage.clear();
    this.backups.clear();
  }
}

// Singleton instance for tests
export const duoNodeMock = new DuoNodeMockServer();