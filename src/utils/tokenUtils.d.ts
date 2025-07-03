export interface TokenPayload {
  accountId: string;
  sessionToken: string;
  deviceId?: string;
  activeProfileId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface DecodedToken {
  type: 'access' | 'refresh';
  iat: number;
  version: string;
  accountId: string;
  sessionToken: string;
  deviceId?: string;
  activeProfileId?: string;
  userId?: string; // For backwards compatibility
  exp?: number;
  iss?: string;
  aud?: string;
  jti?: string;
}

export function generateTokens(payload: TokenPayload): AuthTokens;
export function verifyRefreshToken(token: string): DecodedToken;
export function verifyAccessToken(token: string): DecodedToken;
export function extractTokenFromHeader(authHeader: string | undefined): string | null;
export function isTokenExpired(token: string): boolean;