jest.mock('@com.silencelaboratories/two-party-ecdsa-js', () => ({}));
jest.mock('sigpair-admin-v2', () => ({ SigpairAdmin: class {} }));

process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test';
process.env.JWT_REFRESH_SECRET = 'test';
process.env.ENCRYPTION_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SILENCE_ADMIN_TOKEN = 'test';
process.env.SILENCE_NODE_URL = 'http://localhost';
process.env.ORBY_INSTANCE_PRIVATE_API_KEY = 'test';
process.env.ORBY_INSTANCE_PUBLIC_API_KEY = 'test';
process.env.ORBY_PRIVATE_INSTANCE_URL = 'http://localhost';

import { SessionWalletService } from '../../src/blockchain/sessionWalletService';
const sessionWalletService = new SessionWalletService();

// Access private method for testing
const toAddress = (key: string) => (sessionWalletService as any).publicKeyToAddress(key);

describe('publicKeyToAddress', () => {
  const cases: Array<{ key: string; address: string }> = [
    {
      key: '0x047fb251454a0fdf1ad31f34f7e9cfdd86c7c71c66cfc635db4b79d295696f7cb66ad792e08b76ae217f1381ba9f292aa85828fa66d4eddd7799f5f81989155651',
      address: '0xf1d279e65fee6477f756c2f13833f0c0950ebede'
    },
    {
      key: '0x0490ec6bba36180ab3fc00a4863ed884756c8bbc128c7330b421c26586798879ef2e22fd52ccb8700f19487341899ba1adbf548aff08a92ab24d31e5fa90f4bacd',
      address: '0xab08a32b669e0e94a074da80e75aee68b7439b01'
    }
  ];

  test.each(cases)('derives address from public key', ({ key, address }) => {
    expect(toAddress(key)).toBe(address);
  });
});
