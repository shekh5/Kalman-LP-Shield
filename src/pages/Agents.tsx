import { motion } from 'framer-motion';
import {
  Eye,
  Shield,
  Zap,
  GitBranch,
  Activity,
  Play,
  Pause,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';

// Agent configurations
const agentConfigs = [
  {
    id: 'price-monitor',
    name: 'Price Monitor',
    description: 'Monitors oracle feeds and updates Kalman filter state',
    icon: Eye,
    color: 'from-blue-500 to-cyan-500',
    metrics: {
      'Updates/min': 120,
      'Latency (ms)': 45,
      'Oracle Sources': 4,
    },
  },
  {
    id: 'mev-detector',
    name: 'MEV Detector',
    description: 'Detects sandwich attacks and frontrunning attempts',
    icon: Shield,
    color: 'from-red-500 to-orange-500',
    metrics: {
      'Scanned Txs': 15420,
      'Attacks Detected': 23,
      'False Positives': 2,
    },
  },
  {
    id: 'risk-scoring',
    name: 'Risk Scoring',
    description: 'Calculates composite risk scores from multiple factors',
    icon: Activity,
    color: 'from-yellow-500 to-amber-500',
    metrics: {
      'Current Score': 35,
      'Score Updates': 890,
      'Regime Changes': 12,
    },
  },
  {
    id: 'execution',
    name: 'Execution Agent',
    description: 'Executes fee updates and emergency actions via Flashbots',
    icon: Zap,
    color: 'from-purple-500 to-pink-500',
    metrics: {
      'Txs Submitted': 156,
      'Success Rate': '99.2%',
      'Gas Saved': '12.5 ETH',
    },
  },
  {
    id: 'cross-chain',
    name: 'Cross-Chain',
    description: 'Manages cross-chain liquidity via LI.FI integration',
    icon: GitBranch,
    color: 'from-green-500 to-emerald-500',
    metrics: {
      'Bridges Used': 3,
      'Volume Bridged': '$2.1M',
      'Chains Active': 5,
    },
  },
];

type AgentStatus = 'running' | 'paused' | 'error';

export function Agents() {
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(
    Object.fromEntries(agentConfigs.map((a) => [a.id, 'running' as AgentStatus]))
  );

  const toggleAgent = (id: string) => {
    setAgentStatuses((prev) => ({
      ...prev,
      [id]: prev[id] === 'running' ? 'paused' : 'running',
    }));
  };

  const getStatusColor = (status: AgentStatus) => {
    switch (status) {
      case 'running':
        return 'bg-success-500';
      case 'paused':
        return 'bg-warning-500';
      case 'error':
        return 'bg-danger-500';
    }
  };

  const getStatusText = (status: AgentStatus) => {
    switch (status) {
      case 'running':
        return 'Running';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Management</h1>
          <p className="text-dark-400">Monitor and control your autonomous agents</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Restart All
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            View Logs
          </button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {agentConfigs.map((agent, index) => {
          const status = agentStatuses[agent.id];
          const Icon = agent.icon;

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-panel p-6"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center`}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{agent.name}</h3>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
                      <span className="text-xs text-dark-400">{getStatusText(status)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleAgent(agent.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    status === 'running'
                      ? 'bg-dark-700 hover:bg-dark-600 text-dark-300'
                      : 'bg-success-900/30 hover:bg-success-900/50 text-success-400'
                  }`}
                >
                  {status === 'running' ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Description */}
              <p className="text-sm text-dark-400 mb-4">{agent.description}</p>

              {/* Metrics */}
              <div className="space-y-3 pt-4 border-t border-dark-700">
                {Object.entries(agent.metrics).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-dark-400">{key}</span>
                    <span className="text-sm font-medium text-white">{value}</span>
                  </div>
                ))}
              </div>

              {/* Activity Indicator */}
              {status === 'running' && (
                <div className="mt-4 pt-4 border-t border-dark-700">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-dark-700 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full bg-gradient-to-r ${agent.color}`}
                        initial={{ width: '0%' }}
                        animate={{ width: ['0%', '100%', '0%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                    <span className="text-xs text-dark-500">Active</span>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Agent Coordination Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Agent Coordination</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Message Flow */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-dark-300">Message Flow</h4>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-dark-400">
                <span className="font-mono">PriceMonitor</span>
                <span>→</span>
                <span className="font-mono">RiskScoring</span>
              </div>
              <div className="flex items-center gap-2 text-dark-400">
                <span className="font-mono">MEVDetector</span>
                <span>→</span>
                <span className="font-mono">Execution</span>
              </div>
              <div className="flex items-center gap-2 text-dark-400">
                <span className="font-mono">RiskScoring</span>
                <span>→</span>
                <span className="font-mono">CrossChain</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-dark-300">Coordination Stats</h4>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Messages/sec</span>
                <span className="text-white font-medium">245</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Avg Latency</span>
                <span className="text-white font-medium">12ms</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Queue Depth</span>
                <span className="text-white font-medium">3</span>
              </div>
            </div>
          </div>

          {/* Health */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-dark-300">System Health</h4>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">CPU Usage</span>
                <span className="text-success-400 font-medium">23%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Memory</span>
                <span className="text-success-400 font-medium">512 MB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Uptime</span>
                <span className="text-white font-medium">7d 14h 32m</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
