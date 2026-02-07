import { Outlet, NavLink } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Droplets,
  BarChart3,
  Bot,
  Settings,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { useDashboardStore, selectCriticalAlerts } from '../store/dashboard';
import { useLiveAgentState } from '../hooks/useLiveAgentState';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/pools', icon: Droplets, label: 'Pools' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/agents', icon: Bot, label: 'Agents' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Layout() {
  const criticalAlerts = useDashboardStore(selectCriticalAlerts);
  const isConnected = useDashboardStore((s) => s.isConnected);
  const error = useDashboardStore((s) => s.error);

  useLiveAgentState();

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-900/50 backdrop-blur-xl border-r border-dark-700/50 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-dark-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gradient">KalmanGuard</h1>
              <p className="text-xs text-dark-400">LP Protection</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30'
                    : 'text-dark-300 hover:text-white hover:bg-dark-800/50'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Critical Alert Indicator */}
        {criticalAlerts.length > 0 && (
          <div className="p-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-danger-900/30 border border-danger-500/50 rounded-lg"
            >
              <div className="flex items-center gap-2 text-danger-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''}
                </span>
              </div>
            </motion.div>
          </div>
        )}

        {/* Version */}
        <div className="p-4 border-t border-dark-700/50">
          <p className="text-xs text-dark-500 text-center">v1.0.0 • Mainnet</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-dark-700/50 bg-dark-900/30 backdrop-blur-xl flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-dark-100">
              AI-Powered LP Protection
            </h2>
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
                isConnected
                  ? 'bg-success-900/30 border-success-500/30'
                  : 'bg-danger-900/30 border-danger-500/30'
              }`}
              title={error || undefined}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-success-500 animate-pulse' : 'bg-danger-500'
                }`}
              />
              <span
                className={`text-xs font-medium ${
                  isConnected ? 'text-success-400' : 'text-danger-400'
                }`}
              >
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Network Status */}
            <div className="flex items-center gap-2 text-sm text-dark-400">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success-500' : 'bg-danger-500'}`} />
              <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>

            {/* Connect Wallet */}
            <ConnectButton
              showBalance={false}
              accountStatus="address"
              chainStatus="icon"
            />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
