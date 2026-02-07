import { motion } from 'framer-motion';
import {
  Activity,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useDashboardStore } from '../store/dashboard';

export function Agents() {
  const agents = useDashboardStore((s) => s.agents);
  const isConnected = useDashboardStore((s) => s.isConnected);

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
        {agents.map((agent, index) => {
          const status = agent.status;
          const Icon = Activity;

          const color =
            agent.type === 'price-monitor'
              ? 'from-blue-500 to-cyan-500'
              : agent.type === 'mev-detector'
                ? 'from-red-500 to-orange-500'
                : agent.type === 'risk-scoring'
                  ? 'from-yellow-500 to-amber-500'
                  : agent.type === 'execution'
                    ? 'from-purple-500 to-pink-500'
                    : 'from-green-500 to-emerald-500';

          const getStatusColor = (s: string) =>
            s === 'running' ? 'bg-success-500' : s === 'paused' ? 'bg-warning-500' : 'bg-danger-500';
          const getStatusText = (s: string) =>
            s === 'running' ? 'Running' : s === 'paused' ? 'Paused' : 'Error';

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
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}
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
                  disabled
                  className="p-2 rounded-lg bg-dark-800 text-dark-500 cursor-not-allowed"
                  title={isConnected ? 'Controls not enabled in demo' : 'Offline'}
                >
                  <Terminal className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className="text-sm text-dark-400 mb-4">
                Live status + metrics from the agent service.
              </p>

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
                        className={`h-full rounded-full bg-gradient-to-r ${color}`}
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
