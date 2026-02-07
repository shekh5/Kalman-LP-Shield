import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDashboardStore, selectKalmanState, selectAnalytics } from '../../store/dashboard';

export function KalmanFilterViz() {
  const kalmanState = useDashboardStore(selectKalmanState);
  const analytics = useDashboardStore(selectAnalytics);

  const history = analytics.priceHistory.map((p, idx) => ({
    idx,
    actual: p.actual,
    estimate: p.estimate,
    upper: p.upper95,
    lower: p.lower95,
  }));

  return (
    <div className="space-y-6">
      {/* State Vector Display */}
      <div className="grid grid-cols-5 gap-4">
        <StateItem label="Price" value={`$${kalmanState.price.toFixed(2)}`} />
        <StateItem 
          label="Velocity" 
          value={kalmanState.velocity.toFixed(4)} 
          color={kalmanState.velocity >= 0 ? 'success' : 'danger'}
        />
        <StateItem 
          label="Acceleration" 
          value={kalmanState.acceleration.toFixed(4)}
          color={kalmanState.acceleration >= 0 ? 'success' : 'danger'}
        />
        <StateItem 
          label="Volatility" 
          value={(kalmanState.volatility * 100).toFixed(2) + '%'}
          color={kalmanState.volatility > 0.03 ? 'danger' : 'success'}
        />
        <StateItem 
          label="Beta" 
          value={kalmanState.beta.toFixed(2)}
        />
      </div>

      {/* Price Chart with Predictions */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="idx" 
              stroke="#64748b"
              tick={{ fontSize: 10 }}
            />
            <YAxis 
              stroke="#64748b"
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            
            {/* Confidence band */}
            <Line
              type="monotone"
              dataKey="upper"
              stroke="#0ea5e9"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              opacity={0.3}
            />
            <Line
              type="monotone"
              dataKey="lower"
              stroke="#0ea5e9"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              opacity={0.3}
            />
            
            {/* Actual price */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="Actual"
            />
            
            {/* Predicted price */}
            <Line
              type="monotone"
              dataKey="estimate"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              name="Kalman Estimate"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence Indicator */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-dark-400">Confidence:</span>
        <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary-500 to-success-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${kalmanState.confidence * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <span className="text-sm font-medium text-white">
          {(kalmanState.confidence * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

interface StateItemProps {
  label: string;
  value: string;
  color?: 'success' | 'danger' | 'default';
}

function StateItem({ label, value, color = 'default' }: StateItemProps) {
  const colorClass = {
    success: 'text-success-400',
    danger: 'text-danger-400',
    default: 'text-white',
  }[color];

  return (
    <div className="text-center">
      <p className="text-xs text-dark-400 mb-1">{label}</p>
      <p className={`text-sm font-mono font-medium ${colorClass}`}>{value}</p>
    </div>
  );
}
