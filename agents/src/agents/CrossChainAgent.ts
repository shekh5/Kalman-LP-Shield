/**
 * Cross-Chain Agent
 * 
 * Manages cross-chain liquidity operations using LI.FI SDK
 * for optimal routing and bridging.
 */

import { ethers } from 'ethers';
import axios from 'axios';
import { BaseAgent, AgentReport } from './BaseAgent';
import { ChainConfig, AgentRole, PRECISION } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('CrossChainAgent');

// LI.FI API endpoints
const LIFI_API = 'https://li.quest/v1';

export interface ChainRisk {
  chainId: number;
  chainName: string;
  riskScore: number;
  poolCount: number;
  totalLiquidity: bigint;
}

export interface BridgeRoute {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  bridgeProtocol: string;
  steps: RouteStep[];
}

export interface RouteStep {
  type: 'swap' | 'bridge' | 'cross';
  tool: string;
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
}

export interface RebalanceResult {
  success: boolean;
  sourceChain: string;
  targetChain: string;
  amount: bigint;
  txHashes: string[];
  bridgeProtocol: string;
  timestamp: number;
}

export interface LiquidityPosition {
  chainId: number;
  chainName: string;
  poolAddress: string;
  token0: string;
  token1: string;
  liquidity: bigint;
  valueUSD: number;
  riskScore: number;
}

export class CrossChainAgent extends BaseAgent {
  private chainRisks: Map<number, ChainRisk> = new Map();
  private positions: LiquidityPosition[] = [];
  private rebalanceHistory: RebalanceResult[] = [];
  private lifiApiKey: string;
  private readonly maxRebalanceHistory = 100;
  private readonly riskThreshold = 7000; // 70% risk triggers rebalance

  constructor(
    privateKey: string,
    chains: ChainConfig[],
    lifiApiKey: string,
    updateInterval: number = 60000 // 1 minute
  ) {
    super('cross-chain-agent', AgentRole.CROSS_CHAIN, privateKey, chains, updateInterval);
    this.lifiApiKey = lifiApiKey;
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing Cross-Chain Agent');

    // Initialize chain risks
    for (const chain of this.chains) {
      this.chainRisks.set(chain.id, {
        chainId: chain.id,
        chainName: chain.name,
        riskScore: 0,
        poolCount: 0,
        totalLiquidity: 0n,
      });
    }

    // Fetch initial positions
    await this.fetchPositions();

    logger.info(`Initialized with ${this.positions.length} positions across ${this.chains.length} chains`);
  }

  protected async execute(): Promise<void> {
    try {
      // Update chain risks
      await this.updateChainRisks();

      // Check for rebalancing opportunities
      await this.checkRebalancing();

    } catch (error) {
      logger.error('Cross-chain execution error:', error);
    }
  }

  /**
   * Update risk scores for all chains
   */
  private async updateChainRisks(): Promise<void> {
    for (const chain of this.chains) {
      try {
        // Aggregate pool risks on this chain
        const chainPositions = this.positions.filter((p) => p.chainId === chain.id);
        
        if (chainPositions.length === 0) continue;

        const avgRisk = chainPositions.reduce((sum, p) => sum + p.riskScore, 0) / chainPositions.length;
        const totalLiquidity = chainPositions.reduce((sum, p) => sum + p.liquidity, 0n);

        const chainRisk = this.chainRisks.get(chain.id)!;
        chainRisk.riskScore = Math.round(avgRisk);
        chainRisk.poolCount = chainPositions.length;
        chainRisk.totalLiquidity = totalLiquidity;

        logger.debug(
          `Chain ${chain.name}: risk=${chainRisk.riskScore}, pools=${chainRisk.poolCount}`
        );
      } catch (error) {
        logger.error(`Failed to update risk for ${chain.name}:`, error);
      }
    }
  }

  /**
   * Check if rebalancing is needed and execute
   */
  private async checkRebalancing(): Promise<void> {
    const risks = Array.from(this.chainRisks.values());
    
    // Find high-risk and low-risk chains
    const highRisk = risks.filter((r) => r.riskScore >= this.riskThreshold && r.totalLiquidity > 0n);
    const lowRisk = risks.filter((r) => r.riskScore < this.riskThreshold * 0.5);

    if (highRisk.length === 0 || lowRisk.length === 0) {
      return;
    }

    // Sort by risk
    highRisk.sort((a, b) => b.riskScore - a.riskScore);
    lowRisk.sort((a, b) => a.riskScore - b.riskScore);

    // Attempt rebalance from highest risk to lowest risk
    const sourceChain = highRisk[0];
    const targetChain = lowRisk[0];

    // Calculate amount to move (30% of high-risk chain liquidity)
    const amountToMove = sourceChain.totalLiquidity * 30n / 100n;

    if (amountToMove < ethers.parseEther('0.1')) {
      logger.debug('Amount too small for rebalancing');
      return;
    }

    logger.info(
      `Initiating rebalance: ${sourceChain.chainName} (risk=${sourceChain.riskScore}) -> ` +
      `${targetChain.chainName} (risk=${targetChain.riskScore})`
    );

    await this.executeRebalance(sourceChain, targetChain, amountToMove);
  }

  /**
   * Execute cross-chain rebalancing
   */
  async executeRebalance(
    sourceChain: ChainRisk,
    targetChain: ChainRisk,
    amount: bigint
  ): Promise<RebalanceResult> {
    const result: RebalanceResult = {
      success: false,
      sourceChain: sourceChain.chainName,
      targetChain: targetChain.chainName,
      amount,
      txHashes: [],
      bridgeProtocol: '',
      timestamp: Date.now(),
    };

    try {
      // Step 1: Get bridge route from LI.FI
      const route = await this.getRoute(
        sourceChain.chainId,
        targetChain.chainId,
        '0x0000000000000000000000000000000000000000', // Native token
        '0x0000000000000000000000000000000000000000',
        amount.toString()
      );

      if (!route) {
        logger.error('No route found for rebalancing');
        return result;
      }

      result.bridgeProtocol = route.bridgeProtocol;

      // Step 2: Execute bridge via LI.FI
      const txHash = await this.executeBridge(route);
      result.txHashes.push(txHash);

      // Step 3: Wait for bridge completion
      await this.waitForBridgeCompletion(txHash, targetChain.chainId);

      result.success = true;
      logger.info(`Rebalance completed: ${txHash}`);

    } catch (error) {
      logger.error('Rebalance failed:', error);
      result.success = false;
    }

    // Store in history
    this.rebalanceHistory.push(result);
    if (this.rebalanceHistory.length > this.maxRebalanceHistory) {
      this.rebalanceHistory.shift();
    }

    return result;
  }

  /**
   * Get optimal route from LI.FI
   */
  async getRoute(
    fromChainId: number,
    toChainId: number,
    fromToken: string,
    toToken: string,
    fromAmount: string
  ): Promise<BridgeRoute | null> {
    try {
      const response = await axios.get(`${LIFI_API}/quote`, {
        params: {
          fromChain: fromChainId,
          toChain: toChainId,
          fromToken,
          toToken,
          fromAmount,
          fromAddress: await this.wallet.getAddress(),
          slippage: 0.03, // 3% slippage
        },
        headers: {
          'x-lifi-api-key': this.lifiApiKey,
        },
      });

      const data = response.data;

      return {
        fromChainId,
        toChainId,
        fromToken,
        toToken,
        fromAmount,
        toAmount: data.estimate.toAmount,
        estimatedGas: data.estimate.gasCosts[0]?.amount || '0',
        bridgeProtocol: data.tool,
        steps: data.includedSteps.map((step: any) => ({
          type: step.type,
          tool: step.tool,
          fromChain: step.action.fromChainId,
          toChain: step.action.toChainId,
          fromToken: step.action.fromToken.address,
          toToken: step.action.toToken.address,
          fromAmount: step.estimate.fromAmount,
          toAmount: step.estimate.toAmount,
        })),
      };
    } catch (error) {
      logger.error('Failed to get LI.FI route:', error);
      return null;
    }
  }

  /**
   * Execute bridge transaction via LI.FI
   */
  private async executeBridge(route: BridgeRoute): Promise<string> {
    try {
      // Get step transaction from LI.FI
      const response = await axios.post(
        `${LIFI_API}/advanced/stepTransaction`,
        {
          route,
          fromAddress: await this.wallet.getAddress(),
        },
        {
          headers: {
            'x-lifi-api-key': this.lifiApiKey,
          },
        }
      );

      const txData = response.data.transactionRequest;

      // Execute transaction
      const sourceChain = this.chains.find((c) => c.id === route.fromChainId);
      if (!sourceChain) throw new Error('Source chain not found');

      const signer = this.getSigner(sourceChain.name);
      
      const tx = await signer.sendTransaction({
        to: txData.to,
        data: txData.data,
        value: txData.value,
        gasLimit: txData.gasLimit,
      });

      await tx.wait();
      return tx.hash;

    } catch (error) {
      logger.error('Bridge execution failed:', error);
      throw error;
    }
  }

  /**
   * Wait for bridge to complete on destination chain
   */
  private async waitForBridgeCompletion(
    txHash: string,
    targetChainId: number
  ): Promise<void> {
    const maxAttempts = 60; // 10 minutes with 10s intervals
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(`${LIFI_API}/status`, {
          params: {
            txHash,
          },
          headers: {
            'x-lifi-api-key': this.lifiApiKey,
          },
        });

        const status = response.data.status;
        
        if (status === 'DONE') {
          logger.info(`Bridge completed for ${txHash}`);
          return;
        } else if (status === 'FAILED') {
          throw new Error('Bridge failed');
        }

        // Wait 10 seconds before checking again
        await this.sleep(10000);

      } catch (error) {
        if (i === maxAttempts - 1) {
          throw error;
        }
      }
    }

    throw new Error('Bridge timeout');
  }

  /**
   * Fetch current positions across all chains
   */
  async fetchPositions(): Promise<void> {
    const newPositions: LiquidityPosition[] = [];

    for (const chain of this.chains) {
      try {
        // In production, query actual LP positions
        // For now, create mock positions
        const mockPosition: LiquidityPosition = {
          chainId: chain.id,
          chainName: chain.name,
          poolAddress: '0x0000000000000000000000000000000000000000',
          token0: 'ETH',
          token1: 'USDC',
          liquidity: ethers.parseEther('10'),
          valueUSD: 30000,
          riskScore: 3000,
        };
        
        newPositions.push(mockPosition);
      } catch (error) {
        logger.error(`Failed to fetch positions for ${chain.name}:`, error);
      }
    }

    this.positions = newPositions;
  }

  /**
   * Get unified portfolio view
   */
  getPortfolio(): {
    totalValueUSD: number;
    positions: LiquidityPosition[];
    chainDistribution: Map<string, number>;
    riskDistribution: Map<string, number>;
  } {
    const totalValueUSD = this.positions.reduce((sum, p) => sum + p.valueUSD, 0);
    
    const chainDistribution = new Map<string, number>();
    const riskDistribution = new Map<string, number>();

    for (const position of this.positions) {
      const currentChainValue = chainDistribution.get(position.chainName) || 0;
      chainDistribution.set(position.chainName, currentChainValue + position.valueUSD);

      const riskLevel = position.riskScore < 3000 ? 'low' : 
                       position.riskScore < 7000 ? 'medium' : 'high';
      const currentRiskValue = riskDistribution.get(riskLevel) || 0;
      riskDistribution.set(riskLevel, currentRiskValue + position.valueUSD);
    }

    return {
      totalValueUSD,
      positions: this.positions,
      chainDistribution,
      riskDistribution,
    };
  }

  /**
   * Get recommendations for portfolio optimization
   */
  getRecommendations(): {
    type: string;
    action: string;
    reason: string;
    impact: string;
  }[] {
    const recommendations = [];
    const risks = Array.from(this.chainRisks.values());

    // Check for concentration risk
    const totalLiquidity = risks.reduce((sum, r) => sum + Number(r.totalLiquidity), 0);
    for (const risk of risks) {
      const concentration = Number(risk.totalLiquidity) / totalLiquidity;
      if (concentration > 0.6) {
        recommendations.push({
          type: 'CONCENTRATION',
          action: `Diversify from ${risk.chainName}`,
          reason: `${(concentration * 100).toFixed(0)}% of liquidity on single chain`,
          impact: 'Reduce single-chain risk exposure',
        });
      }
    }

    // Check for high-risk chains
    for (const risk of risks) {
      if (risk.riskScore > this.riskThreshold && risk.totalLiquidity > 0n) {
        const lowestRisk = risks.reduce((min, r) => r.riskScore < min.riskScore ? r : min);
        recommendations.push({
          type: 'REBALANCE',
          action: `Move liquidity from ${risk.chainName} to ${lowestRisk.chainName}`,
          reason: `High risk score (${risk.riskScore / 100}%) detected`,
          impact: 'Reduce exposure to volatile market conditions',
        });
      }
    }

    return recommendations;
  }

  /**
   * Update risk score for a specific pool
   */
  updatePoolRisk(chainId: number, poolAddress: string, riskScore: number): void {
    const position = this.positions.find(
      (p) => p.chainId === chainId && p.poolAddress.toLowerCase() === poolAddress.toLowerCase()
    );
    if (position) {
      position.riskScore = riskScore;
    }
  }

  /**
   * Get chain risks
   */
  getChainRisks(): ChainRisk[] {
    return Array.from(this.chainRisks.values());
  }

  /**
   * Get rebalance history
   */
  getRebalanceHistory(): RebalanceResult[] {
    return [...this.rebalanceHistory];
  }

  protected async cleanup(): Promise<void> {
    this.positions = [];
    this.rebalanceHistory = [];
    logger.info('Cross-Chain Agent cleaned up');
  }

  async report(): Promise<AgentReport> {
    return {
      timestamp: Date.now(),
      agentName: this.name,
      role: this.role,
      data: {
        chainRisks: Array.from(this.chainRisks.values()),
        positionCount: this.positions.length,
        portfolio: this.getPortfolio(),
        recommendations: this.getRecommendations(),
        rebalanceCount: this.rebalanceHistory.length,
      },
    };
  }
}
