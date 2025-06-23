export class OrbyProvider {
  constructor(public url: string) {}
  
  // Ethers provider methods
  async getNetwork() {
    return { chainId: 1, name: 'mainnet' };
  }
  
  async getTransactionCount(address: string) {
    return 0;
  }
  
  async getFeeData() {
    return {
      gasPrice: BigInt('20000000000'), // 20 gwei
      maxFeePerGas: BigInt('30000000000'), // 30 gwei
      maxPriorityFeePerGas: BigInt('1500000000') // 1.5 gwei
    };
  }
  
  async estimateGas(tx: any) {
    return BigInt('21000'); // Standard ETH transfer gas
  }
  
  async broadcastTransaction(signedTx: string) {
    return {
      hash: '0x' + 'f'.repeat(64),
      wait: async () => ({ status: 1 })
    };
  }
  
  // Orby-specific methods
  async createAccountCluster() {
    return { accountClusterId: 'cluster-123' };
  }
  
  async getVirtualNodeRpcUrl() {
    return 'http://virtual-node.test';
  }
  
  async getOperationsToExecuteTransaction(params: any) {
    return { 
      status: 'success', 
      intents: [], 
      estimatedTimeInMs: 1000 
    };
  }
  
  async sendOperationSet(operations: any) {
    return { 
      success: true, 
      operationSetId: 'opset-123' 
    };
  }
  
  subscribeToOperationSetStatus(id: string, callback: any) {
    // Simulate successful completion after 100ms
    setTimeout(() => {
      callback({ status: 'completed' });
    }, 100);
  }
  
  async getStandardizedTokenIds() {
    return ['usdc', 'usdt', 'dai'];
  }
  
  async getOperationsToSwap(params: any) {
    return { 
      status: 'success', 
      intents: [], 
      estimatedTimeInMs: 2000 
    };
  }
  
  async getFungibleTokenPortfolio(address: string) {
    return [];
  }
}