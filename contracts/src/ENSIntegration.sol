// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ENSIntegration
/// @notice Handles ENS name resolution and text record storage for KalmanGuard
/// @dev Provides human-readable naming for agents, pools, and configuration
contract ENSIntegration {
    
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event ConfigStored(bytes32 indexed node, string key, string value);
    event PoolRegistered(bytes32 indexed node, string poolName, address poolAddress);
    event AgentLinked(bytes32 indexed agentNode, bytes32 indexed poolNode);

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Pool configuration stored via ENS-like pattern
    struct PoolConfig {
        address poolAddress;
        string poolName;
        uint24 baseFee;
        uint24 maxFee;
        uint256 riskThreshold;
        address guardian;
        bool isActive;
    }
    
    /// @notice Agent configuration
    struct AgentConfig {
        string role;
        string[] chains;
        uint256 updateFrequency;
        string[] sources;
        string status;
    }

    /*//////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    
    /// @notice ENS Registry interface (mainnet: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e)
    address public ensRegistry;
    
    /// @notice Text records storage (ENS-like pattern)
    mapping(bytes32 => mapping(string => string)) public textRecords;
    
    /// @notice Address records
    mapping(bytes32 => address) public addressRecords;
    
    /// @notice Pool configurations
    mapping(bytes32 => PoolConfig) public poolConfigs;
    
    /// @notice Agent configurations
    mapping(bytes32 => AgentConfig) public agentConfigs;
    
    /// @notice Node to subnode mapping
    mapping(bytes32 => bytes32[]) public subnodes;
    
    /// @notice Owner address
    address public owner;
    
    /// @notice Root node for kalmanguard.eth
    bytes32 public rootNode;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(address _ensRegistry, bytes32 _rootNode) {
        ensRegistry = _ensRegistry;
        rootNode = _rootNode;
        owner = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /*//////////////////////////////////////////////////////////////
                         TEXT RECORD FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Set a text record for a node
    /// @param node The ENS namehash
    /// @param key The record key
    /// @param value The record value
    function setText(bytes32 node, string calldata key, string calldata value) external onlyOwner {
        textRecords[node][key] = value;
        emit ConfigStored(node, key, value);
    }
    
    /// @notice Get a text record
    /// @param node The ENS namehash
    /// @param key The record key
    /// @return The record value
    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return textRecords[node][key];
    }
    
    /// @notice Set address record
    /// @param node The ENS namehash
    /// @param _addr The address to set
    function setAddr(bytes32 node, address _addr) external onlyOwner {
        addressRecords[node] = _addr;
    }
    
    /// @notice Get address record
    /// @param node The ENS namehash
    /// @return The address
    function addr(bytes32 node) external view returns (address) {
        return addressRecords[node];
    }

    /*//////////////////////////////////////////////////////////////
                      POOL REGISTRATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Register a pool with ENS-like naming
    /// @param poolName Human-readable pool name (e.g., "eth-usdc")
    /// @param config Pool configuration
    function registerPool(string calldata poolName, PoolConfig calldata config) external onlyOwner {
        bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(poolName))));
        
        poolConfigs[node] = config;
        addressRecords[node] = config.poolAddress;
        
        // Store as text records for ENS compatibility
        textRecords[node]["pool-address"] = _addressToString(config.poolAddress);
        textRecords[node]["base-fee"] = _uintToString(config.baseFee);
        textRecords[node]["max-fee"] = _uintToString(config.maxFee);
        textRecords[node]["guardian"] = _addressToString(config.guardian);
        
        subnodes[rootNode].push(node);
        
        emit PoolRegistered(node, poolName, config.poolAddress);
    }
    
    /// @notice Get pool configuration
    /// @param poolName Human-readable pool name
    /// @return config The pool configuration
    function getPoolConfig(string calldata poolName) external view returns (PoolConfig memory) {
        bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(poolName))));
        return poolConfigs[node];
    }
    
    /// @notice Resolve pool name to address
    /// @param poolName Human-readable pool name
    /// @return The pool address
    function resolvePool(string calldata poolName) external view returns (address) {
        bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(poolName))));
        return addressRecords[node];
    }

    /*//////////////////////////////////////////////////////////////
                      AGENT REGISTRATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Register an agent with ENS-like naming
    /// @param agentName Agent name (e.g., "agent-1")
    /// @param agentAddress Agent wallet address
    /// @param config Agent configuration
    function registerAgent(
        string calldata agentName,
        address agentAddress,
        AgentConfig calldata config
    ) external onlyOwner {
        bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(agentName))));
        
        agentConfigs[node] = config;
        addressRecords[node] = agentAddress;
        
        // Store as text records
        textRecords[node]["role"] = config.role;
        textRecords[node]["status"] = config.status;
        textRecords[node]["update-frequency"] = _uintToString(config.updateFrequency);
        
        subnodes[rootNode].push(node);
    }
    
    /// @notice Get agent configuration
    /// @param agentName Agent name
    /// @return config The agent configuration
    function getAgentConfig(string calldata agentName) external view returns (AgentConfig memory) {
        bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(agentName))));
        return agentConfigs[node];
    }
    
    /// @notice Update agent status
    /// @param agentName Agent name
    /// @param status New status
    function updateAgentStatus(string calldata agentName, string calldata status) external onlyOwner {
        bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(agentName))));
        agentConfigs[node].status = status;
        textRecords[node]["status"] = status;
        textRecords[node]["last-update"] = _uintToString(block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                      ORACLE REGISTRY FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Register an oracle with metadata
    /// @param oracleName Oracle name
    /// @param oracleAddress Oracle contract address
    /// @param metadata Oracle metadata JSON
    function registerOracle(
        string calldata oracleName,
        address oracleAddress,
        string calldata metadata
    ) external onlyOwner {
        bytes32 node = keccak256(abi.encodePacked(
            keccak256(abi.encodePacked(rootNode, keccak256(bytes("oracles")))),
            keccak256(bytes(oracleName))
        ));
        
        addressRecords[node] = oracleAddress;
        textRecords[node]["oracle-metadata"] = metadata;
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Get all registered subnodes
    /// @param parentNode Parent node
    /// @return Array of subnode hashes
    function getSubnodes(bytes32 parentNode) external view returns (bytes32[] memory) {
        return subnodes[parentNode];
    }
    
    /// @notice Compute namehash for a name under root
    /// @param name The subname
    /// @return The namehash
    function computeNode(string calldata name) external view returns (bytes32) {
        return keccak256(abi.encodePacked(rootNode, keccak256(bytes(name))));
    }
    
    /// @notice Check if a name is registered
    /// @param name The name to check
    /// @return Whether the name is registered
    function isRegistered(string calldata name) external view returns (bool) {
        bytes32 node = keccak256(abi.encodePacked(rootNode, keccak256(bytes(name))));
        return addressRecords[node] != address(0);
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Transfer ownership
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    /// @notice Update root node
    /// @param _rootNode New root node
    function setRootNode(bytes32 _rootNode) external onlyOwner {
        rootNode = _rootNode;
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Convert address to string
    function _addressToString(address _addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory data = abi.encodePacked(_addr);
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }
    
    /// @notice Convert uint to string
    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        
        return string(buffer);
    }
}
