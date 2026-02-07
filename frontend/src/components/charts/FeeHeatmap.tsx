import { useMemo } from 'react';
import { useDashboardStore, selectAnalytics } from '../../store/dashboard';

export function FeeHeatmap() {
  const analytics = useDashboardStore(selectAnalytics);

  const { data, avgFeeBps, peakHoursLabel, lowHoursLabel } = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Aggregate dynamic fees by (day,hour)
    type CellKey = `${string}:${number}`;
    const sums = new Map<CellKey, { sum: number; count: number }>();

    for (const p of analytics.feePerformance) {
      const d = new Date(p.t);
      const day = days[(d.getDay() + 6) % 7]; // JS: Sun=0, convert so Mon=0
      const hour = d.getHours();
      const feeBps = Math.round(p.dynamicFee * 1e4);
      const key = `${day}:${hour}` as CellKey;
      const cur = sums.get(key) ?? { sum: 0, count: 0 };
      sums.set(key, { sum: cur.sum + feeBps, count: cur.count + 1 });
    }

    const flat = days
      .map((day) =>
        hours.map((hour) => {
          const key = `${day}:${hour}` as CellKey;
          const cur = sums.get(key);
          const fee = cur ? Math.round(cur.sum / cur.count) : 0;
          return { day, hour, fee };
        })
      )
      .flat();

    const allFees = flat.map((c) => c.fee).filter((f) => f > 0);
    const avgFeeBps = allFees.length ? Math.round(allFees.reduce((a, b) => a + b, 0) / allFees.length) : 0;

    // Compute per-hour average across week for peak/low labels
    const perHour = hours.map((h) => {
      const fees = flat.filter((c) => c.hour === h).map((c) => c.fee).filter((f) => f > 0);
      const avg = fees.length ? fees.reduce((a, b) => a + b, 0) / fees.length : 0;
      return { h, avg };
    });

    const sorted = [...perHour].sort((a, b) => b.avg - a.avg);
    const peak = sorted.slice(0, 4).map((x) => x.h).sort((a, b) => a - b);
    const low = sorted.slice(-4).map((x) => x.h).sort((a, b) => a - b);

    const peakHoursLabel = peak.length ? `${peak[0].toString().padStart(2, '0')}:00-${(peak[peak.length - 1] + 1).toString().padStart(2, '0')}:00` : '—';
    const lowHoursLabel = low.length ? `${low[0].toString().padStart(2, '0')}:00-${(low[low.length - 1] + 1).toString().padStart(2, '0')}:00` : '—';

    return { data: flat, avgFeeBps, peakHoursLabel, lowHoursLabel };
  }, [analytics.feePerformance]);
  
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
                  const fee = cell?.fee || 0;
                  
                  return (
                    <div
                      key={`${day}-${hour}`}
                      className={`flex-1 h-6 rounded-sm ${getColor(fee || 0)} cursor-pointer transition-all hover:opacity-80 hover:scale-110`}
                      title={`${day} ${hour}:00 - Fee: ${fee || 0} bps`}
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
          <p className="text-lg font-semibold text-white">{avgFeeBps || '—'} {avgFeeBps ? 'bps' : ''}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dark-400">Peak Hours</p>
          <p className="text-lg font-semibold text-white">{peakHoursLabel}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-dark-400">Low Hours</p>
          <p className="text-lg font-semibold text-white">{lowHoursLabel}</p>
        </div>
      </div>
    </div>
  );
}
