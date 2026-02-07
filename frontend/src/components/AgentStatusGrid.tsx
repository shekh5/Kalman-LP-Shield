import { motion } from 'framer-motion';
import { Eye, Shield, Activity, Zap, GitBranch } from 'lucide-react';
import { useDashboardStore } from '../store/dashboard';

type AgentStatus = 'running' | 'paused' | 'error' | 'stopped';

const iconByType = {
  'price-monitor': { icon: Eye, color: 'from-blue-500 to-cyan-500' },
  'mev-detector': { icon: Shield, color: 'from-red-500 to-orange-500' },
  'risk-scoring': { icon: Activity, color: 'from-yellow-500 to-amber-500' },
  'execution': { icon: Zap, color: 'from-purple-500 to-pink-500' },
  'cross-chain': { icon: GitBranch, color: 'from-green-500 to-emerald-500' },
} as const;

export function AgentStatusGrid() {
  const agents = useDashboardStore((s) => s.agents);

  const getStatusIndicator = (status: AgentStatus) => {
    switch (status) {
      case 'running':
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            <span className="text-xs text-success-400">Running</span>
          </div>
        );
      case 'paused':
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-warning-500" />
            <span className="text-xs text-warning-400">Paused</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-danger-500 animate-pulse" />
            <span className="text-xs text-danger-400">Error</span>
          </div>
        );
      case 'stopped':
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-dark-500" />
            <span className="text-xs text-dark-400">Stopped</span>
          </div>
        );
    }
  };

  const formatLastUpdate = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    return `${Math.floor(diff / 60000)}m ago`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {agents.map((agent, index) => {
        const iconCfg = iconByType[agent.type];
        const Icon = iconCfg?.icon ?? Activity;
        const color = iconCfg?.color ?? 'from-slate-500 to-slate-700';
        
        return (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="p-4 bg-dark-800/50 rounded-lg border border-dark-700/50 hover:border-dark-600 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              {getStatusIndicator(agent.status)}
            </div>
            
            <h4 className="font-medium text-white text-sm mb-1">{agent.name}</h4>
            <p className="text-xs text-dark-500 mb-3">
              Updated {formatLastUpdate(agent.lastUpdate)}
            </p>
            
            <div className="space-y-1">
              {Object.entries(agent.metrics).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-dark-400">{key}</span>
                  <span className="text-dark-200 font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Activity indicator */}
            {agent.status === 'running' && (
              <div className="mt-3 h-1 bg-dark-700 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${color}`}
                  initial={{ width: '0%', x: '-100%' }}
                  animate={{ width: '30%', x: ['0%', '350%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
