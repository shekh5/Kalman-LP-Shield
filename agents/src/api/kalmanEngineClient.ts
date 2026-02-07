import axios from 'axios';

export type EngineRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' | string;

export interface KalmanUpdateResponse {
  price: number;
  velocity: number;
  acceleration: number;
  volatility: number;
  beta: number;
  confidence: number;
  regime: EngineRegime;
  risk_score: number;
  fee_recommendation: number; // basis points
}

export class KalmanEngineClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async health(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async update(poolId: string, price: number, timestamp?: number, variance?: number): Promise<KalmanUpdateResponse> {
    const res = await axios.post(
      `${this.baseUrl}/kalman/update`,
      {
        pool_id: poolId,
        price,
        timestamp,
        variance,
      },
      { timeout: 5000 }
    );

    return res.data as KalmanUpdateResponse;
  }

  async predict(poolId: string, steps: number): Promise<unknown> {
    const res = await axios.post(`${this.baseUrl}/kalman/predict`, { pool_id: poolId, steps }, { timeout: 5000 });
    return res.data;
  }
}
