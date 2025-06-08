export class OrbyProvider {
  constructor(_url?: string) {}
  createAccountCluster = async () => ({ accountClusterId: 'stub' });
  getVirtualNodeRpcUrl = async () => 'http://stub';
  getOperationsToExecuteTransaction = async () => ({ status: 'success', intents: [], estimatedTimeInMs: 0 });
  sendOperationSet = async () => ({ success: true, operationSetId: 'stub' });
  subscribeToOperationSetStatus = (_id: string, _cb: any) => {};
  getStandardizedTokenIds = async () => ['token'];
  getOperationsToSwap = async () => ({ status: 'success', intents: [], estimatedTimeInMs: 0 });
  getFungibleTokenPortfolio = async () => [];
}
