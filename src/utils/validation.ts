import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../types';

export const validateRequest = (schema: {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: any[] = [];

    // Validate body
    if (schema.body) {
      const { error } = schema.body.validate(req.body);
      if (error) {
        errors.push(...error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })));
      }
    }

    // Validate query
    if (schema.query) {
      const { error } = schema.query.validate(req.query);
      if (error) {
        errors.push(...error.details.map(detail => ({
          field: `query.${detail.path.join('.')}`,
          message: detail.message
        })));
      }
    }

    // Validate params
    if (schema.params) {
      const { error } = schema.params.validate(req.params);
      if (error) {
        errors.push(...error.details.map(detail => ({
          field: `params.${detail.path.join('.')}`,
          message: detail.message
        })));
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    next();
  };
};

// Common validation schemas
export const commonSchemas = {
  id: Joi.string().required().min(1).max(50),
  email: Joi.string().email().required().max(255),
  password: Joi.string().min(8).max(128).required(),
  deviceId: Joi.string().required().min(1).max(255),
  deviceName: Joi.string().required().min(1).max(255),
  deviceType: Joi.string().valid('ios', 'android', 'web').required(),
  url: Joi.string().uri().required().max(2048),
  name: Joi.string().required().min(1).max(255),
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }
};

// Auth validation schemas
export const authSchemas = {
  register: {
    body: Joi.object({
      email: commonSchemas.email,
      password: commonSchemas.password,
      deviceId: commonSchemas.deviceId,
      deviceName: commonSchemas.deviceName,
      deviceType: commonSchemas.deviceType
    })
  },

  login: {
    body: Joi.object({
      email: commonSchemas.email,
      password: commonSchemas.password,
      deviceId: commonSchemas.deviceId,
      deviceName: commonSchemas.deviceName,
      deviceType: commonSchemas.deviceType
    })
  },

  refreshToken: {
    body: Joi.object({
      refreshToken: Joi.string().required()
    })
  },

  changePassword: {
    body: Joi.object({
      currentPassword: commonSchemas.password,
      newPassword: commonSchemas.password
    })
  }
};

// Profile validation schemas
export const profileSchemas = {
  create: {
    body: Joi.object({
      name: commonSchemas.name
    })
  },

  update: {
    params: Joi.object({
      profileId: commonSchemas.id
    }),
    body: Joi.object({
      name: commonSchemas.name.optional(),
      isActive: Joi.boolean().optional()
    })
  },

  getProfile: {
    params: Joi.object({
      profileId: commonSchemas.id
    })
  }
};

// App validation schemas
export const appSchemas = {
  create: {
    body: Joi.object({
      name: commonSchemas.name,
      url: commonSchemas.url,
      iconUrl: Joi.string().uri().optional().max(2048),
      folderId: commonSchemas.id.optional(),
      position: Joi.number().integer().min(0).optional()
    })
  },

  update: {
    params: Joi.object({
      appId: commonSchemas.id
    }),
    body: Joi.object({
      name: commonSchemas.name.optional(),
      url: commonSchemas.url.optional(),
      iconUrl: Joi.string().uri().optional().max(2048),
      folderId: commonSchemas.id.optional().allow(null),
      position: Joi.number().integer().min(0).optional()
    })
  },

  reorder: {
    body: Joi.object({
      appIds: Joi.array().items(commonSchemas.id).min(1).required()
    })
  }
};

// Folder validation schemas
export const folderSchemas = {
  create: {
    body: Joi.object({
      name: commonSchemas.name,
      position: Joi.number().integer().min(0).optional(),
      color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional()
    })
  },

  update: {
    params: Joi.object({
      folderId: commonSchemas.id
    }),
    body: Joi.object({
      name: commonSchemas.name.optional(),
      position: Joi.number().integer().min(0).optional(),
      color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional(),
      isPublic: Joi.boolean().optional()
    })
  }
};

// Account linking validation schemas
export const accountSchemas = {
  link: {
    body: Joi.object({
      address: Joi.string().required().min(1).max(255),
      walletType: Joi.string().valid(
        'metamask', 'coinbase', 'walletconnect', 'ledger', 'safe', 'magic', 'web3auth'
      ).required(),
      customName: Joi.string().optional().max(255),
      chainId: Joi.number().integer().optional(),
      signature: Joi.string().required(),
      message: Joi.string().required()
    })
  },

  update: {
    params: Joi.object({
      accountId: commonSchemas.id
    }),
    body: Joi.object({
      customName: Joi.string().optional().max(255),
      isPrimary: Joi.boolean().optional()
    })
  }
};

// Transaction validation schemas
export const transactionSchemas = {
  send: {
    body: Joi.object({
      toAddress: Joi.string().required().min(1).max(255),
      value: Joi.string().required(),
      chainId: Joi.number().integer().required(),
      data: Joi.string().optional(),
      gasLimit: Joi.string().optional()
    })
  }
};

// Pagination validation
export const paginationSchema = {
  query: Joi.object(commonSchemas.pagination)
};
