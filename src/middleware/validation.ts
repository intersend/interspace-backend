import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiResponse } from '@/types';

export function validateRequest(schema: Joi.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      context: {
        type: req.body.type // For conditional validation
      }
    });

    if (error) {
      const response: ApiResponse = {
        success: false,
        error: 'Validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      };
      res.status(400).json(response);
      return;
    }

    req.body = value;
    next();
  };
}

export function validateQuery(schema: Joi.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const response: ApiResponse = {
        success: false,
        error: 'Query validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      };
      res.status(400).json(response);
      return;
    }

    req.query = value;
    next();
  };
}

export function validateParams(schema: Joi.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const response: ApiResponse = {
        success: false,
        error: 'Parameter validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      };
      res.status(400).json(response);
      return;
    }

    req.params = value;
    next();
  };
}
