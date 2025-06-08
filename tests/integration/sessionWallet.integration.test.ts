process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'test-encryption-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.SILENCE_ADMIN_TOKEN = process.env.SILENCE_ADMIN_TOKEN || 'test-silence-token';
process.env.SILENCE_NODE_URL = process.env.SILENCE_NODE_URL || 'https://silence.node';
jest.mock('@com.silencelaboratories/two-party-ecdsa-js', () => {
  let counter = 0;
  return {
    generateSessionId: jest.fn(async () => `session-${counter++}`),
    P1Keygen: {
      init: jest.fn(async () => ({
        genMsg1: jest.fn(async () => 'msg1'),
        processMsg2: jest.fn(async () => [{ publicKey: '0'.repeat(40) + counter.toString().padStart(2,'0') }, 'msg3'])
      }))
    },
    P2Keygen: {
      init: jest.fn(async () => ({
        processMsg1: jest.fn(async () => 'msg2'),
        processMsg3: jest.fn(async () => ({ p2: true }))
      }))
    },
    P1Signer: { init: jest.fn() },
    P2Signer: { init: jest.fn() }
  };
});

import { sessionWalletService } from '../../src/blockchain/sessionWalletService';

describe('Silence Labs SessionWalletService', () => {
  test('creates a wallet and retrieves address', async () => {
    const { address } = await sessionWalletService.createSessionWallet('profile1');
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    const stored = await sessionWalletService.getSessionWalletAddress('profile1');
    expect(stored).toBe(address);
    expect(sessionWalletService.isSessionWalletDeployed('profile1')).toBe(true);
  });
});
