import { ethers, Network, FeeData, TransactionResponse } from 'ethers';

// Mock Orby SDK for tests
export class OrbyProvider extends ethers.JsonRpcProvider {
  constructor(url?: string) {
    super(url || 'http://localhost:8545');
  }
  
  // Mock implementations
  mockOperationSetId = 'mock-operation-set-id';
  mockOperations: any[] = [];
  
  // Add mock data
  setMockOperations(operations: any[]) {
    this.mockOperations = operations;
  }
  
  // Mock RPC method
  override async send(method: string, params: any[]): Promise<any> {
    if (method === 'orbsim_createOperations') {
      return {
        status: 'SUCCESS',
        operationSetId: this.mockOperationSetId,
        operations: this.mockOperations || [{
          chainId: 1,
          address: '0x' + '1'.repeat(40),
          userOperations: []
        }]
      };
    }
    
    if (method === 'orbsim_submitOperations') {
      return {
        success: true,
        operationSetId: params[0]
      };
    }
    
    if (method === 'orbsim_getOperationStatus') {
      return {
        status: 'CONFIRMED',
        operationSetId: params[0],
        operations: [{
          status: 'CONFIRMED',
          transactionHash: '0x' + 'a'.repeat(64)
        }]
      };
    }
    
    // Default to parent implementation
    return super.send(method, params);
  }
  
  // Override some ethers methods for testing
  override async getNetwork(): Promise<Network> {
    return Network.from({ chainId: 1, name: 'mainnet' });
  }
  
  override async getTransactionCount(address: string): Promise<number> {
    return 0;
  }
  
  override async getFeeData(): Promise<FeeData> {
    const feeData = new FeeData(
      BigInt('20000000000'), // gasPrice: 20 gwei
      BigInt('30000000000'), // maxFeePerGas: 30 gwei
      BigInt('1500000000')   // maxPriorityFeePerGas: 1.5 gwei
    );
    return feeData;
  }
  
  override async estimateGas(tx: any): Promise<bigint> {
    return BigInt('21000'); // Standard ETH transfer gas
  }
  
  override async broadcastTransaction(signedTx: string): Promise<TransactionResponse> {
    // Create a mock transaction response
    const mockTx = {
      hash: '0x' + 'f'.repeat(64),
      blockNumber: 1000000,
      blockHash: '0x' + 'b'.repeat(64),
      timestamp: Math.floor(Date.now() / 1000),
      confirmations: 1,
      from: '0x' + '1'.repeat(40),
      wait: async (confirmations?: number) => ({
        status: 1,
        blockNumber: 1000000,
        blockHash: '0x' + 'b'.repeat(64),
        timestamp: Math.floor(Date.now() / 1000),
        confirmations: confirmations || 1,
        from: '0x' + '1'.repeat(40),
        to: '0x' + '2'.repeat(40),
        contractAddress: null,
        transactionIndex: 0,
        gasUsed: BigInt('21000'),
        logsBloom: '0x',
        transactionHash: '0x' + 'f'.repeat(64),
        logs: [],
        cumulativeGasUsed: BigInt('21000'),
        effectiveGasPrice: BigInt('20000000000'),
        type: 2
      })
    };
    
    return mockTx as any;
  }
}

// Mock the create operations function
export const createTransferOperations = jest.fn().mockResolvedValue({
  status: 'SUCCESS',
  intents: [{
    type: 'TRANSFER',
    from: { address: '0x' + '1'.repeat(40), chainId: 1 },
    to: { address: '0x' + '2'.repeat(40) }
  }],
  estimatedTimeInMs: 5000,
  operationSetId: 'mock-op-set-id'
});

export const createSwapOperations = jest.fn().mockResolvedValue({
  status: 'SUCCESS',
  intents: [{
    type: 'SWAP',
    from: { token: 'ETH', chainId: 1 },
    to: { token: 'USDC', chainId: 1 }
  }],
  estimatedTimeInMs: 10000,
  operationSetId: 'mock-swap-op-set-id'
});

export const submitOperations = jest.fn().mockResolvedValue({
  success: true,
  operationSetId: 'mock-op-set-id'
});

export const getOperationStatus = jest.fn().mockResolvedValue({
  status: 'CONFIRMED',
  operations: [{
    status: 'CONFIRMED',
    transactionHash: '0x' + 'a'.repeat(64)
  }]
});

// Mock token portfolio
export const getFungibleTokenPortfolio = jest.fn().mockResolvedValue([
  {
    standardizedTokenId: 'eth',
    total: { toRawAmount: () => ({ toString: () => '1000000000000000000' }) }, // 1 ETH
    tokenBalances: [{
      token: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        chainId: '1',
        address: '0x0000000000000000000000000000000000000000'
      },
      toRawAmount: () => ({ toString: () => '1000000000000000000' })
    }]
  }
]);

// Mock account cluster
export const getOrCreateCluster = jest.fn().mockResolvedValue({
  accountClusterId: 'mock-cluster-id'
});

export const addAccountsToCluster = jest.fn().mockResolvedValue({
  success: true
});

// Export everything that might be imported
export default {
  OrbyProvider,
  createTransferOperations,
  createSwapOperations,
  submitOperations,
  getOperationStatus,
  getFungibleTokenPortfolio,
  getOrCreateCluster,
  addAccountsToCluster
};