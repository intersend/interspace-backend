import { faker } from '@faker-js/faker';
import { prisma } from '@/utils/database';

export interface CreateUserData {
  walletAddress?: string;
  email?: string;
  isGuest?: boolean;
}

export class UserFactory {
  static generateUserData(overrides: CreateUserData = {}): CreateUserData {
    return {
      walletAddress: faker.string.hexadecimal({ length: 40, prefix: '0x' }),
      email: faker.internet.email(),
      isGuest: false,
      ...overrides,
    };
  }

  static async create(overrides: CreateUserData = {}) {
    const userData = this.generateUserData(overrides);
    
    return prisma.user.create({
      data: {
        walletAddress: userData.walletAddress,
        email: userData.email,
        isGuest: userData.isGuest || false,
        emailVerified: false,
      }
    });
  }

  static async createMany(count: number, overrides: CreateUserData = {}) {
    const users = [];
    for (let i = 0; i < count; i++) {
      const user = await this.create({
        ...overrides,
        walletAddress: faker.string.hexadecimal({ length: 40, prefix: '0x' }),
        email: faker.internet.email(),
      });
      users.push(user);
    }
    return users;
  }

  static generateValidAddress(): string {
    return faker.string.hexadecimal({ length: 40, prefix: '0x' });
  }

  static generateValidSignature(): string {
    return faker.string.hexadecimal({ length: 130, prefix: '0x' });
  }

  static generateValidMessage(): string {
    return `Sign in to Interspace at ${new Date().toISOString()}`;
  }
}
