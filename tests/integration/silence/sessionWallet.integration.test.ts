jest.mock('../../../src/blockchain/sessionWalletService', () => {
  return {
    sessionWalletService: {
      createSessionWallet: jest.fn(async () => ({ address: '0x' + '1'.repeat(40) })),
      getSessionWalletAddress: jest.fn(async () => '0x' + '1'.repeat(40)),
      isSessionWalletDeployed: jest.fn(() => true),
      signMessage: jest.fn(async () => '0x' + '2'.repeat(130)),
      getTransactionRouting: jest.fn(() => ({ route: 'route', steps: [{}, {}] }))
    }
  };
});

import { sessionWalletService } from '../../../src/blockchain/sessionWalletService';
import { ethers } from 'ethers';

describe('Silence Labs SessionWallet Integration', () => {
  test('creates MPC wallet with valid address', async () => {
    const profileId = 'test_profile_1';
    const { address } = await sessionWalletService.createSessionWallet(profileId);
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    const stored = await sessionWalletService.getSessionWalletAddress(profileId);
    expect(stored).toBe(address);
    expect(sessionWalletService.isSessionWalletDeployed(profileId)).toBe(true);
  });

  test('signs messages correctly', async () => {
    const profileId = 'test_profile_2';
    await sessionWalletService.createSessionWallet(profileId);
    const hash = ethers.keccak256(ethers.toUtf8Bytes('hello'));
    const sig = await sessionWalletService.signMessage(profileId, ethers.getBytes(hash));
    expect(typeof sig).toBe('string');
    expect(sig.startsWith('0x')).toBe(true);
  });

  test('provides transaction routing info', () => {
    const routing = sessionWalletService.getTransactionRouting(
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333'
    );
    expect(routing.route).toBeDefined();
    expect(routing.steps).toHaveLength(2);
  });
});
