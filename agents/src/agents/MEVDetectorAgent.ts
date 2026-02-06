/**
 * MEV Detector Agent
 * 
 * Detects MEV attacks including sandwich attacks, frontrunning,
 * and other toxic order flow patterns.
 */

import { ethers } from 'ethers';
import WebSocket from 'ws';
import { BaseAgent, AgentReport } from './BaseAgent';
import { ChainConfig, AgentRole } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('MEVDetectorAgent');

export enum MEVType {
  SANDWICH = 'sandwich',
  FRONTRUN = 'frontrun',
  BACKRUN = 'backrun',
  JIT_LIQUIDITY = 'jit_liquidity',
  FLASH_LOAN = 'flash_loan',
  UNKNOWN = 'unknown',
}

export interface MEVEvent {
  type: MEVType;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  attacker: string;
  victim?: string;
  pool: string;
  profit?: number;
  severity: number; // 0-100
  details: Record<string, unknown>;
}

export interface MEVSignals {
  sandwichDetected: boolean;
  frontrunDetected: boolean;
  flashLoanDetected: boolean;
  recentAttacks: MEVEvent[];
  riskMultiplier: number;
}

interface PendingTx {
  hash: string;
  from: string;
  to: string;
  data: string;
  gasPrice: bigint;
  value: bigint;
  timestamp: number;
}

export class MEVDetectorAgent extends BaseAgent {
  private mevEvents: MEVEvent[] = [];
  private pendingTxs: Map<string, PendingTx> = new Map();
  private mevCallbacks: ((event: MEVEvent) => void)[] = [];
  private wsConnections: WebSocket[] = [];
  private knownAttackers: Set<string> = new Set();
  private readonly maxEvents = 1000;
  private readonly eventWindow = 3600000; // 1 hour

  // Known MEV bot patterns
  private readonly mevPatterns = {
    // Common MEV bot method signatures
    sandwichSignatures: [
      '0x128acb08', // Uniswap V3 swap
      '0x022c0d9f', // Uniswap V2 swap
    ],
    flashLoanSignatures: [
      '0xab9c4b5d', // Aave flashLoan
      '0x5cffe9de', // dYdX flashLoan
    ],
  };

  constructor(
    privateKey: string,
    chains: ChainConfig[],
    updateInterval: number = 1000 // Fast updates for MEV detection
  ) {
    super('mev-detector-agent', AgentRole.MEV_DETECTOR, privateKey, chains, updateInterval);
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing MEV Detector Agent');

    // Connect to mempool streams for each chain
    for (const chain of this.chains) {
      if (chain.wsUrl) {
        await this.connectMempoolStream(chain);
      }
    }

    // Load known attacker addresses
    this.loadKnownAttackers();

    logger.info('MEV Detector initialized');
  }

  /**
   * Connect to mempool WebSocket stream
   */
  private async connectMempoolStream(chain: ChainConfig): Promise<void> {
    try {
      const ws = new WebSocket(chain.wsUrl!);

      ws.on('open', () => {
        logger.info(`Connected to ${chain.name} mempool stream`);
        
        // Subscribe to pending transactions
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_subscribe',
          params: ['newPendingTransactions'],
          id: 1,
        }));
      });

      ws.on('message', (data: Buffer) => {
        this.handleMempoolMessage(chain.name, data.toString());
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${chain.name}:`, error);
      });

      ws.on('close', () => {
        logger.warn(`WebSocket closed for ${chain.name}, reconnecting...`);
        setTimeout(() => this.connectMempoolStream(chain), 5000);
      });

      this.wsConnections.push(ws);
    } catch (error) {
      logger.error(`Failed to connect mempool for ${chain.name}:`, error);
    }
  }

  /**
   * Handle incoming mempool message
   */
  private handleMempoolMessage(chain: string, data: string): void {
    try {
      const message = JSON.parse(data);
      
      if (message.params?.result) {
        const txHash = message.params.result;
        this.analyzePendingTx(chain, txHash);
      }
    } catch (error) {
      // Ignore parse errors for non-JSON messages
    }
  }

  /**
   * Analyze a pending transaction for MEV patterns
   */
  private async analyzePendingTx(chain: string, txHash: string): Promise<void> {
    try {
      const provider = this.getProvider(chain);
      const tx = await provider.getTransaction(txHash);

      if (!tx) return;

      const pendingTx: PendingTx = {
        hash: txHash,
        from: tx.from,
        to: tx.to || '',
        data: tx.data,
        gasPrice: tx.gasPrice || 0n,
        value: tx.value,
        timestamp: Date.now(),
      };

      this.pendingTxs.set(txHash, pendingTx);

      // Check for known attacker
      if (this.knownAttackers.has(tx.from.toLowerCase())) {
        this.flagPotentialMEV(pendingTx, chain);
      }

      // Check for suspicious patterns
      this.checkSuspiciousPatterns(pendingTx, chain);

      // Clean old pending txs
      this.cleanOldPendingTxs();
    } catch (error) {
      // Transaction might be mined already
    }
  }

  protected async execute(): Promise<void> {
    // Analyze recent blocks for MEV patterns
    for (const chain of this.chains) {
      try {
        await this.analyzeRecentBlocks(chain.name);
      } catch (error) {
        logger.error(`Error analyzing blocks for ${chain.name}:`, error);
      }
    }

    // Clean old events
    this.cleanOldEvents();
  }

  /**
   * Analyze recent blocks for sandwich attacks
   */
  private async analyzeRecentBlocks(chainName: string): Promise<void> {
    const provider = this.getProvider(chainName);
    const blockNumber = await provider.getBlockNumber();

    // Analyze last 5 blocks
    for (let i = 0; i < 5; i++) {
      const block = await provider.getBlock(blockNumber - i, true);
      if (!block || !block.transactions) continue;

      await this.detectSandwichInBlock(block, chainName);
    }
  }

  /**
   * Detect sandwich attacks in a block
   */
  private async detectSandwichInBlock(
    block: ethers.Block,
    chainName: string
  ): Promise<void> {
    const txs = block.prefetchedTransactions;
    if (!txs || txs.length < 3) return;

    // Look for sandwich pattern: same sender, opposite directions, surrounding a victim
    for (let i = 1; i < txs.length - 1; i++) {
      const before = txs[i - 1];
      const victim = txs[i];
      const after = txs[i + 1];

      // Check if before and after have same sender (potential attacker)
      if (before.from.toLowerCase() === after.from.toLowerCase()) {
        // Check if they target the same contract (pool)
        if (before.to?.toLowerCase() === after.to?.toLowerCase()) {
          // Check if victim is different
          if (victim.from.toLowerCase() !== before.from.toLowerCase()) {
            // Potential sandwich detected
            const severity = this.calculateSandwichSeverity(before, victim, after);

            if (severity > 50) {
              const event: MEVEvent = {
                type: MEVType.SANDWICH,
                txHash: victim.hash,
                blockNumber: block.number,
                timestamp: block.timestamp * 1000,
                attacker: before.from,
                victim: victim.from,
                pool: before.to || '',
                severity,
                details: {
                  frontrunTx: before.hash,
                  victimTx: victim.hash,
                  backrunTx: after.hash,
                  chain: chainName,
                },
              };

              this.recordMEVEvent(event);
            }
          }
        }
      }
    }
  }

  /**
   * Calculate severity of sandwich attack
   */
  private calculateSandwichSeverity(
    frontrun: ethers.TransactionResponse,
    victim: ethers.TransactionResponse,
    backrun: ethers.TransactionResponse
  ): number {
    let severity = 0;

    // Higher gas price on frontrun = more likely MEV
    const frontrunGas = frontrun.gasPrice || 0n;
    const victimGas = victim.gasPrice || 0n;
    const backrunGas = backrun.gasPrice || 0n;

    if (frontrunGas > victimGas) {
      severity += 30;
    }

    // Check if frontrun and backrun have opposite swap directions
    // This requires decoding the transaction data
    if (this.hasOppositeDirections(frontrun.data, backrun.data)) {
      severity += 40;
    }

    // Check if known attacker
    if (this.knownAttackers.has(frontrun.from.toLowerCase())) {
      severity += 30;
    }

    return Math.min(100, severity);
  }

  /**
   * Check if two transactions have opposite swap directions
   */
  private hasOppositeDirections(data1: string, data2: string): boolean {
    // Simplified check - in production would decode and compare
    // For now, check if they have swap signatures but different parameters
    const isSwap1 = this.mevPatterns.sandwichSignatures.some((sig) =>
      data1.startsWith(sig)
    );
    const isSwap2 = this.mevPatterns.sandwichSignatures.some((sig) =>
      data2.startsWith(sig)
    );

    if (isSwap1 && isSwap2) {
      // Different parameters suggest opposite directions
      return data1.slice(10) !== data2.slice(10);
    }

    return false;
  }

  /**
   * Check for suspicious patterns in pending tx
   */
  private checkSuspiciousPatterns(tx: PendingTx, chain: string): void {
    // Check for flash loan signatures
    const isFlashLoan = this.mevPatterns.flashLoanSignatures.some((sig) =>
      tx.data.startsWith(sig)
    );

    if (isFlashLoan) {
      const event: MEVEvent = {
        type: MEVType.FLASH_LOAN,
        txHash: tx.hash,
        blockNumber: 0, // Pending
        timestamp: tx.timestamp,
        attacker: tx.from,
        pool: tx.to,
        severity: 60,
        details: { chain, pending: true },
      };
      this.recordMEVEvent(event);
    }
  }

  /**
   * Flag potential MEV from known attacker
   */
  private flagPotentialMEV(tx: PendingTx, chain: string): void {
    const event: MEVEvent = {
      type: MEVType.UNKNOWN,
      txHash: tx.hash,
      blockNumber: 0,
      timestamp: tx.timestamp,
      attacker: tx.from,
      pool: tx.to,
      severity: 70,
      details: { chain, knownAttacker: true, pending: true },
    };
    this.recordMEVEvent(event);
  }

  /**
   * Record MEV event and notify callbacks
   */
  private recordMEVEvent(event: MEVEvent): void {
    this.mevEvents.push(event);
    
    // Add to known attackers
    this.knownAttackers.add(event.attacker.toLowerCase());

    // Notify callbacks
    for (const callback of this.mevCallbacks) {
      callback(event);
    }

    logger.warn(
      `MEV detected: ${event.type} by ${event.attacker.slice(0, 10)}... ` +
      `severity=${event.severity}`
    );
  }

  /**
   * Get MEV signals for risk calculation
   */
  getSignals(poolAddress?: string): MEVSignals {
    const recentEvents = this.getRecentEvents(poolAddress);
    
    const sandwichDetected = recentEvents.some((e) => e.type === MEVType.SANDWICH);
    const frontrunDetected = recentEvents.some((e) => e.type === MEVType.FRONTRUN);
    const flashLoanDetected = recentEvents.some((e) => e.type === MEVType.FLASH_LOAN);

    // Calculate risk multiplier based on recent activity
    let riskMultiplier = 1.0;
    if (sandwichDetected) riskMultiplier += 0.5;
    if (frontrunDetected) riskMultiplier += 0.3;
    if (flashLoanDetected) riskMultiplier += 0.4;
    riskMultiplier += recentEvents.length * 0.05;

    return {
      sandwichDetected,
      frontrunDetected,
      flashLoanDetected,
      recentAttacks: recentEvents,
      riskMultiplier: Math.min(3, riskMultiplier),
    };
  }

  /**
   * Get recent MEV events
   */
  getRecentEvents(poolAddress?: string): MEVEvent[] {
    const cutoff = Date.now() - this.eventWindow;
    let events = this.mevEvents.filter((e) => e.timestamp > cutoff);

    if (poolAddress) {
      events = events.filter(
        (e) => e.pool.toLowerCase() === poolAddress.toLowerCase()
      );
    }

    return events;
  }

  /**
   * Register callback for MEV events
   */
  onMEVDetected(callback: (event: MEVEvent) => void): void {
    this.mevCallbacks.push(callback);
  }

  /**
   * Load known attacker addresses
   */
  private loadKnownAttackers(): void {
    // Common MEV bot addresses (examples)
    const knownBots = [
      '0x000000000000000000000000000000000000dEaD', // Placeholder
      // Add real known MEV bot addresses
    ];

    for (const addr of knownBots) {
      this.knownAttackers.add(addr.toLowerCase());
    }
  }

  /**
   * Clean old pending transactions
   */
  private cleanOldPendingTxs(): void {
    const cutoff = Date.now() - 60000; // 1 minute
    for (const [hash, tx] of this.pendingTxs) {
      if (tx.timestamp < cutoff) {
        this.pendingTxs.delete(hash);
      }
    }
  }

  /**
   * Clean old events
   */
  private cleanOldEvents(): void {
    const cutoff = Date.now() - this.eventWindow;
    this.mevEvents = this.mevEvents.filter((e) => e.timestamp > cutoff);
    
    if (this.mevEvents.length > this.maxEvents) {
      this.mevEvents = this.mevEvents.slice(-this.maxEvents);
    }
  }

  protected async cleanup(): Promise<void> {
    // Close WebSocket connections
    for (const ws of this.wsConnections) {
      ws.close();
    }
    this.wsConnections = [];
    this.mevCallbacks = [];
    this.pendingTxs.clear();
    logger.info('MEV Detector Agent cleaned up');
  }

  async report(): Promise<AgentReport> {
    const signals = this.getSignals();
    
    return {
      timestamp: Date.now(),
      agentName: this.name,
      role: this.role,
      data: {
        signals,
        totalEvents: this.mevEvents.length,
        knownAttackers: this.knownAttackers.size,
        eventsByType: {
          sandwich: this.mevEvents.filter((e) => e.type === MEVType.SANDWICH).length,
          frontrun: this.mevEvents.filter((e) => e.type === MEVType.FRONTRUN).length,
          flashLoan: this.mevEvents.filter((e) => e.type === MEVType.FLASH_LOAN).length,
        },
      },
    };
  }
}
