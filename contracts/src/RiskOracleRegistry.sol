// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RiskOracleRegistry
/// @notice Decentralized registry for risk oracles using ENS integration
/// @dev Manages oracle registration, reputation, and data aggregation

contract RiskOracleRegistry {


    // errors

    error OrcaleNotRegistered();
    error OrcaleAlreadyRegistered();
    error InvalidStake();
    error InsufficientStake();
    error Unauthorized();
    error OrcaleSlashed();
    error InvalidReport();
    error ReportTooFrequent();

    // events
    event OrcaleRegistered();

    event RiskReportSubmitted(address indexed oracle,
        bytes32 indexed poolId,
        uint256 riskScore,
        uint256 confidence,
        uint256 timestamp);

    event OrcaleSlashedEvent();
    event ReputationUpdated();
    event AggregatedRiskUpdated(
        bytes32 indexed poolId,
        uint256 aggregatedRisk,
        uint256 oracleCount
    );


    //structs
    struct OracleInfo{
        bytes32 ensNode; //ENS namehash
        string ensName; /// Human-readable ENS name
        uint256 stake;            // Staked ETH
        uint256 reputation;       // Reputation score [0-10000]
        uint256 totalReports;     // Total reports submitted
        uint256 accurateReports;  // Reports validated as accurate
        uint256 lastReport;       // Timestamp of last report
        bool isActive;            // Active status
        bool isSlashed;           // Slash status
    }

    // @notice Risk report from an oracle
    struct RiskReport {
        uint256 riskScore;        // Risk score [0-10000]
        uint256 confidence;       // Confidence [0-10000]
        uint256 timestamp;        // Report timestamp
        bytes32 dataHash;         // Hash of supporting data
    }
    
    /// @notice Aggregated risk data for a pool
    struct AggregatedRisk {
        uint256 weightedRisk;     // Reputation-weighted average risk
        uint256 medianRisk;       // Median risk score
        uint256 oracleCount;      // Number of reporting oracles
        uint256 totalWeight;      // Sum of oracle weights
        uint256 lastUpdate;       // Last aggregation timestamp
        uint256 consensus;        // Agreement level [0-10000]
    }
    
    /// @notice Oracle configuration
    struct OracleConfig {
        string[] supportedChains;
        string[] supportedPools;
        uint256 updateFrequency;
        string dataSource;
        string methodology;
    }

    //state variables
    // @notice Registered oracles
    mapping(address => OracleInfo) public oracles;
    
    /// @notice ENS node to oracle address mapping
    mapping(bytes32 => address) public ensToOracle;
    
    /// @notice Oracle configurations (stored off-chain via ENS text records in production)
    mapping(address => OracleConfig) public oracleConfigs;
    
    /// @notice Risk reports per pool per oracle
    mapping(bytes32 => mapping(address => RiskReport)) public poolReports;
    
    /// @notice Aggregated risk per pool
    mapping(bytes32 => AggregatedRisk) public aggregatedRisks;
    
    /// @notice List of oracles that reported for a pool
    mapping(bytes32 => address[]) public poolOracles;
    
    /// @notice Minimum stake to register as oracle
    uint256 public minStake = 0.1 ether;
    
    /// @notice Minimum report interval
    uint256 public minReportInterval = 12; // ~1 block
    
    /// @notice Owner address
    address public owner;
    
    /// @notice ENS registry address (for production ENS integration)
    address public ensRegistry;
    
    /// @notice Total registered oracles
    uint256 public totalOracles;
    
    /// @notice Reputation decay factor (per day of inactivity)
    uint256 public constant REPUTATION_DECAY = 10; // 0.1%
    
    /// @notice Base reputation for new oracles
    uint256 public constant BASE_REPUTATION = 5000;
    
    /// @notice Precision for calculations
    uint256 public constant PRECISION = 10000;


    //constructor

    constructor(address _ensRegistry) {
        owner = msg.sender;
        ensRegistry = _ensRegistry;
    }

    modifiers onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }   

    modifier onlyActiveOracle() {
        if (!oracles[msg.sender].isActive) revert OracleNotRegistered();
        if (oracles[msg.sender].isSlashed) revert OracleSlashed();
        _;
    }

    //orcale registration functions

    /// @notice Register as a risk oracle
    /// @param ensNode ENS namehash for oracle identity
    /// @param ensName Human-readable ENS name
    function registerOracle(bytes32 ensNode, string calldata ensName) external payable {
        if (oracles[msg.sender].isActive) revert OracleAlreadyRegistered();
        if (msg.value < minStake) revert InvalidStake();
        
        oracles[msg.sender] = OracleInfo({
            ensNode: ensNode,
            ensName: ensName,
            stake: msg.value,
            reputation: BASE_REPUTATION,
            totalReports: 0,
            accurateReports: 0,
            lastReport: 0,
            isActive: true,
            isSlashed: false
        });
        
        ensToOracle[ensNode] = msg.sender;
        totalOracles++;
        
        emit OracleRegistered(msg.sender, ensNode, ensName, msg.value);
    }
    function addStake() external payable onlyActiveOracle{
        oracles[msg.sender].stake += msg.value;
    }
    
    /// @notice Deregister as oracle and withdraw stake
    function deregisterOracle() external {
        OracleInfo storage oracle = oracles[msg.sender];
        if (!oracle.isActive) revert OracleNotRegistered();
        
        uint256 stake = oracle.stake;
        oracle.isActive = false;
        oracle.stake = 0;
        
        delete ensToOracle[oracle.ensNode];
        totalOracles--;
        
        // Return stake (minus any slashing)
        if (stake > 0 && !oracle.isSlashed) {
            payable(msg.sender).transfer(stake);
        }
        
        emit OracleDeregistered(msg.sender);
    }
    
    /// @notice Update oracle configuration
    /// @param config New configuration
    function updateOracleConfig(OracleConfig calldata config) external onlyActiveOracle {
        oracleConfigs[msg.sender] = config;
    }

    //Risk reporting functions
    /// @notice Submit a risk report for a pool
    /// @param poolId The pool identifier
    /// @param riskScore Risk score [0-10000]
    /// @param confidence Confidence level [0-10000]
    /// @param dataHash Hash of supporting data

    function submitRiskReport(bytes32 poolId ,
        uint256 riskScore,
        uint256 confidence,
        bytes32 dataHash) external onlyActiveOracle {
        OracleInfo storage oracle = oracles[msg.sender];


        // Validate inputs
        if (riskScore > PRECISION) revert InvalidReport();
        if (confidence > PRECISION) revert InvalidReport();

        // Check report frequency
        if (block.timestamp - oracle.lastReport < minReportInterval) {
            revert ReportTooFrequent();
        }
        
        // Check if first report for this pool
        RiskReport storage existingReport = poolReports[poolId][msg.sender];
        if (existingReport.timestamp == 0) {
            poolOracles[poolId].push(msg.sender);
        }
        
        // Store report
        poolReports[poolId][msg.sender] = RiskReport({
            riskScore: riskScore,
            confidence: confidence,
            timestamp: block.timestamp,
            dataHash: dataHash
        });
        
        // Update oracle stats
        oracle.totalReports++;
        oracle.lastReport = block.timestamp;

        emit RiskReportSubmitted(msg.sender, poolId, riskScore, confidence, block.timestamp);
        
        // Trigger aggregation
        _aggregateRisk(poolId);
    }

    /// @notice Batch submit reports for multiple pools
    /// @param poolIds Pool identifiers
    /// @param riskScores Risk scores
    /// @param confidences Confidence levels
    /// @param dataHashes Data hashes
    function batchSubmitReports(
        bytes32[] calldata poolIds,
        uint256[] calldata riskScores,
        uint256[] calldata confidences,
        bytes32[] calldata dataHashes
    ) external onlyActiveOracle {
        require(
            poolIds.length == riskScores.length &&
            poolIds.length == confidences.length &&
            poolIds.length == dataHashes.length,
            "Array length mismatch"
        );
        
        OracleInfo storage oracle = oracles[msg.sender];
        
        for (uint256 i = 0; i < poolIds.length; i++) {
            if (riskScores[i] <= PRECISION && confidences[i] <= PRECISION) {
                // Check if first report for this pool
                if (poolReports[poolIds[i]][msg.sender].timestamp == 0) {
                    poolOracles[poolIds[i]].push(msg.sender);
                }
                
                poolReports[poolIds[i]][msg.sender] = RiskReport({
                    riskScore: riskScores[i],
                    confidence: confidences[i],
                    timestamp: block.timestamp,
                    dataHash: dataHashes[i]
                });
                
                emit RiskReportSubmitted(
                    msg.sender,
                    poolIds[i],
                    riskScores[i],
                    confidences[i],
                    block.timestamp
                );
                
                _aggregateRisk(poolIds[i]);
            }
        }
        
        oracle.totalReports += poolIds.length;
        oracle.lastReport = block.timestamp;
    }

    //aggregation functions
    /// @notice Aggregate risk reports for a pool
    /// @param poolId The pool identifier
    function _aggregateRisk(bytes32 poolId) internal {
        address[] storage reporters = poolOracles[poolId];
        uint256 count = reporters.length;
        
        if (count == 0) return;
        
        uint256 totalWeight = 0;
        uint256 weightedSum = 0;
        uint256[] memory scores = new uint256[](count);
        uint256 validCount = 0;
        
        // Calculate weighted average
        for (uint256 i = 0; i < count; i++) {
            address reporter = reporters[i];
            OracleInfo storage oracle = oracles[reporter];
            RiskReport storage report = poolReports[poolId][reporter];
            
            // Only include recent reports from active oracles
            if (oracle.isActive && 
                !oracle.isSlashed && 
                block.timestamp - report.timestamp < 1 hours) {
                
                // Weight = reputation * confidence * stake_factor
                uint256 stakeFactor = oracle.stake >= minStake * 10 ? 150 : 100;
                uint256 weight = (oracle.reputation * report.confidence * stakeFactor) / (PRECISION * 100);
                
                totalWeight += weight;
                weightedSum += report.riskScore * weight;
                scores[validCount] = report.riskScore;
                validCount++;
            }
        }
        
        if (validCount == 0) return;
        
        // Calculate weighted average
        uint256 weightedRisk = totalWeight > 0 ? weightedSum / totalWeight : 0;
        
        // Calculate median (simplified - sort and take middle)
        uint256 medianRisk = _calculateMedian(scores, validCount);
        
        // Calculate consensus (how much oracles agree)
        uint256 consensus = _calculateConsensus(scores, validCount, weightedRisk);
        
        // Update aggregated risk
        aggregatedRisks[poolId] = AggregatedRisk({
            weightedRisk: weightedRisk,
            medianRisk: medianRisk,
            oracleCount: validCount,
            totalWeight: totalWeight,
            lastUpdate: block.timestamp,
            consensus: consensus
        });
        
        emit AggregatedRiskUpdated(poolId, weightedRisk, validCount);
    }
    
    /// @notice Calculate median of risk scores
    function _calculateMedian(uint256[] memory scores, uint256 count) internal pure returns (uint256) {
        if (count == 0) return 0;
        if (count == 1) return scores[0];
        
        // Simple bubble sort (acceptable for small arrays)
        for (uint256 i = 0; i < count - 1; i++) {
            for (uint256 j = 0; j < count - i - 1; j++) {
                if (scores[j] > scores[j + 1]) {
                    (scores[j], scores[j + 1]) = (scores[j + 1], scores[j]);
                }
            }
        }
        
        if (count % 2 == 0) {
            return (scores[count / 2 - 1] + scores[count / 2]) / 2;
        } else {
            return scores[count / 2];
        }
    }
    
    /// @notice Calculate consensus level
    function _calculateConsensus(
        uint256[] memory scores,
        uint256 count,
        uint256 average
    ) internal pure returns (uint256) {
        if (count <= 1) return PRECISION;
        
        uint256 totalDeviation = 0;
        for (uint256 i = 0; i < count; i++) {
            if (scores[i] > average) {
                totalDeviation += scores[i] - average;
            } else {
                totalDeviation += average - scores[i];
            }
        }
        
        uint256 avgDeviation = totalDeviation / count;
        
        // Consensus = 100% - normalized deviation
        if (avgDeviation >= PRECISION) return 0;
        return PRECISION - avgDeviation;
    }

    //reputation functions
    /// @notice Update oracle reputation based on report accuracy
    /// @param oracle Oracle address
    /// @param isAccurate Whether the report was accurate
    function updateReputation(address oracle, bool isAccurate) external onlyOwner {
        OracleInfo storage info = oracles[oracle];
        if (!info.isActive) revert OracleNotRegistered();
        
        uint256 oldRep = info.reputation;
        
        if (isAccurate) {
            info.accurateReports++;
            // Increase reputation (max 10000)
            info.reputation = info.reputation + 100 > PRECISION 
                ? PRECISION 
                : info.reputation + 100;
        } else {
            // Decrease reputation
            info.reputation = info.reputation > 200 
                ? info.reputation - 200 
                : 0;
        }
        
        emit ReputationUpdated(oracle, oldRep, info.reputation);
    }
    
    /// @notice Slash an oracle for misbehavior
    /// @param oracle Oracle address
    /// @param amount Amount to slash
    /// @param reason Reason for slashing
    function slashOracle(
        address oracle,
        uint256 amount,
        string calldata reason
    ) external onlyOwner {
        OracleInfo storage info = oracles[oracle];
        if (!info.isActive) revert OracleNotRegistered();
        
        uint256 slashAmount = amount > info.stake ? info.stake : amount;
        info.stake -= slashAmount;
        info.reputation = info.reputation / 2; // Halve reputation
        
        if (info.stake < minStake) {
            info.isSlashed = true;
        }
        
        emit OracleSlashedEvent(oracle, slashAmount, reason);
    }
    //functions
    /// @notice Get aggregated risk for a pool
    /// @param poolId The pool identifier
    /// @return risk The aggregated risk data
    function getAggregatedRisk(bytes32 poolId) external view returns (AggregatedRisk memory) {
        return aggregatedRisks[poolId];
    }
    
    /// @notice Get oracle information
    /// @param oracle Oracle address
    /// @return info The oracle information
    function getOracleInfo(address oracle) external view returns (OracleInfo memory) {
        return oracles[oracle];
    }
    
    /// @notice Get oracle by ENS node
    /// @param ensNode ENS namehash
    /// @return oracle Oracle address
    function getOracleByENS(bytes32 ensNode) external view returns (address) {
        return ensToOracle[ensNode];
    }
    
    /// @notice Get all oracles for a pool
    /// @param poolId The pool identifier
    /// @return Array of oracle addresses
    function getPoolOracles(bytes32 poolId) external view returns (address[] memory) {
        return poolOracles[poolId];
    }
    
    /// @notice Get oracle's report for a pool
    /// @param poolId The pool identifier
    /// @param oracle Oracle address
    /// @return report The risk report
    function getOracleReport(
        bytes32 poolId,
        address oracle
    ) external view returns (RiskReport memory) {
        return poolReports[poolId][oracle];
    }
    
    /// @notice Check if oracle is healthy
    /// @param oracle Oracle address
    /// @return healthy Whether oracle is healthy
    /// @return reason Reason if not healthy
    function isOracleHealthy(address oracle) external view returns (bool healthy, string memory reason) {
        OracleInfo storage info = oracles[oracle];
        
        if (!info.isActive) return (false, "Not active");
        if (info.isSlashed) return (false, "Slashed");
        if (info.stake < minStake) return (false, "Insufficient stake");
        if (info.reputation < 1000) return (false, "Low reputation");
        if (block.timestamp - info.lastReport > 1 hours) return (false, "Stale reports");
        
        return (true, "");
    }

    //admin functions
    /// @notice Update minimum stake requirement
    /// @param _minStake New minimum stake
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
    }
    
    /// @notice Update minimum report interval
    /// @param _minInterval New minimum interval
    function setMinReportInterval(uint256 _minInterval) external onlyOwner {
        minReportInterval = _minInterval;
    }
    
    /// @notice Transfer ownership
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    /// @notice Withdraw slashed funds
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdrawSlashedFunds(address to, uint256 amount) external onlyOwner {
        payable(to).transfer(amount);
    }
}