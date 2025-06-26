import { prisma } from '@/utils/database';
import { orbyService } from './orbyService';
import { cacheService } from './cacheService';
import { NotFoundError, ValidationError, AppError } from '@/types';
import { SmartProfile, BatchOperation, Prisma } from '@prisma/client';
import { CreateOperationsStatus } from '@orb-labs/orby-core';
// import { auditLogService } from './auditLogService'; // TODO: Implement audit log service
// import { io } from '@/index'; // TODO: Fix socket.io export

interface BatchOperationIntent {
  type: 'transfer' | 'swap';
  from: {
    token: string;
    chainId: number;
    amount: string;
  };
  to: {
    address?: string; // for transfer
    token?: string;   // for swap
    chainId?: number;
  };
  gasToken?: {
    standardizedTokenId: string;
    tokenSources?: { chainId: bigint; address?: string }[];
  };
}

interface BatchIntentRequest {
  operations: BatchOperationIntent[];
  atomicExecution?: boolean;
  metadata?: any;
}

interface BatchOperationResponse {
  batchId: string;
  operations: Array<{
    index: number;
    type: string;
    status: 'created' | 'failed';
    operationSetId?: string;
    unsignedOperations?: any;
    error?: string;
  }>;
  atomicExecution: boolean;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
}

interface SignedOperation {
  index: number;
  operationSetId: string;
  signature?: string;
  signedData?: string;
}

interface BatchExecutionResult {
  batchId: string;
  status: 'submitted' | 'partial' | 'failed';
  submittedOperations: number;
  failedOperations: number;
  operations: Array<{
    index: number;
    operationSetId: string;
    status: 'submitted' | 'failed';
    error?: string;
  }>;
}

interface BatchStatus {
  batchId: string;
  status: string;
  operations: any[];
  createdAt: Date;
  completedAt?: Date;
  atomicExecution: boolean;
  results?: any;
}

class BatchOperationService {
  /**
   * Create a batch of operations
   */
  async createBatchIntent(
    profileId: string,
    batchRequest: BatchIntentRequest
  ): Promise<BatchOperationResponse> {
    // Get profile with orby cluster
    const profile = await prisma.smartProfile.findUnique({
      where: { id: profileId },
      include: { linkedAccounts: true }
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    if (!batchRequest.operations || batchRequest.operations.length === 0) {
      throw new ValidationError('At least one operation is required');
    }

    if (batchRequest.operations.length > 10) {
      throw new ValidationError('Maximum 10 operations allowed per batch');
    }

    // Generate batch ID
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Process each operation
    const processedOperations = [];
    let successfulOperations = 0;
    let failedOperations = 0;

    for (let i = 0; i < batchRequest.operations.length; i++) {
      const operation = batchRequest.operations[i];
      if (!operation) continue;
      
      try {
        let unsignedOps;
        let operationSetId;

        if (operation.type === 'transfer') {
          unsignedOps = await orbyService.buildTransferOperation(
            profile,
            {
              from: operation.from,
              to: { address: operation.to.address! }
            },
            operation.gasToken
          );
        } else if (operation.type === 'swap') {
          unsignedOps = await orbyService.buildSwapOperation(
            profile,
            {
              from: operation.from,
              to: {
                token: operation.to.token!,
                chainId: operation.to.chainId || operation.from.chainId
              }
            },
            operation.gasToken
          );
        } else {
          throw new ValidationError(`Invalid operation type: ${operation.type}`);
        }

        if (!unsignedOps || unsignedOps.status !== CreateOperationsStatus.SUCCESS) {
          throw new AppError('Failed to create operation');
        }

        // Generate operation set ID for this specific operation
        operationSetId = `${batchId}_op${i}_${Date.now()}`;

        // Store the operation
        await prisma.orbyOperation.create({
          data: {
            profileId,
            operationSetId,
            type: operation.type,
            status: 'created',
            unsignedPayload: JSON.stringify(unsignedOps),
            metadata: JSON.stringify({
              batchId,
              operationIndex: i,
              ...operation
            })
          }
        });

        processedOperations.push({
          index: i,
          type: operation.type,
          status: 'created' as const,
          operationSetId,
          unsignedOperations: unsignedOps
        });
        successfulOperations++;
      } catch (error) {
        processedOperations.push({
          index: i,
          type: operation.type,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failedOperations++;

        // If atomic execution is required and any operation fails, stop processing
        if (batchRequest.atomicExecution) {
          break;
        }
      }
    }

    // If atomic execution and any operation failed, mark all as failed
    if (batchRequest.atomicExecution && failedOperations > 0) {
      // Clean up any created operations
      await prisma.orbyOperation.deleteMany({
        where: {
          metadata: {
            contains: batchId
          }
        }
      });

      throw new AppError(
        `Batch operation failed: ${failedOperations} operations could not be created`,
        400
      );
    }

    // Store batch operation record
    const batchOperation = await prisma.batchOperation.create({
      data: {
        profileId,
        batchId,
        status: failedOperations > 0 ? 'partial' : 'created',
        operations: processedOperations as Prisma.InputJsonValue,
        atomicExecution: batchRequest.atomicExecution || false,
        metadata: batchRequest.metadata
      }
    });

    // TODO: Log batch creation when audit log service is implemented
    // await auditLogService.log({
    //   userId: profile.userId,
    //   profileId,
    //   action: 'BATCH_OPERATION_CREATED',
    //   resource: 'BatchOperation',
    //   details: {
    //     batchId,
    //     totalOperations: batchRequest.operations.length,
    //     successfulOperations,
    //     failedOperations,
    //     atomicExecution: batchRequest.atomicExecution
    //   }
    // });

    return {
      batchId,
      operations: processedOperations,
      atomicExecution: batchRequest.atomicExecution || false,
      totalOperations: batchRequest.operations.length,
      successfulOperations,
      failedOperations
    };
  }

  /**
   * Execute batch with signed operations
   */
  async executeBatch(
    batchId: string,
    signedOperations: SignedOperation[]
  ): Promise<BatchExecutionResult> {
    // Get batch operation
    const batchOperation = await prisma.batchOperation.findUnique({
      where: { batchId },
      include: { profile: true }
    });

    if (!batchOperation) {
      throw new NotFoundError('Batch operation not found');
    }

    if (batchOperation.status !== 'created' && batchOperation.status !== 'partial') {
      throw new ValidationError('Batch has already been processed');
    }

    const operations = batchOperation.operations as any[];
    const results = [];
    let submittedCount = 0;
    let failedCount = 0;

    // Process each signed operation
    for (const signedOp of signedOperations) {
      const operation = operations.find(op => op.operationSetId === signedOp.operationSetId);
      
      if (!operation) {
        results.push({
          index: signedOp.index,
          operationSetId: signedOp.operationSetId,
          status: 'failed' as const,
          error: 'Operation not found in batch'
        });
        failedCount++;
        continue;
      }

      try {
        // Submit to Orby
        const result = await orbyService.submitSignedOperations(
          signedOp.operationSetId,
          [{
            index: 0, // Single operation within the set
            signature: signedOp.signature || '',
            signedData: signedOp.signedData
          }]
        );

        if (result.success) {
          results.push({
            index: signedOp.index,
            operationSetId: signedOp.operationSetId,
            status: 'submitted' as const
          });
          submittedCount++;
        } else {
          throw new Error('Submission failed');
        }
      } catch (error) {
        results.push({
          index: signedOp.index,
          operationSetId: signedOp.operationSetId,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failedCount++;

        // If atomic execution, stop on first failure
        if (batchOperation.atomicExecution) {
          break;
        }
      }
    }

    // Determine overall status
    let status: 'submitted' | 'partial' | 'failed';
    if (failedCount === 0) {
      status = 'submitted';
    } else if (submittedCount > 0) {
      status = 'partial';
    } else {
      status = 'failed';
    }

    // Update batch operation status
    await prisma.batchOperation.update({
      where: { id: batchOperation.id },
      data: {
        status,
        results,
        updatedAt: new Date()
      }
    });

    // TODO: Emit real-time update when socket.io is properly exported
    // io.to(`profile:${batchOperation.profileId}`).emit('batch_operation_update', {
    //   batchId,
    //   status,
    //   submittedCount,
    //   failedCount,
    //   timestamp: new Date().toISOString()
    // });

    // TODO: Log execution when audit log service is implemented
    // await auditLogService.log({
    //   userId: batchOperation.profile.userId,
    //   profileId: batchOperation.profileId,
    //   action: 'BATCH_OPERATION_EXECUTED',
    //   resource: 'BatchOperation',
    //   details: {
    //     batchId,
    //     status,
    //     submittedCount,
    //     failedCount
    //   }
    // });

    return {
      batchId,
      status,
      submittedOperations: submittedCount,
      failedOperations: failedCount,
      operations: results
    };
  }

  /**
   * Get batch operation status
   */
  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const batchOperation = await prisma.batchOperation.findUnique({
      where: { batchId }
    });

    if (!batchOperation) {
      throw new NotFoundError('Batch operation not found');
    }

    // Get status of individual operations
    const operationSetIds = (batchOperation.operations as any[])
      .map(op => op.operationSetId)
      .filter(Boolean);

    const orbyOperations = await prisma.orbyOperation.findMany({
      where: {
        operationSetId: { in: operationSetIds }
      },
      include: {
        transactions: true
      }
    });

    // Map operation statuses
    const operations = (batchOperation.operations as any[]).map(op => {
      const orbyOp = orbyOperations.find(o => o.operationSetId === op.operationSetId);
      
      return {
        ...op,
        currentStatus: orbyOp?.status || op.status,
        transactions: orbyOp?.transactions || []
      };
    });

    // Determine overall batch status
    const allCompleted = operations.every(op => 
      ['successful', 'failed'].includes(op.currentStatus)
    );
    
    const anyFailed = operations.some(op => 
      op.currentStatus === 'failed'
    );

    let overallStatus = batchOperation.status;
    if (allCompleted) {
      overallStatus = anyFailed ? 'failed' : 'completed';
      
      // Update batch status if changed
      if (overallStatus !== batchOperation.status) {
        await prisma.batchOperation.update({
          where: { id: batchOperation.id },
          data: {
            status: overallStatus,
            completedAt: new Date()
          }
        });
      }
    }

    return {
      batchId: batchOperation.batchId,
      status: overallStatus,
      operations,
      createdAt: batchOperation.createdAt,
      completedAt: batchOperation.completedAt || undefined,
      atomicExecution: batchOperation.atomicExecution,
      results: batchOperation.results
    };
  }

  /**
   * Handle partial failure recovery
   */
  async handlePartialFailure(
    batchId: string,
    failedIndices: number[]
  ): Promise<{
    retryableOperations: any[];
    permanentFailures: any[];
  }> {
    const batchOperation = await prisma.batchOperation.findUnique({
      where: { batchId }
    });

    if (!batchOperation) {
      throw new NotFoundError('Batch operation not found');
    }

    const operations = batchOperation.operations as any[];
    const retryableOperations = [];
    const permanentFailures = [];

    for (const index of failedIndices) {
      const operation = operations[index];
      if (!operation) continue;

      // Analyze failure reason
      const canRetry = await this.canRetryOperation(operation);
      
      if (canRetry) {
        retryableOperations.push(operation);
      } else {
        permanentFailures.push(operation);
      }
    }

    return {
      retryableOperations,
      permanentFailures
    };
  }

  /**
   * Retry failed operations in a batch
   */
  async retryFailedOperations(
    batchId: string,
    operationIndices?: number[]
  ): Promise<BatchOperationResponse> {
    const batchOperation = await prisma.batchOperation.findUnique({
      where: { batchId },
      include: { profile: true }
    });

    if (!batchOperation) {
      throw new NotFoundError('Batch operation not found');
    }

    const operations = batchOperation.operations as any[];
    const operationsToRetry = operationIndices 
      ? operations.filter((_, idx) => operationIndices.includes(idx))
      : operations.filter(op => op.status === 'failed');

    if (operationsToRetry.length === 0) {
      throw new ValidationError('No failed operations to retry');
    }

    // Create new batch intent with failed operations
    const retryRequest: BatchIntentRequest = {
      operations: operationsToRetry.map(op => ({
        type: op.type,
        from: op.from,
        to: op.to,
        gasToken: op.gasToken
      })),
      atomicExecution: false, // Don't use atomic for retries
      metadata: {
        originalBatchId: batchId,
        isRetry: true
      }
    };

    return this.createBatchIntent(batchOperation.profileId, retryRequest);
  }

  /**
   * Private helper to determine if an operation can be retried
   */
  private async canRetryOperation(operation: any): Promise<boolean> {
    // Check common retryable conditions
    const retryableErrors = [
      'insufficient balance',
      'network error',
      'timeout',
      'gas estimation failed'
    ];

    const error = operation.error?.toLowerCase() || '';
    return retryableErrors.some(retryable => error.includes(retryable));
  }
}

export const batchOperationService = new BatchOperationService();