import { faker } from '@faker-js/faker';
import { prisma } from '@/utils/database';

// Legacy factory - Uses User table for backward compatibility
// In flat identity model, this represents creating accounts
export interface CreateUserData {
  walletAddress?: string;
  email?: string;
  isGuest?: boolean;
}

export class UserFactory {  // Kept name for backward compatibility
  static generateUserData(overrides: CreateUserData = {}): CreateUserData {
    return {
      walletAddress: faker.string.hexadecimal({ length: 40, prefix: '0x' }),
      email: faker.internet.email(),
      isGuest: false,
      ...overrides,
    };
  }

  static async create(overrides: CreateUserData = {}) {
    const accountData = this.generateUserData(overrides);
    
    // Using legacy user table for backward compatibility
    return prisma.user.create({
      data: {
        walletAddress: accountData.walletAddress,
        email: accountData.email,
        isGuest: accountData.isGuest || false,
        emailVerified: false,
      }
    });
  }

  static async createMany(count: number, overrides: CreateUserData = {}) {
    const accounts = [];
    for (let i = 0; i < count; i++) {
      const account = await this.create({
        ...overrides,
        walletAddress: faker.string.hexadecimal({ length: 40, prefix: '0x' }),
        email: faker.internet.email(),
      });
      accounts.push(account);
    }
    return accounts;
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