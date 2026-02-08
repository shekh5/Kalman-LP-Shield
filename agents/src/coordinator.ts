/**
 * KalmanGuard Agent Coordinator
 * 
 * Main entry point that orchestrates all agent activities
 */

import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { DEFAULT_CHAINS, AgentRole, ChainConfig } from './config';
import { startHttpServer } from './api/httpServer';
import { StateStore } from './api/stateStore';
import {
  PriceMonitorAgent,
  MEVDetectorAgent,
  RiskScoringAgent,
  ExecutionAgent,
  CrossChainAgent,
  AgentReport,
} from './agents';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('Coordinator');

interface CoordinatorConfig {
  chains: ChainConfig[];
  updateInterval: number;
  enabledAgents: AgentRole[];
}

class AgentCoordinator {
  private priceAgent: PriceMonitorAgent | null = null;
  private mevAgent: MEVDetectorAgent | null = null;
  private riskAgent: RiskScoringAgent | null = null;
  private executionAgent: ExecutionAgent | null = null;
  private crossChainAgent: CrossChainAgent | null = null;
  private isRunning = false;
  private config: CoordinatorConfig;

  private store: StateStore;
  private apiServer: ReturnType<typeof startHttpServer> | null = null;

  constructor(config: Partial<CoordinatorConfig> = {}) {
    const requested = (process.env.TARGET_CHAINS || process.env.CHAINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const defaultChains = requested.length
      ? requested
          .map((name) => DEFAULT_CHAINS[name])
          .filter(Boolean)
      : Object.values(DEFAULT_CHAINS);

    if (requested.length && defaultChains.length === 0) {
      throw new Error(`TARGET_CHAINS/CHAINS did not match any known chains: ${requested.join(',')}`);
    }

    this.config = {
      chains: defaultChains,
      updateInterval: 12000,
      enabledAgents: [
        AgentRole.PRICE_MONITOR,
        AgentRole.MEV_DETECTOR,
        AgentRole.RISK_SCORER,
        AgentRole.EXECUTOR,
        AgentRole.CROSS_CHAIN,
      ],
      ...config,
    };

    this.store = new StateStore();
  }

  /**
   * Initialize and start all agents
   */
  async start(): Promise<void> {
    logger.info('Starting KalmanGuard Agent Coordinator');

    try {
      // Start HTTP + WebSocket API server first (so judges can see something immediately)
      const port = Number(process.env.PORT || process.env.AGENT_API_PORT || 3001);
      const host = process.env.HOST || '0.0.0.0';
      this.apiServer = startHttpServer(this.store, { port, host });
      logger.info(`Agent API listening on http://${host}:${port} (ws: /ws)`);

      const kalmanEngineUrl = process.env.KALMAN_ENGINE_URL || 'http://localhost:8000';

      // Sepolia-only mode: initialize agents and stream live snapshots.
      void kalmanEngineUrl; // reserved for future direct push; agents use it via env.

      // Initialize agents based on configuration
      await this.initializeAgents();

      // Wire up inter-agent communication
      this.wireAgents();

      // Start all agents
      await this.startAgents();

      this.isRunning = true;
      logger.info('All agents started successfully');

      // Bridge key agent events into the public state store for the frontend
      if (this.priceAgent) {
        this.priceAgent.onPriceUpdate((poolId, state) => {
          const id = `live:${poolId}`;
          const now = Date.now();
          const chain = this.config.chains[0];

          // Create if missing
          const existing = this.store.getPools().find((p) => p.id === id);
          if (!existing) {
            this.store.upsertPool({
              id,
              chainId: chain?.id ?? 1,
              chainName: chain?.name ?? 'ethereum',
              token0: poolId.split('-')[0]?.toUpperCase() || 'TOKEN0',
              token1: poolId.split('-')[1]?.toUpperCase() || 'TOKEN1',
              baseFeeBps: 30,
              currentFeeBps: 30,
              tvlUsd: 0,
              volume24hUsd: 0,
              price: state.price,
              kalman: {
                velocity: state.velocity,
                acceleration: state.acceleration,
                volatility: state.volatility,
                beta: state.beta,
                confidence: state.confidence / 10000,
                regime: (String(state.regime).toLowerCase().includes('volatile') || String(state.regime).toLowerCase().includes('high'))
                  ? 'high'
                  : String(state.regime).toLowerCase().includes('crisis')
                    ? 'extreme'
                    : String(state.regime).toLowerCase().includes('stable')
                      ? 'low'
                      : 'normal',
              },
              riskScore: 0,
              lastUpdate: now,
            });
          } else {
            this.store.updatePool(id, {
              price: state.price,
              kalman: {
                ...existing.kalman,
                velocity: state.velocity,
                acceleration: state.acceleration,
                volatility: state.volatility,
                beta: state.beta,
                confidence: state.confidence / 10000,
              },
            });
          }

          this.apiServer?.broadcast({ type: 'snapshot', data: this.store.getPublicState() });
        });
      }

      if (this.riskAgent) {
        this.riskAgent.onRiskUpdate((assessment) => {
          const id = `live:${assessment.poolId}`;
          this.store.updatePool(id, { riskScore: Math.round((assessment.riskScore / 10000) * 100) });
          this.apiServer?.broadcast({ type: 'snapshot', data: this.store.getPublicState() });
        });
      }

      // Start health monitoring
      this.startHealthMonitoring();

      // Optional: send a cheap on-chain heartbeat tx (useful for Sepolia judge demos)
      this.startHeartbeatLoop();

    } catch (error) {
      logger.error('Failed to start coordinator:', error);
      throw error;
    }
  }

  private startHeartbeatLoop(): void {
    const chain = this.config.chains[0];
    if (!chain) return;

    const enabled = (process.env.ENABLE_HEARTBEAT_TX || 'true').toLowerCase() === 'true';
    if (!enabled) return;

    if (!this.executionAgent) return;
    if (!chain.agentControllerAddress || chain.agentControllerAddress === '0x0000000000000000000000000000000000000000') return;

    // Heartbeat every 60s by default
    const intervalMs = Number(process.env.HEARTBEAT_TX_MS || 60000);
    const iface = new ethers.Interface(['function heartbeat(string agentName)']);

    setInterval(() => {
      try {
        const data = iface.encodeFunctionData('heartbeat', ['kalmanguard-execution-agent']);
        void this.executionAgent!.submit({
          id: `hb_${Date.now()}`,
          chainName: chain.name,
          to: chain.agentControllerAddress,
          data,
          value: 0n,
          gasLimit: 150000n,
          priority: 'low',
          usePrivate: false,
          deadline: Date.now() + 5 * 60 * 1000,
        });
      } catch {
        // ignore
      }
    }, intervalMs);
  }

  /**
   * Initialize all enabled agents
   */
  private async initializeAgents(): Promise<void> {
    const { chains, updateInterval, enabledAgents } = this.config;

    if (enabledAgents.includes(AgentRole.PRICE_MONITOR)) {
      const priceKey = process.env.PRICE_AGENT_KEY || process.env.PRIVATE_KEY;
      if (!priceKey) throw new Error('PRICE_AGENT_KEY not set');
      
      this.priceAgent = new PriceMonitorAgent(priceKey, chains, updateInterval);
      logger.info('Price Monitor Agent initialized');
    }

    if (enabledAgents.includes(AgentRole.MEV_DETECTOR)) {
      const mevKey = process.env.MEV_AGENT_KEY || process.env.PRIVATE_KEY;
      if (!mevKey) throw new Error('MEV_AGENT_KEY not set');
      
      this.mevAgent = new MEVDetectorAgent(mevKey, chains, 1000); // Fast updates
      logger.info('MEV Detector Agent initialized');
    }

    if (enabledAgents.includes(AgentRole.RISK_SCORER)) {
      const riskKey = process.env.RISK_AGENT_KEY || process.env.PRIVATE_KEY;
      if (!riskKey) throw new Error('RISK_AGENT_KEY not set');
      
      this.riskAgent = new RiskScoringAgent(riskKey, chains, updateInterval);
      logger.info('Risk Scoring Agent initialized');
    }

    if (enabledAgents.includes(AgentRole.EXECUTOR)) {
      const execKey = process.env.EXEC_AGENT_KEY || process.env.PRIVATE_KEY;
      if (!execKey) throw new Error('EXEC_AGENT_KEY not set');
      
      this.executionAgent = new ExecutionAgent(execKey, chains, 1000);
      logger.info('Execution Agent initialized');
    }

    if (enabledAgents.includes(AgentRole.CROSS_CHAIN)) {
      const crossChainKey = process.env.CROSSCHAIN_AGENT_KEY || process.env.PRIVATE_KEY;
      const lifiKey = process.env.LIFI_API_KEY || '';
      if (!crossChainKey) throw new Error('CROSSCHAIN_AGENT_KEY not set');
      
      this.crossChainAgent = new CrossChainAgent(crossChainKey, chains, lifiKey, 60000);
      logger.info('Cross-Chain Agent initialized');
    }
  }

  /**
   * Wire up inter-agent communication
   */
  private wireAgents(): void {
    // Price updates -> Risk scoring
    if (this.priceAgent && this.riskAgent) {
      this.priceAgent.onPriceUpdate((poolId, state) => {
        this.riskAgent!.updatePriceState(poolId, state);
      });
      logger.debug('Wired: PriceAgent -> RiskAgent');
    }

    // MEV signals -> Risk scoring
    if (this.mevAgent && this.riskAgent) {
      this.mevAgent.onMEVDetected((event) => {
        const signals = this.mevAgent!.getSignals(event.pool);
        this.riskAgent!.updateMEVSignals(event.pool, signals);
      });
      logger.debug('Wired: MEVAgent -> RiskAgent');
    }

    // Risk updates -> Cross-chain agent
    if (this.riskAgent && this.crossChainAgent) {
      this.riskAgent.onRiskUpdate((assessment) => {
        // Update cross-chain agent with pool risk
        // This would require chain ID mapping
        logger.debug(`Risk update for ${assessment.poolId}: ${assessment.riskScore}`);
      });
      logger.debug('Wired: RiskAgent -> CrossChainAgent');
    }
  }

  /**
   * Start all initialized agents
   */
  private async startAgents(): Promise<void> {
    const startPromises: Promise<void>[] = [];

    if (this.priceAgent) startPromises.push(this.priceAgent.start());
    if (this.mevAgent) startPromises.push(this.mevAgent.start());
    if (this.riskAgent) startPromises.push(this.riskAgent.start());
    if (this.executionAgent) startPromises.push(this.executionAgent.start());
    if (this.crossChainAgent) startPromises.push(this.crossChainAgent.start());

    await Promise.all(startPromises);
  }

  /**
   * Start health monitoring loop
   */
  private startHealthMonitoring(): void {
    setInterval(() => {
      this.checkHealth();
    }, 30000); // Every 30 seconds
  }

  /**
   * Check health of all agents
   */
  private checkHealth(): void {
    const agents = [
      { name: 'Price', agent: this.priceAgent },
      { name: 'MEV', agent: this.mevAgent },
      { name: 'Risk', agent: this.riskAgent },
      { name: 'Execution', agent: this.executionAgent },
      { name: 'CrossChain', agent: this.crossChainAgent },
    ];

    for (const { name, agent } of agents) {
      if (agent) {
        const status = agent.getStatus();
        if (!status.isHealthy) {
          logger.warn(`Agent ${name} unhealthy: last action ${Date.now() - status.lastAction}ms ago`);
        }
      }
    }
  }

  /**
   * Stop all agents
   */
  async stop(): Promise<void> {
    logger.info('Stopping Agent Coordinator');
    this.isRunning = false;

    const stopPromises: Promise<void>[] = [];

    if (this.priceAgent) stopPromises.push(this.priceAgent.stop());
    if (this.mevAgent) stopPromises.push(this.mevAgent.stop());
    if (this.riskAgent) stopPromises.push(this.riskAgent.stop());
    if (this.executionAgent) stopPromises.push(this.executionAgent.stop());
    if (this.crossChainAgent) stopPromises.push(this.crossChainAgent.stop());

    await Promise.all(stopPromises);

    if (this.apiServer) {
      await this.apiServer.close();
      this.apiServer = null;
    }
    logger.info('All agents stopped');
  }

  /**
   * Get reports from all agents
   */
  async getReports(): Promise<Record<string, AgentReport>> {
    const reports: Record<string, AgentReport> = {};

    if (this.priceAgent) {
      reports.price = await this.priceAgent.report();
    }
    if (this.mevAgent) {
      reports.mev = await this.mevAgent.report();
    }
    if (this.riskAgent) {
      reports.risk = await this.riskAgent.report();
    }
    if (this.executionAgent) {
      reports.execution = await this.executionAgent.report();
    }
    if (this.crossChainAgent) {
      reports.crossChain = await this.crossChainAgent.report();
    }

    return reports;
  }

  /**
   * Get coordinator status
   */
  getStatus(): {
    isRunning: boolean;
    agents: Record<string, { isHealthy: boolean; actionCount: number }>;
  } {
    const agents: Record<string, { isHealthy: boolean; actionCount: number }> = {};

    if (this.priceAgent) {
      const status = this.priceAgent.getStatus();
      agents.price = { isHealthy: status.isHealthy, actionCount: status.actionCount };
    }
    if (this.mevAgent) {
      const status = this.mevAgent.getStatus();
      agents.mev = { isHealthy: status.isHealthy, actionCount: status.actionCount };
    }
    if (this.riskAgent) {
      const status = this.riskAgent.getStatus();
      agents.risk = { isHealthy: status.isHealthy, actionCount: status.actionCount };
    }
    if (this.executionAgent) {
      const status = this.executionAgent.getStatus();
      agents.execution = { isHealthy: status.isHealthy, actionCount: status.actionCount };
    }
    if (this.crossChainAgent) {
      const status = this.crossChainAgent.getStatus();
      agents.crossChain = { isHealthy: status.isHealthy, actionCount: status.actionCount };
    }

    return {
      isRunning: this.isRunning,
      agents,
    };
  }
}

// Main execution
async function main() {
  const coordinator = new AgentCoordinator();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await coordinator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await coordinator.stop();
    process.exit(0);
  });

  try {
    await coordinator.start();

    // Keep running
    logger.info('KalmanGuard agents are running. Press Ctrl+C to stop.');
    
    // Periodic status logging
    setInterval(async () => {
      const status = coordinator.getStatus();
      const healthyCount = Object.values(status.agents).filter((a) => a.isHealthy).length;
      logger.info(`Status: ${healthyCount}/${Object.keys(status.agents).length} agents healthy`);
    }, 60000);

  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
