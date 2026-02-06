import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Shield, Zap, AlertTriangle } from 'lucide-react';
import { KalmanFilterViz } from '../components/charts/KalmanFilterViz.tsx';
import { RiskGauge } from '../components/charts/RiskGauge.tsx';
import { FeeHeatmap } from '../components/charts/FeeHeatmap.tsx';
import { AlertList } from '../components/AlertList.tsx';
import { AgentStatusGrid } from '../components/AgentStatusGrid.tsx';
import { useDashboardStore, selectKalmanState, selectAlerts } from '../store/dashboard';

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: 'primary' | 'success' | 'warning' | 'danger';
}

function StatCard({ title, value, change, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    primary: 'from-primary-500 to-primary-700',
    success: 'from-success-500 to-success-700',
    warning: 'from-warning-500 to-warning-700',
    danger: 'from-danger-500 to-danger-700',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="stat-card"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-dark-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${
              change >= 0 ? 'text-success-400' : 'text-danger-400'
            }`}>
              {change >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{Math.abs(change).toFixed(2)}%</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

// Regime Badge Component
function RegimeBadge({ regime }: { regime: string }) {
  const regimeConfig = {
    low: { label: 'Low Volatility', class: 'regime-low' },
    normal: { label: 'Normal', class: 'regime-normal' },
    high: { label: 'High Volatility', class: 'regime-high' },
    extreme: { label: 'EXTREME', class: 'regime-extreme' },
  };

  const config = regimeConfig[regime as keyof typeof regimeConfig] || regimeConfig.normal;

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${config.class}`}>
      {config.label}
    </span>
  );
}

export function Dashboard() {
  const kalmanState = useDashboardStore(selectKalmanState);
  const alerts = useDashboardStore(selectAlerts);
  
  // Mock data - in production, this comes from the agent system
  const mockStats = {
    totalProtected: '$12.5M',
    totalPools: 24,
    avgRiskScore: 35,
    mevBlocked: 156,
    feesCollected: '$45.2K',
    activeAgents: 5,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-dark-400">Real-time LP protection monitoring</p>
        </div>
        <RegimeBadge regime={kalmanState.regime} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Value Protected"
          value={mockStats.totalProtected}
          change={5.2}
          icon={Shield}
          color="primary"
        />
        <StatCard
          title="Active Pools"
          value={mockStats.totalPools}
          icon={Activity}
          color="success"
        />
        <StatCard
          title="MEV Attacks Blocked"
          value={mockStats.mevBlocked}
          change={12.5}
          icon={Zap}
          color="warning"
        />
        <StatCard
          title="Current Risk Score"
          value={mockStats.avgRiskScore}
          change={-3.2}
          icon={AlertTriangle}
          color={mockStats.avgRiskScore > 60 ? 'danger' : 'success'}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kalman Filter Visualization - Takes 2 columns */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-6"
          >
            <h3 className="text-lg font-semibold mb-4">Kalman Filter State</h3>
            <KalmanFilterViz />
          </motion.div>
        </div>

        {/* Risk Gauge */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel p-6 h-full"
          >
            <h3 className="text-lg font-semibold mb-4">Risk Score</h3>
            <RiskGauge score={mockStats.avgRiskScore} />
          </motion.div>
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fee Heatmap */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-6"
        >
          <h3 className="text-lg font-semibold mb-4">Dynamic Fee Heatmap</h3>
          <FeeHeatmap />
        </motion.div>

        {/* Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-panel p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Alerts</h3>
            {alerts.length > 0 && (
              <button
                onClick={() => useDashboardStore.getState().clearAlerts()}
                className="text-sm text-dark-400 hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          <AlertList alerts={alerts.slice(0, 5)} />
        </motion.div>
      </div>

      {/* Agent Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Agent Status</h3>
        <AgentStatusGrid />
      </motion.div>
    </div>
  );
}
