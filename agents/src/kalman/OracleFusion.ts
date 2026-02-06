/**
 * Multi-Source Oracle Fusion Module
 * 
 * Aggregates price data from multiple sources with:
 * - Z-score outlier rejection
 * - Liquidity-weighted median
 * - Confidence scoring
 */

import { OracleSource } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('OracleFusion');

export interface PriceData {
  source: string;
  price: number;
  timestamp: number;
  volume?: number;
  liquidity?: number;
  confidence: number;
}

export interface FusedPrice {
  price: number;
  confidence: number;
  timestamp: number;
  sources: string[];
  spread: number;
  consensus: number;
}

export interface OracleFusionConfig {
  zScoreThreshold: number;
  minSources: number;
  maxLatency: number; // seconds
  liquidityWeight: number;
  timeDecay: number;
}

const DEFAULT_CONFIG: OracleFusionConfig = {
  zScoreThreshold: 2.5,
  minSources: 2,
  maxLatency: 60, // 1 minute
  liquidityWeight: 0.3,
  timeDecay: 0.1,
};

export class OracleFusion {
  private config: OracleFusionConfig;
  private priceHistory: Map<string, PriceData[]> = new Map();
  private readonly maxHistorySize = 1000;

  constructor(config: Partial<OracleFusionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Fuse multiple price sources into single estimate
   */
  fuse(prices: PriceData[]): FusedPrice | null {
    if (prices.length === 0) {
      logger.warn('No price data to fuse');
      return null;
    }

    const now = Date.now();

    // Step 1: Filter stale data
    const freshPrices = prices.filter(
      (p) => now - p.timestamp < this.config.maxLatency * 1000
    );

    if (freshPrices.length < this.config.minSources) {
      logger.warn(
        `Insufficient fresh sources: ${freshPrices.length}/${this.config.minSources}`
      );
      // Return single source if available
      if (freshPrices.length > 0) {
        const best = freshPrices.reduce((a, b) =>
          a.confidence > b.confidence ? a : b
        );
        return {
          price: best.price,
          confidence: best.confidence * 0.5, // Reduced confidence
          timestamp: best.timestamp,
          sources: [best.source],
          spread: 0,
          consensus: 10000,
        };
      }
      return null;
    }

    // Step 2: Z-score outlier rejection
    const filtered = this.rejectOutliers(freshPrices);

    if (filtered.length < this.config.minSources) {
      logger.warn('Too many outliers rejected');
      return this.fallbackFusion(freshPrices);
    }

    // Step 3: Calculate liquidity-weighted median
    const weightedPrice = this.calculateWeightedMedian(filtered);

    // Step 4: Calculate confidence score
    const confidence = this.calculateConfidence(filtered, weightedPrice);

    // Step 5: Calculate consensus
    const consensus = this.calculateConsensus(filtered);

    // Step 6: Store in history
    this.updateHistory(filtered);

    return {
      price: weightedPrice,
      confidence,
      timestamp: now,
      sources: filtered.map((p) => p.source),
      spread: this.calculateSpread(filtered),
      consensus,
    };
  }

  /**
   * Reject outliers using Z-score method
   */
  private rejectOutliers(prices: PriceData[]): PriceData[] {
    if (prices.length < 3) {
      return prices;
    }

    const values = prices.map((p) => p.price);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    );

    if (std === 0) {
      return prices;
    }

    return prices.filter((p) => {
      const zScore = Math.abs((p.price - mean) / std);
      const isValid = zScore <= this.config.zScoreThreshold;
      
      if (!isValid) {
        logger.debug(`Rejected outlier from ${p.source}: price=${p.price}, z=${zScore.toFixed(2)}`);
      }
      
      return isValid;
    });
  }

  /**
   * Calculate liquidity-weighted median
   */
  private calculateWeightedMedian(prices: PriceData[]): number {
    // Sort by price
    const sorted = [...prices].sort((a, b) => a.price - b.price);

    // Calculate weights
    const weights = sorted.map((p) => {
      const liquidityWeight = p.liquidity ? Math.log(p.liquidity + 1) : 1;
      const confidenceWeight = p.confidence / 10000;
      const timeWeight = Math.exp(
        -this.config.timeDecay * (Date.now() - p.timestamp) / 1000
      );

      return liquidityWeight * confidenceWeight * timeWeight;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const targetWeight = totalWeight / 2;

    // Find weighted median
    let cumulativeWeight = 0;
    for (let i = 0; i < sorted.length; i++) {
      cumulativeWeight += weights[i];
      if (cumulativeWeight >= targetWeight) {
        // Interpolate between current and previous
        if (i > 0) {
          const prevWeight = cumulativeWeight - weights[i];
          const fraction = (targetWeight - prevWeight) / weights[i];
          return sorted[i - 1].price + fraction * (sorted[i].price - sorted[i - 1].price);
        }
        return sorted[i].price;
      }
    }

    return sorted[sorted.length - 1].price;
  }

  /**
   * Calculate confidence score based on agreement and freshness
   */
  private calculateConfidence(prices: PriceData[], fusedPrice: number): number {
    // Factor 1: Source agreement (lower spread = higher confidence)
    const spread = this.calculateSpread(prices);
    const maxAcceptableSpread = 0.01; // 1%
    const spreadScore = Math.max(0, 1 - spread / maxAcceptableSpread);

    // Factor 2: Number of sources
    const sourceScore = Math.min(1, prices.length / 5);

    // Factor 3: Average source confidence
    const avgConfidence = prices.reduce((sum, p) => sum + p.confidence, 0) / prices.length;

    // Factor 4: Freshness
    const avgLatency =
      prices.reduce((sum, p) => sum + (Date.now() - p.timestamp), 0) / prices.length;
    const freshnessScore = Math.exp(-avgLatency / (this.config.maxLatency * 1000));

    // Combined score
    const confidence =
      0.3 * spreadScore +
      0.2 * sourceScore +
      0.3 * (avgConfidence / 10000) +
      0.2 * freshnessScore;

    return Math.round(confidence * 10000);
  }

  /**
   * Calculate price spread
   */
  private calculateSpread(prices: PriceData[]): number {
    if (prices.length < 2) return 0;

    const values = prices.map((p) => p.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mid = (min + max) / 2;

    return mid > 0 ? (max - min) / mid : 0;
  }

  /**
   * Calculate consensus (agreement level)
   */
  private calculateConsensus(prices: PriceData[]): number {
    if (prices.length < 2) return 10000;

    const values = prices.map((p) => p.price);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    const avgDeviation =
      values.reduce((sum, val) => sum + Math.abs(val - mean), 0) / values.length;

    const normalizedDeviation = mean > 0 ? avgDeviation / mean : 0;
    
    // Convert to consensus score (0-10000)
    return Math.round(Math.max(0, 1 - normalizedDeviation * 100) * 10000);
  }

  /**
   * Fallback fusion when not enough valid sources
   */
  private fallbackFusion(prices: PriceData[]): FusedPrice {
    const sorted = [...prices].sort((a, b) => b.confidence - a.confidence);
    const best = sorted[0];

    return {
      price: best.price,
      confidence: Math.round(best.confidence * 0.7), // Reduced confidence
      timestamp: best.timestamp,
      sources: [best.source],
      spread: this.calculateSpread(prices),
      consensus: this.calculateConsensus(prices),
    };
  }

  /**
   * Update price history for analytics
   */
  private updateHistory(prices: PriceData[]): void {
    for (const price of prices) {
      let history = this.priceHistory.get(price.source);
      if (!history) {
        history = [];
        this.priceHistory.set(price.source, history);
      }

      history.push(price);
      
      // Trim history
      if (history.length > this.maxHistorySize) {
        history.shift();
      }
    }
  }

  /**
   * Get historical prices for a source
   */
  getHistory(source: string): PriceData[] {
    return this.priceHistory.get(source) || [];
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.priceHistory.clear();
  }

  /**
   * Get statistics for all sources
   */
  getSourceStats(): Map<string, { count: number; avgLatency: number; avgConfidence: number }> {
    const stats = new Map();
    
    for (const [source, history] of this.priceHistory) {
      if (history.length === 0) continue;
      
      const now = Date.now();
      const latencies = history.map((p) => now - p.timestamp);
      const confidences = history.map((p) => p.confidence);
      
      stats.set(source, {
        count: history.length,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        avgConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
      });
    }
    
    return stats;
  }
}
