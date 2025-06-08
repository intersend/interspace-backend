process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'test-encryption-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.SILENCE_ADMIN_TOKEN = process.env.SILENCE_ADMIN_TOKEN || 'test-silence-token';
process.env.SILENCE_NODE_URL = process.env.SILENCE_NODE_URL || 'https://silence.node';
jest.mock('@orb-labs/orby-ethers6', () => {
  return {
    OrbyProvider: jest.fn().mockImplementation(() => ({
      createAccountCluster: jest.fn(async () => ({ accountClusterId: 'cluster_test' })),
      getVirtualNodeRpcUrl: jest.fn(async () => 'http://node.rpc'),
      getOperationsToExecuteTransaction: jest.fn(async () => ({ status: 'success', intents: [{}], estimatedTimeInMs: 1000 })),
      sendOperationSet: jest.fn(async () => ({ success: true, operationSetId: 'op_set' })),
      subscribeToOperationSetStatus: jest.fn((id, cb) => cb({ overallStatus: 'successful', operations: [] })),
      getStandardizedTokenIds: jest.fn(async () => ['token1', 'token2']),
      getOperationsToSwap: jest.fn(async () => ({ status: 'success', intents: [{}], estimatedTimeInMs: 1000 })),
      getFungibleTokenPortfolio: jest.fn(async () => [])
    }))
  };
});

jest.mock('@orb-labs/orby-core', () => {
  return {
    Account: { toAccount: (d: any) => d },
    QuoteType: { EXACT_INPUT: 'EXACT_INPUT' },
    CreateOperationsStatus: { SUCCESS: 'success' },
    ActivityStatus: { SUCCESSFUL: 'successful', FAILED: 'failed' }
  };
});

import { orbyService } from '../../src/services/orbyService';
import { SmartProfileFactory } from '../factories/smartProfileFactory';
import { prisma } from '../../src/utils/database';

describe('OrbyService operations', () => {
  test('builds transfer operation with virtual node', async () => {
    const profile: any = {
      id: 'test-profile',
      sessionWalletAddress: '0x' + '1'.repeat(40),
      orbyAccountClusterId: 'cluster_test',
      linkedAccounts: []
    };

    jest.spyOn(prisma.orbyVirtualNode, 'upsert').mockResolvedValue({
      id: '1', profileId: profile.id, chainId: 1, rpcUrl: 'http', address: profile.sessionWalletAddress, isActive: true, createdAt: new Date()
    } as any);

    const op = await orbyService.buildTransferOperation(
      profile,
      { from: { token: '0xToken', chainId: 1, amount: '1' }, to: { address: '0x' + '1'.repeat(40) } }
    );
    expect(op.status).toBe('success');
  });
});
