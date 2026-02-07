/**
 * Base Agent Class
 * 
 * Abstract base class for all KalmanGuard agents
 */

import { ethers } from 'ethers';
import { ChainConfig, AgentRole } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('BaseAgent');

export interface AgentStatus {
  name: string;
  role: AgentRole;
  isHealthy: boolean;
  lastAction: number;
  actionCount: number;
  chains: string[];
  errors: string[];
}

export interface AgentReport {
  timestamp: number;
  agentName: string;
  role: AgentRole;
  data: Record<string, unknown>;
}

export abstract class BaseAgent {
  protected name: string;
  protected role: AgentRole;
  protected wallet: ethers.Wallet;
  protected providers: Map<string, ethers.JsonRpcProvider> = new Map();
  protected chains: ChainConfig[];
  protected isRunning: boolean = false;
  protected lastAction: number = 0;
  protected actionCount: number = 0;
  protected errors: string[] = [];
  protected updateInterval: number;

  constructor(
    name: string,
    role: AgentRole,
    privateKey: string,
    chains: ChainConfig[],
    updateInterval: number = 12000 // 12 seconds default
  ) {
    this.name = name;
    this.role = role;
    this.wallet = new ethers.Wallet(privateKey);
    this.chains = chains;
    this.updateInterval = updateInterval;

    // Initialize providers for each chain
    for (const chain of chains) {
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      this.providers.set(chain.name, provider);
    }
  }

  /**
   * Get provider for a specific chain
   */
  protected getProvider(chainName: string): ethers.JsonRpcProvider {
    const provider = this.providers.get(chainName);
    if (!provider) {
      throw new Error(`Provider not found for chain: ${chainName}`);
    }
    return provider;
  }

  /**
   * Get signer for a specific chain
   */
  protected getSigner(chainName: string): ethers.Wallet {
    const provider = this.getProvider(chainName);
    return this.wallet.connect(provider);
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    logger.info(`Starting agent: ${this.name} (${this.role})`);
    this.isRunning = true;
    
    try {
      await this.validateProviders();
      await this.initialize();
      this.runLoop();
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  private async validateProviders(): Promise<void> {
    const allowMainnet = String(process.env.ALLOW_MAINNET || '').toLowerCase() === 'true';

    for (const chain of this.chains) {
      const provider = this.providers.get(chain.name);
      if (!provider) throw new Error(`Provider not found for chain: ${chain.name}`);

      const network = await provider.getNetwork();
      const actualChainId = Number(network.chainId);

      if (actualChainId !== chain.id) {
        throw new Error(
          `RPC chainId mismatch for ${chain.name}: expected ${chain.id}, got ${actualChainId}. Check RPC_URL_* env vars.`
        );
      }

      // Safety: never allow accidental real ETH spending on mainnet unless explicitly opted-in.
      if (actualChainId === 1 && !allowMainnet) {
        throw new Error(
          `Refusing to run on Ethereum mainnet for safety. Set ALLOW_MAINNET=true to override.`
        );
      }
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    logger.info(`Stopping agent: ${this.name}`);
    this.isRunning = false;
    await this.cleanup();
  }

  /**
   * Main run loop
   */
  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.execute();
        this.lastAction = Date.now();
        this.actionCount++;
      } catch (error) {
        this.handleError(error as Error);
      }

      // Wait for next interval
      await this.sleep(this.updateInterval);
    }
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    const timeSinceLastAction = Date.now() - this.lastAction;
    const isHealthy = this.isRunning && timeSinceLastAction < this.updateInterval * 3;

    return {
      name: this.name,
      role: this.role,
      isHealthy,
      lastAction: this.lastAction,
      actionCount: this.actionCount,
      chains: this.chains.map((c) => c.name),
      errors: this.errors.slice(-10), // Last 10 errors
    };
  }

  /**
   * Handle errors
   */
  protected handleError(error: Error): void {
    const errorMsg = `[${new Date().toISOString()}] ${error.message}`;
    this.errors.push(errorMsg);
    
    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors.shift();
    }

    logger.error(`Agent ${this.name} error:`, error);
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract initialize(): Promise<void>;
  protected abstract execute(): Promise<void>;
  
  /**
   * Cleanup (optional override)
   */
  protected async cleanup(): Promise<void> {
    // Default: no-op
  }
  
  abstract report(): Promise<AgentReport>;
}
