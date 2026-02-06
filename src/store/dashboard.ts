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
  address: string;
  token0: string;
  token1: string;
  fee: number;
  liquidity: bigint;
  riskScore: number;
  regime: VolatilityRegime;
  currentFee: number;
  volume24h: number;
}

export interface AlertInfo {
  id: string;
  type: 'mev' | 'volatility' | 'risk' | 'emergency';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  poolAddress?: string;
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
  
  // UI State
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  updateKalmanState: (state: Partial<KalmanState>) => void;
  addKalmanHistory: (state: KalmanState) => void;
  updateAgent: (id: string, update: Partial<AgentStatus>) => void;
  setAgents: (agents: AgentStatus[]) => void;
  updatePool: (address: string, update: Partial<PoolInfo>) => void;
  setPools: (pools: PoolInfo[]) => void;
  selectPool: (address: string | null) => void;
  addAlert: (alert: Omit<AlertInfo, 'id' | 'timestamp'>) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
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
    
    updatePool: (address, update) =>
      set((state) => ({
        pools: state.pools.map((pool) =>
          pool.address === address ? { ...pool, ...update } : pool
        ),
      })),
    
    setPools: (pools) => set({ pools }),
    
    selectPool: (address) => set({ selectedPool: address }),
    
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
  state.pools.find(p => p.address === state.selectedPool);
export const selectAlerts = (state: DashboardState) => state.alerts;
export const selectCriticalAlerts = (state: DashboardState) =>
  state.alerts.filter((a) => a.severity === 'critical');
