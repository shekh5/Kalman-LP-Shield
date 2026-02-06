/**
 * Execution Agent
 * 
 * Executes transactions with privacy protection using Flashbots
 * and other private mempool services.
 */

import { ethers } from 'ethers';
import { BaseAgent, AgentReport } from './BaseAgent';
import { ChainConfig, AgentRole } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('ExecutionAgent');

export interface ExecutionRequest {
  id: string;
  chainName: string;
  to: string;
  data: string;
  value: bigint;
  gasLimit: bigint;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  usePrivate: boolean;
  deadline: number;
  callback?: (result: ExecutionResult) => void;
}

export interface ExecutionResult {
  requestId: string;
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
  error?: string;
  timestamp: number;
}

export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  privateExecutions: number;
  averageGasUsed: bigint;
  averageLatency: number;
}

export class ExecutionAgent extends BaseAgent {
  private pendingRequests: Map<string, ExecutionRequest> = new Map();
  private executionHistory: ExecutionResult[] = [];
  private flashbotsProviders: Map<string, ethers.JsonRpcProvider> = new Map();
  private stats: ExecutionStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    privateExecutions: 0,
    averageGasUsed: 0n,
    averageLatency: 0,
  };

  private readonly maxHistorySize = 1000;
  private readonly flashbotsRpc = 'https://relay.flashbots.net';

  constructor(
    privateKey: string,
    chains: ChainConfig[],
    updateInterval: number = 1000
  ) {
    super('execution-agent', AgentRole.EXECUTOR, privateKey, chains, updateInterval);
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing Execution Agent');

    // Initialize Flashbots providers for supported chains
    for (const chain of this.chains) {
      if (chain.id === 1) {
        // Mainnet - use Flashbots
        const flashbotsProvider = new ethers.JsonRpcProvider(this.flashbotsRpc);
        this.flashbotsProviders.set(chain.name, flashbotsProvider);
      }
    }

    logger.info(`Initialized Flashbots for ${this.flashbotsProviders.size} chains`);
  }

  protected async execute(): Promise<void> {
    // Process pending requests
    const now = Date.now();
    
    for (const [id, request] of this.pendingRequests) {
      // Check if deadline passed
      if (now > request.deadline) {
        this.completeRequest(id, {
          requestId: id,
          success: false,
          error: 'Deadline exceeded',
          timestamp: now,
        });
        continue;
      }

      // Execute the request
      try {
        const result = await this.executeRequest(request);
        this.completeRequest(id, result);
      } catch (error) {
        logger.error(`Execution failed for ${id}:`, error);
        this.completeRequest(id, {
          requestId: id,
          success: false,
          error: (error as Error).message,
          timestamp: now,
        });
      }
    }
  }

  /**
   * Submit a transaction for execution
   */
  async submit(request: ExecutionRequest): Promise<string> {
    this.pendingRequests.set(request.id, request);
    logger.info(`Queued execution request ${request.id}, priority: ${request.priority}`);
    return request.id;
  }

  /**
   * Execute a single request
   */
  private async executeRequest(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    if (request.usePrivate && this.flashbotsProviders.has(request.chainName)) {
      return this.executePrivate(request, startTime);
    } else {
      return this.executePublic(request, startTime);
    }
  }

  /**
   * Execute via Flashbots (private mempool)
   */
  private async executePrivate(
    request: ExecutionRequest,
    startTime: number
  ): Promise<ExecutionResult> {
    logger.info(`Executing privately via Flashbots: ${request.id}`);
    
    const signer = this.getSigner(request.chainName);
    const provider = this.getProvider(request.chainName);
    
    try {
      // Get current block number
      const blockNumber = await provider.getBlockNumber();
      
      // Create transaction
      const tx: ethers.TransactionRequest = {
        to: request.to,
        data: request.data,
        value: request.value,
        gasLimit: request.gasLimit,
        type: 2, // EIP-1559
      };

      // Get gas price
      const feeData = await provider.getFeeData();
      tx.maxFeePerGas = feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      tx.nonce = await provider.getTransactionCount(await signer.getAddress());

      // Sign transaction
      const signedTx = await signer.signTransaction(tx);

      // Create Flashbots bundle
      // Note: In production, use @flashbots/ethers-provider-bundle
      const bundle = {
        signedTransactions: [signedTx],
        blockNumber: blockNumber + 1,
      };

      // Submit to Flashbots
      const flashbotsProvider = this.flashbotsProviders.get(request.chainName)!;
      
      // Simplified Flashbots submission
      // In production, use proper Flashbots SDK
      const response = await flashbotsProvider.send('eth_sendBundle', [
        {
          txs: bundle.signedTransactions,
          blockNumber: `0x${bundle.blockNumber.toString(16)}`,
        },
      ]);

      const latency = Date.now() - startTime;
      this.updateStats(true, true, request.gasLimit, latency);

      return {
        requestId: request.id,
        success: true,
        txHash: response.bundleHash || ethers.keccak256(signedTx),
        blockNumber: bundle.blockNumber,
        gasUsed: request.gasLimit,
        timestamp: Date.now(),
      };
    } catch (error) {
      // Fallback to public execution
      logger.warn(`Flashbots failed, falling back to public: ${(error as Error).message}`);
      return this.executePublic(request, startTime);
    }
  }

  /**
   * Execute via public mempool
   */
  private async executePublic(
    request: ExecutionRequest,
    startTime: number
  ): Promise<ExecutionResult> {
    logger.info(`Executing publicly: ${request.id}`);
    
    const signer = this.getSigner(request.chainName);
    
    try {
      const tx = await signer.sendTransaction({
        to: request.to,
        data: request.data,
        value: request.value,
        gasLimit: request.gasLimit,
      });

      const receipt = await tx.wait();
      const latency = Date.now() - startTime;

      this.updateStats(true, false, receipt?.gasUsed || 0n, latency);

      return {
        requestId: request.id,
        success: receipt?.status === 1,
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed,
        timestamp: Date.now(),
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateStats(false, false, 0n, latency);
      
      throw error;
    }
  }

  /**
   * Complete a request and notify callback
   */
  private completeRequest(id: string, result: ExecutionResult): void {
    const request = this.pendingRequests.get(id);
    this.pendingRequests.delete(id);

    // Store in history
    this.executionHistory.push(result);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }

    // Notify callback
    if (request?.callback) {
      request.callback(result);
    }

    if (result.success) {
      logger.info(`Execution ${id} completed: tx=${result.txHash}`);
    } else {
      logger.warn(`Execution ${id} failed: ${result.error}`);
    }
  }

  /**
   * Update execution statistics
   */
  private updateStats(
    success: boolean,
    isPrivate: boolean,
    gasUsed: bigint,
    latency: number
  ): void {
    this.stats.totalExecutions++;
    
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    
    if (isPrivate) {
      this.stats.privateExecutions++;
    }

    // Update average gas
    if (gasUsed > 0n) {
      const totalGas = this.stats.averageGasUsed * BigInt(this.stats.totalExecutions - 1) + gasUsed;
      this.stats.averageGasUsed = totalGas / BigInt(this.stats.totalExecutions);
    }

    // Update average latency
    this.stats.averageLatency = 
      (this.stats.averageLatency * (this.stats.totalExecutions - 1) + latency) / 
      this.stats.totalExecutions;
  }

  /**
   * Get execution statistics
   */
  getStats(): ExecutionStats {
    return { ...this.stats };
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): ExecutionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Get execution history
   */
  getHistory(limit: number = 100): ExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Cancel a pending request
   */
  cancel(requestId: string): boolean {
    if (this.pendingRequests.has(requestId)) {
      this.pendingRequests.delete(requestId);
      return true;
    }
    return false;
  }

  protected async cleanup(): Promise<void> {
    // Cancel all pending requests
    for (const [id, request] of this.pendingRequests) {
      if (request.callback) {
        request.callback({
          requestId: id,
          success: false,
          error: 'Agent shutting down',
          timestamp: Date.now(),
        });
      }
    }
    this.pendingRequests.clear();
    logger.info('Execution Agent cleaned up');
  }

  async report(): Promise<AgentReport> {
    return {
      timestamp: Date.now(),
      agentName: this.name,
      role: this.role,
      data: {
        stats: this.stats,
        pendingCount: this.pendingRequests.size,
        historySize: this.executionHistory.length,
        recentExecutions: this.executionHistory.slice(-10),
      },
    };
  }
}
