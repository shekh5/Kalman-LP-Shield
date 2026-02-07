import { KalmanEngineClient } from '../api/kalmanEngineClient';
import { StateStore, PoolState, VolatilityRegime } from '../api/stateStore';

export interface DemoRunnerConfig {
  kalmanEngineUrl: string;
  tickMs: number;
  seed: number;
}

function pickRegime(r: string): VolatilityRegime {
  const v = r.toLowerCase();
  if (v.includes('low') || v.includes('stable')) return 'low';
  if (v.includes('extreme') || v.includes('crisis')) return 'extreme';
  if (v.includes('high') || v.includes('volatile')) return 'high';
  return 'normal';
}

// Simple deterministic PRNG (xorshift32)
function xorshift32(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 0xffffffff) as number;
  };
}

export class DemoRunner {
  private store: StateStore;
  private cfg: DemoRunnerConfig;
  private kalman: KalmanEngineClient;
  private stopFlag = false;
  private rand: () => number;

  // internal series
  private poolPrices: Record<string, number> = {};

  constructor(store: StateStore, cfg: DemoRunnerConfig) {
    this.store = store;
    this.cfg = cfg;
    this.kalman = new KalmanEngineClient(cfg.kalmanEngineUrl);
    this.rand = xorshift32(cfg.seed);

    const now = Date.now();

    const pools: PoolState[] = [
      {
        id: 'demo:sepolia:ETH/USDC',
        chainId: 11155111,
        chainName: 'sepolia',
        token0: 'ETH',
        token1: 'USDC',
        baseFeeBps: 30,
        currentFeeBps: 30,
        tvlUsd: 250000,
        volume24hUsd: 120000,
        price: 2000,
        kalman: {
          velocity: 0,
          acceleration: 0,
          volatility: 0.02,
          beta: 1,
          confidence: 0.9,
          regime: 'normal',
        },
        riskScore: 25,
        lastUpdate: now,
      },
      {
        id: 'demo:sepolia:WBTC/ETH',
        chainId: 11155111,
        chainName: 'sepolia',
        token0: 'WBTC',
        token1: 'ETH',
        baseFeeBps: 30,
        currentFeeBps: 30,
        tvlUsd: 180000,
        volume24hUsd: 60000,
        price: 16.5,
        kalman: {
          velocity: 0,
          acceleration: 0,
          volatility: 0.03,
          beta: 1.2,
          confidence: 0.9,
          regime: 'normal',
        },
        riskScore: 35,
        lastUpdate: now,
      },
      {
        id: 'demo:sepolia:USDC/USDT',
        chainId: 11155111,
        chainName: 'sepolia',
        token0: 'USDC',
        token1: 'USDT',
        baseFeeBps: 1,
        currentFeeBps: 1,
        tvlUsd: 300000,
        volume24hUsd: 200000,
        price: 1.0,
        kalman: {
          velocity: 0,
          acceleration: 0,
          volatility: 0.005,
          beta: 0.2,
          confidence: 0.95,
          regime: 'low',
        },
        riskScore: 10,
        lastUpdate: now,
      },
    ];

    for (const p of pools) {
      this.store.upsertPool(p);
      this.poolPrices[p.id] = p.price;
    }

    this.store.addAlert({
      type: 'info',
      severity: 'info',
      message: 'Demo mode enabled: synthetic Sepolia pools updating live.',
    });
  }

  async start(onTick?: (snapshot: any) => void): Promise<void> {
    const engineOk = await this.kalman.health();
    if (!engineOk) {
      this.store.addAlert({
        type: 'risk',
        severity: 'warning',
        message: 'Kalman Engine not reachable. Demo will run with degraded updates.',
      });
    }

    while (!this.stopFlag) {
      const t = Date.now();

      const pools = this.store.getPools();
      let mevAttempts = 0;

      for (const pool of pools) {
        const base = this.poolPrices[pool.id] ?? pool.price;
        const drift = (this.rand() - 0.5) * 0.001;
        const shock = (this.rand() - 0.5) * (pool.token0 === 'USDC' ? 0.0002 : 0.01);

        // occasional jump
        const jump = this.rand() < 0.01 ? (this.rand() - 0.5) * 0.08 : 0;
        const next = Math.max(0.0001, base * (1 + drift + shock + jump));
        this.poolPrices[pool.id] = next;

        try {
          if (engineOk) {
            const res = await this.kalman.update(pool.id, next, t / 1000);
            const regime = pickRegime(res.regime);

            const feeBps = Math.max(1, Math.min(200, Math.round(res.fee_recommendation)));
            const riskScore = Math.max(0, Math.min(100, res.risk_score));

            // Random MEV attempt correlated with risk
            const mev = this.rand() < (0.01 + riskScore / 20000) ? 1 : 0;
            mevAttempts += mev;
            if (mev) {
              this.store.addAlert({
                type: 'mev',
                severity: riskScore > 70 ? 'critical' : 'warning',
                poolId: pool.id,
                message: `MEV activity detected on ${pool.token0}/${pool.token1}. Fee shield engaged.`,
              });
              this.store.updateAgent('mev-detector', {
                metrics: {
                  ...this.store.getAgents().find((a) => a.id === 'mev-detector')?.metrics,
                  attacks: (this.store.getAgents().find((a) => a.id === 'mev-detector')?.metrics.attacks || 0) + 1,
                } as any,
              });
            }

            this.store.updatePool(pool.id, {
              price: res.price,
              currentFeeBps: feeBps,
              riskScore,
              kalman: {
                velocity: res.velocity,
                acceleration: res.acceleration,
                volatility: res.volatility,
                beta: res.beta,
                confidence: res.confidence,
                regime,
              },
            });

            this.store.updateAgent('price-monitor', {
              metrics: {
                updates: (this.store.getAgents().find((a) => a.id === 'price-monitor')?.metrics.updates || 0) + 1,
                latencyMs: 50,
                sources: 3,
              } as any,
            });

            this.store.updateAgent('risk-scoring', {
              metrics: {
                updates: (this.store.getAgents().find((a) => a.id === 'risk-scoring')?.metrics.updates || 0) + 1,
              } as any,
            });

            this.store.appendAnalyticsPoint({
              t,
              actual: next,
              estimate: res.price,
              lower95: res.price - 1.96 * 0.5,
              upper95: res.price + 1.96 * 0.5,
              risk: riskScore,
              mevAttempts: mevAttempts,
              feeBps,
            });
          } else {
            // degraded mode: update only price
            this.store.updatePool(pool.id, { price: next, lastUpdate: t } as any);
          }
        } catch {
          // ignore per-pool failures
        }
      }

      onTick?.(this.store.getPublicState());

      await new Promise((r) => setTimeout(r, this.cfg.tickMs));
    }
  }

  stop(): void {
    this.stopFlag = true;
  }
}
