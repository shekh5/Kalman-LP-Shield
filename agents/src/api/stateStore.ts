export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

export interface PoolState {
  id: string;
  chainId: number;
  chainName: string;
  token0: string;
  token1: string;
  baseFeeBps: number;
  currentFeeBps: number;
  tvlUsd: number;
  volume24hUsd: number;
  price: number;
  kalman: {
    velocity: number;
    acceleration: number;
    volatility: number;
    beta: number;
    confidence: number;
    regime: VolatilityRegime;
  };
  riskScore: number; // 0-100
  lastUpdate: number;
}

export interface AgentState {
  id: string;
  name: string;
  type: 'price-monitor' | 'mev-detector' | 'risk-scoring' | 'execution' | 'cross-chain';
  status: 'running' | 'paused' | 'error' | 'stopped';
  lastUpdate: number;
  metrics: Record<string, number>;
}

export interface AlertState {
  id: string;
  type: 'mev' | 'volatility' | 'risk' | 'emergency' | 'info';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  poolId?: string;
}

export interface AnalyticsSnapshot {
  priceHistory: Array<{ t: number; actual: number; estimate: number; lower95: number; upper95: number }>;
  riskHistory: Array<{ t: number; risk: number; mevAttempts: number; feesCollectedUsd: number }>;
  feePerformance: Array<{ t: number; staticFee: number; dynamicFee: number }>;
  regimeDistribution: Array<{ regime: VolatilityRegime; share: number }>;
}

export interface PublicState {
  demoMode: boolean;
  timestamp: number;
  pools: PoolState[];
  agents: AgentState[];
  alerts: AlertState[];
  analytics: AnalyticsSnapshot;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export class StateStore {
  private demoMode: boolean;
  private pools: Map<string, PoolState> = new Map();
  private agents: Map<string, AgentState> = new Map();
  private alerts: AlertState[] = [];
  private analytics: AnalyticsSnapshot = {
    priceHistory: [],
    riskHistory: [],
    feePerformance: [],
    regimeDistribution: [
      { regime: 'low', share: 0 },
      { regime: 'normal', share: 0 },
      { regime: 'high', share: 0 },
      { regime: 'extreme', share: 0 },
    ],
  };

  constructor(demoMode: boolean) {
    this.demoMode = demoMode;

    // Seed baseline agent list so UI always renders something.
    this.setAgent({
      id: 'price-monitor',
      name: 'Price Monitor',
      type: 'price-monitor',
      status: 'running',
      lastUpdate: Date.now(),
      metrics: { updates: 0, latencyMs: 0, sources: 0 },
    });
    this.setAgent({
      id: 'mev-detector',
      name: 'MEV Detector',
      type: 'mev-detector',
      status: demoMode ? 'running' : 'paused',
      lastUpdate: Date.now(),
      metrics: { scannedTx: 0, attacks: 0 },
    });
    this.setAgent({
      id: 'risk-scoring',
      name: 'Risk Scoring',
      type: 'risk-scoring',
      status: 'running',
      lastUpdate: Date.now(),
      metrics: { updates: 0 },
    });
    this.setAgent({
      id: 'execution',
      name: 'Execution',
      type: 'execution',
      status: demoMode ? 'running' : 'paused',
      lastUpdate: Date.now(),
      metrics: { txSubmitted: 0, successRate: 1 },
    });
    this.setAgent({
      id: 'cross-chain',
      name: 'Cross-Chain',
      type: 'cross-chain',
      status: demoMode ? 'running' : 'paused',
      lastUpdate: Date.now(),
      metrics: { bridges: 0, volumeUsd: 0 },
    });
  }

  reset(): void {
    this.pools.clear();
    this.alerts = [];
    this.analytics = {
      priceHistory: [],
      riskHistory: [],
      feePerformance: [],
      regimeDistribution: [
        { regime: 'low', share: 0 },
        { regime: 'normal', share: 0 },
        { regime: 'high', share: 0 },
        { regime: 'extreme', share: 0 },
      ],
    };
  }

  upsertPool(pool: PoolState): void {
    this.pools.set(pool.id, pool);
    this.recomputeRegimeDistribution();
  }

  updatePool(poolId: string, update: Partial<PoolState>): void {
    const existing = this.pools.get(poolId);
    if (!existing) return;
    this.pools.set(poolId, { ...existing, ...update, lastUpdate: Date.now() });
    this.recomputeRegimeDistribution();
  }

  setAgent(agent: AgentState): void {
    this.agents.set(agent.id, agent);
  }

  updateAgent(agentId: string, update: Partial<AgentState>): void {
    const existing = this.agents.get(agentId);
    if (!existing) return;
    this.agents.set(agentId, { ...existing, ...update, lastUpdate: Date.now() });
  }

  addAlert(alert: Omit<AlertState, 'id' | 'timestamp'>): AlertState {
    const a: AlertState = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      timestamp: Date.now(),
    };
    this.alerts = [a, ...this.alerts].slice(0, 200);
    return a;
  }

  appendAnalyticsPoint(point: {
    t: number;
    actual: number;
    estimate: number;
    lower95: number;
    upper95: number;
    risk: number;
    mevAttempts: number;
    feeBps: number;
  }): void {
    this.analytics.priceHistory = [...this.analytics.priceHistory, {
      t: point.t,
      actual: point.actual,
      estimate: point.estimate,
      lower95: point.lower95,
      upper95: point.upper95,
    }].slice(-300);

    // Risk history (aggregate)
    const feesCollectedUsd = (point.feeBps / 1e4) * 1000; // demo rough
    this.analytics.riskHistory = [...this.analytics.riskHistory, {
      t: point.t,
      risk: point.risk,
      mevAttempts: point.mevAttempts,
      feesCollectedUsd,
    }].slice(-300);

    // Fee performance (compare static 30bps)
    const staticFee = 0.003;
    const dynamicFee = clamp(point.feeBps / 1e4, 0.0001, 0.02);
    this.analytics.feePerformance = [...this.analytics.feePerformance, {
      t: point.t,
      staticFee,
      dynamicFee,
    }].slice(-300);
  }

  getPools(): PoolState[] {
    return Array.from(this.pools.values()).sort((a, b) => b.tvlUsd - a.tvlUsd);
  }

  getAgents(): AgentState[] {
    return Array.from(this.agents.values());
  }

  getAlerts(): AlertState[] {
    return this.alerts;
  }

  getAnalytics(): AnalyticsSnapshot {
    return this.analytics;
  }

  getPublicState(): PublicState {
    return {
      demoMode: this.demoMode,
      timestamp: Date.now(),
      pools: this.getPools(),
      agents: this.getAgents(),
      alerts: this.getAlerts(),
      analytics: this.getAnalytics(),
    };
  }

  private recomputeRegimeDistribution() {
    const pools = this.getPools();
    if (pools.length === 0) {
      this.analytics.regimeDistribution = [
        { regime: 'low', share: 0 },
        { regime: 'normal', share: 0 },
        { regime: 'high', share: 0 },
        { regime: 'extreme', share: 0 },
      ];
      return;
    }

    const counts: Record<VolatilityRegime, number> = { low: 0, normal: 0, high: 0, extreme: 0 };
    for (const p of pools) counts[p.kalman.regime] += 1;

    this.analytics.regimeDistribution = (Object.keys(counts) as VolatilityRegime[]).map((regime) => ({
      regime,
      share: counts[regime] / pools.length,
    }));
  }
}
