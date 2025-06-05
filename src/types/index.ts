export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'ios' | 'android' | 'web';
}

export interface RegisterRequest {
  email: string;
  password: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'ios' | 'android' | 'web';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  userId: string;
  deviceId?: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// Smart Profile Types
export interface CreateSmartProfileRequest {
  name: string;
}

export interface UpdateSmartProfileRequest {
  name?: string;
  isActive?: boolean;
}

export interface SmartProfileResponse {
  id: string;
  name: string;
  sessionWalletAddress: string;
  isActive: boolean;
  linkedAccountsCount: number;
  appsCount: number;
  foldersCount: number;
  createdAt: string;
  updatedAt: string;
}

// Linked Account Types
export interface LinkAccountRequest {
  address: string;
  walletType: WalletType;
  customName?: string;
  chainId?: number;
  signature: string; // Signature proving ownership
  message: string; // Message that was signed
}

export interface UpdateLinkedAccountRequest {
  customName?: string;
  isPrimary?: boolean;
}

export type WalletType = 
  | 'metamask' 
  | 'coinbase' 
  | 'walletconnect' 
  | 'ledger' 
  | 'safe' 
  | 'magic' 
  | 'web3auth';

export interface LinkedAccountResponse {
  id: string;
  address: string;
  walletType: WalletType;
  customName?: string;
  isPrimary: boolean;
  isActive: boolean;
  chainId?: number;
  allowancesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSearchResponse {
  profileId: string;
  profileName: string;
  isActive: boolean;
  linkedAccount: LinkedAccountResponse;
}

// Token Allowance Types
export interface TokenAllowanceRequest {
  tokenAddress: string;
  allowanceAmount: string;
  chainId: number;
}

export interface TokenAllowanceResponse {
  id: string;
  tokenAddress: string;
  allowanceAmount: string;
  chainId: number;
  createdAt: string;
  updatedAt: string;
}

// Bookmarked App Types
export interface CreateBookmarkedAppRequest {
  name: string;
  url: string;
  iconUrl?: string;
  folderId?: string;
  position?: number;
}

export interface UpdateBookmarkedAppRequest {
  name?: string;
  url?: string;
  iconUrl?: string;
  folderId?: string;
  position?: number;
}

export interface BookmarkedAppResponse {
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  position: number;
  folderId?: string;
  folderName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderAppsRequest {
  appIds: string[];
}

// Folder Types
export interface CreateFolderRequest {
  name: string;
  position?: number;
  color?: string;
}

export interface UpdateFolderRequest {
  name?: string;
  position?: number;
  color?: string;
  isPublic?: boolean;
}

export interface FolderResponse {
  id: string;
  name: string;
  position: number;
  isPublic: boolean;
  shareableId?: string;
  color?: string;
  appsCount: number;
  apps?: BookmarkedAppResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface ShareFolderResponse {
  shareableId: string;
  shareableUrl: string;
}

// User Types
export interface UserResponse {
  id: string;
  email?: string;
  authStrategies: string[];
  isGuest: boolean;
  profilesCount: number;
  linkedAccountsCount: number;
  activeDevicesCount: number;
  socialAccounts: SocialAccountResponse[];
  createdAt: string;
  updatedAt: string;
}

// Social Account Types (User Level)
export interface LinkSocialAccountRequest {
  provider: SocialProvider;
  oauthCode: string;
  redirectUri?: string;
}

export type SocialProvider = 'farcaster' | 'telegram' | 'twitter' | 'discord' | 'google';

export interface SocialAccountResponse {
  id: string;
  provider: SocialProvider;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// Transaction Types
export interface TransactionResponse {
  id: string;
  hash: string;
  chainId: number;
  fromAddress: string;
  toAddress: string;
  value: string;
  gasUsed?: string;
  gasPrice?: string;
  status: TransactionStatus;
  blockNumber?: number;
  blockTimestamp?: string;
  routingType?: RoutingType;
  sourceAccount?: string;
  sessionWallet?: string;
  targetApp?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';
export type RoutingType = 'direct' | 'session_wallet' | 'batch';

export interface SendTransactionRequest {
  toAddress: string;
  value: string;
  chainId: number;
  data?: string;
  gasLimit?: string;
}

// Wallet Balance Types
export interface BalanceResponse {
  totalUsdValue: string;
  accounts: AccountBalance[];
}

export interface AccountBalance {
  address: string;
  walletType: WalletType;
  customName?: string;
  chainBalances: ChainBalance[];
  totalUsdValue: string;
}

export interface ChainBalance {
  chainId: number;
  chainName: string;
  nativeBalance: TokenBalance;
  tokenBalances: TokenBalance[];
  totalUsdValue: string;
}

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  usdValue: string;
  logoUrl?: string;
}

// Blockchain Types
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrls: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrls: string[];
  isTestnet: boolean;
}

export interface SessionWalletConfig {
  address: string;
  chainId: number;
  factoryAddress: string;
  implementationAddress: string;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  profileId?: string;
  data: any;
  timestamp: number;
}

export interface ProfileUpdateMessage extends WebSocketMessage {
  type: 'profile_update';
  data: {
    profileId: string;
    updates: Partial<SmartProfileResponse>;
  };
}

export interface AppUpdateMessage extends WebSocketMessage {
  type: 'app_update';
  data: {
    action: 'created' | 'updated' | 'deleted' | 'reordered';
    app?: BookmarkedAppResponse;
    apps?: BookmarkedAppResponse[];
  };
}

export interface FolderUpdateMessage extends WebSocketMessage {
  type: 'folder_update';
  data: {
    action: 'created' | 'updated' | 'deleted' | 'reordered';
    folder?: FolderResponse;
    folders?: FolderResponse[];
  };
}

export interface TransactionUpdateMessage extends WebSocketMessage {
  type: 'transaction_update';
  data: {
    transaction: TransactionResponse;
  };
}

// Error Types
export class AppError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ValidationError[]) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

// Utility Types
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Request context for middleware
export interface RequestContext {
  userId?: string;
  deviceId?: string;
  profileId?: string;
  ipAddress?: string;
  userAgent?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestContext;
    }
  }
}
