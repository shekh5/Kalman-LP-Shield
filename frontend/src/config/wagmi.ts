import { http, createConfig } from 'wagmi';
import { mainnet, arbitrum, optimism, polygon, base } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// Project ID from WalletConnect Cloud
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

export const wagmiConfig = getDefaultConfig({
  appName: 'KalmanGuard',
  projectId,
  chains: [mainnet, arbitrum, optimism, polygon, base],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
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
  agentApi: import.meta.env.VITE_AGENT_API_URL || 'http://localhost:3001',
  kalmanEngine: import.meta.env.VITE_KALMAN_ENGINE_URL || 'http://localhost:8000',
  wsEndpoint: import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:3001/ws',
};
