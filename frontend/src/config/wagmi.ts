import { http } from 'wagmi';
import { mainnet, arbitrum, optimism, polygon, base, sepolia } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// Project ID from WalletConnect Cloud
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

export const wagmiConfig = getDefaultConfig({
  appName: 'KalmanGuard',
  projectId,
  chains: [mainnet, arbitrum, optimism, polygon, base, sepolia],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
  },
});

// Contract addresses (to be deployed)
export const CONTRACT_ADDRESSES = {
  mainnet: {
    kalmanGuardHook: '0x0000000000000000000000000000000000000000',
    privateOrderPool: '0x0000000000000000000000000000000000000000',
    riskOracleRegistry: '0x0000000000000000000000000000000000000000',
    agentController: '0x0000000000000000000000000000000000000000',
  },
  arbitrum: {
    kalmanGuardHook: '0x0000000000000000000000000000000000000000',
    privateOrderPool: '0x0000000000000000000000000000000000000000',
    riskOracleRegistry: '0x0000000000000000000000000000000000000000',
    agentController: '0x0000000000000000000000000000000000000000',
  },
  optimism: {
    kalmanGuardHook: '0x0000000000000000000000000000000000000000',
    privateOrderPool: '0x0000000000000000000000000000000000000000',
    riskOracleRegistry: '0x0000000000000000000000000000000000000000',
    agentController: '0x0000000000000000000000000000000000000000',
  },
  polygon: {
    kalmanGuardHook: '0x0000000000000000000000000000000000000000',
    privateOrderPool: '0x0000000000000000000000000000000000000000',
    riskOracleRegistry: '0x0000000000000000000000000000000000000000',
    agentController: '0x0000000000000000000000000000000000000000',
  },
  base: {
    kalmanGuardHook: '0x0000000000000000000000000000000000000000',
    privateOrderPool: '0x0000000000000000000000000000000000000000',
    riskOracleRegistry: '0x0000000000000000000000000000000000000000',
    agentController: '0x0000000000000000000000000000000000000000',
  },
} as const;

// API endpoints
export const API_CONFIG = {
  // Default to same-origin (nginx proxies /api and /ws)
  agentApi: import.meta.env.VITE_AGENT_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : ''),
  kalmanEngine: import.meta.env.VITE_KALMAN_ENGINE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : ''),
  wsEndpoint: import.meta.env.VITE_WS_ENDPOINT || (import.meta.env.DEV ? 'ws://localhost:3001/ws' : ''),
};
