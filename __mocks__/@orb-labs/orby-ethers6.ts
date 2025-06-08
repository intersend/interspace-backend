export class OrbyProvider {
  createAccountCluster = jest.fn().mockResolvedValue({ accountClusterId: 'cluster123' });
  getVirtualNodeRpcUrl = jest.fn().mockResolvedValue('http://rpc.test');
  getStandardizedTokenIds = jest.fn().mockResolvedValue(['id1', 'id2']);
  getOperationsToExecuteTransaction = jest.fn().mockResolvedValue({ status: 'SUCCESS', intents: [] });
  getOperationsToSwap = jest.fn();
  sendOperationSet = jest.fn();
  subscribeToOperationSetStatus = jest.fn();
}
