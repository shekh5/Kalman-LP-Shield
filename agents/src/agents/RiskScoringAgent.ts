/**
 * Risk Scoring Agent
 * 
 * Calculates risk scores based on Kalman filter output and MEV signals.
 * Updates on-chain risk scores via the KalmanGuard hook.
 */

import { ethers } from 'ethers';
import { BaseAgent, AgentReport } from './BaseAgent';
import { ChainConfig, AgentRole, VolatilityRegime, DEFAULT_RISK_THRESHOLDS, PRECISION } from '../config';
import { FilteredState } from '../kalman';
import { MEVSignals } from './MEVDetectorAgent';
import { createLogger } from '../utils/logger';

const logger = createLogger('RiskScoringAgent');

// KalmanGuardHook ABI (simplified)
const HOOK_ABI = [
  'function updateRiskScore(bytes32 poolId, uint256 riskScore, uint8 regime, uint256 confidence) external',
  'function batchUpdateRiskScores(bytes32[] poolIds, uint256[] riskScores, uint8[] regimes, uint256[] confidences) external',
  'function getRiskState(bytes32 poolId) view returns (tuple(uint256 riskScore, uint256 lastUpdate, uint8 regime, uint256 confidence, bool emergencyMode, uint256 swapCount, uint256 cumulativeVolume))',
  'function getCurrentFee(bytes32 poolId) view returns (uint24)',
];

export interface RiskAssessment {
  poolId: string;
  riskScore: number;
  regime: VolatilityRegime;
  confidence: number;
  components: RiskComponents;
  timestamp: number;
}

export interface RiskComponents {
  volatilityRisk: number;
  mevRisk: number;
  liquidityRisk: number;
  trendRisk: number;
  anomalyRisk: number;
}

export interface PoolRiskData {
  priceState: FilteredState | null;
  mevSignals: MEVSignals | null;
  lastAssessment: RiskAssessment | null;
  historicalRisks: number[];
}

export class RiskScoringAgent extends BaseAgent {
  private poolRisks: Map<string, PoolRiskData> = new Map();
  private hookContracts: Map<string, ethers.Contract> = new Map();
  private riskCallbacks: ((assessment: RiskAssessment) => void)[] = [];
  private readonly historySize = 100;

  // Risk calculation weights
  private readonly weights = {
    volatility: 0.30,
    mev: 0.25,
    liquidity: 0.15,
    trend: 0.15,
    anomaly: 0.15,
  };

  constructor(
    privateKey: string,
    chains: ChainConfig[],
    updateInterval: number = 12000
  ) {
    super('risk-scoring-agent', AgentRole.RISK_SCORER, privateKey, chains, updateInterval);
  }

  protected async initialize(): Promise<void> {
    logger.info('Initializing Risk Scoring Agent');

    // Initialize hook contracts for each chain
    for (const chain of this.chains) {
      const signer = this.getSigner(chain.name);
      const hookContract = new ethers.Contract(
        chain.hookAddress,
        HOOK_ABI,
        signer
      );
      this.hookContracts.set(chain.name, hookContract);
    }

    // Initialize pool risk tracking
    const pools = ['eth-usdc', 'eth-wbtc', 'usdc-usdt']; // Example pools
    for (const poolId of pools) {
      this.poolRisks.set(poolId, {
        priceState: null,
        mevSignals: null,
        lastAssessment: null,
        historicalRisks: [],
      });
    }

    logger.info(`Initialized risk tracking for ${this.poolRisks.size} pools`);
  }

  protected async execute(): Promise<void> {
    const assessments: RiskAssessment[] = [];

    for (const [poolId, riskData] of this.poolRisks) {
      try {
        // Calculate risk assessment
        const assessment = this.calculateRisk(poolId, riskData);
        
        if (assessment) {
          assessments.push(assessment);
          riskData.lastAssessment = assessment;
          
          // Update history
          riskData.historicalRisks.push(assessment.riskScore);
          if (riskData.historicalRisks.length > this.historySize) {
            riskData.historicalRisks.shift();
          }

          // Notify callbacks
          for (const callback of this.riskCallbacks) {
            callback(assessment);
          }
        }
      } catch (error) {
        logger.error(`Error calculating risk for ${poolId}:`, error);
      }
    }

    // Batch update on-chain if we have assessments
    if (assessments.length > 0) {
      await this.updateOnChainRisks(assessments);
    }
  }

  /**
   * Calculate comprehensive risk score
   */
  calculateRisk(poolId: string, data: PoolRiskData): RiskAssessment | null {
    const { priceState, mevSignals } = data;

    // Calculate individual risk components
    const components: RiskComponents = {
      volatilityRisk: this.calculateVolatilityRisk(priceState),
      mevRisk: this.calculateMEVRisk(mevSignals),
      liquidityRisk: this.calculateLiquidityRisk(priceState),
      trendRisk: this.calculateTrendRisk(priceState),
      anomalyRisk: this.calculateAnomalyRisk(priceState, data.historicalRisks),
    };

    // Weighted sum of components
    const rawRisk =
      components.volatilityRisk * this.weights.volatility +
      components.mevRisk * this.weights.mev +
      components.liquidityRisk * this.weights.liquidity +
      components.trendRisk * this.weights.trend +
      components.anomalyRisk * this.weights.anomaly;

    // Apply MEV multiplier
    const mevMultiplier = mevSignals?.riskMultiplier || 1.0;
    const adjustedRisk = Math.min(PRECISION, Math.round(rawRisk * mevMultiplier));

    // Determine regime
    const regime = this.determineRegime(priceState, components);

    // Calculate confidence
    const confidence = this.calculateConfidence(priceState, components);

    return {
      poolId,
      riskScore: adjustedRisk,
      regime,
      confidence,
      components,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate volatility-based risk
   */
  private calculateVolatilityRisk(state: FilteredState | null): number {
    if (!state) return 5000; // Default medium risk

    const volatility = state.volatility;
    
    // Map volatility to risk score
    // 0% vol -> 0 risk, 20% vol -> max risk
    const normalizedVol = Math.min(1, volatility / 0.20);
    return Math.round(normalizedVol * PRECISION);
  }

  /**
   * Calculate MEV-based risk
   */
  private calculateMEVRisk(signals: MEVSignals | null): number {
    if (!signals) return 0;

    let risk = 0;

    if (signals.sandwichDetected) risk += 4000;
    if (signals.frontrunDetected) risk += 3000;
    if (signals.flashLoanDetected) risk += 2000;
    
    // Add risk for number of recent attacks
    risk += Math.min(1000, signals.recentAttacks.length * 200);

    return Math.min(PRECISION, risk);
  }

  /**
   * Calculate liquidity-based risk
   */
  private calculateLiquidityRisk(state: FilteredState | null): number {
    if (!state) return 5000;

    // Higher uncertainty suggests lower liquidity or market depth issues
    const uncertainty = state.uncertainty;
    const price = state.price;
    
    if (price === 0) return 5000;
    
    const relativeUncertainty = uncertainty / price;
    return Math.round(Math.min(1, relativeUncertainty * 100) * PRECISION);
  }

  /**
   * Calculate trend-based risk
   */
  private calculateTrendRisk(state: FilteredState | null): number {
    if (!state) return 0;

    // Strong acceleration suggests trend changes - higher risk
    const acceleration = Math.abs(state.acceleration);
    const velocity = Math.abs(state.velocity);
    const price = state.price;

    if (price === 0) return 0;

    // Normalized metrics
    const normAccel = Math.min(1, (acceleration / price) * 1000);
    const normVel = Math.min(1, (velocity / price) * 100);

    return Math.round((normAccel * 0.6 + normVel * 0.4) * PRECISION);
  }

  /**
   * Calculate anomaly-based risk using historical data
   */
  private calculateAnomalyRisk(
    state: FilteredState | null,
    historicalRisks: number[]
  ): number {
    if (!state || historicalRisks.length < 10) return 0;

    // Check if current state deviates significantly from history
    const recentRisks = historicalRisks.slice(-20);
    const mean = recentRisks.reduce((a, b) => a + b, 0) / recentRisks.length;
    const std = Math.sqrt(
      recentRisks.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentRisks.length
    );

    if (std === 0) return 0;

    // Current implied risk
    const currentRisk = this.calculateVolatilityRisk(state);
    const zScore = Math.abs(currentRisk - mean) / std;

    // High z-score = anomaly
    if (zScore > 3) return 8000;
    if (zScore > 2) return 5000;
    if (zScore > 1.5) return 3000;
    
    return 0;
  }

  /**
   * Determine volatility regime
   */
  private determineRegime(
    state: FilteredState | null,
    components: RiskComponents
  ): VolatilityRegime {
    if (!state) return VolatilityRegime.NORMAL;

    // Check for manipulation first
    if (state.regime === VolatilityRegime.MANIPULATED || components.mevRisk > 7000) {
      return VolatilityRegime.MANIPULATED;
    }

    // Otherwise use Kalman filter's regime
    return state.regime;
  }

  /**
   * Calculate confidence in the risk assessment
   */
  private calculateConfidence(
    state: FilteredState | null,
    components: RiskComponents
  ): number {
    if (!state) return 5000;

    // Base confidence from Kalman filter
    let confidence = state.confidence;

    // Reduce confidence if MEV is high (less predictable market)
    if (components.mevRisk > 5000) {
      confidence = Math.round(confidence * 0.8);
    }

    // Reduce confidence if anomaly detected
    if (components.anomalyRisk > 5000) {
      confidence = Math.round(confidence * 0.7);
    }

    return confidence;
  }

  /**
   * Update on-chain risk scores
   */
  private async updateOnChainRisks(assessments: RiskAssessment[]): Promise<void> {
    // Group by chain (assuming all pools are on same chain for simplicity)
    const chainName = this.chains[0].name;
    const hookContract = this.hookContracts.get(chainName);

    if (!hookContract) {
      logger.error(`No hook contract for chain ${chainName}`);
      return;
    }

    try {
      // Check if we should use batch update
      if (assessments.length > 1) {
        const poolIds = assessments.map((a) => 
          ethers.keccak256(ethers.toUtf8Bytes(a.poolId))
        );
        const riskScores = assessments.map((a) => a.riskScore);
        const regimes = assessments.map((a) => a.regime);
        const confidences = assessments.map((a) => a.confidence);

        const tx = await hookContract.batchUpdateRiskScores(
          poolIds,
          riskScores,
          regimes,
          confidences
        );
        
        await tx.wait();
        logger.info(`Batch updated ${assessments.length} pool risks, tx: ${tx.hash}`);
      } else {
        // Single update
        const assessment = assessments[0];
        const poolIdHash = ethers.keccak256(ethers.toUtf8Bytes(assessment.poolId));

        const tx = await hookContract.updateRiskScore(
          poolIdHash,
          assessment.riskScore,
          assessment.regime,
          assessment.confidence
        );

        await tx.wait();
        logger.info(
          `Updated risk for ${assessment.poolId}: ` +
          `score=${assessment.riskScore}, regime=${assessment.regime}, tx: ${tx.hash}`
        );
      }
    } catch (error) {
      logger.error('Failed to update on-chain risks:', error);
    }
  }

  /**
   * Update price state for a pool
   */
  updatePriceState(poolId: string, state: FilteredState): void {
    const riskData = this.poolRisks.get(poolId);
    if (riskData) {
      riskData.priceState = state;
    }
  }

  /**
   * Update MEV signals for a pool
   */
  updateMEVSignals(poolId: string, signals: MEVSignals): void {
    const riskData = this.poolRisks.get(poolId);
    if (riskData) {
      riskData.mevSignals = signals;
    }
  }

  /**
   * Register callback for risk assessments
   */
  onRiskUpdate(callback: (assessment: RiskAssessment) => void): void {
    this.riskCallbacks.push(callback);
  }

  /**
   * Get current risk assessment for a pool
   */
  getAssessment(poolId: string): RiskAssessment | null {
    return this.poolRisks.get(poolId)?.lastAssessment || null;
  }

  /**
   * Get all current assessments
   */
  getAllAssessments(): Map<string, RiskAssessment | null> {
    const assessments = new Map();
    for (const [poolId, data] of this.poolRisks) {
      assessments.set(poolId, data.lastAssessment);
    }
    return assessments;
  }

  protected async cleanup(): Promise<void> {
    this.riskCallbacks = [];
    this.poolRisks.clear();
    this.hookContracts.clear();
    logger.info('Risk Scoring Agent cleaned up');
  }

  async report(): Promise<AgentReport> {
    const assessments: Record<string, RiskAssessment | null> = {};
    
    for (const [poolId, data] of this.poolRisks) {
      assessments[poolId] = data.lastAssessment;
    }

    return {
      timestamp: Date.now(),
      agentName: this.name,
      role: this.role,
      data: {
        poolCount: this.poolRisks.size,
        assessments,
        weights: this.weights,
      },
    };
  }
}
