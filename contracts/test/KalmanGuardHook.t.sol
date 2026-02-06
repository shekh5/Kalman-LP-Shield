// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {KalmanGuardHook} from "../src/KalmanGuardHook.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

contract KalmanGuardHookTest is Test {
    using PoolIdLibrary for PoolKey;
    
    KalmanGuardHook public hook;
    address public poolManager;
    address public owner;
    address public agent;
    address public user;
    
    PoolKey public poolKey;
    PoolId public poolId;
    
    function setUp() public {
        owner = address(this);
        agent = makeAddr("agent");
        user = makeAddr("user");
        poolManager = makeAddr("poolManager");
        
        // Deploy hook
        hook = new KalmanGuardHook(IPoolManager(poolManager));
        
        // Setup pool key
        poolKey = PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        
        poolId = poolKey.toId();
        
        // Authorize agent
        hook.setAgentAuthorization(agent, true);
    }
    
    function test_InitialState() public view {
        assertEq(hook.owner(), owner);
        assertTrue(hook.authorizedAgents(owner));
        assertFalse(hook.globalPause());
    }
    
    function test_AgentAuthorization() public {
        address newAgent = makeAddr("newAgent");
        
        assertFalse(hook.authorizedAgents(newAgent));
        
        hook.setAgentAuthorization(newAgent, true);
        assertTrue(hook.authorizedAgents(newAgent));
        
        hook.setAgentAuthorization(newAgent, false);
        assertFalse(hook.authorizedAgents(newAgent));
    }
    
    function test_UpdateRiskScore() public {
        vm.prank(agent);
        hook.updateRiskScore(
            poolId,
            5000, // 50% risk
            KalmanGuardHook.VolatilityRegime.VOLATILE,
            8000  // 80% confidence
        );
        
        KalmanGuardHook.RiskState memory state = hook.getRiskState(poolId);
        assertEq(state.riskScore, 5000);
        assertEq(uint256(state.regime), uint256(KalmanGuardHook.VolatilityRegime.VOLATILE));
        assertEq(state.confidence, 8000);
    }
    
    function test_UpdateRiskScore_UnauthorizedReverts() public {
        vm.prank(user);
        vm.expectRevert(KalmanGuardHook.UnauthorizedAgent.selector);
        hook.updateRiskScore(
            poolId,
            5000,
            KalmanGuardHook.VolatilityRegime.NORMAL,
            10000
        );
    }
    
    function test_UpdateRiskScore_InvalidRiskScoreReverts() public {
        vm.prank(agent);
        vm.expectRevert(KalmanGuardHook.InvalidRiskScore.selector);
        hook.updateRiskScore(
            poolId,
            10001, // > 10000
            KalmanGuardHook.VolatilityRegime.NORMAL,
            10000
        );
    }
    
    function test_DynamicFeeCalculation() public {
        // Low risk - should be near base fee
        vm.prank(agent);
        hook.updateRiskScore(
            poolId,
            1000, // 10% risk
            KalmanGuardHook.VolatilityRegime.STABLE,
            10000
        );
        
        uint24 lowRiskFee = hook.getCurrentFee(poolId);
        
        // High risk - should be near max fee
        vm.warp(block.timestamp + 13); // Advance time to avoid cooldown
        vm.prank(agent);
        hook.updateRiskScore(
            poolId,
            9000, // 90% risk
            KalmanGuardHook.VolatilityRegime.CRISIS,
            10000
        );
        
        uint24 highRiskFee = hook.getCurrentFee(poolId);
        
        // High risk fee should be greater than low risk fee
        assertGt(highRiskFee, lowRiskFee);
        console.log("Low risk fee:", lowRiskFee);
        console.log("High risk fee:", highRiskFee);
    }
    
    function test_EmergencyMode() public {
        vm.prank(agent);
        hook.setEmergencyMode(poolId, true);
        
        KalmanGuardHook.RiskState memory state = hook.getRiskState(poolId);
        assertTrue(state.emergencyMode);
        
        vm.prank(agent);
        hook.setEmergencyMode(poolId, false);
        
        state = hook.getRiskState(poolId);
        assertFalse(state.emergencyMode);
    }
    
    function test_IsPoolSafe() public {
        // Initially safe
        (bool safe, string memory reason) = hook.isPoolSafe(poolId);
        assertTrue(safe);
        assertEq(reason, "");
        
        // Set emergency mode
        vm.prank(agent);
        hook.setEmergencyMode(poolId, true);
        
        (safe, reason) = hook.isPoolSafe(poolId);
        assertFalse(safe);
        assertEq(reason, "Emergency mode active");
    }
    
    function test_BatchUpdateRiskScores() public {
        PoolKey memory poolKey2 = PoolKey({
            currency0: Currency.wrap(address(0x3)),
            currency1: Currency.wrap(address(0x4)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        PoolId poolId2 = poolKey2.toId();
        
        PoolId[] memory poolIds = new PoolId[](2);
        poolIds[0] = poolId;
        poolIds[1] = poolId2;
        
        uint256[] memory riskScores = new uint256[](2);
        riskScores[0] = 3000;
        riskScores[1] = 7000;
        
        KalmanGuardHook.VolatilityRegime[] memory regimes = new KalmanGuardHook.VolatilityRegime[](2);
        regimes[0] = KalmanGuardHook.VolatilityRegime.NORMAL;
        regimes[1] = KalmanGuardHook.VolatilityRegime.VOLATILE;
        
        uint256[] memory confidences = new uint256[](2);
        confidences[0] = 9000;
        confidences[1] = 8500;
        
        vm.prank(agent);
        hook.batchUpdateRiskScores(poolIds, riskScores, regimes, confidences);
        
        KalmanGuardHook.RiskState memory state1 = hook.getRiskState(poolId);
        KalmanGuardHook.RiskState memory state2 = hook.getRiskState(poolId2);
        
        assertEq(state1.riskScore, 3000);
        assertEq(state2.riskScore, 7000);
    }
    
    function test_AntiFlapping() public {
        // First update
        vm.prank(agent);
        hook.updateRiskScore(
            poolId,
            5000,
            KalmanGuardHook.VolatilityRegime.NORMAL,
            10000
        );
        
        // Immediate update with small change should revert
        vm.prank(agent);
        vm.expectRevert(KalmanGuardHook.UpdateTooFrequent.selector);
        hook.updateRiskScore(
            poolId,
            5100, // Only 1% change
            KalmanGuardHook.VolatilityRegime.NORMAL,
            10000
        );
        
        // But significant change should succeed
        vm.prank(agent);
        hook.updateRiskScore(
            poolId,
            8000, // 30% change (> 5% threshold)
            KalmanGuardHook.VolatilityRegime.VOLATILE,
            10000
        );
        
        KalmanGuardHook.RiskState memory state = hook.getRiskState(poolId);
        assertEq(state.riskScore, 8000);
    }
    
    function test_GlobalPause() public {
        hook.setGlobalPause(true);
        assertTrue(hook.globalPause());
        
        hook.setGlobalPause(false);
        assertFalse(hook.globalPause());
    }
    
    function test_TransferOwnership() public {
        address newOwner = makeAddr("newOwner");
        
        hook.transferOwnership(newOwner);
        assertEq(hook.owner(), newOwner);
    }
    
    function test_FeeConfigUpdate() public {
        KalmanGuardHook.FeeConfig memory newConfig = KalmanGuardHook.FeeConfig({
            baseFee: 5000,
            maxFee: 15000,
            minFee: 1000,
            steepness: 7,
            threshold: 6000,
            cooldownPeriod: 24
        });
        
        hook.setFeeConfig(poolId, newConfig);
        
        KalmanGuardHook.FeeConfig memory stored = hook.feeConfigs(poolId);
        assertEq(stored.baseFee, 5000);
        assertEq(stored.maxFee, 15000);
    }
    
    function testFuzz_RiskScoreInRange(uint256 riskScore) public {
        riskScore = bound(riskScore, 0, 10000);
        
        vm.warp(block.timestamp + 100);
        vm.prank(agent);
        hook.updateRiskScore(
            poolId,
            riskScore,
            KalmanGuardHook.VolatilityRegime.NORMAL,
            10000
        );
        
        KalmanGuardHook.RiskState memory state = hook.getRiskState(poolId);
        assertEq(state.riskScore, riskScore);
        
        uint24 fee = hook.getCurrentFee(poolId);
        assertTrue(fee >= 500); // Min fee
        assertTrue(fee <= 10000); // Max fee
    }
}
