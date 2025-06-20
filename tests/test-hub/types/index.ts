export type TestStatus = 'running' | 'passed' | 'failed' | 'skipped';
export type TestPriority = 'critical' | 'high' | 'medium' | 'low';
export type TestMode = 'quick' | 'standard' | 'comprehensive';

export interface TestOptions {
  mode?: TestMode;
  parallel?: boolean;
  maxConcurrency?: number;
  bail?: boolean;
  timeout?: number;
  retries?: number;
  suites?: string[];
  tags?: string[];
  priority?: TestPriority;
  endpoints?: string[];
  reporter?: ReporterOptions;
  verbose?: boolean;
  dryRun?: boolean;
}

export interface ReporterOptions {
  formats?: ('console' | 'html' | 'json' | 'junit' | 'pdf')[];
  outputDir?: string;
  includeScreenshots?: boolean;
  includeRequestLogs?: boolean;
  emailOnFailure?: string[];
  slackWebhook?: string;
}

export interface TestCase {
  name: string;
  fn: (context: TestContext) => Promise<void>;
  timeout?: number;
  retries?: number;
  skip?: boolean;
  only?: boolean;
  tags?: string[];
}

export interface TestSuite {
  name: string;
  description?: string;
  tags: string[];
  priority: TestPriority;
  endpoints?: string[];
  setup?: (context: TestContext) => Promise<void>;
  teardown?: (context: TestContext) => Promise<void>;
  tests: TestCase[];
}

export interface TestResult {
  suite: string;
  status: TestStatus;
  tests: TestCaseResult[];
  startTime: number;
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
  error?: Error;
}

export interface TestCaseResult {
  name: string;
  status: TestStatus;
  duration: number;
  error?: Error;
  retries?: number;
  requests?: RequestLog[];
  assertions?: AssertionResult[];
  screenshots?: string[];
}

export interface RequestLog {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
  response?: {
    status: number;
    headers: Record<string, string>;
    body: any;
    duration: number;
  };
  error?: Error;
  timestamp: number;
}

export interface AssertionResult {
  type: string;
  expected: any;
  actual: any;
  passed: boolean;
  message?: string;
}

export interface TestContext {
  // User management
  createUser(data?: Partial<UserData>): Promise<TestUser>;
  getUser(id: string): Promise<TestUser>;
  deleteUser(id: string): Promise<void>;
  
  // Authentication
  authenticate(user: TestUser): Promise<AuthTokens>;
  refreshToken(refreshToken: string): Promise<AuthTokens>;
  logout(accessToken: string): Promise<void>;
  
  // Profile management
  createProfile(userId: string, data?: Partial<ProfileData>): Promise<TestProfile>;
  getProfile(id: string): Promise<TestProfile>;
  deleteProfile(id: string): Promise<void>;
  
  // API client
  createApiClient(accessToken?: string): ApiClient;
  
  // Test data
  generateTestData<T>(schema: any): T;
  cleanupTestData(): Promise<void>;
  
  // Utilities
  wait(ms: number): Promise<void>;
  retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
  measure<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }>;
  
  // Test-specific context
  createTestContext(suite: string, test: string): TestContext;
  
  // Database operations
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  checkDatabaseConnection(): Promise<void>;
  checkRedisConnection(): Promise<void>;
  checkExternalServices(): Promise<void>;
  
  // Cleanup
  cleanup(): Promise<void>;
  initializeTestData(): Promise<void>;
}

export interface TestUser {
  id: string;
  email?: string;
  walletAddress?: string;
  password?: string;
  totpSecret?: string;
  backupCodes?: string[];
  createdAt: Date;
}

export interface TestProfile {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  walletAddress?: string;
  clientShare?: any;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserData {
  email?: string;
  walletAddress?: string;
  password?: string;
  enable2FA?: boolean;
}

export interface ProfileData {
  name: string;
  clientShare?: any;
  isActive?: boolean;
}

export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
  onRetry?: (error: Error, attempt: number) => void;
}

export interface ApiClient {
  get(path: string, options?: RequestOptions): Promise<ApiResponse>;
  post(path: string, data?: any, options?: RequestOptions): Promise<ApiResponse>;
  put(path: string, data?: any, options?: RequestOptions): Promise<ApiResponse>;
  patch(path: string, data?: any, options?: RequestOptions): Promise<ApiResponse>;
  delete(path: string, options?: RequestOptions): Promise<ApiResponse>;
  setAccessToken(token: string): void;
  clearAccessToken(): void;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, any>;
  timeout?: number;
  retries?: number;
}

export interface ApiResponse<T = any> {
  status: number;
  data: T;
  headers: Record<string, string>;
  duration: number;
}

export interface TestReport {
  summary: ReportSummary;
  suites: TestResult[];
  metrics: PerformanceMetrics;
  security: SecurityAudit;
  recommendations: string[];
  generatedAt: Date;
}

export interface ReportSummary {
  totalSuites: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  passRate: string;
  startTime: Date;
  endTime: Date;
  environment: string;
}

export interface PerformanceMetrics {
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  slowestEndpoints: EndpointMetric[];
  requestsPerSecond: number;
  errorRate: number;
}

export interface EndpointMetric {
  endpoint: string;
  method: string;
  avgDuration: number;
  callCount: number;
  errorCount: number;
}

export interface SecurityAudit {
  vulnerabilities: SecurityVulnerability[];
  passedChecks: string[];
  failedChecks: string[];
  riskScore: number;
  compliance: ComplianceStatus;
}

export interface SecurityVulnerability {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  endpoint?: string;
  recommendation: string;
}

export interface ComplianceStatus {
  owasp: boolean;
  pci: boolean;
  gdpr: boolean;
  details: string[];
}