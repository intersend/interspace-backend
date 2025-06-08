jest.mock('@orb-labs/orby-ethers6', () => {
  return {
    OrbyProvider: class {
      createAccountCluster = jest.fn(async () => ({ accountClusterId: 'cluster123' }));
      getVirtualNodeRpcUrl = jest.fn(async () => 'http://rpc.local');
      getOperationsToExecuteTransaction = jest.fn(async () => ({ status: 'SUCCESS', intents: [] }));
      getOperationsToSwap = jest.fn(async () => ({ status: 'SUCCESS' }));
      getStandardizedTokenIds = jest.fn(async (tokens) => tokens.map(() => 'id'));
      sendOperationSet = jest.fn(async () => ({ success: true, operationSetId: 'op1' }));
      subscribeToOperationSetStatus = jest.fn();
      getFungibleTokenPortfolio = jest.fn(async () => ({}));
    }
  };
}, { virtual: true });

jest.mock('@orb-labs/orby-core', () => {
  return {
    Account: { toAccount: (x: any) => x },
    AccountCluster: class {},
    Activity: class {},
    ActivityStatus: { SUCCESSFUL: 'SUCCESSFUL', FAILED: 'FAILED' },
    OnchainOperation: class {},
    QuoteType: { EXACT_INPUT: 'EXACT_INPUT' },
    CreateOperationsStatus: { SUCCESS: 'SUCCESS' }
  };
}, { virtual: true });

process.env.SILENCE_ADMIN_TOKEN = 'test-admin-token';
process.env.SILENCE_NODE_URL = 'http://localhost:8080';
process.env.ORBY_INSTANCE_PRIVATE_API_KEY = 'test-orby-private';
process.env.ORBY_INSTANCE_PUBLIC_API_KEY = 'test-orby-public';
process.env.ORBY_APP_NAME = 'test-app';
process.env.ORBY_PRIVATE_INSTANCE_URL = 'http://localhost:8545';
process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef';

import { orbyService } from '../../../src/services/orbyService';
import { prisma } from '../../../src/utils/database';
import { SmartProfileFactory } from '../../factories/smartProfileFactory';

describe('Orby Operations', () => {
  test('create cluster and build transfer ops', async () => {
    const profile = await SmartProfileFactory.create();
    await prisma.linkedAccount.create({
      data: {
        userId: profile.userId,
        profileId: profile.id,
        address: '0x' + '2'.repeat(40),
        authStrategy: 'wallet',
        walletType: 'metamask',
        isPrimary: true,
        chainId: 1
      }
    });

    let profileWith = await prisma.smartProfile.findUnique({
      where: { id: profile.id },
      include: { linkedAccounts: true }
    });

    const clusterId = await orbyService.createOrGetAccountCluster(profileWith!);
    expect(clusterId).toBe('cluster123');

    const updated = await prisma.smartProfile.findUnique({ where: { id: profile.id } });
    expect(updated?.orbyAccountClusterId).toBe('cluster123');

    profileWith = await prisma.smartProfile.findUnique({
      where: { id: profile.id },
      include: { linkedAccounts: true }
    });

    const ops = await orbyService.buildTransferOperation(profileWith!, {
      from: { token: '0xA0b86a33E6441a60142aEB9c1E89e8A5b3e8D8D4', chainId: 1, amount: '1' },
      to: { address: '0x' + '3'.repeat(40) }
    });
    expect(ops.status).toBe('SUCCESS');
  });
});
