import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { ApiError } from '../utils/errors';
import { EventEmitter } from 'events';

interface MPCSession {
  sessionId: string;
  profileId: string;
  type: 'keyGen' | 'sign';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  expiresAt: Date;
}

interface KeyGenResult {
  keyId: string;
  publicKey: string;
  address: string;
}

interface SignResult {
  signature: string;
}

class MPCDuoNodeService extends EventEmitter {
  private socket: Socket | null = null;
  private isConnected = false;
  private sessions = new Map<string, MPCSession>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor() {
    super();
    // Disabled Socket.IO connection - duo-node doesn't implement Socket.IO server
    // iOS connects directly to sigpair for WebSocket MPC operations
    // this.connect();
  }

  private connect() {
    const duoNodeUrl = config.DUO_NODE_URL;
    if (!duoNodeUrl) {
      logger.error('DUO_NODE_URL not configured');
      return;
    }

    logger.info('Connecting to duo-node', { url: duoNodeUrl });

    this.socket = io(duoNodeUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 30000,
      auth: {
        // Add any authentication if needed
        service: 'interspace-backend'
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      logger.info('Connected to duo-node');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('Disconnected from duo-node', { reason });
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.socket.on('connect_error', (error) => {
      logger.error('Duo-node connection error', { error: error.message });
      this.reconnectAttempts++;
    });

    // Key generation events
    this.socket.on('keyGen:p2Ready', (data) => {
      logger.debug('P2 ready for key generation', data);
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.status = 'in_progress';
      }
    });

    this.socket.on('keyGen:complete', (data) => {
      logger.info('Key generation complete', data);
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.status = 'completed';
        session.result = {
          keyId: data.keyId,
          publicKey: data.publicKey,
          address: data.address
        };
        this.emit(`keyGen:complete:${session.sessionId}`, session.result);
      }
    });

    // Signing events
    this.socket.on('sign:ready', (data) => {
      logger.debug('Ready for signing', data);
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.status = 'in_progress';
      }
    });

    this.socket.on('sign:complete', (data) => {
      logger.info('Signing complete', data);
      const session = this.sessions.get(data.sessionId);
      if (session) {
        session.status = 'completed';
        session.result = {
          signature: data.signature
        };
        this.emit(`sign:complete:${session.sessionId}`, session.result);
      }
    });

    // Error handling
    this.socket.on('error', (error) => {
      logger.error('Duo-node error', error);
      if (error.sessionId) {
        const session = this.sessions.get(error.sessionId);
        if (session) {
          session.status = 'failed';
          session.error = error.message;
          this.emit(`error:${session.sessionId}`, error);
        }
      }
    });
  }

  private ensureConnected(): Promise<void> {
    if (this.isConnected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ApiError('Failed to connect to duo-node', 503));
      }, 10000);

      this.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Start key generation process
   */
  async startKeyGeneration(profileId: string, p1Messages: any[]): Promise<KeyGenResult> {
    // Socket.IO connection disabled - duo-node is REST-only
    throw new ApiError('MPC key generation via backend is not supported. iOS should connect directly to sigpair.', 501);

    const sessionId = `keygen_${profileId}_${uuidv4()}`;
    const session: MPCSession = {
      sessionId,
      profileId,
      type: 'keyGen',
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    };

    this.sessions.set(sessionId, session);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.sessions.delete(sessionId);
        reject(new ApiError('Key generation timeout', 504));
      }, 120000); // 2 minutes

      // Listen for completion
      this.once(`keyGen:complete:${sessionId}`, (result) => {
        clearTimeout(timeout);
        this.sessions.delete(sessionId);
        resolve(result);
      });

      // Listen for errors
      this.once(`error:${sessionId}`, (error) => {
        clearTimeout(timeout);
        this.sessions.delete(sessionId);
        reject(new ApiError(error.message || 'Key generation failed', 500));
      });

      // Start key generation
      this.socket!.emit('keyGen:start', {
        profileId,
        sessionId
      });

      // Send P1 messages if provided
      if (p1Messages && p1Messages.length > 0) {
        p1Messages.forEach((message, index) => {
          this.socket!.emit('keyGen:p1Message', {
            sessionId,
            round: index + 1,
            message
          });
        });
      }
    });
  }

  /**
   * Start signing process
   */
  async startSigning(
    profileId: string,
    keyId: string,
    message: string,
    p1Messages: any[]
  ): Promise<SignResult> {
    // Socket.IO connection disabled - duo-node is REST-only
    throw new ApiError('MPC signing via backend is not supported. iOS should connect directly to sigpair.', 501);

    const sessionId = `sign_${keyId}_${uuidv4()}`;
    const session: MPCSession = {
      sessionId,
      profileId,
      type: 'sign',
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * 60 * 1000) // 2 minutes
    };

    this.sessions.set(sessionId, session);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.sessions.delete(sessionId);
        reject(new ApiError('Signing timeout', 504));
      }, 60000); // 1 minute

      // Listen for completion
      this.once(`sign:complete:${sessionId}`, (result) => {
        clearTimeout(timeout);
        this.sessions.delete(sessionId);
        resolve(result);
      });

      // Listen for errors
      this.once(`error:${sessionId}`, (error) => {
        clearTimeout(timeout);
        this.sessions.delete(sessionId);
        reject(new ApiError(error.message || 'Signing failed', 500));
      });

      // Start signing
      this.socket!.emit('sign:start', {
        keyId,
        message,
        sessionId
      });

      // Send P1 messages if provided
      if (p1Messages && p1Messages.length > 0) {
        p1Messages.forEach((message, index) => {
          this.socket!.emit('sign:p1Message', {
            sessionId,
            keyId,
            message
          });
        });
      }
    });
  }

  /**
   * Forward P1 message from client
   */
  async forwardP1Message(sessionId: string, messageType: 'keyGen' | 'sign', message: any) {
    // Socket.IO connection disabled - duo-node is REST-only
    throw new ApiError('MPC message forwarding is not supported. iOS should connect directly to sigpair.', 501);

  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): MPCSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Clean up expired sessions
   */
  cleanupSessions() {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        logger.debug('Cleaned up expired session', { sessionId });
      }
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.sessions.clear();
  }
}

// Export singleton instance
export const mpcDuoNodeService = new MPCDuoNodeService();

// Cleanup expired sessions periodically
setInterval(() => {
  mpcDuoNodeService.cleanupSessions();
}, 60000); // Every minute