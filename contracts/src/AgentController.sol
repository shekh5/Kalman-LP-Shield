// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoolId} from "v4-core/src/types/PoolId.sol";
import {KalmanGuardHook} from "./KalmanGuardHook.sol";

/// @title AgentController
/// @notice Manages agent operations and coordinates risk updates
/// @dev Acts as intermediary between off-chain agents and on-chain hooks
contract AgentController {
    
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/
    
    error AgentNotRegistered();
    error AgentAlreadyRegistered();
    error InvalidRole();
    error Unauthorized();
    error CooldownNotElapsed();
    error InvalidThreshold();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event AgentRegistered(
        address indexed agent,
        AgentRole role,
        bytes32 ensNode,
        string ensName
    );
    
    event AgentDeregistered(address indexed agent);
    
    event RiskUpdateProposed(
        bytes32 indexed proposalId,
        PoolId indexed poolId,
        uint256 riskScore,
        address proposer
    );
    
    event RiskUpdateExecuted(
        bytes32 indexed proposalId,
        PoolId indexed poolId,
        uint256 riskScore
    );
    
    event EmergencyActionExecuted(
        address indexed agent,
        PoolId indexed poolId,
        EmergencyAction action
    );
    
    event ThresholdUpdated(string thresholdType, uint256 oldValue, uint256 newValue);

    /// @notice Lightweight proof-of-life event for public testnet demos
    event Heartbeat(address indexed sender, string agentName, uint256 blockNumber, uint256 timestamp);

    /*//////////////////////////////////////////////////////////////
                                 ENUMS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Agent role types
    enum AgentRole {
        PRICE_MONITOR,      // Monitors oracle feeds
        MEV_DETECTOR,       // Detects MEV attacks
        RISK_SCORER,        // Calculates risk scores
        EXECUTOR,           // Submits transactions
        CROSS_CHAIN,        // Manages cross-chain operations
        GUARDIAN            // Emergency powers
    }
    
    /// @notice Emergency action types
    enum EmergencyAction {
        PAUSE_POOL,
        UNPAUSE_POOL,
        MAX_FEE,
        RESET_FEE
    }

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Agent information
    struct AgentInfo {
        AgentRole role;
        bytes32 ensNode;
        string ensName;
        uint256 reputation;
        uint256 lastAction;
        uint256 actionCount;
        bool isActive;
    }
    
    /// @notice Risk update proposal
    struct RiskProposal {
        PoolId poolId;
        uint256 riskScore;
        KalmanGuardHook.VolatilityRegime regime;
        uint256 confidence;
        address proposer;
        uint256 timestamp;
        uint256 approvals;
        bool executed;
    }
    
    /// @notice Multi-sig threshold configuration
    struct ThresholdConfig {
        uint256 normalUpdateThreshold;    // Approvals needed for normal updates
        uint256 emergencyThreshold;        // Approvals needed for emergency actions
        uint256 highRiskThreshold;         // Risk score threshold for requiring multi-sig
        uint256 cooldownPeriod;            // Time between actions from same agent
    }

    /*//////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    
    /// @notice The KalmanGuard hook contract
    KalmanGuardHook public hook;
    
    /// @notice Registered agents
    mapping(address => AgentInfo) public agents;
    
    /// @notice Agents by role
    mapping(AgentRole => address[]) public agentsByRole;
    
    /// @notice Risk update proposals
    mapping(bytes32 => RiskProposal) public proposals;
    
    /// @notice Proposal approvals
    mapping(bytes32 => mapping(address => bool)) public proposalApprovals;
    
    /// @notice Threshold configuration
    ThresholdConfig public thresholds;
    
    /// @notice Owner address
    address public owner;
    
    /// @notice Total registered agents
    uint256 public totalAgents;
    
    /// @notice Proposal counter for unique IDs
    uint256 public proposalCounter;
    
    /// @notice Precision for calculations
    uint256 public constant PRECISION = 10000;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(address _hook) {
        hook = KalmanGuardHook(_hook);
        owner = msg.sender;
        
        thresholds = ThresholdConfig({
            normalUpdateThreshold: 1,     // Single agent can update normally
            emergencyThreshold: 2,        // 2 agents for emergency actions
            highRiskThreshold: 8000,      // 80% risk requires multi-sig
            cooldownPeriod: 12            // ~1 block
        });
    }

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }
    
    modifier onlyAgent() {
        if (!agents[msg.sender].isActive) revert AgentNotRegistered();
        _;
    }
    
    modifier onlyRole(AgentRole role) {
        if (agents[msg.sender].role != role) revert InvalidRole();
        _;
    }
    
    modifier cooldownElapsed() {
        if (block.timestamp - agents[msg.sender].lastAction < thresholds.cooldownPeriod) {
            revert CooldownNotElapsed();
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                           DEMO / HEARTBEAT
    //////////////////////////////////////////////////////////////*/

    /// @notice Emit a heartbeat event (useful for Sepolia judging demos)
    /// @dev Does not require registration; intended as a cheap verifiable transaction.
    function heartbeat(string calldata agentName) external {
        emit Heartbeat(msg.sender, agentName, block.number, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                      AGENT REGISTRATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Register a new agent
    /// @param agent Agent address
    /// @param role Agent role
    /// @param ensNode ENS namehash
    /// @param ensName Human-readable ENS name
    function registerAgent(
        address agent,
        AgentRole role,
        bytes32 ensNode,
        string calldata ensName
    ) external onlyOwner {
        if (agents[agent].isActive) revert AgentAlreadyRegistered();
        
        agents[agent] = AgentInfo({
            role: role,
            ensNode: ensNode,
            ensName: ensName,
            reputation: 5000, // Start with 50% reputation
            lastAction: 0,
            actionCount: 0,
            isActive: true
        });
        
        agentsByRole[role].push(agent);
        totalAgents++;
        
        // Authorize agent on hook contract
        hook.setAgentAuthorization(agent, true);
        
        emit AgentRegistered(agent, role, ensNode, ensName);
    }
    
    /// @notice Deregister an agent
    /// @param agent Agent address
    function deregisterAgent(address agent) external onlyOwner {
        if (!agents[agent].isActive) revert AgentNotRegistered();
        
        agents[agent].isActive = false;
        totalAgents--;
        
        // Revoke authorization on hook
        hook.setAgentAuthorization(agent, false);
        
        emit AgentDeregistered(agent);
    }

    /*//////////////////////////////////////////////////////////////
                       RISK UPDATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Propose a risk update (for high-risk situations requiring multi-sig)
    /// @param poolId The pool identifier
    /// @param riskScore New risk score
    /// @param regime Volatility regime
    /// @param confidence Confidence level
    /// @return proposalId The proposal identifier
    function proposeRiskUpdate(
        PoolId poolId,
        uint256 riskScore,
        KalmanGuardHook.VolatilityRegime regime,
        uint256 confidence
    ) external onlyAgent cooldownElapsed returns (bytes32 proposalId) {
        proposalId = keccak256(abi.encode(
            poolId,
            riskScore,
            regime,
            confidence,
            block.timestamp,
            proposalCounter++
        ));
        
        proposals[proposalId] = RiskProposal({
            poolId: poolId,
            riskScore: riskScore,
            regime: regime,
            confidence: confidence,
            proposer: msg.sender,
            timestamp: block.timestamp,
            approvals: 1,
            executed: false
        });
        
        proposalApprovals[proposalId][msg.sender] = true;
        
        agents[msg.sender].lastAction = block.timestamp;
        agents[msg.sender].actionCount++;
        
        emit RiskUpdateProposed(proposalId, poolId, riskScore, msg.sender);
        
        // Auto-execute if threshold met
        _tryExecuteProposal(proposalId);
        
        return proposalId;
    }
    
    /// @notice Approve a risk update proposal
    /// @param proposalId The proposal identifier
    function approveProposal(bytes32 proposalId) external onlyAgent {
        RiskProposal storage proposal = proposals[proposalId];
        
        require(!proposal.executed, "Already executed");
        require(!proposalApprovals[proposalId][msg.sender], "Already approved");
        require(block.timestamp - proposal.timestamp < 1 hours, "Proposal expired");
        
        proposalApprovals[proposalId][msg.sender] = true;
        proposal.approvals++;
        
        _tryExecuteProposal(proposalId);
    }
    
    /// @notice Direct risk update (for low-risk situations)
    /// @param poolId The pool identifier
    /// @param riskScore New risk score
    /// @param regime Volatility regime
    /// @param confidence Confidence level
    function updateRiskDirect(
        PoolId poolId,
        uint256 riskScore,
        KalmanGuardHook.VolatilityRegime regime,
        uint256 confidence
    ) external onlyAgent onlyRole(AgentRole.RISK_SCORER) cooldownElapsed {
        // Only allow direct updates for low-risk scores
        require(riskScore < thresholds.highRiskThreshold, "Use proposeRiskUpdate for high risk");
        
        hook.updateRiskScore(poolId, riskScore, regime, confidence);
        
        agents[msg.sender].lastAction = block.timestamp;
        agents[msg.sender].actionCount++;
    }
    
    /// @notice Try to execute a proposal if threshold is met
    /// @param proposalId The proposal identifier
    function _tryExecuteProposal(bytes32 proposalId) internal {
        RiskProposal storage proposal = proposals[proposalId];
        
        if (proposal.executed) return;
        
        // Determine required threshold
        uint256 requiredApprovals = proposal.riskScore >= thresholds.highRiskThreshold
            ? thresholds.emergencyThreshold
            : thresholds.normalUpdateThreshold;
        
        if (proposal.approvals >= requiredApprovals) {
            proposal.executed = true;
            
            hook.updateRiskScore(
                proposal.poolId,
                proposal.riskScore,
                proposal.regime,
                proposal.confidence
            );
            
            emit RiskUpdateExecuted(proposalId, proposal.poolId, proposal.riskScore);
        }
    }

    /*//////////////////////////////////////////////////////////////
                       EMERGENCY FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Execute emergency action
    /// @param poolId The pool identifier
    /// @param action Emergency action type
    function executeEmergencyAction(
        PoolId poolId,
        EmergencyAction action
    ) external onlyAgent onlyRole(AgentRole.GUARDIAN) {
        if (action == EmergencyAction.PAUSE_POOL) {
            hook.setEmergencyMode(poolId, true);
        } else if (action == EmergencyAction.UNPAUSE_POOL) {
            hook.setEmergencyMode(poolId, false);
        } else if (action == EmergencyAction.MAX_FEE) {
            // Set risk to maximum to trigger max fees
            hook.updateRiskScore(
                poolId,
                PRECISION,
                KalmanGuardHook.VolatilityRegime.CRISIS,
                PRECISION
            );
        } else if (action == EmergencyAction.RESET_FEE) {
            // Reset risk to normal
            hook.updateRiskScore(
                poolId,
                0,
                KalmanGuardHook.VolatilityRegime.NORMAL,
                PRECISION
            );
        }
        
        emit EmergencyActionExecuted(msg.sender, poolId, action);
    }

    /*//////////////////////////////////////////////////////////////
                       BATCH OPERATIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Batch update risk scores for multiple pools
    /// @param poolIds Pool identifiers
    /// @param riskScores Risk scores
    /// @param regimes Volatility regimes
    /// @param confidences Confidence levels
    function batchUpdateRisk(
        PoolId[] calldata poolIds,
        uint256[] calldata riskScores,
        KalmanGuardHook.VolatilityRegime[] calldata regimes,
        uint256[] calldata confidences
    ) external onlyAgent onlyRole(AgentRole.RISK_SCORER) cooldownElapsed {
        require(
            poolIds.length == riskScores.length &&
            poolIds.length == regimes.length &&
            poolIds.length == confidences.length,
            "Array length mismatch"
        );
        
        // Check all are low-risk
        for (uint256 i = 0; i < riskScores.length; i++) {
            require(
                riskScores[i] < thresholds.highRiskThreshold,
                "Use proposals for high risk"
            );
        }
        
        hook.batchUpdateRiskScores(poolIds, riskScores, regimes, confidences);
        
        agents[msg.sender].lastAction = block.timestamp;
        agents[msg.sender].actionCount += poolIds.length;
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get agent information
    /// @param agent Agent address
    /// @return info Agent information
    function getAgentInfo(address agent) external view returns (AgentInfo memory) {
        return agents[agent];
    }
    
    /// @notice Get all agents with a specific role
    /// @param role The agent role
    /// @return Array of agent addresses
    function getAgentsByRole(AgentRole role) external view returns (address[] memory) {
        return agentsByRole[role];
    }
    
    /// @notice Get proposal details
    /// @param proposalId The proposal identifier
    /// @return proposal The risk proposal
    function getProposal(bytes32 proposalId) external view returns (RiskProposal memory) {
        return proposals[proposalId];
    }
    
    /// @notice Check if agent can perform action
    /// @param agent Agent address
    /// @return canAct Whether agent can act
    /// @return reason Reason if cannot act
    function canAgentAct(address agent) external view returns (bool canAct, string memory reason) {
        AgentInfo storage info = agents[agent];
        
        if (!info.isActive) return (false, "Agent not active");
        if (block.timestamp - info.lastAction < thresholds.cooldownPeriod) {
            return (false, "Cooldown not elapsed");
        }
        
        return (true, "");
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Update threshold configuration
    /// @param _thresholds New threshold configuration
    function setThresholds(ThresholdConfig calldata _thresholds) external onlyOwner {
        if (_thresholds.normalUpdateThreshold == 0) revert InvalidThreshold();
        if (_thresholds.emergencyThreshold == 0) revert InvalidThreshold();
        if (_thresholds.highRiskThreshold > PRECISION) revert InvalidThreshold();
        
        emit ThresholdUpdated("normalUpdate", thresholds.normalUpdateThreshold, _thresholds.normalUpdateThreshold);
        emit ThresholdUpdated("emergency", thresholds.emergencyThreshold, _thresholds.emergencyThreshold);
        emit ThresholdUpdated("highRisk", thresholds.highRiskThreshold, _thresholds.highRiskThreshold);
        emit ThresholdUpdated("cooldown", thresholds.cooldownPeriod, _thresholds.cooldownPeriod);
        
        thresholds = _thresholds;
    }
    
    /// @notice Update hook contract address
    /// @param _hook New hook address
    function setHook(address _hook) external onlyOwner {
        hook = KalmanGuardHook(_hook);
    }
    
    /// @notice Transfer ownership
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    /// @notice Update agent reputation (for rewards/penalties)
    /// @param agent Agent address
    /// @param newReputation New reputation score
    function updateAgentReputation(address agent, uint256 newReputation) external onlyOwner {
        require(newReputation <= PRECISION, "Invalid reputation");
        agents[agent].reputation = newReputation;
    }
}
