/**
 * KalmanGuard - Adaptive Kalman Filter Implementation
 * 
 * Extended Kalman Filter with online covariance adaptation
 * for price estimation and volatility tracking.
 * 
 * State Vector: [price, velocity, acceleration, volatility, beta]
 */

import { KalmanConfig, VolatilityRegime, DEFAULT_KALMAN_CONFIG } from '../config';

export interface KalmanState {
  x: number[]; // State estimate
  P: number[][]; // State covariance
  Q: number[][]; // Process noise covariance
  R: number[][]; // Measurement noise covariance
  timestamp: number;
  innovations: number[];
  residuals: number[];
}

export interface PriceObservation {
  price: number;
  volume: number;
  timestamp: number;
  source: string;
  confidence: number;
}

export interface FilteredState {
  price: number;
  velocity: number;
  acceleration: number;
  volatility: number;
  beta: number;
  uncertainty: number;
  confidence: number;
  regime: VolatilityRegime;
}

export class AdaptiveKalmanFilter {
  private state: KalmanState;
  private config: KalmanConfig;
  private priceHistory: number[] = [];
  private innovationHistory: number[] = [];
  private readonly windowSize: number;

  constructor(config: KalmanConfig = DEFAULT_KALMAN_CONFIG) {
    this.config = config;
    this.windowSize = config.windowSize;
    
    // Initialize state
    this.state = {
      x: [0, 0, 0, 0.01, 1], // [price, velocity, accel, vol, beta]
      P: this.copyMatrix(config.initialCovariance),
      Q: this.copyMatrix(config.processNoiseQ),
      R: this.copyMatrix(config.measurementNoiseR),
      timestamp: Date.now(),
      innovations: [],
      residuals: [],
    };
  }

  /**
   * Initialize filter with first observation
   */
  initialize(observation: PriceObservation): void {
    this.state.x[0] = observation.price;
    this.state.timestamp = observation.timestamp;
    this.priceHistory.push(observation.price);
  }

  /**
   * Main filter update step
   */
  update(observation: PriceObservation): FilteredState {
    const dt = (observation.timestamp - this.state.timestamp) / 1000; // seconds
    
    if (dt <= 0) {
      return this.getFilteredState();
    }

    // Step 1: Predict
    const { xPred, PPred } = this.predict(dt);

    // Step 2: Update
    const { xNew, PNew, innovation } = this.updateStep(
      xPred,
      PPred,
      observation
    );

    // Step 3: Store state
    this.state.x = xNew;
    this.state.P = PNew;
    this.state.timestamp = observation.timestamp;
    this.state.innovations.push(innovation);

    // Step 4: Adapt covariances
    this.adaptCovariances();

    // Step 5: Update history
    this.priceHistory.push(observation.price);
    if (this.priceHistory.length > this.windowSize) {
      this.priceHistory.shift();
    }

    // Step 6: Update volatility estimate
    this.updateVolatility();

    return this.getFilteredState();
  }

  /**
   * Prediction step: x_pred = F * x, P_pred = F * P * F' + Q
   */
  private predict(dt: number): { xPred: number[]; PPred: number[][] } {
    // State transition matrix F (constant velocity + acceleration model)
    const F: number[][] = [
      [1, dt, 0.5 * dt * dt, 0, 0],
      [0, 1, dt, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];

    // Predict state: x_pred = F * x
    const xPred = this.matrixVectorMultiply(F, this.state.x);

    // Predict covariance: P_pred = F * P * F' + Q
    const FP = this.matrixMultiply(F, this.state.P);
    const FT = this.transpose(F);
    const FPFT = this.matrixMultiply(FP, FT);
    const PPred = this.matrixAdd(FPFT, this.state.Q);

    return { xPred, PPred };
  }

  /**
   * Update step: K = P * H' * (H * P * H' + R)^-1
   */
  private updateStep(
    xPred: number[],
    PPred: number[][],
    observation: PriceObservation
  ): { xNew: number[]; PNew: number[][]; innovation: number } {
    // Measurement matrix H (we observe price and optionally volume)
    const H: number[][] = [
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0], // Volume placeholder
    ];

    // Measurement vector z
    const z = [observation.price, 0];

    // Innovation: y = z - H * x_pred
    const Hx = this.matrixVectorMultiply(H, xPred);
    const innovation = z[0] - Hx[0];

    // Innovation covariance: S = H * P * H' + R
    const HT = this.transpose(H);
    const HP = this.matrixMultiply(H, PPred);
    const HPHT = this.matrixMultiply(HP, HT);
    const S = this.matrixAdd(HPHT, this.state.R);

    // Kalman gain: K = P * H' * S^-1
    const PHT = this.matrixMultiply(PPred, HT);
    const SInv = this.invertMatrix2x2(S);
    const K = this.matrixMultiply(PHT, SInv);

    // Updated state: x_new = x_pred + K * y
    const Ky = this.matrixVectorMultiply(K, [innovation, 0]);
    const xNew = this.vectorAdd(xPred, Ky);

    // Updated covariance: P_new = (I - K * H) * P_pred
    const KH = this.matrixMultiply(K, H);
    const I = this.identityMatrix(5);
    const IKH = this.matrixSubtract(I, KH);
    const PNew = this.matrixMultiply(IKH, PPred);

    return { xNew, PNew, innovation };
  }

  /**
   * Online covariance adaptation based on innovation sequence
   */
  private adaptCovariances(): void {
    if (this.state.innovations.length < this.windowSize) {
      return;
    }

    // Keep only recent innovations
    const recentInnovations = this.state.innovations.slice(-this.windowSize);
    this.state.innovations = recentInnovations;

    // Compute innovation covariance
    const mean = recentInnovations.reduce((a, b) => a + b, 0) / recentInnovations.length;
    const variance = recentInnovations.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentInnovations.length;

    // Adapt Q (process noise)
    const alpha = this.config.adaptiveAlpha;
    for (let i = 0; i < this.state.Q.length; i++) {
      this.state.Q[i][i] = alpha * this.state.Q[i][i] + (1 - alpha) * variance * 0.1;
    }

    // Adapt R (measurement noise)
    const beta = this.config.adaptiveBeta;
    const innovationCov = variance;
    this.state.R[0][0] = beta * this.state.R[0][0] + (1 - beta) * innovationCov;
  }

  /**
   * Update volatility estimate using exponential moving average
   */
  private updateVolatility(): void {
    if (this.priceHistory.length < 2) {
      return;
    }

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      const ret = Math.log(this.priceHistory[i] / this.priceHistory[i - 1]);
      returns.push(ret);
    }

    // Calculate rolling standard deviation
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
    const newVolatility = Math.sqrt(variance);

    // Exponential smoothing
    const smoothingFactor = 0.1;
    this.state.x[3] = smoothingFactor * newVolatility + (1 - smoothingFactor) * this.state.x[3];
  }

  /**
   * Get current filtered state
   */
  getFilteredState(): FilteredState {
    const volatility = this.state.x[3];
    const uncertainty = Math.sqrt(this.state.P[0][0]);
    
    return {
      price: this.state.x[0],
      velocity: this.state.x[1],
      acceleration: this.state.x[2],
      volatility: volatility,
      beta: this.state.x[4],
      uncertainty: uncertainty,
      confidence: Math.max(0, Math.min(10000, Math.round((1 - uncertainty / this.state.x[0]) * 10000))),
      regime: this.classifyRegime(volatility),
    };
  }

  /**
   * Classify volatility regime
   */
  private classifyRegime(volatility: number): VolatilityRegime {
    // Check for manipulation signals (high kurtosis)
    if (this.priceHistory.length >= 20) {
      const kurtosis = this.calculateKurtosis();
      if (kurtosis > 5) {
        return VolatilityRegime.MANIPULATED;
      }
    }

    if (volatility > 0.15) {
      return VolatilityRegime.CRISIS;
    } else if (volatility > 0.05) {
      return VolatilityRegime.VOLATILE;
    } else if (volatility > 0.01) {
      return VolatilityRegime.NORMAL;
    } else {
      return VolatilityRegime.STABLE;
    }
  }

  /**
   * Calculate excess kurtosis for manipulation detection
   */
  private calculateKurtosis(): number {
    if (this.priceHistory.length < 4) {
      return 0;
    }

    const returns: number[] = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      returns.push(Math.log(this.priceHistory[i] / this.priceHistory[i - 1]));
    }

    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    
    const m2 = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const m4 = returns.reduce((sum, val) => sum + Math.pow(val - mean, 4), 0) / n;

    if (m2 === 0) return 0;
    
    // Excess kurtosis
    return (m4 / Math.pow(m2, 2)) - 3;
  }

  /**
   * Get raw state for on-chain updates
   */
  getRawState(): KalmanState {
    return { ...this.state };
  }

  /**
   * Reset filter to initial state
   */
  reset(): void {
    this.state = {
      x: [0, 0, 0, 0.01, 1],
      P: this.copyMatrix(this.config.initialCovariance),
      Q: this.copyMatrix(this.config.processNoiseQ),
      R: this.copyMatrix(this.config.measurementNoiseR),
      timestamp: Date.now(),
      innovations: [],
      residuals: [],
    };
    this.priceHistory = [];
    this.innovationHistory = [];
  }

  // Matrix operations
  private matrixMultiply(A: number[][], B: number[][]): number[][] {
    const rowsA = A.length;
    const colsA = A[0].length;
    const colsB = B[0].length;
    const result: number[][] = Array(rowsA).fill(null).map(() => Array(colsB).fill(0));

    for (let i = 0; i < rowsA; i++) {
      for (let j = 0; j < colsB; j++) {
        for (let k = 0; k < colsA; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  private matrixVectorMultiply(A: number[][], v: number[]): number[] {
    return A.map(row => row.reduce((sum, val, i) => sum + val * v[i], 0));
  }

  private transpose(A: number[][]): number[][] {
    return A[0].map((_, i) => A.map(row => row[i]));
  }

  private matrixAdd(A: number[][], B: number[][]): number[][] {
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
  }

  private matrixSubtract(A: number[][], B: number[][]): number[][] {
    return A.map((row, i) => row.map((val, j) => val - B[i][j]));
  }

  private vectorAdd(a: number[], b: number[]): number[] {
    return a.map((val, i) => val + b[i]);
  }

  private identityMatrix(n: number): number[][] {
    return Array(n).fill(null).map((_, i) => 
      Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
    );
  }

  private copyMatrix(A: number[][]): number[][] {
    return A.map(row => [...row]);
  }

  private invertMatrix2x2(A: number[][]): number[][] {
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    if (Math.abs(det) < 1e-10) {
      // Return pseudo-inverse for singular matrix
      return [[1 / (A[0][0] || 1), 0], [0, 1 / (A[1][1] || 1)]];
    }
    return [
      [A[1][1] / det, -A[0][1] / det],
      [-A[1][0] / det, A[0][0] / det],
    ];
  }
}
