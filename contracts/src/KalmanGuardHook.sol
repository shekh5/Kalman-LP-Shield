// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/base/hooks/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";

/// @title KalmanGuardHook
/// @notice Uniswap v4 hook implementing adaptive risk management using Kalman filtering
/// @dev Provides dynamic fee adjustment, emergency circuit breaker, and MEV protection
contract KalmanGuardHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/
    
    error UnauthorizedAgent();
    error InvalidRiskScore();
    error InvalidConfidence();
    error PoolInEmergencyMode();
    error UpdateTooFrequent();
    error InvalidFeeConfig();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event RiskUpdated(
        PoolId indexed poolId,
        uint256 riskScore,
        VolatilityRegime regime,
        uint256 confidence,
        uint256 timestamp
    );
    
    event SwapExecuted(
        PoolId indexed poolId,
        uint256 timestamp,
        uint24 dynamicFee
    );
    
    event SwapCompleted(
        PoolId indexed poolId,
        uint256 timestamp,
        int128 amount0Delta,
        int128 amount1Delta
    );
    
    event EmergencyModeToggled(PoolId indexed poolId, bool enabled);
    event AgentAuthorized(address indexed agent, bool authorized);
    event FeeConfigUpdated(PoolId indexed poolId, FeeConfig config);

    /*//////////////////////////////////////////////////////////////
                                 ENUMS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Volatility regime classification
    enum VolatilityRegime {
        STABLE,      // σ < 0.01 (low volatility)
        NORMAL,      // 0.01 < σ < 0.05
        VOLATILE,    // 0.05 < σ < 0.15
        CRISIS,      // σ > 0.15 (extreme volatility)
        MANIPULATED  // High kurtosis + MEV signals detected
    }

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Risk state for a pool
    struct RiskState {
        uint256 riskScore;        // [0-10000] representing 0-100%
        uint256 lastUpdate;       // Block timestamp of last update
        VolatilityRegime regime;  // Current volatility regime
        uint256 confidence;       // Confidence level [0-10000]
        bool emergencyMode;       // Circuit breaker status
        uint256 swapCount;        // Number of swaps since last update
        uint256 cumulativeVolume; // Cumulative volume for analytics
    }
    
    /// @notice Fee configuration for dynamic fee calculation
    struct FeeConfig {
        uint24 baseFee;           // Base fee in bps (e.g., 3000 = 0.30%)
        uint24 maxFee;            // Maximum fee in bps
        uint24 minFee;            // Minimum fee in bps
        uint256 steepness;        // Sigmoid curve steepness (k)
        uint256 threshold;        // Risk threshold for fee increase
        uint256 cooldownPeriod;   // Minimum time between updates
    }
    
    /// @notice Kalman filter state (simplified on-chain version)
    struct KalmanState {
        int256 priceEstimate;     // Current price estimate (scaled by 1e18)
        int256 velocity;          // Price velocity estimate
        uint256 uncertainty;      // State uncertainty (P matrix diagonal)
        uint256 lastObservation;  // Last observed price
        uint256 lastTimestamp;    // Last update timestamp
    }

    /*//////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Authorized agents that can update risk scores
    mapping(address => bool) public authorizedAgents;
    
    /// @notice Risk states per pool
    mapping(PoolId => RiskState) public poolRiskStates;
    
    /// @notice Fee configurations per pool
    mapping(PoolId => FeeConfig) public feeConfigs;
    
    /// @notice Simplified Kalman state per pool (for on-chain tracking)
    mapping(PoolId => KalmanState) public kalmanStates;
    
    /// @notice Owner/admin address
    address public owner;
    
    /// @notice Global pause flag
    bool public globalPause;
    
    /// @notice Default fee configuration
    FeeConfig public defaultFeeConfig;
    
    /// @notice Minimum update interval to prevent spam
    uint256 public constant MIN_UPDATE_INTERVAL = 12; // ~1 block
    
    /// @notice Minimum risk change to allow frequent updates
    uint256 public constant MIN_RISK_CHANGE = 500; // 5%
    
    /// @notice Precision for calculations
    uint256 public constant PRECISION = 10000;
    
    /// @notice Price scaling factor
    int256 public constant PRICE_SCALE = 1e18;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {
        owner = msg.sender;
        authorizedAgents[msg.sender] = true;
        
        // Set default fee configuration
        defaultFeeConfig = FeeConfig({
            baseFee: 3000,      // 0.30%
            maxFee: 10000,      // 1.00%
            minFee: 500,        // 0.05%
            steepness: 5,
            threshold: 5000,    // 50% risk threshold
            cooldownPeriod: 12  // ~1 block
        });
    }

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyAgent() {
        if (!authorizedAgents[msg.sender]) revert UnauthorizedAgent();
        _;
    }
    
    modifier notPaused() {
        require(!globalPause, "System paused");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                           HOOK PERMISSIONS
    //////////////////////////////////////////////////////////////*/
    
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /*//////////////////////////////////////////////////////////////
                            HOOK CALLBACKS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Called before pool initialization
    function beforeInitialize(
        address,
        PoolKey calldata key,
        uint160,
        bytes calldata hookData
    ) external override returns (bytes4) {
        PoolId poolId = key.toId();
        
        // Initialize with default or custom configuration
        FeeConfig memory config = defaultFeeConfig;
        if (hookData.length > 0) {
            config = abi.decode(hookData, (FeeConfig));
            _validateFeeConfig(config);
        }
        
        feeConfigs[poolId] = config;
        
        // Initialize risk state with conservative defaults
        poolRiskStates[poolId] = RiskState({
            riskScore: 0,
            lastUpdate: block.timestamp,
            regime: VolatilityRegime.NORMAL,
            confidence: PRECISION,
            emergencyMode: false,
            swapCount: 0,
            cumulativeVolume: 0
        });
        
        // Initialize Kalman state
        kalmanStates[poolId] = KalmanState({
            priceEstimate: 0,
            velocity: 0,
            uncertainty: 1e18, // High initial uncertainty
            lastObservation: 0,
            lastTimestamp: block.timestamp
        });
        
        return BaseHook.beforeInitialize.selector;
    }
    
    /// @notice Called before each swap - calculates dynamic fee
    function beforeSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        bytes calldata
    ) external override notPaused returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        RiskState storage state = poolRiskStates[poolId];
        
        // Check emergency mode
        if (state.emergencyMode) revert PoolInEmergencyMode();
        
        // Calculate dynamic fee based on risk score
        uint24 dynamicFee = _calculateDynamicFee(poolId, state.riskScore);
        
        // Increment swap counter
        state.swapCount++;
        
        // Emit privacy-preserving event (minimal information)
        emit SwapExecuted(poolId, block.timestamp, dynamicFee);
        
        return (
            BaseHook.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            dynamicFee | LPFeeLibrary.OVERRIDE_FEE_FLAG
        );
    }
    
    /// @notice Called after each swap - logs for agent analysis
    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        BalanceDelta delta,
        bytes calldata
    ) external override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        RiskState storage state = poolRiskStates[poolId];
        
        // Update cumulative volume (absolute value)
        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();
        state.cumulativeVolume += uint256(uint128(amount0 > 0 ? amount0 : -amount0));
        
        // Emit completion event for agent analysis
        emit SwapCompleted(poolId, block.timestamp, amount0, amount1);
        
        return (BaseHook.afterSwap.selector, 0);
    }
    
    /// @notice Called before adding liquidity
    function beforeAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external view override notPaused returns (bytes4) {
        PoolId poolId = key.toId();
        RiskState storage state = poolRiskStates[poolId];
        
        // Allow liquidity addition even in high risk (LPs may want to provide more)
        // But block if in emergency mode
        if (state.emergencyMode) revert PoolInEmergencyMode();
        
        return BaseHook.beforeAddLiquidity.selector;
    }
    
    /// @notice Called before removing liquidity
    function beforeRemoveLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external view override returns (bytes4) {
        // Always allow liquidity removal (even in emergency - users should be able to exit)
        return BaseHook.beforeRemoveLiquidity.selector;
    }

    /*//////////////////////////////////////////////////////////////
                           AGENT FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Update risk score for a pool (called by authorized agents)
    /// @param poolId The pool identifier
    /// @param newRiskScore New risk score [0-10000]
    /// @param regime Current volatility regime
    /// @param confidence Confidence level of the assessment
    function updateRiskScore(
        PoolId poolId,
        uint256 newRiskScore,
        VolatilityRegime regime,
        uint256 confidence
    ) external onlyAgent {
        if (newRiskScore > PRECISION) revert InvalidRiskScore();
        if (confidence > PRECISION) revert InvalidConfidence();
        
        RiskState storage state = poolRiskStates[poolId];
        
        // Anti-flapping: require significant change or sufficient time elapsed
        uint256 timeSinceUpdate = block.timestamp - state.lastUpdate;
        if (timeSinceUpdate < MIN_UPDATE_INTERVAL) {
            uint256 riskChange = _absDiff(newRiskScore, state.riskScore);
            if (riskChange < MIN_RISK_CHANGE) revert UpdateTooFrequent();
        }
        
        // Update state
        state.riskScore = newRiskScore;
        state.regime = regime;
        state.confidence = confidence;
        state.lastUpdate = block.timestamp;
        
        emit RiskUpdated(poolId, newRiskScore, regime, confidence, block.timestamp);
    }
    
    /// @notice Update Kalman filter state (called by agents with off-chain computation)
    /// @param poolId The pool identifier
    /// @param priceEstimate New price estimate
    /// @param velocity Price velocity
    /// @param uncertainty State uncertainty
    function updateKalmanState(
        PoolId poolId,
        int256 priceEstimate,
        int256 velocity,
        uint256 uncertainty
    ) external onlyAgent {
        KalmanState storage ks = kalmanStates[poolId];
        
        ks.priceEstimate = priceEstimate;
        ks.velocity = velocity;
        ks.uncertainty = uncertainty;
        ks.lastTimestamp = block.timestamp;
    }
    
    /// @notice Toggle emergency mode for a pool
    /// @param poolId The pool identifier
    /// @param enabled Whether to enable emergency mode
    function setEmergencyMode(PoolId poolId, bool enabled) external onlyAgent {
        poolRiskStates[poolId].emergencyMode = enabled;
        emit EmergencyModeToggled(poolId, enabled);
    }
    
    /// @notice Batch update risk scores for multiple pools
    /// @param poolIds Array of pool identifiers
    /// @param riskScores Array of risk scores
    /// @param regimes Array of volatility regimes
    /// @param confidences Array of confidence levels
    function batchUpdateRiskScores(
        PoolId[] calldata poolIds,
        uint256[] calldata riskScores,
        VolatilityRegime[] calldata regimes,
        uint256[] calldata confidences
    ) external onlyAgent {
        require(
            poolIds.length == riskScores.length &&
            poolIds.length == regimes.length &&
            poolIds.length == confidences.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < poolIds.length; i++) {
            RiskState storage state = poolRiskStates[poolIds[i]];
            
            if (riskScores[i] <= PRECISION && confidences[i] <= PRECISION) {
                state.riskScore = riskScores[i];
                state.regime = regimes[i];
                state.confidence = confidences[i];
                state.lastUpdate = block.timestamp;
                
                emit RiskUpdated(
                    poolIds[i],
                    riskScores[i],
                    regimes[i],
                    confidences[i],
                    block.timestamp
                );
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Authorize or deauthorize an agent
    /// @param agent The agent address
    /// @param authorized Whether to authorize
    function setAgentAuthorization(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }
    
    /// @notice Update fee configuration for a pool
    /// @param poolId The pool identifier
    /// @param config New fee configuration
    function setFeeConfig(PoolId poolId, FeeConfig calldata config) external onlyOwner {
        _validateFeeConfig(config);
        feeConfigs[poolId] = config;
        emit FeeConfigUpdated(poolId, config);
    }
    
    /// @notice Update default fee configuration
    /// @param config New default fee configuration
    function setDefaultFeeConfig(FeeConfig calldata config) external onlyOwner {
        _validateFeeConfig(config);
        defaultFeeConfig = config;
    }
    
    /// @notice Toggle global pause
    /// @param paused Whether to pause
    function setGlobalPause(bool paused) external onlyOwner {
        globalPause = paused;
    }
    
    /// @notice Transfer ownership
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get current dynamic fee for a pool
    /// @param poolId The pool identifier
    /// @return fee The current dynamic fee
    function getCurrentFee(PoolId poolId) external view returns (uint24) {
        return _calculateDynamicFee(poolId, poolRiskStates[poolId].riskScore);
    }
    
    /// @notice Get full risk state for a pool
    /// @param poolId The pool identifier
    /// @return state The risk state
    function getRiskState(PoolId poolId) external view returns (RiskState memory) {
        return poolRiskStates[poolId];
    }
    
    /// @notice Get Kalman filter state for a pool
    /// @param poolId The pool identifier
    /// @return state The Kalman state
    function getKalmanState(PoolId poolId) external view returns (KalmanState memory) {
        return kalmanStates[poolId];
    }
    
    /// @notice Check if a pool is in a safe state for operations
    /// @param poolId The pool identifier
    /// @return safe Whether the pool is safe
    /// @return reason Reason code if not safe
    function isPoolSafe(PoolId poolId) external view returns (bool safe, string memory reason) {
        RiskState storage state = poolRiskStates[poolId];
        
        if (globalPause) return (false, "Global pause active");
        if (state.emergencyMode) return (false, "Emergency mode active");
        if (state.riskScore > 8000) return (false, "Risk score too high");
        if (state.regime == VolatilityRegime.CRISIS) return (false, "Crisis regime");
        if (state.regime == VolatilityRegime.MANIPULATED) return (false, "Manipulation detected");
        
        return (true, "");
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Calculate dynamic fee using sigmoid function
    /// @param poolId The pool identifier
    /// @param riskScore Current risk score
    /// @return fee The calculated fee
    function _calculateDynamicFee(PoolId poolId, uint256 riskScore) internal view returns (uint24) {
        FeeConfig memory config = feeConfigs[poolId];
        
        // If no custom config, use default
        if (config.baseFee == 0) {
            config = defaultFeeConfig;
        }
        
        // Sigmoid function: fee = base + (max-base) * sigmoid(k * (risk - threshold))
        // Simplified for gas efficiency using linear interpolation in high/low regions
        
        if (riskScore <= config.threshold / 2) {
            // Low risk region - use minimum fee
            return config.minFee;
        } else if (riskScore >= config.threshold * 3 / 2) {
            // High risk region - use maximum fee
            return config.maxFee;
        } else {
            // Transition region - linear interpolation (approximates sigmoid)
            uint256 range = config.maxFee - config.baseFee;
            uint256 riskRange = config.threshold;
            uint256 adjustedRisk = riskScore - config.threshold / 2;
            
            uint256 feeIncrease = (range * adjustedRisk * config.steepness) / (riskRange * 10);
            
            uint24 calculatedFee = config.baseFee + uint24(feeIncrease);
            
            // Clamp to bounds
            if (calculatedFee < config.minFee) return config.minFee;
            if (calculatedFee > config.maxFee) return config.maxFee;
            
            return calculatedFee;
        }
    }
    
    /// @notice Validate fee configuration
    /// @param config The configuration to validate
    function _validateFeeConfig(FeeConfig memory config) internal pure {
        if (config.minFee > config.baseFee) revert InvalidFeeConfig();
        if (config.baseFee > config.maxFee) revert InvalidFeeConfig();
        if (config.maxFee > 100000) revert InvalidFeeConfig(); // Max 10%
        if (config.threshold > PRECISION) revert InvalidFeeConfig();
        if (config.steepness == 0 || config.steepness > 100) revert InvalidFeeConfig();
    }
    
    /// @notice Calculate absolute difference
    /// @param a First value
    /// @param b Second value
    /// @return diff The absolute difference
    function _absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }
}
