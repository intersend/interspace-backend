import { SessionWalletService } from '@/blockchain/sessionWalletService';
import { mpcKeyShareService } from '@/services/mpcKeyShareService';
import { orbyService } from '@/services/orbyService';
import { prisma } from '@/utils/database';
import { P1KeyGen, P2KeyGen, P1Signature, P2Signature, randBytes } from '@silencelaboratories/ecdsa-tss';
import { ethers } from 'ethers';
import { OrbyProvider } from '@orb-labs/orby-ethers6';

// Mock all dependencies
jest.mock('@/services/mpcKeyShareService');
jest.mock('@/services/orbyService');
jest.mock('@/utils/database');
jest.mock('@silencelaboratories/ecdsa-tss');
jest.mock('@orb-labs/orby-ethers6');

describe('SessionWalletService', () => {
  let service: SessionWalletService;
  let mockP1KeyGen: jest.Mocked<P1KeyGen>;
  let mockP2KeyGen: jest.Mocked<P2KeyGen>;
  let mockP1Signature: jest.Mocked<P1Signature>;
  let mockP2Signature: jest.Mocked<P2Signature>;
  let mockProvider: jest.Mocked<OrbyProvider>;

  beforeEach(() => {
    service = new SessionWalletService();
    jest.clearAllMocks();

    // Setup mock responses
    mockP1KeyGen = {
      init: jest.fn().mockResolvedValue(undefined),
      processMessage: jest.fn()
    } as any;

    mockP2KeyGen = {
      processMessage: jest.fn()
    } as any;

    mockP1Signature = {
      processMessage: jest.fn()
    } as any;

    mockP2Signature = {
      processMessage: jest.fn()
    } as any;

    mockProvider = {
      getTransactionCount: jest.fn().mockResolvedValue(0),
      getFeeData: jest.fn().mockResolvedValue({
        maxFeePerGas: BigInt(30000000000),
        maxPriorityFeePerGas: BigInt(2000000000)
      }),
      estimateGas: jest.fn().mockResolvedValue(BigInt(21000)),
      broadcastTransaction: jest.fn().mockResolvedValue({ hash: '0x123' })
    } as any;

    // Mock constructors
    (P1KeyGen as any).mockImplementation(() => mockP1KeyGen);
    (P2KeyGen as any).mockImplementation(() => mockP2KeyGen);
    (P1Signature as any).mockImplementation(() => mockP1Signature);
    (P2Signature as any).mockImplementation(() => mockP2Signature);
    (OrbyProvider as any).mockImplementation(() => mockProvider);
    
    // Mock randBytes
    (randBytes as jest.Mock).mockResolvedValue(Buffer.alloc(32));
  });

  describe('createSessionWallet', () => {
    it('should create a new MPC session wallet', async () => {
      const profileId = 'profile123';
      const clientShare = {
        public_key: '0x04' + '0'.repeat(128),
        p1_key_share: { /* mock data */ }
      };

      const mockMessages = {
        msg1: { msg_to_send: 'msg1' },
        msg2: { msg_to_send: 'msg2' },
        msg3: { msg_to_send: 'msg3' },
        msg4: { msg_to_send: 'msg4', p2_key_share: { /* server share */ } }
      };

      mockP1KeyGen.processMessage
        .mockResolvedValueOnce(mockMessages.msg1)
        .mockResolvedValueOnce(mockMessages.msg3);
      
      mockP2KeyGen.processMessage
        .mockResolvedValueOnce(mockMessages.msg2)
        .mockResolvedValueOnce(mockMessages.msg4);

      (mpcKeyShareService.updateKeyShare as jest.Mock).mockResolvedValue(true);

      const result = await service.createSessionWallet(profileId, clientShare);

      expect(result).toHaveProperty('address');
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(P1KeyGen).toHaveBeenCalled();
      expect(P2KeyGen).toHaveBeenCalled();
      expect(mpcKeyShareService.updateKeyShare).toHaveBeenCalledWith(profileId, mockMessages.msg4.p2_key_share);
    });

    it('should throw error if key generation fails', async () => {
      const profileId = 'profile123';
      const clientShare = {};

      mockP1KeyGen.processMessage.mockResolvedValue({ msg_to_send: 'msg1' });
      mockP2KeyGen.processMessage.mockResolvedValue({ msg_to_send: 'msg2' });

      await expect(service.createSessionWallet(profileId, clientShare)).rejects.toThrow('Failed to generate key shares');
    });
  });

  describe('rotateSessionWallet', () => {
    it('should rotate key shares while maintaining the same address', async () => {
      const profileId = 'profile123';
      const existingShare = {
        p1: { /* client share */ },
        p2: { /* server share */ },
        address: '0x1234567890123456789012345678901234567890'
      };

      (mpcKeyShareService.getKeyShare as jest.Mock).mockResolvedValue(existingShare.p2);

      // Mock key refresh
      (P1KeyGen.getInstanceForKeyRefresh as any) = jest.fn().mockReturnValue(mockP1KeyGen);
      (P2KeyGen.getInstanceForKeyRefresh as any) = jest.fn().mockReturnValue(mockP2KeyGen);

      const mockRefreshMessages = {
        msg1: { msg_to_send: 'refresh1' },
        msg2: { msg_to_send: 'refresh2' },
        msg3: { msg_to_send: 'refresh3', p1_key_share: { /* new client share */ } },
        msg4: { msg_to_send: 'refresh4', p2_key_share: { /* new server share */ } }
      };

      mockP1KeyGen.processMessage
        .mockResolvedValueOnce(mockRefreshMessages.msg1)
        .mockResolvedValueOnce(mockRefreshMessages.msg3);
      
      mockP2KeyGen.processMessage
        .mockResolvedValueOnce(mockRefreshMessages.msg2)
        .mockResolvedValueOnce(mockRefreshMessages.msg4);

      // Set up existing share
      (service as any).shares.set(profileId, existingShare);

      const result = await service.rotateSessionWallet(profileId);

      expect(result.clientShare).toBeDefined();
      expect(P1KeyGen.getInstanceForKeyRefresh).toHaveBeenCalledWith(expect.any(String), existingShare.p1);
      expect(P2KeyGen.getInstanceForKeyRefresh).toHaveBeenCalledWith(expect.any(String), existingShare.p2);
      expect(mpcKeyShareService.updateKeyShare).toHaveBeenCalledWith(profileId, mockRefreshMessages.msg4.p2_key_share);
    });

    it('should throw error if client share not loaded', async () => {
      const profileId = 'profile123';
      
      (mpcKeyShareService.getKeyShare as jest.Mock).mockResolvedValue({ /* server share */ });

      await expect(service.rotateSessionWallet(profileId)).rejects.toThrow('Client share not loaded for this profile');
    });
  });

  describe('signMessage', () => {
    it('should generate a valid signature using MPC', async () => {
      const profileId = 'profile123';
      const messageHash = new Uint8Array(32).fill(1);
      const expectedSignature = '0x' + '1'.repeat(130);

      const existingShare = {
        p1: { /* client share */ },
        p2: { /* server share */ },
        address: '0x1234567890123456789012345678901234567890'
      };

      (mpcKeyShareService.getKeyShare as jest.Mock).mockResolvedValue(existingShare.p2);
      (service as any).shares.set(profileId, existingShare);

      // Mock signature generation messages
      const mockSigMessages = {
        msg1: { msg_to_send: 'sig1' },
        msg2: { msg_to_send: 'sig2' },
        msg3: { msg_to_send: 'sig3' },
        msg4: { msg_to_send: 'sig4' },
        msg5: { msg_to_send: 'sig5', signature: expectedSignature },
        msg6: { msg_to_send: 'sig6', signature: expectedSignature }
      };

      mockP1Signature.processMessage
        .mockResolvedValueOnce(mockSigMessages.msg1)
        .mockResolvedValueOnce(mockSigMessages.msg3)
        .mockResolvedValueOnce(mockSigMessages.msg5);
      
      mockP2Signature.processMessage
        .mockResolvedValueOnce(mockSigMessages.msg2)
        .mockResolvedValueOnce(mockSigMessages.msg4)
        .mockResolvedValueOnce(mockSigMessages.msg6);

      const signature = await service.signMessage(profileId, messageHash);

      expect(signature).toBe(expectedSignature);
      expect(P1Signature).toHaveBeenCalledWith(expect.any(String), messageHash, existingShare.p1);
      expect(P2Signature).toHaveBeenCalledWith(expect.any(String), messageHash, existingShare.p2);
    });

    it('should throw error if signatures do not match', async () => {
      const profileId = 'profile123';
      const messageHash = new Uint8Array(32).fill(1);

      const existingShare = {
        p1: { /* client share */ },
        p2: { /* server share */ },
        address: '0x1234567890123456789012345678901234567890'
      };

      (mpcKeyShareService.getKeyShare as jest.Mock).mockResolvedValue(existingShare.p2);
      (service as any).shares.set(profileId, existingShare);

      // Mock mismatched signatures
      mockP1Signature.processMessage
        .mockResolvedValueOnce({ msg_to_send: 'sig1' })
        .mockResolvedValueOnce({ msg_to_send: 'sig3' })
        .mockResolvedValueOnce({ msg_to_send: 'sig5', signature: '0xabc123' });
      
      mockP2Signature.processMessage
        .mockResolvedValueOnce({ msg_to_send: 'sig2' })
        .mockResolvedValueOnce({ msg_to_send: 'sig4' })
        .mockResolvedValueOnce({ msg_to_send: 'sig6', signature: '0xdef456' });

      await expect(service.signMessage(profileId, messageHash)).rejects.toThrow('Signatures do not match');
    });
  });

  describe('executeTransaction', () => {
    it('should execute a transaction with MPC signature', async () => {
      const profileId = 'profile123';
      const targetAddress = '0xabcdef1234567890123456789012345678901234';
      const value = '1000000000000000000'; // 1 ETH
      const data = '0x';
      const chainId = 1;

      const existingShare = {
        p1: { /* client share */ },
        p2: { /* server share */ },
        address: '0x1234567890123456789012345678901234567890'
      };

      (mpcKeyShareService.getKeyShare as jest.Mock).mockResolvedValue(existingShare.p2);
      (service as any).shares.set(profileId, existingShare);
      
      (orbyService.getVirtualNodeRpcUrl as jest.Mock).mockResolvedValue('https://rpc.example.com');
      (prisma.smartProfile.findUnique as jest.Mock).mockResolvedValue({ id: profileId });
      (prisma.transaction.create as jest.Mock).mockResolvedValue({});

      // Mock signature generation
      const mockSignature = '0x' + '1'.repeat(130);
      jest.spyOn(service, 'signMessage').mockResolvedValue(mockSignature);

      const txHash = await service.executeTransaction(profileId, targetAddress, value, data, chainId);

      expect(txHash).toBe('0x123');
      expect(orbyService.getVirtualNodeRpcUrl).toHaveBeenCalledWith(expect.any(Object), chainId);
      expect(service.signMessage).toHaveBeenCalledWith(profileId, expect.any(Uint8Array));
      expect(mockProvider.broadcastTransaction).toHaveBeenCalled();
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId,
          hash: '0x123',
          chainId,
          fromAddress: existingShare.address,
          toAddress: targetAddress,
          value: BigInt(value),
          status: 'pending'
        })
      });
    });
  });

  describe('getSessionWalletAddress', () => {
    it('should return the wallet address for a profile', async () => {
      const profileId = 'profile123';
      const expectedAddress = '0x1234567890123456789012345678901234567890';

      (mpcKeyShareService.getKeyShare as jest.Mock).mockResolvedValue({
        public_key: '0x04' + '0'.repeat(128)
      });

      const address = await service.getSessionWalletAddress(profileId);

      expect(address).toBe(expectedAddress);
    });

    it('should throw error if key share not found', async () => {
      const profileId = 'profile123';
      
      (mpcKeyShareService.getKeyShare as jest.Mock).mockResolvedValue(null);

      await expect(service.getSessionWalletAddress(profileId)).rejects.toThrow('Key share not found');
    });
  });

  describe('publicKeyToAddress', () => {
    it('should convert public key to Ethereum address', () => {
      const publicKey = '0x04' + '1'.repeat(128);
      const address = (service as any).publicKeyToAddress(publicKey);

      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should handle public key without 0x prefix', () => {
      const publicKey = '04' + '1'.repeat(128);
      const address = (service as any).publicKeyToAddress(publicKey);

      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });
});