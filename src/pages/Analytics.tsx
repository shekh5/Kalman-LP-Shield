import { motion } from 'framer-motion';
import { Calendar, Download } from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// Mock analytics data
const priceHistory = Array.from({ length: 100 }, (_, i) => ({
  time: i,
  actual: 2000 + Math.sin(i * 0.1) * 100 + Math.random() * 20,
  predicted: 2000 + Math.sin(i * 0.1) * 100,
  upper: 2000 + Math.sin(i * 0.1) * 100 + 50,
  lower: 2000 + Math.sin(i * 0.1) * 100 - 50,
}));

const riskHistory = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  risk: Math.max(10, Math.min(90, 40 + Math.sin(i * 0.3) * 30 + Math.random() * 10)),
  mevAttempts: Math.floor(Math.random() * 20),
  feesCollected: 1000 + Math.random() * 500,
}));

const regimeDistribution = [
  { name: 'Low', value: 35, color: '#22c55e' },
  { name: 'Normal', value: 45, color: '#0ea5e9' },
  { name: 'High', value: 15, color: '#f59e0b' },
  { name: 'Extreme', value: 5, color: '#ef4444' },
];

const feePerformance = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  static: 0.3,
  dynamic: 0.3 + Math.sin(i * 0.3) * 0.15 + Math.random() * 0.05,
}));

export function Analytics() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-dark-400">Historical performance and insights</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="btn-secondary flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Last 30 days
          </button>
          <button className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Price Prediction Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Kalman Filter Predictions vs Actual</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#64748b" />
              <YAxis stroke="#64748b" domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="upper"
                stackId="1"
                stroke="transparent"
                fill="#0ea5e9"
                fillOpacity={0.1}
                name="95% Confidence"
              />
              <Area
                type="monotone"
                dataKey="lower"
                stackId="2"
                stroke="transparent"
                fill="#0ea5e9"
                fillOpacity={0.1}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
                name="Predicted"
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#f59e0b"
                strokeWidth={1}
                dot={false}
                name="Actual"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Score History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-6"
        >
          <h3 className="text-lg font-semibold mb-4">Risk Score History</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={riskHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="risk"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.2}
                  name="Risk Score"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* MEV Attacks Blocked */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel p-6"
        >
          <h3 className="text-lg font-semibold mb-4">MEV Attacks Blocked</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
                <Bar
                  dataKey="mevAttempts"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  name="MEV Attempts"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Fee Performance Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-6"
        >
          <h3 className="text-lg font-semibold mb-4">Dynamic vs Static Fee Performance</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={feePerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => `${(value * 100).toFixed(2)}%`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="static"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Static Fee"
                />
                <Line
                  type="monotone"
                  dataKey="dynamic"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="Dynamic Fee (KalmanGuard)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Regime Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-panel p-6"
        >
          <h3 className="text-lg font-semibold mb-4">Regime Distribution</h3>
          <div className="space-y-4">
            {regimeDistribution.map((regime) => (
              <div key={regime.name} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-dark-300">{regime.name}</span>
                  <span className="font-medium text-white">{regime.value}%</span>
                </div>
                <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${regime.value}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: regime.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 pt-4 border-t border-dark-700">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-dark-400">Average Fee</p>
                <p className="text-xl font-bold text-white">0.32%</p>
              </div>
              <div>
                <p className="text-sm text-dark-400">Fee Efficiency</p>
                <p className="text-xl font-bold text-success-400">+18.5%</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
