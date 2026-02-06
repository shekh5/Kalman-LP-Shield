"""
MEVSimulator - MEV Attack Simulation Module

This module simulates various MEV attacks to test the effectiveness
of KalmanGuard's protection mechanisms:
1. Sandwich attacks
2. Frontrunning
3. Just-in-time (JIT) liquidity
4. Multi-block MEV (cross-block attacks)
"""

import numpy as np
from numpy.typing import NDArray
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
import structlog

logger = structlog.get_logger()


class AttackType(Enum):
    """Types of MEV attacks."""
    SANDWICH = "sandwich"
    FRONTRUN = "frontrun"
    BACKRUN = "backrun"
    JIT_LIQUIDITY = "jit_liquidity"
    MULTI_BLOCK = "multi_block"


@dataclass
class MEVAttack:
    """Representation of an MEV attack."""
    attack_type: AttackType
    timestamp: float
    target_trade_size: float
    attacker_profit: float
    victim_loss: float
    detected: bool
    mitigated: bool
    fee_at_detection: int
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SandwichAttackResult:
    """Result of a simulated sandwich attack."""
    frontrun_size: float
    frontrun_price: float
    victim_price: float
    backrun_size: float
    backrun_price: float
    attacker_profit: float
    victim_slippage: float
    gas_cost: float
    net_profit: float


@dataclass
class MEVSimulationResult:
    """Results from MEV simulation run."""
    total_attacks: int
    attacks_detected: int
    attacks_mitigated: int
    total_attacker_profit: float
    total_victim_loss: float
    loss_prevented: float
    detection_rate: float
    mitigation_rate: float
    attacks: List[MEVAttack]


class MEVSimulator:
    """
    MEV attack simulator for testing KalmanGuard protection.
    
    Simulates realistic MEV attacks including:
    - Sandwich attacks with optimal sizing
    - Frontrunning with gas price competition
    - JIT liquidity provisioning
    - Multi-block MEV strategies
    """
    
    # Gas costs in wei (ETH)
    BASE_GAS_COST = 21000
    SWAP_GAS_COST = 150000
    JIT_GAS_COST = 200000
    
    # Gas price in Gwei
    DEFAULT_GAS_PRICE = 30
    
    def __init__(
        self,
        pool_liquidity: float = 10_000_000,
        fee_bps: int = 30,
        gas_price_gwei: float = DEFAULT_GAS_PRICE,
    ):
        """
        Initialize MEV simulator.
        
        Args:
            pool_liquidity: Pool liquidity in USD
            fee_bps: Pool swap fee in basis points
            gas_price_gwei: Gas price in Gwei
        """
        self.pool_liquidity = pool_liquidity
        self.fee_bps = fee_bps
        self.gas_price_gwei = gas_price_gwei
        
        # Attack records
        self.attacks: List[MEVAttack] = []
        
        logger.info(
            "MEVSimulator initialized",
            pool_liquidity=pool_liquidity,
            fee_bps=fee_bps,
        )
    
    def simulate_sandwich(
        self,
        victim_trade_size: float,
        price: float,
        fee_bps: Optional[int] = None,
    ) -> SandwichAttackResult:
        """
        Simulate a sandwich attack.
        
        Calculates optimal frontrun size and expected profit.
        
        Args:
            victim_trade_size: Size of victim's trade
            price: Current price
            fee_bps: Current fee (uses default if None)
            
        Returns:
            SandwichAttackResult with attack details
        """
        fee = fee_bps or self.fee_bps
        
        # Optimal frontrun size (simplified model)
        # In practice, this depends on constant product formula
        optimal_frontrun_ratio = 0.5  # Simplified
        frontrun_size = victim_trade_size * optimal_frontrun_ratio
        
        # Price impact model (constant product: xy = k)
        # Price impact ≈ trade_size / liquidity
        frontrun_impact = frontrun_size / self.pool_liquidity
        victim_impact = victim_trade_size / (self.pool_liquidity + frontrun_size)
        
        # Prices after each leg
        frontrun_price = price * (1 + frontrun_impact)
        victim_price = frontrun_price * (1 + victim_impact)
        backrun_price = victim_price * (1 - frontrun_impact * 0.95)  # Slight slippage
        
        # Fee costs
        frontrun_fee = frontrun_size * (fee / 10000)
        backrun_fee = frontrun_size * (fee / 10000)
        
        # Gas costs (in USD, assuming ETH = $2000)
        eth_price = 2000
        gas_cost_eth = (2 * self.SWAP_GAS_COST * self.gas_price_gwei * 1e-9)
        gas_cost_usd = gas_cost_eth * eth_price
        
        # Profit calculation
        # Profit = (backrun_price - frontrun_price) * frontrun_size - fees - gas
        price_gain = (victim_price - frontrun_price) * frontrun_size
        attacker_profit = price_gain - frontrun_fee - backrun_fee - gas_cost_usd
        
        # Victim slippage
        expected_victim_price = price * (1 + victim_trade_size / self.pool_liquidity)
        victim_slippage = (victim_price - expected_victim_price) / expected_victim_price
        
        return SandwichAttackResult(
            frontrun_size=frontrun_size,
            frontrun_price=frontrun_price,
            victim_price=victim_price,
            backrun_size=frontrun_size,
            backrun_price=backrun_price,
            attacker_profit=max(0, attacker_profit),
            victim_slippage=victim_slippage,
            gas_cost=gas_cost_usd,
            net_profit=attacker_profit,
        )
    
    def simulate_frontrun(
        self,
        victim_trade_size: float,
        price: float,
        fee_bps: Optional[int] = None,
        priority_fee_gwei: float = 5.0,
    ) -> Dict[str, Any]:
        """
        Simulate a frontrunning attack.
        
        Args:
            victim_trade_size: Size of victim's trade
            price: Current price
            fee_bps: Current fee
            priority_fee_gwei: Priority fee to outbid victim
            
        Returns:
            Attack result dictionary
        """
        fee = fee_bps or self.fee_bps
        
        # Frontrunner copies victim's trade
        attack_size = victim_trade_size
        
        # Price impact
        impact = attack_size / self.pool_liquidity
        
        # Post-frontrun price
        new_price = price * (1 + impact)
        
        # Victim gets worse price
        victim_actual_price = new_price * (1 + impact)
        victim_loss = victim_trade_size * impact
        
        # Frontrunner can sell at higher price
        attacker_sell_price = victim_actual_price * (1 - impact * 0.1)
        
        # Fees and gas
        fee_cost = attack_size * (fee / 10000) * 2
        gas_cost = (self.SWAP_GAS_COST * 2 * 
                   (self.gas_price_gwei + priority_fee_gwei) * 1e-9 * 2000)
        
        profit = (attacker_sell_price - price) * attack_size - fee_cost - gas_cost
        
        return {
            "attack_type": AttackType.FRONTRUN,
            "attack_size": attack_size,
            "original_price": price,
            "frontrun_price": new_price,
            "victim_price": victim_actual_price,
            "attacker_profit": max(0, profit),
            "victim_loss": victim_loss,
            "gas_cost": gas_cost,
        }
    
    def simulate_jit_liquidity(
        self,
        victim_trade_size: float,
        price: float,
        existing_fee_bps: int,
    ) -> Dict[str, Any]:
        """
        Simulate Just-In-Time liquidity attack.
        
        JIT LPs add liquidity just before a large trade and remove
        it immediately after to capture fees with minimal IL risk.
        
        Args:
            victim_trade_size: Size of victim's trade
            price: Current price
            existing_fee_bps: Current pool fee
            
        Returns:
            Attack result dictionary
        """
        # JIT liquidity added (concentrated around current price)
        jit_liquidity = victim_trade_size * 2  # 2x the trade size
        
        # With concentrated liquidity, JIT LP captures most of the fee
        # Assume 50% price range capture 90% of fees
        fee_capture_rate = 0.9
        
        # Fee revenue
        fee_revenue = victim_trade_size * (existing_fee_bps / 10000) * fee_capture_rate
        
        # IL from price movement during the trade
        price_impact = victim_trade_size / (self.pool_liquidity + jit_liquidity)
        il_loss = jit_liquidity * (price_impact ** 2) / 4  # Simplified IL formula
        
        # Gas for add + remove liquidity
        gas_cost = (2 * self.JIT_GAS_COST * self.gas_price_gwei * 1e-9 * 2000)
        
        profit = fee_revenue - il_loss - gas_cost
        
        # For the victim, this isn't necessarily bad (more liquidity = less slippage)
        # But it extracts value from passive LPs
        passive_lp_loss = fee_revenue * (jit_liquidity / (self.pool_liquidity + jit_liquidity))
        
        return {
            "attack_type": AttackType.JIT_LIQUIDITY,
            "jit_liquidity": jit_liquidity,
            "fee_revenue": fee_revenue,
            "il_loss": il_loss,
            "gas_cost": gas_cost,
            "attacker_profit": max(0, profit),
            "passive_lp_loss": passive_lp_loss,
        }
    
    def run_attack_simulation(
        self,
        n_attacks: int = 100,
        price_series: Optional[NDArray[np.float64]] = None,
        detection_callback: Optional[callable] = None,
        mitigation_callback: Optional[callable] = None,
    ) -> MEVSimulationResult:
        """
        Run multiple attack simulations.
        
        Args:
            n_attacks: Number of attacks to simulate
            price_series: Optional price series (generates random if None)
            detection_callback: Function(attack) -> bool for detection
            mitigation_callback: Function(attack) -> bool for mitigation
            
        Returns:
            MEVSimulationResult with aggregate statistics
        """
        self.attacks = []
        
        # Generate price series if not provided
        if price_series is None:
            prices = 1000 + np.cumsum(np.random.randn(n_attacks) * 10)
        else:
            prices = price_series[:n_attacks]
        
        total_attacker_profit = 0
        total_victim_loss = 0
        loss_prevented = 0
        attacks_detected = 0
        attacks_mitigated = 0
        
        for i in range(n_attacks):
            price = float(prices[i])
            
            # Random attack type
            attack_type = np.random.choice([
                AttackType.SANDWICH,
                AttackType.FRONTRUN,
                AttackType.JIT_LIQUIDITY,
            ], p=[0.5, 0.3, 0.2])
            
            # Random trade size (log-normal)
            trade_size = np.random.lognormal(10, 1)  # Mean ~$22k
            
            # Simulate attack
            if attack_type == AttackType.SANDWICH:
                result = self.simulate_sandwich(trade_size, price)
                attacker_profit = result.attacker_profit
                victim_loss = result.victim_slippage * trade_size
            elif attack_type == AttackType.FRONTRUN:
                result = self.simulate_frontrun(trade_size, price)
                attacker_profit = result["attacker_profit"]
                victim_loss = result["victim_loss"]
            else:
                result = self.simulate_jit_liquidity(trade_size, price, self.fee_bps)
                attacker_profit = result["attacker_profit"]
                victim_loss = result["passive_lp_loss"]
            
            # Detection
            detected = False
            if detection_callback is not None:
                detected = detection_callback({
                    "type": attack_type,
                    "trade_size": trade_size,
                    "price": price,
                })
            else:
                # Default detection: large trades + rapid price movement
                detected = trade_size > 50000 and np.random.random() < 0.7
            
            # Mitigation (increase fees, etc.)
            mitigated = False
            if detected:
                attacks_detected += 1
                if mitigation_callback is not None:
                    mitigated = mitigation_callback({
                        "type": attack_type,
                        "profit": attacker_profit,
                    })
                else:
                    # Default: 60% mitigation rate when detected
                    mitigated = np.random.random() < 0.6
            
            if mitigated:
                attacks_mitigated += 1
                # Mitigation reduces attacker profit by 80%
                prevented = attacker_profit * 0.8
                attacker_profit *= 0.2
                loss_prevented += prevented
            
            total_attacker_profit += attacker_profit
            total_victim_loss += victim_loss
            
            # Record attack
            attack = MEVAttack(
                attack_type=attack_type,
                timestamp=float(i),
                target_trade_size=trade_size,
                attacker_profit=attacker_profit,
                victim_loss=victim_loss,
                detected=detected,
                mitigated=mitigated,
                fee_at_detection=self.fee_bps,
                details={"result": result} if isinstance(result, dict) else {"result": result.__dict__},
            )
            self.attacks.append(attack)
        
        # Calculate rates
        detection_rate = attacks_detected / n_attacks if n_attacks > 0 else 0
        mitigation_rate = attacks_mitigated / attacks_detected if attacks_detected > 0 else 0
        
        return MEVSimulationResult(
            total_attacks=n_attacks,
            attacks_detected=attacks_detected,
            attacks_mitigated=attacks_mitigated,
            total_attacker_profit=total_attacker_profit,
            total_victim_loss=total_victim_loss,
            loss_prevented=loss_prevented,
            detection_rate=detection_rate,
            mitigation_rate=mitigation_rate,
            attacks=self.attacks,
        )
    
    def analyze_fee_sensitivity(
        self,
        trade_size: float,
        price: float,
        fee_range: Tuple[int, int] = (5, 100),
        attack_type: AttackType = AttackType.SANDWICH,
    ) -> Dict[int, float]:
        """
        Analyze how fee changes affect attack profitability.
        
        Args:
            trade_size: Target trade size
            price: Current price
            fee_range: Range of fees to test (min, max)
            attack_type: Type of attack to analyze
            
        Returns:
            Dict mapping fee_bps -> attacker_profit
        """
        results = {}
        
        for fee_bps in range(fee_range[0], fee_range[1] + 1, 5):
            if attack_type == AttackType.SANDWICH:
                result = self.simulate_sandwich(trade_size, price, fee_bps)
                profit = result.attacker_profit
            elif attack_type == AttackType.FRONTRUN:
                result = self.simulate_frontrun(trade_size, price, fee_bps)
                profit = result["attacker_profit"]
            else:
                result = self.simulate_jit_liquidity(trade_size, price, fee_bps)
                profit = result["attacker_profit"]
            
            results[fee_bps] = profit
        
        return results
    
    def find_break_even_fee(
        self,
        trade_size: float,
        price: float,
        attack_type: AttackType = AttackType.SANDWICH,
    ) -> int:
        """
        Find the fee level where attack profit becomes zero.
        
        Args:
            trade_size: Target trade size
            price: Current price
            attack_type: Type of attack
            
        Returns:
            Break-even fee in basis points
        """
        sensitivity = self.analyze_fee_sensitivity(
            trade_size, price, (5, 200), attack_type
        )
        
        # Find where profit crosses zero
        for fee_bps, profit in sorted(sensitivity.items()):
            if profit <= 0:
                return fee_bps
        
        return 200  # Max fee if never breaks even
