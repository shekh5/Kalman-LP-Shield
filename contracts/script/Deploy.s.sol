// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KalmanGuardHook} from "../src/KalmanGuardHook.sol";
import {PrivateOrderPool} from "../src/PrivateOrderPool.sol";
import {RiskOracleRegistry} from "../src/RiskOracleRegistry.sol";
import {AgentController} from "../src/AgentController.sol";
import {ENSIntegration} from "../src/ENSIntegration.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

/// @title DeployKalmanGuard
/// @notice Deployment script for all KalmanGuard contracts
contract DeployKalmanGuard is Script {
    /// @dev Safety guard: by default this script only runs on Sepolia.
    ///      Override by setting EXPECTED_CHAIN_ID in the environment.
    uint256 internal constant DEFAULT_EXPECTED_CHAIN_ID = 11155111; // Sepolia
    
    // Deployment addresses (update for each network)
    struct NetworkConfig {
        address poolManager;
        address ensRegistry;
        bytes32 rootNode;
    }
    
    // Deployed contract addresses
    KalmanGuardHook public hook;
    PrivateOrderPool public privatePool;
    RiskOracleRegistry public oracleRegistry;
    AgentController public agentController;
    ENSIntegration public ensIntegration;
    
    function run() external {
        uint256 expectedChainId = vm.envOr("EXPECTED_CHAIN_ID", DEFAULT_EXPECTED_CHAIN_ID);
        require(block.chainid == expectedChainId, "DeployKalmanGuard: wrong chain (check --rpc-url / EXPECTED_CHAIN_ID)");

        // Get network configuration
        NetworkConfig memory config = getNetworkConfig();
        
        // Start broadcast
        uint256 deployerPrivateKey = uint256(vm.envBytes32("PRIVATE_KEY"));
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy contracts
        console.log("Deploying KalmanGuard contracts...");
        
        // 1. Deploy KalmanGuardHook
        hook = new KalmanGuardHook(IPoolManager(config.poolManager));
        console.log("KalmanGuardHook deployed at:", address(hook));
        
        // 2. Deploy PrivateOrderPool
        privatePool = new PrivateOrderPool(config.poolManager);
        console.log("PrivateOrderPool deployed at:", address(privatePool));
        
        // 3. Deploy RiskOracleRegistry
        oracleRegistry = new RiskOracleRegistry(config.ensRegistry);
        console.log("RiskOracleRegistry deployed at:", address(oracleRegistry));
        
        // 4. Deploy AgentController
        agentController = new AgentController(address(hook));
        console.log("AgentController deployed at:", address(agentController));
        
        // 5. Deploy ENSIntegration
        ensIntegration = new ENSIntegration(config.ensRegistry, config.rootNode);
        console.log("ENSIntegration deployed at:", address(ensIntegration));
        
        // Configure contracts
        console.log("Configuring contracts...");
        
        // Authorize AgentController on hook
        hook.setAgentAuthorization(address(agentController), true);
        console.log("AgentController authorized on hook");
        
        vm.stopBroadcast();
        
        // Log deployment summary
        console.log("\n=== Deployment Summary ===");
        console.log("Network:", block.chainid);
        console.log("Hook:", address(hook));
        console.log("PrivatePool:", address(privatePool));
        console.log("OracleRegistry:", address(oracleRegistry));
        console.log("AgentController:", address(agentController));
        console.log("ENSIntegration:", address(ensIntegration));
    }
    
    function getNetworkConfig() internal view returns (NetworkConfig memory) {
        if (block.chainid == 1) {
            // Ethereum Mainnet
            return NetworkConfig({
                poolManager: 0x000000000000000000000000000000000000dEaD, // Replace with actual
                ensRegistry: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e,
                rootNode: keccak256(abi.encodePacked(bytes32(0), keccak256("eth")))
            });
        } else if (block.chainid == 8453) {
            // Base
            return NetworkConfig({
                poolManager: 0x000000000000000000000000000000000000dEaD, // Replace with actual
                ensRegistry: address(0), // No ENS on Base
                rootNode: bytes32(0)
            });
        } else if (block.chainid == 42161) {
            // Arbitrum
            return NetworkConfig({
                poolManager: 0x000000000000000000000000000000000000dEaD, // Replace with actual
                ensRegistry: address(0),
                rootNode: bytes32(0)
            });
        } else if (block.chainid == 11155111) {
            // Sepolia Testnet
            address poolManager = vm.envOr("POOL_MANAGER", address(0x000000000000000000000000000000000000dEaD));
            address ensRegistry = vm.envOr("ENS_REGISTRY", 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e);
            return NetworkConfig({
                poolManager: poolManager,
                ensRegistry: ensRegistry,
                rootNode: keccak256(abi.encodePacked(bytes32(0), keccak256("eth")))
            });
        } else {
            // Local/Anvil
            return NetworkConfig({
                poolManager: 0x5FbDB2315678afecb367f032d93F642f64180aa3, // Default anvil
                ensRegistry: address(0),
                rootNode: bytes32(0)
            });
        }
    }
}

/// @title DeployAgents
/// @notice Script to register agents after main deployment
contract DeployAgents is Script {
    uint256 internal constant DEFAULT_EXPECTED_CHAIN_ID = 11155111; // Sepolia
    
    function run(address agentControllerAddr) external {
        uint256 expectedChainId = vm.envOr("EXPECTED_CHAIN_ID", DEFAULT_EXPECTED_CHAIN_ID);
        require(block.chainid == expectedChainId, "DeployAgents: wrong chain (check --rpc-url / EXPECTED_CHAIN_ID)");

        uint256 deployerPrivateKey = uint256(vm.envBytes32("PRIVATE_KEY"));
        vm.startBroadcast(deployerPrivateKey);
        
        AgentController controller = AgentController(agentControllerAddr);
        
        // Register agents (replace with actual addresses)
        address priceAgent = vm.envAddress("PRICE_AGENT_ADDRESS");
        address mevAgent = vm.envAddress("MEV_AGENT_ADDRESS");
        address riskAgent = vm.envAddress("RISK_AGENT_ADDRESS");
        address execAgent = vm.envAddress("EXEC_AGENT_ADDRESS");
        address crossChainAgent = vm.envAddress("CROSSCHAIN_AGENT_ADDRESS");
        
        // Register Price Monitor Agent
        controller.registerAgent(
            priceAgent,
            AgentController.AgentRole.PRICE_MONITOR,
            keccak256("agent-1.kalmanguard.eth"),
            "agent-1.kalmanguard.eth"
        );
        console.log("Price Agent registered:", priceAgent);
        
        // Register MEV Detector Agent
        controller.registerAgent(
            mevAgent,
            AgentController.AgentRole.MEV_DETECTOR,
            keccak256("agent-2.kalmanguard.eth"),
            "agent-2.kalmanguard.eth"
        );
        console.log("MEV Agent registered:", mevAgent);
        
        // Register Risk Scorer Agent
        controller.registerAgent(
            riskAgent,
            AgentController.AgentRole.RISK_SCORER,
            keccak256("agent-3.kalmanguard.eth"),
            "agent-3.kalmanguard.eth"
        );
        console.log("Risk Agent registered:", riskAgent);
        
        // Register Execution Agent
        controller.registerAgent(
            execAgent,
            AgentController.AgentRole.EXECUTOR,
            keccak256("agent-4.kalmanguard.eth"),
            "agent-4.kalmanguard.eth"
        );
        console.log("Execution Agent registered:", execAgent);
        
        // Register Cross-Chain Agent
        controller.registerAgent(
            crossChainAgent,
            AgentController.AgentRole.CROSS_CHAIN,
            keccak256("crosschain.kalmanguard.eth"),
            "crosschain.kalmanguard.eth"
        );
        console.log("Cross-Chain Agent registered:", crossChainAgent);
        
        vm.stopBroadcast();
    }
}
