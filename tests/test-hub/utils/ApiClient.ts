import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { 
  ApiClient as IApiClient, 
  ApiResponse, 
  RequestOptions,
  RequestLog 
} from '../types';
import { logger } from './logger';
import { performance } from 'perf_hooks';

export class ApiClient implements IApiClient {
  private client: AxiosInstance;
  private baseURL: string;
  private accessToken?: string;
  private requestLogs: RequestLog[] = [];
  private requestInterceptorId?: number;
  private responseInterceptorId?: number;

  constructor(baseURL: string, accessToken?: string) {
    // Force IPv4 by replacing localhost with 127.0.0.1
    this.baseURL = baseURL.replace('localhost', '127.0.0.1');
    this.accessToken = accessToken;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': uuidv4(),
        'User-Agent': 'Test Hub/1.0'
      }
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.requestInterceptorId = this.client.interceptors.request.use(
      (config) => {
        // Add JWT token if available
        if (this.accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }

        // Add correlation ID
        if (config.headers) {
          config.headers['X-Correlation-ID'] = uuidv4();
        }

        // Start timing
        (config as any).metadata = {
          startTime: performance.now(),
          requestId: config.headers?.['X-Correlation-ID']
        };

        logger.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
          headers: config.headers,
          data: config.data
        });

        return config;
      },
      (error) => {
        logger.error('[API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.responseInterceptorId = this.client.interceptors.response.use(
      (response) => {
        const duration = performance.now() - (response.config as any).metadata.startTime;
        
        logger.debug(`[API] Response ${response.status} (${Math.round(duration)}ms)`, {
          url: response.config.url,
          status: response.status,
          data: response.data
        });

        // Log request for reporting
        this.logRequest(response.config, response, duration);

        return response;
      },
      (error) => {
        const config = error.config;
        const duration = config?.metadata ? performance.now() - config.metadata.startTime : 0;

        logger.error(`[API] Error ${error.response?.status || 'Network Error'} (${Math.round(duration)}ms)`, {
          url: config?.url,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });

        // Log failed request
        if (config) {
          this.logRequest(config, error.response, duration, error);
        }

        return Promise.reject(this.enhanceError(error));
      }
    );
  }

  /**
   * Log request for reporting
   */
  private logRequest(
    config: AxiosRequestConfig, 
    response: AxiosResponse | undefined,
    duration: number,
    error?: Error
  ): void {
    const log: RequestLog = {
      method: config.method?.toUpperCase() || 'GET',
      url: config.url || '',
      headers: config.headers as Record<string, string>,
      body: config.data,
      timestamp: Date.now()
    };

    if (response) {
      log.response = {
        status: response.status,
        headers: response.headers as Record<string, string>,
        body: response.data,
        duration
      };
    }

    if (error) {
      log.error = error;
    }

    this.requestLogs.push(log);
  }

  /**
   * Enhance error with additional information
   */
  private enhanceError(error: any): Error {
    const enhanced = new Error(error.message);
    enhanced.name = 'ApiError';
    
    (enhanced as any).status = error.response?.status;
    (enhanced as any).statusText = error.response?.statusText;
    (enhanced as any).data = error.response?.data;
    (enhanced as any).headers = error.response?.headers;
    (enhanced as any).config = {
      method: error.config?.method,
      url: error.config?.url,
      data: error.config?.data
    };

    return enhanced;
  }

  /**
   * Build request configuration
   */
  private buildConfig(options?: RequestOptions): AxiosRequestConfig {
    const config: AxiosRequestConfig = {};

    if (options?.headers) {
      config.headers = { ...config.headers, ...options.headers };
    }

    if (options?.query) {
      config.params = options.query;
    }

    if (options?.timeout) {
      config.timeout = options.timeout;
    }

    return config;
  }

  /**
   * Make request with retry logic
   */
  private async makeRequest<T = any>(
    config: AxiosRequestConfig,
    retries: number = 0
  ): Promise<ApiResponse<T>> {
    const maxRetries = config.params?.retries || retries || 0;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = performance.now();
        const response = await this.client.request<T>(config);
        const duration = performance.now() - startTime;

        return {
          status: response.status,
          data: response.data,
          headers: response.headers as Record<string, string>,
          duration
        };
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on client errors (4xx)
        if ((error as any).status && (error as any).status >= 400 && (error as any).status < 500) {
          throw error;
        }

        // Retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.debug(`[API] Retrying request (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * GET request
   */
  async get<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const config = this.buildConfig(options);
    config.method = 'GET';
    config.url = path;
    
    return this.makeRequest<T>(config, options?.retries);
  }

  /**
   * POST request
   */
  async post<T = any>(path: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    const config = this.buildConfig(options);
    config.method = 'POST';
    config.url = path;
    config.data = data;
    
    return this.makeRequest<T>(config, options?.retries);
  }

  /**
   * PUT request
   */
  async put<T = any>(path: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    const config = this.buildConfig(options);
    config.method = 'PUT';
    config.url = path;
    config.data = data;
    
    return this.makeRequest<T>(config, options?.retries);
  }

  /**
   * PATCH request
   */
  async patch<T = any>(path: string, data?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    const config = this.buildConfig(options);
    config.method = 'PATCH';
    config.url = path;
    config.data = data;
    
    return this.makeRequest<T>(config, options?.retries);
  }

  /**
   * DELETE request
   */
  async delete<T = any>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const config = this.buildConfig(options);
    config.method = 'DELETE';
    config.url = path;
    
    return this.makeRequest<T>(config, options?.retries);
  }

  /**
   * Set access token
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Clear access token
   */
  clearAccessToken(): void {
    this.accessToken = undefined;
  }

  /**
   * Get request logs
   */
  getRequestLogs(): RequestLog[] {
    return this.requestLogs;
  }

  /**
   * Clear request logs
   */
  clearRequestLogs(): void {
    this.requestLogs = [];
  }

  /**
   * Cleanup interceptors
   */
  cleanup(): void {
    if (this.requestInterceptorId !== undefined) {
      this.client.interceptors.request.eject(this.requestInterceptorId);
    }
    if (this.responseInterceptorId !== undefined) {
      this.client.interceptors.response.eject(this.responseInterceptorId);
    }
  }
}

/**
 * Helper function to assert API response
 */
export function assertResponse(
  response: ApiResponse,
  expectedStatus: number,
  message?: string
): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      message || `Expected status ${expectedStatus}, got ${response.status}`
    );
  }
}

/**
 * Helper function to assert response data
 */
export function assertResponseData<T>(
  response: ApiResponse<T>,
  validator: (data: T) => boolean,
  message?: string
): void {
  if (!validator(response.data)) {
    throw new Error(
      message || `Response data validation failed`
    );
  }
}

/**
 * Helper function to extract error message
 */
export function getErrorMessage(error: any): string {
  if (error.data?.message) {
    return error.data.message;
  }
  if (error.data?.error) {
    return error.data.error;
  }
  return error.message || 'Unknown error';
}

/**
 * Helper function to assert error response
 */
export function assertErrorResponse(
  error: any,
  expectedStatus: number,
  expectedMessage?: string | RegExp
): void {
  if (!error.status || error.status !== expectedStatus) {
    throw new Error(
      `Expected error status ${expectedStatus}, got ${error.status || 'no status'}`
    );
  }

  if (expectedMessage) {
    const message = getErrorMessage(error);
    if (typeof expectedMessage === 'string') {
      if (!message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}", got "${message}"`
        );
      }
    } else {
      if (!expectedMessage.test(message)) {
        throw new Error(
          `Expected error message to match ${expectedMessage}, got "${message}"`
        );
      }
    }
  }
}