import { motion } from 'framer-motion';

interface RiskGaugeProps {
  score: number; // 0-100
}

export function RiskGauge({ score }: RiskGaugeProps) {
  // Clamp score between 0 and 100
  const clampedScore = Math.max(0, Math.min(100, score));
  
  // Determine color based on score
  const getColor = (score: number) => {
    if (score < 30) return { color: '#22c55e', label: 'Low Risk', bg: 'rgba(34, 197, 94, 0.1)' };
    if (score < 60) return { color: '#f59e0b', label: 'Moderate Risk', bg: 'rgba(245, 158, 11, 0.1)' };
    if (score < 80) return { color: '#f97316', label: 'High Risk', bg: 'rgba(249, 115, 22, 0.1)' };
    return { color: '#ef4444', label: 'Extreme Risk', bg: 'rgba(239, 68, 68, 0.1)' };
  };

  const { color, label, bg } = getColor(clampedScore);
  
  // Calculate the arc path
  const radius = 80;
  const strokeWidth = 12;
  const center = 100;
  const startAngle = -180;
  const endAngle = 0;
  const totalAngle = endAngle - startAngle;
  const scoreAngle = startAngle + (clampedScore / 100) * totalAngle;

  const polarToCartesian = (angle: number) => {
    const radian = (angle * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(radian),
      y: center + radius * Math.sin(radian),
    };
  };

  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  const scorePoint = polarToCartesian(scoreAngle);

  const backgroundArc = `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
  const scoreArc = `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${scorePoint.x} ${scorePoint.y}`;

  return (
    <div className="flex flex-col items-center">
      {/* SVG Gauge */}
      <svg viewBox="0 0 200 120" className="w-full max-w-[250px]">
        {/* Background arc */}
        <path
          d={backgroundArc}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* Score arc */}
        <motion.path
          d={scoreArc}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const tickAngle = startAngle + (tick / 100) * totalAngle;
          const innerPoint = polarToCartesian(tickAngle);
          const outerRadius = radius + 8;
          const radian = (tickAngle * Math.PI) / 180;
          const outerPoint = {
            x: center + outerRadius * Math.cos(radian),
            y: center + outerRadius * Math.sin(radian),
          };
          
          return (
            <g key={tick}>
              <line
                x1={innerPoint.x}
                y1={innerPoint.y}
                x2={outerPoint.x}
                y2={outerPoint.y}
                stroke="#475569"
                strokeWidth={2}
              />
              <text
                x={outerPoint.x + (tick === 0 ? -10 : tick === 100 ? 10 : 0)}
                y={outerPoint.y + (tick === 50 ? -8 : 5)}
                fill="#64748b"
                fontSize="10"
                textAnchor="middle"
              >
                {tick}
              </text>
            </g>
          );
        })}
        
        {/* Needle */}
        <motion.g
          initial={{ rotate: -180 }}
          animate={{ rotate: -180 + (clampedScore / 100) * 180 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        >
          <polygon
            points={`${center},${center - 5} ${center + radius - 15},${center} ${center},${center + 5}`}
            fill={color}
          />
          <circle cx={center} cy={center} r={8} fill={color} />
          <circle cx={center} cy={center} r={4} fill="#0f172a" />
        </motion.g>
      </svg>

      {/* Score Display */}
      <motion.div
        className="text-center -mt-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-4xl font-bold" style={{ color }}>
          {clampedScore}
        </p>
        <p className="text-sm text-dark-400 mt-1">{label}</p>
      </motion.div>

      {/* Risk Breakdown */}
      <div className="w-full mt-6 space-y-3">
        <RiskComponent label="Volatility Risk" value={35} maxValue={40} />
        <RiskComponent label="MEV Risk" value={20} maxValue={30} />
        <RiskComponent label="Liquidity Risk" value={15} maxValue={20} />
        <RiskComponent label="Trend Risk" value={10} maxValue={10} />
      </div>
    </div>
  );
}

interface RiskComponentProps {
  label: string;
  value: number;
  maxValue: number;
}

function RiskComponent({ label, value, maxValue }: RiskComponentProps) {
  const percentage = (value / maxValue) * 100;
  const getBarColor = (pct: number) => {
    if (pct < 40) return 'bg-success-500';
    if (pct < 70) return 'bg-warning-500';
    return 'bg-danger-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-dark-400">{label}</span>
        <span className="text-dark-300 font-medium">{value}/{maxValue}</span>
      </div>
      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${getBarColor(percentage)}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, delay: 0.5 }}
        />
      </div>
    </div>
  );
}
