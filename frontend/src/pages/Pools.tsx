import { motion } from 'framer-motion';
import { Search, Filter, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useState } from 'react';
import { useDashboardStore } from '../store/dashboard';

const regimeColors = {
  low: 'text-success-400 bg-success-900/30',
  normal: 'text-primary-400 bg-primary-900/30',
  high: 'text-warning-400 bg-warning-900/30',
  extreme: 'text-danger-400 bg-danger-900/30',
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

export function Pools() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegime, setSelectedRegime] = useState<string | null>(null);

  const pools = useDashboardStore((s) => s.pools);

  const filteredPools = pools.filter((pool) => {
    const matchesSearch =
      pool.token0.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pool.token1.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRegime = !selectedRegime || pool.kalman.regime === selectedRegime;
    return matchesSearch && matchesRegime;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Protected Pools</h1>
          <p className="text-dark-400">Manage your liquidity positions</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Pool
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
          <input
            type="text"
            placeholder="Search pools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-dark-400" />
          {['low', 'normal', 'high', 'extreme'].map((regime) => (
            <button
              key={regime}
              onClick={() => setSelectedRegime(selectedRegime === regime ? null : regime)}
              className={`px-3 py-1 rounded-lg text-sm font-medium capitalize transition-colors ${
                selectedRegime === regime
                  ? regimeColors[regime as keyof typeof regimeColors]
                  : 'text-dark-400 hover:text-white bg-dark-800'
              }`}
            >
              {regime}
            </button>
          ))}
        </div>
      </div>

      {/* Pool Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel overflow-hidden"
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left p-4 text-sm font-medium text-dark-400">Pool</th>
              <th className="text-right p-4 text-sm font-medium text-dark-400">TVL</th>
              <th className="text-right p-4 text-sm font-medium text-dark-400">24h Volume</th>
              <th className="text-right p-4 text-sm font-medium text-dark-400">Risk Score</th>
              <th className="text-center p-4 text-sm font-medium text-dark-400">Regime</th>
              <th className="text-right p-4 text-sm font-medium text-dark-400">Current Fee</th>
              <th className="text-right p-4 text-sm font-medium text-dark-400">APY</th>
              <th className="text-right p-4 text-sm font-medium text-dark-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPools.map((pool, index) => (
              <motion.tr
                key={pool.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="border-b border-dark-800 hover:bg-dark-800/30 transition-colors"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-xs font-bold">
                        {pool.token0.charAt(0)}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-success-500 to-teal-600 flex items-center justify-center text-xs font-bold">
                        {pool.token1.charAt(0)}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {pool.token0}/{pool.token1}
                      </p>
                      <p className="text-xs text-dark-400">{(pool.baseFeeBps / 100).toFixed(2)}% base fee</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <p className="font-medium text-white">{formatCurrency(pool.tvlUsd)}</p>
                </td>
                <td className="p-4 text-right">
                  <p className="font-medium text-white">{formatCurrency(pool.volume24hUsd)}</p>
                </td>
                <td className="p-4 text-right">
                  <div className="inline-flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        pool.riskScore < 30
                          ? 'bg-success-500'
                          : pool.riskScore < 60
                          ? 'bg-warning-500'
                          : 'bg-danger-500'
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        pool.riskScore < 30
                          ? 'text-success-400'
                          : pool.riskScore < 60
                          ? 'text-warning-400'
                          : 'text-danger-400'
                      }`}
                    >
                      {pool.riskScore}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-center">
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium capitalize ${
                      regimeColors[pool.kalman.regime as keyof typeof regimeColors]
                    }`}
                  >
                    {pool.kalman.regime}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-medium text-white">
                      {(pool.currentFeeBps / 100).toFixed(2)}%
                    </span>
                    {pool.currentFeeBps > pool.baseFeeBps ? (
                      <ArrowUpRight className="w-4 h-4 text-warning-400" />
                    ) : pool.currentFeeBps < pool.baseFeeBps ? (
                      <ArrowDownRight className="w-4 h-4 text-success-400" />
                    ) : null}
                  </div>
                </td>
                <td className="p-4 text-right">
                  <span className="font-medium text-dark-300">—</span>
                </td>
                <td className="p-4 text-right">
                  <button className="px-3 py-1 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors">
                    Manage
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
