/**
 * KalmanGuard Agent Coordinator
 * 
 * Main entry point that orchestrates all agent activities
 */

import dotenv from 'dotenv';
import { DEFAULT_CHAINS, AgentRole, ChainConfig } from './config';
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

  constructor(config: Partial<CoordinatorConfig> = {}) {
    this.config = {
      chains: Object.values(DEFAULT_CHAINS),
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
  }

  /**
   * Initialize and start all agents
   */
  async start(): Promise<void> {
    logger.info('Starting KalmanGuard Agent Coordinator');

    try {
      // Initialize agents based on configuration
      await this.initializeAgents();

      // Wire up inter-agent communication
      this.wireAgents();

      // Start all agents
      await this.startAgents();

      this.isRunning = true;
      logger.info('All agents started successfully');

      // Start health monitoring
      this.startHealthMonitoring();

    } catch (error) {
      logger.error('Failed to start coordinator:', error);
      throw error;
    }
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
