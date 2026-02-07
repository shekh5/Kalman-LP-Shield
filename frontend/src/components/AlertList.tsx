import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Zap, Activity, X } from 'lucide-react';
import { AlertInfo, useDashboardStore } from '../store/dashboard';

interface AlertListProps {
  alerts: AlertInfo[];
}

export function AlertList({ alerts }: AlertListProps) {
  const dismissAlert = useDashboardStore((state) => state.dismissAlert);

  const getAlertConfig = (alert: AlertInfo) => {
    switch (alert.type) {
      case 'mev':
        return {
          icon: Shield,
          color: 'danger',
          bgColor: 'bg-danger-900/30',
          borderColor: 'border-danger-500/30',
          iconColor: 'text-danger-400',
        };
      case 'volatility':
        return {
          icon: Activity,
          color: 'warning',
          bgColor: 'bg-warning-900/30',
          borderColor: 'border-warning-500/30',
          iconColor: 'text-warning-400',
        };
      case 'risk':
        return {
          icon: AlertTriangle,
          color: 'warning',
          bgColor: 'bg-warning-900/30',
          borderColor: 'border-warning-500/30',
          iconColor: 'text-warning-400',
        };
      case 'emergency':
        return {
          icon: Zap,
          color: 'danger',
          bgColor: 'bg-danger-900/50',
          borderColor: 'border-danger-500/50',
          iconColor: 'text-danger-400',
        };
      default:
        return {
          icon: Activity,
          color: 'primary',
          bgColor: 'bg-primary-900/30',
          borderColor: 'border-primary-500/30',
          iconColor: 'text-primary-400',
        };
    }
  };

  const getSeverityBadge = (severity: AlertInfo['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-danger-500 text-white';
      case 'warning':
        return 'bg-warning-500 text-dark-900';
      default:
        return 'bg-dark-600 text-dark-200';
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-dark-400">
        <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No active alerts</p>
        <p className="text-sm mt-1">Your pools are protected</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert) => {
          const config = getAlertConfig(alert);
          const Icon = config.icon;

          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className={`p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${config.bgColor}`}>
                  <Icon className={`w-4 h-4 ${config.iconColor}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityBadge(alert.severity)}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                    <span className="text-xs text-dark-500">
                      {formatTime(alert.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-dark-200">{alert.message}</p>
                  {alert.poolId && (
                    <p className="text-xs text-dark-500 font-mono mt-1 truncate">
                      Pool: {alert.poolId}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="p-1 text-dark-500 hover:text-dark-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
