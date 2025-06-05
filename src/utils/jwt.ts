import jwt from 'jsonwebtoken';
import { config } from './config';
import { JwtPayload } from '@/types';
import { AuthenticationError } from '@/types';

export function generateAccessToken(userId: string, deviceId?: string): string {
  const payload: any = {
    userId,
    type: 'access' as const
  };

  // Only include deviceId if provided
  if (deviceId) {
    payload.deviceId = deviceId;
  }

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as any,
    issuer: 'interspace-api',
    audience: 'interspace-app'
  });
}

export function generateRefreshToken(userId: string, deviceId?: string): string {
  const payload: any = {
    userId,
    type: 'refresh' as const
  };

  // Only include deviceId if provided
  if (deviceId) {
    payload.deviceId = deviceId;
  }

  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
    issuer: 'interspace-api',
    audience: 'interspace-app'
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      issuer: 'interspace-api',
      audience: 'interspace-app'
    }) as JwtPayload;

    if (decoded.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired');
    }
    throw error;
  }
}

export function verifyRefreshToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
      issuer: 'interspace-api',
      audience: 'interspace-app'
    }) as JwtPayload;

    if (decoded.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid refresh token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Refresh token expired');
    }
    throw error;
  }
}

export function getTokenExpirationTime(token: string): number {
  try {
    const decoded = jwt.decode(token) as JwtPayload | null;
    return decoded?.exp ? decoded.exp * 1000 : Date.now();
  } catch {
    return Date.now();
  }
}

export function isTokenExpired(token: string): boolean {
  const expirationTime = getTokenExpirationTime(token);
  return Date.now() >= expirationTime;
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  
  //@ts-ignore
  return parts[1];
}
