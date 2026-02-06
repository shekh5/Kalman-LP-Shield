import { motion } from 'framer-motion';
import { Save, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';

export function Settings() {
  const [settings, setSettings] = useState({
    // Kalman Filter
    processNoise: 0.01,
    measurementNoise: 0.005,
    adaptationRate: 0.1,
    
    // Fee Parameters
    baseFee: 30,
    minFee: 5,
    maxFee: 100,
    
    // Risk Thresholds
    lowRiskThreshold: 30,
    highRiskThreshold: 60,
    emergencyThreshold: 90,
    
    // Agent Configuration
    updateInterval: 12,
    maxGasPrice: 50,
    flashbotsEnabled: true,
    
    // Notifications
    emailAlerts: true,
    telegramAlerts: false,
    criticalOnly: false,
  });

  const handleSave = () => {
    // Save settings to backend/localStorage
    console.log('Saving settings:', settings);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-dark-400">Configure KalmanGuard parameters</p>
        </div>
        <button onClick={handleSave} className="btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Kalman Filter Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Kalman Filter Parameters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label">Process Noise (Q)</label>
            <input
              type="number"
              step="0.001"
              value={settings.processNoise}
              onChange={(e) => setSettings({ ...settings, processNoise: parseFloat(e.target.value) })}
              className="input-field"
            />
            <p className="text-xs text-dark-500 mt-1">
              Controls how much the filter trusts the model vs measurements
            </p>
          </div>
          <div>
            <label className="label">Measurement Noise (R)</label>
            <input
              type="number"
              step="0.001"
              value={settings.measurementNoise}
              onChange={(e) => setSettings({ ...settings, measurementNoise: parseFloat(e.target.value) })}
              className="input-field"
            />
            <p className="text-xs text-dark-500 mt-1">
              Expected variance in oracle price readings
            </p>
          </div>
          <div>
            <label className="label">Adaptation Rate</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.adaptationRate}
              onChange={(e) => setSettings({ ...settings, adaptationRate: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-dark-500 mt-1">
              <span>Slow (0)</span>
              <span>{settings.adaptationRate}</span>
              <span>Fast (1)</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Fee Parameters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Dynamic Fee Parameters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="label">Base Fee (bps)</label>
            <input
              type="number"
              value={settings.baseFee}
              onChange={(e) => setSettings({ ...settings, baseFee: parseInt(e.target.value) })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Minimum Fee (bps)</label>
            <input
              type="number"
              value={settings.minFee}
              onChange={(e) => setSettings({ ...settings, minFee: parseInt(e.target.value) })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Maximum Fee (bps)</label>
            <input
              type="number"
              value={settings.maxFee}
              onChange={(e) => setSettings({ ...settings, maxFee: parseInt(e.target.value) })}
              className="input-field"
            />
          </div>
        </div>
        <div className="mt-4 p-3 bg-primary-900/20 border border-primary-500/30 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-dark-300">
            Fees are dynamically adjusted based on volatility regime. During high volatility,
            fees can increase up to the maximum to protect LPs from impermanent loss.
          </p>
        </div>
      </motion.div>

      {/* Risk Thresholds */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Risk Thresholds</h3>
        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="label mb-0">Risk Score Thresholds</label>
              <span className="text-sm text-dark-400">0-100 scale</span>
            </div>
            <div className="relative h-4 bg-dark-700 rounded-full">
              <div
                className="absolute h-full bg-success-500 rounded-l-full"
                style={{ width: `${settings.lowRiskThreshold}%` }}
              />
              <div
                className="absolute h-full bg-warning-500"
                style={{
                  left: `${settings.lowRiskThreshold}%`,
                  width: `${settings.highRiskThreshold - settings.lowRiskThreshold}%`,
                }}
              />
              <div
                className="absolute h-full bg-danger-500 rounded-r-full"
                style={{
                  left: `${settings.highRiskThreshold}%`,
                  width: `${100 - settings.highRiskThreshold}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-dark-400">
              <span>Low (0-{settings.lowRiskThreshold})</span>
              <span>High ({settings.lowRiskThreshold}-{settings.highRiskThreshold})</span>
              <span>Extreme ({settings.highRiskThreshold}+)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Low Risk Threshold</label>
              <input
                type="number"
                value={settings.lowRiskThreshold}
                onChange={(e) => setSettings({ ...settings, lowRiskThreshold: parseInt(e.target.value) })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">High Risk Threshold</label>
              <input
                type="number"
                value={settings.highRiskThreshold}
                onChange={(e) => setSettings({ ...settings, highRiskThreshold: parseInt(e.target.value) })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">Emergency Threshold</label>
              <input
                type="number"
                value={settings.emergencyThreshold}
                onChange={(e) => setSettings({ ...settings, emergencyThreshold: parseInt(e.target.value) })}
                className="input-field"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Agent Configuration */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Agent Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label">Update Interval (seconds)</label>
            <input
              type="number"
              value={settings.updateInterval}
              onChange={(e) => setSettings({ ...settings, updateInterval: parseInt(e.target.value) })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Max Gas Price (Gwei)</label>
            <input
              type="number"
              value={settings.maxGasPrice}
              onChange={(e) => setSettings({ ...settings, maxGasPrice: parseInt(e.target.value) })}
              className="input-field"
            />
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.flashbotsEnabled}
                onChange={(e) => setSettings({ ...settings, flashbotsEnabled: e.target.checked })}
                className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500"
              />
              <div>
                <span className="font-medium text-white">Enable Flashbots</span>
                <p className="text-sm text-dark-400">
                  Submit transactions via Flashbots to prevent frontrunning
                </p>
              </div>
            </label>
          </div>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-panel p-6"
      >
        <h3 className="text-lg font-semibold mb-4">Notifications</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.emailAlerts}
              onChange={(e) => setSettings({ ...settings, emailAlerts: e.target.checked })}
              className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-white">Email Alerts</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.telegramAlerts}
              onChange={(e) => setSettings({ ...settings, telegramAlerts: e.target.checked })}
              className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-white">Telegram Alerts</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.criticalOnly}
              onChange={(e) => setSettings({ ...settings, criticalOnly: e.target.checked })}
              className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-white">Critical Alerts Only</span>
          </label>
        </div>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-panel p-6 border-danger-500/30"
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-danger-500" />
          <h3 className="text-lg font-semibold text-danger-400">Danger Zone</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-medium">Reset All Settings</p>
            <p className="text-sm text-dark-400">
              This will reset all parameters to their default values
            </p>
          </div>
          <button className="btn-danger flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </motion.div>
    </div>
  );
}
