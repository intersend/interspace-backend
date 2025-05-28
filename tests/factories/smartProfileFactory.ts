import { faker } from '@faker-js/faker';
import { prisma } from '@/utils/database';
import { UserFactory } from './userFactory';

export interface CreateSmartProfileData {
  userId?: string;
  name?: string;
  sessionWalletAddress?: string;
  isActive?: boolean;
}

export class SmartProfileFactory {
  static generateProfileData(overrides: CreateSmartProfileData = {}): CreateSmartProfileData {
    return {
      name: faker.company.name(),
      sessionWalletAddress: faker.string.hexadecimal({ length: 40, prefix: '0x' }),
      isActive: false,
      ...overrides,
    };
  }

  static async create(overrides: CreateSmartProfileData = {}) {
    // Ensure we have a user
    let userId = overrides.userId;
    if (!userId) {
      const user = await UserFactory.create();
      userId = user.id;
    }

    const profileData = this.generateProfileData({ ...overrides, userId });
    
    return prisma.smartProfile.create({
      data: {
        userId: profileData.userId!,
        name: profileData.name!,
        sessionWalletAddress: profileData.sessionWalletAddress!,
        isActive: profileData.isActive!
      },
      include: {
        linkedAccounts: true,
        apps: true,
        folders: true,
        _count: {
          select: {
            linkedAccounts: true,
            apps: true,
            folders: true
          }
        }
      }
    });
  }

  static async createMany(count: number, overrides: CreateSmartProfileData = {}) {
    const profiles = [];
    for (let i = 0; i < count; i++) {
      const profile = await this.create({
        ...overrides,
        name: `${faker.company.name()} ${i + 1}`,
      });
      profiles.push(profile);
    }
    return profiles;
  }

  static async createWithUser() {
    const user = await UserFactory.create();
    const profile = await this.create({ userId: user.id });
    return { user, profile };
  }

  static async createActiveProfile(userId?: string) {
    return this.create({ 
      userId,
      isActive: true,
      name: 'Active Profile'
    });
  }

  static generateValidProfileNames(): string[] {
    return [
      'Trading Profile',
      'Gaming Wallet',
      'DeFi Portfolio',
      'NFT Collection',
      'Payment Wallet',
      'Investment Account'
    ];
  }
}
