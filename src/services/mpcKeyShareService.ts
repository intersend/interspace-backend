import { prisma } from '@/utils/database';
import { encrypt, decrypt } from '@/utils/crypto';

class MpcKeyShareService {
  async createKeyShare(profileId: string, share: any) {
    const encrypted = encrypt(JSON.stringify(share));
    await prisma.mpcKeyShare.create({
      data: { profileId, serverShare: encrypted }
    });
  }

  async getKeyShare(profileId: string): Promise<any | null> {
    const record = await prisma.mpcKeyShare.findUnique({ where: { profileId } });
    if (!record) return null;
    return JSON.parse(decrypt(record.serverShare));
  }

  async updateKeyShare(profileId: string, share: any) {
    const encrypted = encrypt(JSON.stringify(share));
    await prisma.mpcKeyShare.upsert({
      where: { profileId },
      update: { serverShare: encrypted },
      create: { profileId, serverShare: encrypted }
    });
  }

  async deleteKeyShare(profileId: string) {
    await prisma.mpcKeyShare.delete({ where: { profileId } });
  }
}

export const mpcKeyShareService = new MpcKeyShareService();
