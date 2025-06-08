import { OrbyService } from '../../../src/services/orbyService';
import { prisma } from '../../../src/utils/database';
import { CreateOperationsStatus } from '@orb-labs/orby-core';
import { OrbyProvider } from '@orb-labs/orby-ethers6';

jest.mock('@orb-labs/orby-ethers6');
jest.mock('../../../src/utils/database', () => ({
  prisma: {
    smartProfile: { update: jest.fn(), findUnique: jest.fn() },
    orbyVirtualNode: { upsert: jest.fn() },
  }
}));

const MockedProvider = OrbyProvider as jest.Mock;

describe('OrbyService Integration', () => {
  let service: OrbyService;
  let profile: any;

  beforeEach(() => {
    service = new OrbyService();
    const provider: any = new OrbyProvider('http://dummy');
    provider.createAccountCluster.mockResolvedValue({ accountClusterId: 'cluster123' });
    provider.getVirtualNodeRpcUrl.mockResolvedValue('http://rpc.test');
    provider.getStandardizedTokenIds.mockResolvedValue(['id1','id2']);
    provider.getOperationsToExecuteTransaction.mockResolvedValue({ status: CreateOperationsStatus.SUCCESS, intents: [] });
    profile = { id: 'p1', sessionWalletAddress: '0xabc', linkedAccounts: [] };
  });

  test('creates account cluster', async () => {
    const id = await service.createOrGetAccountCluster(profile as any);
    expect(id).toBe('cluster123');
    expect(prisma.smartProfile.update).toHaveBeenCalled();
  });

  test('builds transfer operations', async () => {
    (prisma.smartProfile.update as jest.Mock).mockResolvedValue({});
    profile.orbyAccountClusterId = 'cluster123';
    const res = await service.buildTransferOperation(profile as any, {
      from: { token: '0xToken', chainId: 1, amount: '1' },
      to: { address: '0xabc0000000000000000000000000000000000000' }
    });
    expect(res.status).toBe(CreateOperationsStatus.SUCCESS);
  });
});
