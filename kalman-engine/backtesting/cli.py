#!/usr/bin/env python3
"""
KalmanGuard Backtesting CLI

Command-line interface for running backtests and analyzing results.
"""

import argparse
import sys
import json
from pathlib import Path

import numpy as np

from .backtest_engine import BacktestEngine, BacktestConfig, generate_synthetic_prices
from .mev_simulator import MEVSimulator, AttackType
from .data_loader import DataLoader


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="KalmanGuard Backtesting CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Backtest command
    backtest_parser = subparsers.add_parser("backtest", help="Run a backtest")
    backtest_parser.add_argument(
        "--data", "-d",
        type=str,
        help="Path to price data file (CSV or JSON)",
    )
    backtest_parser.add_argument(
        "--synthetic", "-s",
        action="store_true",
        help="Use synthetic data",
    )
    backtest_parser.add_argument(
        "--periods", "-n",
        type=int,
        default=10000,
        help="Number of periods for synthetic data",
    )
    backtest_parser.add_argument(
        "--process-noise",
        type=float,
        default=0.01,
        help="Kalman filter process noise",
    )
    backtest_parser.add_argument(
        "--measurement-noise",
        type=float,
        default=0.005,
        help="Kalman filter measurement noise",
    )
    backtest_parser.add_argument(
        "--output", "-o",
        type=str,
        help="Output file for results (JSON)",
    )
    
    # MEV simulation command
    mev_parser = subparsers.add_parser("mev", help="Run MEV attack simulation")
    mev_parser.add_argument(
        "--attacks", "-n",
        type=int,
        default=100,
        help="Number of attacks to simulate",
    )
    mev_parser.add_argument(
        "--pool-liquidity",
        type=float,
        default=10_000_000,
        help="Pool liquidity in USD",
    )
    mev_parser.add_argument(
        "--fee",
        type=int,
        default=30,
        help="Pool fee in basis points",
    )
    mev_parser.add_argument(
        "--output", "-o",
        type=str,
        help="Output file for results (JSON)",
    )
    
    # Optimize command
    optimize_parser = subparsers.add_parser("optimize", help="Optimize filter parameters")
    optimize_parser.add_argument(
        "--data", "-d",
        type=str,
        help="Path to price data file",
    )
    optimize_parser.add_argument(
        "--output", "-o",
        type=str,
        help="Output file for results (JSON)",
    )
    
    args = parser.parse_args()
    
    if args.command == "backtest":
        run_backtest(args)
    elif args.command == "mev":
        run_mev_simulation(args)
    elif args.command == "optimize":
        run_optimization(args)
    else:
        parser.print_help()
        sys.exit(1)


def run_backtest(args):
    """Run backtest command."""
    print("=" * 60)
    print("KalmanGuard Backtest")
    print("=" * 60)
    
    # Load or generate data
    if args.data:
        loader = DataLoader()
        if args.data.endswith(".csv"):
            data = loader.load_csv(args.data)
        else:
            data = loader.load_json(args.data)
        prices = data.prices
        print(f"Loaded {len(prices)} price observations from {args.data}")
    else:
        prices = generate_synthetic_prices(
            n_periods=args.periods,
            volatility=0.02,
            regime_changes=5,
        )
        print(f"Generated {len(prices)} synthetic price observations")
    
    # Configure backtest
    config = BacktestConfig(
        process_noise_std=args.process_noise,
        measurement_noise_std=args.measurement_noise,
    )
    
    # Run backtest
    engine = BacktestEngine(config)
    result = engine.run(prices)
    
    # Print results
    print("\nResults:")
    print("-" * 40)
    print(f"Total PnL:           ${result.total_pnl:,.2f}")
    print(f"Fees Collected:      ${result.total_fees_collected:,.2f}")
    print(f"Sharpe Ratio:        {result.sharpe_ratio:.3f}")
    print(f"Max Drawdown:        {result.max_drawdown:.2%}")
    print(f"Win Rate:            {result.win_rate:.2%}")
    print(f"Avg Risk Score:      {result.avg_risk_score:.1f}")
    print(f"Emergency Triggers:  {result.emergency_triggers}")
    print(f"Prediction RMSE:     {result.prediction_rmse:.4f}")
    print(f"Prediction MAE:      {result.prediction_mae:.4f}")
    
    print("\nRegime Distribution:")
    for regime, pct in result.regime_distribution.items():
        print(f"  {regime:12s}: {pct:.1%}")
    
    # Save results if requested
    if args.output:
        output_data = {
            "total_pnl": result.total_pnl,
            "fees_collected": result.total_fees_collected,
            "sharpe_ratio": result.sharpe_ratio,
            "max_drawdown": result.max_drawdown,
            "win_rate": result.win_rate,
            "avg_risk_score": result.avg_risk_score,
            "emergency_triggers": result.emergency_triggers,
            "prediction_rmse": result.prediction_rmse,
            "prediction_mae": result.prediction_mae,
            "regime_distribution": result.regime_distribution,
            "equity_curve": result.equity_curve,
            "fee_history": result.fee_history,
        }
        
        with open(args.output, "w") as f:
            json.dump(output_data, f, indent=2)
        print(f"\nResults saved to {args.output}")


def run_mev_simulation(args):
    """Run MEV simulation command."""
    print("=" * 60)
    print("KalmanGuard MEV Attack Simulation")
    print("=" * 60)
    
    simulator = MEVSimulator(
        pool_liquidity=args.pool_liquidity,
        fee_bps=args.fee,
    )
    
    result = simulator.run_attack_simulation(n_attacks=args.attacks)
    
    print("\nResults:")
    print("-" * 40)
    print(f"Total Attacks:       {result.total_attacks}")
    print(f"Attacks Detected:    {result.attacks_detected} ({result.detection_rate:.1%})")
    print(f"Attacks Mitigated:   {result.attacks_mitigated} ({result.mitigation_rate:.1%})")
    print(f"Attacker Profit:     ${result.total_attacker_profit:,.2f}")
    print(f"Victim Loss:         ${result.total_victim_loss:,.2f}")
    print(f"Loss Prevented:      ${result.loss_prevented:,.2f}")
    
    # Attack type breakdown
    attack_types = {}
    for attack in result.attacks:
        t = attack.attack_type.value
        attack_types[t] = attack_types.get(t, 0) + 1
    
    print("\nAttack Type Distribution:")
    for t, count in attack_types.items():
        print(f"  {t:15s}: {count} ({count/result.total_attacks:.1%})")
    
    # Fee sensitivity analysis
    print("\nFee Sensitivity (Sandwich Attack on $100k trade):")
    sensitivity = simulator.analyze_fee_sensitivity(
        trade_size=100000,
        price=2000,
        fee_range=(10, 100),
        attack_type=AttackType.SANDWICH,
    )
    for fee, profit in sorted(sensitivity.items()):
        status = "✓ Unprofitable" if profit <= 0 else ""
        print(f"  {fee:3d} bps: ${profit:8,.2f} profit {status}")
    
    # Save results if requested
    if args.output:
        output_data = {
            "total_attacks": result.total_attacks,
            "attacks_detected": result.attacks_detected,
            "attacks_mitigated": result.attacks_mitigated,
            "total_attacker_profit": result.total_attacker_profit,
            "total_victim_loss": result.total_victim_loss,
            "loss_prevented": result.loss_prevented,
            "detection_rate": result.detection_rate,
            "mitigation_rate": result.mitigation_rate,
            "attack_types": attack_types,
            "fee_sensitivity": {str(k): v for k, v in sensitivity.items()},
        }
        
        with open(args.output, "w") as f:
            json.dump(output_data, f, indent=2)
        print(f"\nResults saved to {args.output}")


def run_optimization(args):
    """Run parameter optimization command."""
    print("=" * 60)
    print("KalmanGuard Parameter Optimization")
    print("=" * 60)
    
    # Load or generate data
    if args.data:
        loader = DataLoader()
        data = loader.load_csv(args.data)
        prices = data.prices
    else:
        prices = generate_synthetic_prices(n_periods=5000)
    
    print(f"Using {len(prices)} price observations")
    
    # Parameter grid
    param_grid = {
        "process_noise_std": [0.005, 0.01, 0.02, 0.05],
        "measurement_noise_std": [0.002, 0.005, 0.01, 0.02],
    }
    
    print(f"Testing {np.prod([len(v) for v in param_grid.values()])} parameter combinations...")
    
    engine = BacktestEngine()
    best_params, best_result = engine.optimize_parameters(prices, param_grid)
    
    print("\nBest Parameters:")
    print("-" * 40)
    for param, value in best_params.items():
        print(f"  {param}: {value}")
    
    print(f"\nBest Sharpe Ratio: {best_result.sharpe_ratio:.3f}")
    
    if args.output:
        output_data = {
            "best_params": best_params,
            "best_sharpe": best_result.sharpe_ratio,
            "best_pnl": best_result.total_pnl,
        }
        
        with open(args.output, "w") as f:
            json.dump(output_data, f, indent=2)
        print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
