import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiResponse } from '@/types';

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => {
      if ('msg' in error) {
        return `${error.msg} (${error.type} in ${error.location})`;
      }
      return 'Validation error';
    });

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorMessages
    } as ApiResponse);
    return;
  }
  
  next();
};