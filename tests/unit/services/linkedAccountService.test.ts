import { linkedAccountService } from '../../../src/services/linkedAccountService';
import { SmartProfileFactory } from '../../factories/smartProfileFactory';
import { UserFactory } from '../../factories/userFactory';
import { AuthorizationError } from '../../../src/types';
import { ethers } from 'ethers';

// Mock Orby service to avoid network calls
jest.mock('../../../src/services/orbyService', () => ({
  orbyService: {
    updateAccountCluster: jest.fn().mockResolvedValue(undefined),
  }
}));

describe('LinkedAccountService', () => {
  test('should link account with valid signature', async () => {
    const user = await UserFactory.create();
    const profile = await SmartProfileFactory.create({ userId: user.id });

    const wallet = ethers.Wallet.createRandom();
    const message = 'Sign in to Interspace';
    const signature = await wallet.signMessage(message);

    const account = await linkedAccountService.linkAccount(profile.id, user.id, {
      address: wallet.address,
      walletType: 'metamask',
      chainId: 1,
      signature,
      message,
    });

    expect(account.address).toBe(wallet.address.toLowerCase());
    expect(account.isPrimary).toBe(true);
  });

  test('should reject account with invalid signature', async () => {
    const user = await UserFactory.create();
    const profile = await SmartProfileFactory.create({ userId: user.id });

    const wallet = ethers.Wallet.createRandom();
    const message = 'Sign in to Interspace';
    const signature = await wallet.signMessage(message);

    // Sign with another wallet to produce invalid signature
    const otherWallet = ethers.Wallet.createRandom();
    const invalidSignature = await otherWallet.signMessage(message);

    await expect(
      linkedAccountService.linkAccount(profile.id, user.id, {
        address: wallet.address,
        walletType: 'metamask',
        chainId: 1,
        signature: invalidSignature,
        message,
      })
    ).rejects.toThrow(AuthorizationError);
  });
});
