export const CreateOperationsStatus = { SUCCESS: 'success' } as const;
export const QuoteType = { EXACT_INPUT: 'EXACT_INPUT' } as const;
export const ActivityStatus = { SUCCESSFUL: 'successful', FAILED: 'failed' } as const;
export class Account {
  static toAccount(data: any) { return data; }
}
export class AccountCluster {}
export interface Activity {}
export interface OnchainOperation {}
