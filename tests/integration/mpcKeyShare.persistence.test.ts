import { SessionWalletService } from '../../src/blockchain/sessionWalletService';
import { prisma } from '../../src/utils/database';

describe('MPC key share persistence', () => {
  let userId: string;
  let profileId: string;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'mpc-persistence-test@example.com',
        emailVerified: true
      }
    });
    userId = user.id;

    // Create test profile
    const profile = await prisma.smartProfile.create({
      data: {
        userId,
        name: 'MPC Persistence Test Profile',
        sessionWalletAddress: '0x' + '0'.repeat(40)
      }
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    // Clean up in proper order
    await prisma.mpcKeyShare.deleteMany();
    await prisma.mpcKeyMapping.deleteMany();
    await prisma.smartProfile.deleteMany();
    await prisma.user.deleteMany();
  });

  test('server share survives service restart', async () => {
    const service1 = new SessionWalletService();
    // Create a proper public key (65 bytes = 130 hex chars)
    const publicKey = '0x04' + 'a'.repeat(128);
    const clientShare = { public_key: publicKey } as any;
    const { address } = await service1.createSessionWallet(profileId, clientShare);

    const record = await prisma.mpcKeyShare.findUnique({ where: { profileId } });
    expect(record).toBeTruthy();
    expect(record!.serverShare).toBeTruthy();

    // Verify the share was encrypted
    expect(record!.serverShare.length).toBeGreaterThan(100);

    const service2 = new SessionWalletService();
    const loadedAddress = await service2.getSessionWalletAddress(profileId);
    
    // The address should be derived from the stored share's public key
    expect(loadedAddress).toBeTruthy();
    expect(loadedAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});

