export interface OAuthProviderConfig {
  name: string;
  displayName: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint?: string;
  scopes: string[];
  additionalParams?: Record<string, string>;
  userInfoMapping?: {
    id: string;
    email?: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
    verified?: string;
  };
}

export interface OAuthUserInfo {
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  username?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    name: 'google',
    displayName: 'Google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['openid', 'email', 'profile'],
    userInfoMapping: {
      id: 'sub',
      email: 'email',
      name: 'name',
      avatarUrl: 'picture',
      verified: 'email_verified'
    }
  },
  github: {
    name: 'github',
    displayName: 'GitHub',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userInfoEndpoint: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
    userInfoMapping: {
      id: 'id',
      email: 'email',
      name: 'name',
      username: 'login',
      avatarUrl: 'avatar_url'
    }
  },
  discord: {
    name: 'discord',
    displayName: 'Discord',
    authorizationEndpoint: 'https://discord.com/api/oauth2/authorize',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    userInfoEndpoint: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
    userInfoMapping: {
      id: 'id',
      email: 'email',
      name: 'global_name',
      username: 'username',
      avatarUrl: 'avatar',
      verified: 'verified'
    }
  },
  spotify: {
    name: 'spotify',
    displayName: 'Spotify',
    authorizationEndpoint: 'https://accounts.spotify.com/authorize',
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
    userInfoEndpoint: 'https://api.spotify.com/v1/me',
    scopes: ['user-read-email', 'user-read-private'],
    userInfoMapping: {
      id: 'id',
      email: 'email',
      name: 'display_name',
      avatarUrl: 'images[0].url'
    }
  },
  twitter: {
    name: 'twitter',
    displayName: 'X (Twitter)',
    authorizationEndpoint: 'https://twitter.com/i/oauth2/authorize',
    tokenEndpoint: 'https://api.twitter.com/2/oauth2/token',
    userInfoEndpoint: 'https://api.twitter.com/2/users/me',
    scopes: ['users.read', 'tweet.read'],
    additionalParams: {
      'code_challenge_method': 'S256'
    },
    userInfoMapping: {
      id: 'data.id',
      name: 'data.name',
      username: 'data.username',
      avatarUrl: 'data.profile_image_url',
      verified: 'data.verified'
    }
  },
  facebook: {
    name: 'facebook',
    displayName: 'Facebook',
    authorizationEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenEndpoint: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userInfoEndpoint: 'https://graph.facebook.com/me?fields=id,name,email,picture',
    scopes: ['email', 'public_profile'],
    additionalParams: {
      display: 'touch'
    },
    userInfoMapping: {
      id: 'id',
      email: 'email',
      name: 'name',
      avatarUrl: 'picture.data.url'
    }
  },
  tiktok: {
    name: 'tiktok',
    displayName: 'TikTok',
    authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize',
    tokenEndpoint: 'https://open.tiktokapis.com/v2/oauth/token',
    userInfoEndpoint: 'https://open.tiktokapis.com/v2/user/info/',
    scopes: ['user.info.basic', 'user.info.profile'],
    userInfoMapping: {
      id: 'data.user.open_id',
      name: 'data.user.display_name',
      username: 'data.user.username',
      avatarUrl: 'data.user.avatar_url'
    }
  },
  epicgames: {
    name: 'epicgames',
    displayName: 'Epic Games',
    authorizationEndpoint: 'https://www.epicgames.com/id/authorize',
    tokenEndpoint: 'https://api.epicgames.dev/epic/oauth/v2/token',
    userInfoEndpoint: 'https://api.epicgames.dev/epic/id/v2/accounts',
    scopes: ['openid', 'profile', 'email'],
    userInfoMapping: {
      id: 'accountId',
      email: 'email',
      name: 'displayName',
      username: 'preferredLanguage'
    }
  },
  apple: {
    name: 'apple',
    displayName: 'Apple',
    authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
    tokenEndpoint: 'https://appleid.apple.com/auth/token',
    scopes: ['name', 'email'],
    additionalParams: {
      'response_mode': 'form_post'
    }
  },
  shopify: {
    name: 'shopify',
    displayName: 'Shopify',
    authorizationEndpoint: '', // Dynamic based on shop domain
    tokenEndpoint: '', // Dynamic based on shop domain
    scopes: ['read_customers', 'read_orders']
  },
  farcaster: {
    name: 'farcaster',
    displayName: 'Farcaster',
    authorizationEndpoint: '', // Uses SIWE flow instead of OAuth
    tokenEndpoint: '', // Uses SIWE flow instead of OAuth
    scopes: [],
    userInfoMapping: {
      id: 'fid',
      username: 'username',
      name: 'displayName',
      avatarUrl: 'pfpUrl'
    }
  }
};