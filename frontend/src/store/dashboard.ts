import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Types
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

export interface KalmanState {
  price: number;
  velocity: number;
  acceleration: number;
  volatility: number;
  beta: number;
  confidence: number;
  regime: VolatilityRegime;
  timestamp: number;
}

export interface AgentStatus {
  id: string;
  name: string;
  type: 'price-monitor' | 'mev-detector' | 'risk-scoring' | 'execution' | 'cross-chain';
  status: 'running' | 'paused' | 'error' | 'stopped';
  lastUpdate: number;
  metrics: Record<string, number>;
}

export interface PoolInfo {
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
  riskScore: number;
  kalman: {
    velocity: number;
    acceleration: number;
    volatility: number;
    beta: number;
    confidence: number;
    regime: VolatilityRegime;
  };
  lastUpdate: number;
}

export interface AlertInfo {
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

// Store State
interface DashboardState {
  // Kalman Filter State
  kalmanState: KalmanState;
  kalmanHistory: KalmanState[];
  
  // Agent State
  agents: AgentStatus[];
  
  // Pool State
  pools: PoolInfo[];
  selectedPool: string | null;
  
  // Alerts
  alerts: AlertInfo[];

  // Analytics
  analytics: AnalyticsSnapshot;
  
  // UI State
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  updateKalmanState: (state: Partial<KalmanState>) => void;
  addKalmanHistory: (state: KalmanState) => void;
  updateAgent: (id: string, update: Partial<AgentStatus>) => void;
  setAgents: (agents: AgentStatus[]) => void;
  updatePool: (id: string, update: Partial<PoolInfo>) => void;
  setPools: (pools: PoolInfo[]) => void;
  selectPool: (id: string | null) => void;
  addAlert: (alert: Omit<AlertInfo, 'id' | 'timestamp'>) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  setAlerts: (alerts: AlertInfo[]) => void;
  setAnalytics: (analytics: AnalyticsSnapshot) => void;
  ingestSnapshot: (snapshot: {
    timestamp?: number;
    pools: PoolInfo[];
    agents: AgentStatus[];
    alerts: AlertInfo[];
    analytics: AnalyticsSnapshot;
  }) => void;
  setConnected: (connected: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Initial state
const initialKalmanState: KalmanState = {
  price: 2000,
  velocity: 0,
  acceleration: 0,
  volatility: 0.01,
  beta: 1,
  confidence: 1,
  regime: 'normal',
  timestamp: Date.now(),
};

const initialAnalytics: AnalyticsSnapshot = {
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

// Create store
export const useDashboardStore = create<DashboardState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    kalmanState: initialKalmanState,
    kalmanHistory: [],
    agents: [],
    pools: [],
    selectedPool: null,
    alerts: [],
    analytics: initialAnalytics,
    isConnected: false,
    isLoading: false,
    error: null,
    
    // Actions
    updateKalmanState: (update) =>
      set((state) => ({
        kalmanState: { ...state.kalmanState, ...update, timestamp: Date.now() },
      })),
    
    addKalmanHistory: (newState) =>
      set((state) => ({
        kalmanHistory: [...state.kalmanHistory.slice(-999), newState],
      })),
    
    updateAgent: (id, update) =>
      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === id ? { ...agent, ...update, lastUpdate: Date.now() } : agent
        ),
      })),
    
    setAgents: (agents) => set({ agents }),
    
    updatePool: (id, update) =>
      set((state) => ({
        pools: state.pools.map((pool) =>
          pool.id === id ? { ...pool, ...update } : pool
        ),
      })),
    
    setPools: (pools) => set({ pools }),
    
    selectPool: (id) => set({ selectedPool: id }),
    
    addAlert: (alert) =>
      set((state) => ({
        alerts: [
          {
            ...alert,
            id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
          },
          ...state.alerts.slice(0, 99),
        ],
      })),
    
    dismissAlert: (id) =>
      set((state) => ({
        alerts: state.alerts.filter((alert) => alert.id !== id),
      })),
    
    clearAlerts: () => set({ alerts: [] }),

    setAlerts: (alerts) => set({ alerts }),
    setAnalytics: (analytics) => set({ analytics }),

    ingestSnapshot: (snapshot) => {
      set({
        pools: snapshot.pools,
        agents: snapshot.agents,
        alerts: snapshot.alerts,
        analytics: snapshot.analytics,
      });

      // Keep kalman state in-sync with selected (or first) pool
      const pools = snapshot.pools;
      const selectedId = get().selectedPool;
      const pool = (selectedId && pools.find((p) => p.id === selectedId)) || pools[0];
      if (pool) {
        set({
          kalmanState: {
            price: pool.price,
            velocity: pool.kalman.velocity,
            acceleration: pool.kalman.acceleration,
            volatility: pool.kalman.volatility,
            beta: pool.kalman.beta,
            confidence: pool.kalman.confidence,
            regime: pool.kalman.regime,
            timestamp: pool.lastUpdate,
          },
        });
      }

      // Maintain a chart-friendly history from analytics
      const hist = snapshot.analytics.priceHistory.map((p) => ({
        price: p.estimate,
        velocity: 0,
        acceleration: 0,
        volatility: 0,
        beta: 0,
        confidence: 1,
        regime: 'normal' as const,
        timestamp: p.t,
      }));
      set({ kalmanHistory: hist.slice(-300) });
    },
    
    setConnected: (connected) => set({ isConnected: connected }),
    
    setLoading: (loading) => set({ isLoading: loading }),
    
    setError: (error) => set({ error }),
  }))
);

// Selectors
export const selectKalmanState = (state: DashboardState) => state.kalmanState;
export const selectKalmanHistory = (state: DashboardState) => state.kalmanHistory;
export const selectAgents = (state: DashboardState) => state.agents;
export const selectPools = (state: DashboardState) => state.pools;
export const selectSelectedPool = (state: DashboardState) => 
  state.pools.find(p => p.id === state.selectedPool);
export const selectAlerts = (state: DashboardState) => state.alerts;
export const selectCriticalAlerts = (state: DashboardState) =>
  state.alerts.filter((a) => a.severity === 'critical');

export const selectAnalytics = (state: DashboardState) => state.analytics;
