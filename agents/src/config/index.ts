/**
 * KalmanGuard Agent Configuration
 * Configuration types and default values for the agent system
 */

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  wsUrl?: string;
  poolManagerAddress: string;
  hookAddress: string;
  agentControllerAddress: string;
  blockTime: number;
  nativeCurrency: string;
  explorerUrl: string;
}

export interface AgentConfig {
  privateKey: string;
  ensName: string;
  role: AgentRole;
  updateFrequency: number; // seconds
  maxGasPrice: bigint;
  minConfidence: number;
}

export enum AgentRole {
  PRICE_MONITOR = 'price_monitor',
  MEV_DETECTOR = 'mev_detector',
  RISK_SCORER = 'risk_scorer',
  EXECUTOR = 'executor',
  CROSS_CHAIN = 'cross_chain',
  GUARDIAN = 'guardian',
}

export enum VolatilityRegime {
  STABLE = 0,
  NORMAL = 1,
  VOLATILE = 2,
  CRISIS = 3,
  MANIPULATED = 4,
}

export interface OracleSource {
  name: string;
  type: 'chainlink' | 'uniswap_v3' | 'uniswap_v4' | 'curve' | 'cex';
  address?: string;
  weight: number;
  maxLatency: number; // seconds
}

export interface PoolConfig {
  poolId: string;
  token0: string;
  token1: string;
  fee: number;
  chain: string;
  oracleSources: OracleSource[];
}

export interface KalmanConfig {
  // State transition matrix F
  processNoiseQ: number[][];
  // Measurement noise R
  measurementNoiseR: number[][];
  // Initial state covariance P
  initialCovariance: number[][];
  // Adaptive parameters
  adaptiveAlpha: number;
  adaptiveBeta: number;
  windowSize: number;
}

export interface RiskThresholds {
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
  criticalRisk: number;
  emergencyThreshold: number;
}

export interface FeeConfig {
  baseFee: number;
  maxFee: number;
  minFee: number;
  steepness: number;
  threshold: number;
}

// Default configurations

export const DEFAULT_CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    id: 1,
    name: 'ethereum',
    rpcUrl: process.env.RPC_URL_ETHEREUM || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    wsUrl: process.env.WS_URL_ETHEREUM,
    poolManagerAddress: '0x0000000000000000000000000000000000000000',
    hookAddress: '0x0000000000000000000000000000000000000000',
    agentControllerAddress: '0x0000000000000000000000000000000000000000',
    blockTime: 12,
    nativeCurrency: 'ETH',
    explorerUrl: 'https://etherscan.io',
  },
  base: {
    id: 8453,
    name: 'base',
    rpcUrl: process.env.RPC_URL_BASE || 'https://mainnet.base.org',
    wsUrl: process.env.WS_URL_BASE,
    poolManagerAddress: '0x0000000000000000000000000000000000000000',
    hookAddress: '0x0000000000000000000000000000000000000000',
    agentControllerAddress: '0x0000000000000000000000000000000000000000',
    blockTime: 2,
    nativeCurrency: 'ETH',
    explorerUrl: 'https://basescan.org',
  },
  arbitrum: {
    id: 42161,
    name: 'arbitrum',
    rpcUrl: process.env.RPC_URL_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
    wsUrl: process.env.WS_URL_ARBITRUM,
    poolManagerAddress: '0x0000000000000000000000000000000000000000',
    hookAddress: '0x0000000000000000000000000000000000000000',
    agentControllerAddress: '0x0000000000000000000000000000000000000000',
    blockTime: 0.25,
    nativeCurrency: 'ETH',
    explorerUrl: 'https://arbiscan.io',
  },
  optimism: {
    id: 10,
    name: 'optimism',
    rpcUrl: process.env.RPC_URL_OPTIMISM || 'https://mainnet.optimism.io',
    wsUrl: process.env.WS_URL_OPTIMISM,
    poolManagerAddress: '0x0000000000000000000000000000000000000000',
    hookAddress: '0x0000000000000000000000000000000000000000',
    agentControllerAddress: '0x0000000000000000000000000000000000000000',
    blockTime: 2,
    nativeCurrency: 'ETH',
    explorerUrl: 'https://optimistic.etherscan.io',
  },
};

export const DEFAULT_KALMAN_CONFIG: KalmanConfig = {
  processNoiseQ: [
    [0.0001, 0, 0, 0, 0],
    [0, 0.001, 0, 0, 0],
    [0, 0, 0.01, 0, 0],
    [0, 0, 0, 0.0001, 0],
    [0, 0, 0, 0, 0.001],
  ],
  measurementNoiseR: [
    [0.001, 0],
    [0, 0.01],
  ],
  initialCovariance: [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1],
  ],
  adaptiveAlpha: 0.1,
  adaptiveBeta: 0.1,
  windowSize: 100,
};

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  lowRisk: 2000, // 20%
  mediumRisk: 5000, // 50%
  highRisk: 7500, // 75%
  criticalRisk: 9000, // 90%
  emergencyThreshold: 9500, // 95%
};

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  baseFee: 3000, // 0.30%
  maxFee: 10000, // 1.00%
  minFee: 500, // 0.05%
  steepness: 5,
  threshold: 5000, // 50%
};

export const PRECISION = 10000;
