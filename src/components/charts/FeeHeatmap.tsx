import { useMemo } from 'react';

// Generate mock heatmap data
const generateHeatmapData = () => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  return days.map(day => 
    hours.map(hour => ({
      day,
      hour,
      fee: Math.round(10 + Math.random() * 90), // 10-100 bps
    }))
  ).flat();
};

export function FeeHeatmap() {
  const data = useMemo(() => generateHeatmapData(), []);
  
  const getColor = (fee: number) => {
    // Color scale from green (low fees) to red (high fees)
    if (fee < 20) return 'bg-success-900/80';
    if (fee < 35) return 'bg-success-700/80';
    if (fee < 50) return 'bg-warning-700/80';
    if (fee < 65) return 'bg-warning-600/80';
    if (fee < 80) return 'bg-danger-700/80';
    return 'bg-danger-600/80';
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-4">
      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex mb-2">
            <div className="w-10" /> {/* Spacer for day labels */}
            {hours.map(hour => (
              <div
                key={hour}
                className="flex-1 text-center text-xs text-dark-500"
              >
                {hour % 4 === 0 ? `${hour}:00` : ''}
              </div>
            ))}
          </div>

          {/* Heatmap rows */}
          {days.map(day => (
            <div key={day} className="flex items-center mb-1">
              <div className="w-10 text-xs text-dark-400 font-medium">{day}</div>
              <div className="flex-1 flex gap-0.5">
                {hours.map(hour => {
                  const cell = data.find(d => d.day === day && d.hour === hour);
                  const fee = cell?.fee || 30;
                  
                  return (
                    <div
                      key={`${day}-${hour}`}
                      className={`flex-1 h-6 rounded-sm ${getColor(fee)} cursor-pointer transition-all hover:opacity-80 hover:scale-110`}
                      title={`${day} ${hour}:00 - Fee: ${fee} bps`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4">
        <span className="text-xs text-dark-400">Low Fee</span>
        <div className="flex gap-1">
          <div className="w-6 h-3 rounded bg-success-900/80" />
          <div className="w-6 h-3 rounded bg-success-700/80" />
          <div className="w-6 h-3 rounded bg-warning-700/80" />
          <div className="w-6 h-3 rounded bg-warning-600/80" />
          <div className="w-6 h-3 rounded bg-danger-700/80" />
          <div className="w-6 h-3 rounded bg-danger-600/80" />
        </div>
        <span className="text-xs text-dark-400">High Fee</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-dark-700">
        <div className="text-center">
          <p className="text-xs text-dark-400">Avg Fee</p>
          <p className="text-lg font-semibold text-white">32 bps</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dark-400">Peak Hours</p>
          <p className="text-lg font-semibold text-white">14:00-18:00</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dark-400">Low Hours</p>
          <p className="text-lg font-semibold text-white">02:00-06:00</p>
        </div>
      </div>
    </div>
  );
}
