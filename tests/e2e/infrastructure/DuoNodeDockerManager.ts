import { execSync, spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import { config } from '@/utils/config';

export interface DuoNodeConfig {
  port: number;
  silenceNodeUrl: string;
  silenceAdminToken: string;
  googleProjectId?: string;
  containerName: string;
}

/**
 * Manages the interspace-duo-node Docker container for E2E testing
 * This runs the actual duo node proxy service that communicates with Silence Labs
 */
export class DuoNodeDockerManager {
  private config: DuoNodeConfig;
  private containerProcess?: ChildProcess;
  private isRunning: boolean = false;
  
  constructor(configOverrides?: Partial<DuoNodeConfig>) {
    this.config = {
      port: configOverrides?.port || 3001,
      silenceNodeUrl: configOverrides?.silenceNodeUrl || config.SILENCE_NODE_URL,
      silenceAdminToken: configOverrides?.silenceAdminToken || config.SILENCE_ADMIN_TOKEN,
      googleProjectId: configOverrides?.googleProjectId || process.env.GOOGLE_CLOUD_PROJECT,
      containerName: configOverrides?.containerName || 'interspace-duo-node-e2e'
    };
  }

  /**
   * Check if Docker is available
   */
  private checkDockerAvailable(): boolean {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      console.error('❌ Docker is not available. Please install Docker to run E2E tests.');
      return false;
    }
  }

  /**
   * Check if duo node image exists or needs to be built
   */
  private async ensureDuoNodeImage(): Promise<void> {
    console.log('🔍 Checking for interspace-duo-node image...');
    
    try {
      // Check if image exists
      execSync('docker image inspect interspace-duo-node:latest', { stdio: 'ignore' });
      console.log('✅ Duo node image found');
    } catch (error) {
      console.log('📦 Building duo node image...');
      
      // Check if duo node repository exists
      const duoNodePath = '../interspace-duo-node';
      const fs = require('fs');
      
      if (!fs.existsSync(duoNodePath)) {
        throw new Error(
          'interspace-duo-node repository not found. Please clone it to ../interspace-duo-node'
        );
      }
      
      // Build the image
      execSync('docker build -t interspace-duo-node:latest .', {
        cwd: duoNodePath,
        stdio: 'inherit'
      });
      
      console.log('✅ Duo node image built successfully');
    }
  }

  /**
   * Start the duo node container
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Duo node is already running');
      return;
    }

    if (!this.checkDockerAvailable()) {
      throw new Error('Docker is required for E2E tests');
    }

    await this.ensureDuoNodeImage();

    // Stop any existing container with the same name
    await this.cleanup();

    console.log('🚀 Starting interspace-duo-node container...');

    const dockerCommand = [
      'run',
      '--rm',
      '--name', this.config.containerName,
      '-p', `${this.config.port}:${this.config.port}`,
      '-e', `PORT=${this.config.port}`,
      '-e', `SILENCE_NODE_URL=${this.config.silenceNodeUrl}`,
      '-e', `SILENCE_ADMIN_TOKEN=${this.config.silenceAdminToken}`,
      '-e', 'NODE_ENV=test',
      '-e', 'LOG_LEVEL=debug'
    ];

    // Add Google Cloud credentials if available
    if (this.config.googleProjectId) {
      dockerCommand.push('-e', `GOOGLE_CLOUD_PROJECT=${this.config.googleProjectId}`);
    }

    // Add the image name
    dockerCommand.push('interspace-duo-node:latest');

    // Start the container
    this.containerProcess = spawn('docker', dockerCommand, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Handle container output
    this.containerProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[DUO-NODE] ${output}`);
      }
    });

    this.containerProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.error(`[DUO-NODE ERROR] ${output}`);
      }
    });

    this.containerProcess.on('exit', (code) => {
      console.log(`[DUO-NODE] Container exited with code ${code}`);
      this.isRunning = false;
    });

    // Wait for the service to be ready
    await this.waitForReady();
    
    this.isRunning = true;
    console.log('✅ Duo node container is running');
  }

  /**
   * Wait for the duo node service to be ready
   */
  private async waitForReady(maxAttempts: number = 30): Promise<void> {
    console.log('⏳ Waiting for duo node to be ready...');
    
    const healthUrl = `http://localhost:${this.config.port}/health`;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(healthUrl, { timeout: 1000 });
        if (response.data.status === 'healthy' || response.data.status === 'ok') {
          console.log('✅ Duo node is ready');
          return;
        }
      } catch (error) {
        // Service not ready yet
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Duo node failed to start within timeout');
  }

  /**
   * Stop the duo node container
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping duo node container...');

    try {
      execSync(`docker stop ${this.config.containerName}`, { stdio: 'ignore' });
      console.log('✅ Duo node container stopped');
    } catch (error) {
      console.error('Failed to stop duo node container:', error);
    }

    this.isRunning = false;
  }

  /**
   * Cleanup any existing containers
   */
  async cleanup(): Promise<void> {
    try {
      // Stop the container if it's running
      execSync(`docker stop ${this.config.containerName}`, { stdio: 'ignore' });
    } catch (error) {
      // Container might not be running
    }

    try {
      // Remove the container if it exists
      execSync(`docker rm ${this.config.containerName}`, { stdio: 'ignore' });
    } catch (error) {
      // Container might not exist
    }
  }

  /**
   * Get container logs
   */
  async getLogs(tail: number = 100): Promise<string> {
    try {
      const logs = execSync(
        `docker logs ${this.config.containerName} --tail ${tail}`,
        { encoding: 'utf-8' }
      );
      return logs;
    } catch (error) {
      return 'Failed to retrieve logs';
    }
  }

  /**
   * Check if the container is running
   */
  async isContainerRunning(): Promise<boolean> {
    try {
      const result = execSync(
        `docker ps --filter name=${this.config.containerName} --format "{{.Names}}"`,
        { encoding: 'utf-8' }
      );
      return result.trim() === this.config.containerName;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the duo node URL for testing
   */
  getDuoNodeUrl(): string {
    return `http://localhost:${this.config.port}`;
  }
}

// Export singleton instance
export const duoNodeDocker = new DuoNodeDockerManager();