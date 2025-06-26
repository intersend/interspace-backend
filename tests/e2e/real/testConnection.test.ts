// Test basic connectivity to services
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios from 'axios';

describe('Service Connectivity Test', () => {
  it('should connect to duo-node health endpoint', async () => {
    const response = await axios.get('http://localhost:3002/health', {
      validateStatus: () => true
    });
    
    console.log('Duo Node Health:', response.data);
    expect(response.status).toBe(200);
    expect(response.data.status).toBeDefined();
  });
  
  it('should connect to database', async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'postgresql://postgres:postgres@localhost:5433/interspace_e2e'
        }
      }
    });
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection successful');
    } finally {
      await prisma.$disconnect();
    }
  });
  
  it('should connect to redis', async () => {
    const Redis = require('ioredis');
    const redis = new Redis({
      port: 6380,
      host: 'localhost'
    });
    
    try {
      await redis.ping();
      console.log('✅ Redis connection successful');
    } finally {
      redis.disconnect();
    }
  });
});