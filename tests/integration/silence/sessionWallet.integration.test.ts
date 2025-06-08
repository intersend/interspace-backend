jest.mock('@com.silencelaboratories/two-party-ecdsa-js', () => {
  const keyShare = { publicKey: '0x' + '1'.repeat(40) };
  return {
    generateSessionId: jest.fn(async () => 'session'),
    P1Keygen: { init: jest.fn(async () => ({
      genMsg1: jest.fn(async () => 'msg1'),
      processMsg2: jest.fn(async () => [keyShare, 'msg3'])
    })) },
    P2Keygen: { init: jest.fn(async () => ({
      processMsg1: jest.fn(async () => 'msg2'),
      processMsg3: jest.fn(async () => 'share2')
    })) },
    P1Signer: { init: jest.fn(async () => ({
      genMsg1: jest.fn(async () => 'smsg1'),
      processMsg2: jest.fn(async () => ({ sign: 'signature' }))
    })) },
    P2Signer: { init: jest.fn(async () => ({
      processMsg1: jest.fn(async () => 'smsg2'),
      processMsg3: jest.fn(async () => 'signature')
    })) }
  };
}, { virtual: true });

jest.mock('sigpair-admin-v2', () => ({ SigpairAdmin: class {} }), { virtual: true });

process.env.SILENCE_ADMIN_TOKEN = 'test-admin-token';
process.env.SILENCE_NODE_URL = 'http://localhost:8080';
process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef';

import { sessionWalletService } from '../../../src/blockchain/sessionWalletService';

describe('Silence Labs Session Wallet', () => {
  test('creates wallet and signs messages', async () => {
    const { address } = await sessionWalletService.createSessionWallet('profile1');
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    const stored = await sessionWalletService.getSessionWalletAddress('profile1');
    expect(stored).toBe(address);
    expect(sessionWalletService.isSessionWalletDeployed('profile1')).toBe(true);
    const sig = await sessionWalletService.signMessage('profile1', new Uint8Array([1,2]));
    expect(sig).toBe('signature');

  });
});
