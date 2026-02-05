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
    event RiskReportSubmitted();
    event OrcaleSlashedEvent();
    event ReputationUpdated();
    event AggregatedRiskUpdated();


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
}