// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PrivateOrderPool
/// @notice Implements commit-reveal scheme for privacy-preserving swaps
/// @dev Prevents MEV by hiding swap details until execution
contract PrivateOrderPool is ReentrancyGuard {
    
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/
    
    error CommitmentExists();
    error CommitmentNotFound();
    error CommitmentExpired();
    error CommitmentNotReady();
    error InvalidReveal();
    error InsufficientBalance();
    error TransferFailed();
    error Unauthorized();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event OrderCommitted(
        bytes32 indexed commitment,
        address indexed sender,
        uint256 revealDeadline,
        uint256 executionWindow
    );
    
    event OrderRevealed(
        bytes32 indexed commitment,
        address indexed sender,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    );
    
    event OrderExecuted(
        bytes32 indexed commitment,
        address indexed sender,
        uint256 amountIn,
        uint256 amountOut
    );
    
    event OrderCancelled(bytes32 indexed commitment);

    /*//////////////////////////////////////////////////////////////
                                 STRUCTS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Committed order data
    struct CommittedOrder {
        address sender;
        uint256 commitTime;
        uint256 revealDeadline;
        uint256 executionDeadline;
        bool revealed;
        bool executed;
    }
    
    /// @notice Revealed order parameters
    struct RevealedOrder {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        bytes executionData;
    }
    
    /// @notice Configuration for commit-reveal timing
    struct TimingConfig {
        uint256 minCommitPeriod;      // Min time before reveal
        uint256 revealWindow;          // Time window for reveal
        uint256 executionWindow;       // Time window for execution
    }

    /*//////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Committed orders
    mapping(bytes32 => CommittedOrder) public commitments;
    
    /// @notice Revealed order details (only populated after reveal)
    mapping(bytes32 => RevealedOrder) public revealedOrders;
    
    /// @notice User's active commitments
    mapping(address => bytes32[]) public userCommitments;
    
    /// @notice Timing configuration
    TimingConfig public timingConfig;
    
    /// @notice Pool/DEX address for execution
    address public executor;
    
    /// @notice Owner address
    address public owner;
    
    /// @notice Nonce for commitment uniqueness
    mapping(address => uint256) public nonces;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    
    constructor(address _executor) {
        owner = msg.sender;
        executor = _executor;
        
        timingConfig = TimingConfig({
            minCommitPeriod: 2,       // 2 blocks (~24 seconds)
            revealWindow: 10,         // 10 blocks (~2 minutes)
            executionWindow: 25       // 25 blocks (~5 minutes)
        });
    }

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                           COMMIT FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Commit to an order without revealing details
    /// @param commitment Hash of (params, salt, sender)
    function commitOrder(bytes32 commitment) external {
        if (commitments[commitment].sender != address(0)) revert CommitmentExists();
        
        uint256 revealDeadline = block.number + timingConfig.minCommitPeriod + timingConfig.revealWindow;
        uint256 executionDeadline = revealDeadline + timingConfig.executionWindow;
        
        commitments[commitment] = CommittedOrder({
            sender: msg.sender,
            commitTime: block.number,
            revealDeadline: revealDeadline,
            executionDeadline: executionDeadline,
            revealed: false,
            executed: false
        });
        
        userCommitments[msg.sender].push(commitment);
        
        emit OrderCommitted(
            commitment,
            msg.sender,
            revealDeadline,
            timingConfig.executionWindow
        );
    }
    
    /// @notice Commit with encrypted data (for future decryption)
    /// @param commitment The commitment hash
    /// @param encryptedData Encrypted order data (for off-chain storage)
    function commitOrderEncrypted(
        bytes32 commitment,
        bytes calldata encryptedData
    ) external {
        // Same as commitOrder but allows storing encrypted data
        if (commitments[commitment].sender != address(0)) revert CommitmentExists();
        
        uint256 revealDeadline = block.number + timingConfig.minCommitPeriod + timingConfig.revealWindow;
        uint256 executionDeadline = revealDeadline + timingConfig.executionWindow;
        
        commitments[commitment] = CommittedOrder({
            sender: msg.sender,
            commitTime: block.number,
            revealDeadline: revealDeadline,
            executionDeadline: executionDeadline,
            revealed: false,
            executed: false
        });
        
        userCommitments[msg.sender].push(commitment);
        
        // Note: encryptedData is just emitted, not stored (gas optimization)
        emit OrderCommitted(
            commitment,
            msg.sender,
            revealDeadline,
            timingConfig.executionWindow
        );
    }

    /*//////////////////////////////////////////////////////////////
                           REVEAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Reveal order parameters
    /// @param tokenIn Input token address
    /// @param tokenOut Output token address
    /// @param amountIn Amount of input token
    /// @param minAmountOut Minimum output amount (slippage protection)
    /// @param recipient Recipient of output tokens
    /// @param salt Random salt used in commitment
    /// @param executionData Additional data for execution
    function revealOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes32 salt,
        bytes calldata executionData
    ) external nonReentrant {
        // Compute commitment
        bytes32 commitment = computeCommitment(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            recipient,
            salt,
            msg.sender,
            executionData
        );
        
        CommittedOrder storage order = commitments[commitment];
        
        // Verify commitment exists and is from sender
        if (order.sender != msg.sender) revert CommitmentNotFound();
        
        // Check timing
        if (block.number < order.commitTime + timingConfig.minCommitPeriod) {
            revert CommitmentNotReady();
        }
        if (block.number > order.revealDeadline) revert CommitmentExpired();
        if (order.revealed) revert InvalidReveal();
        
        // Store revealed order
        order.revealed = true;
        revealedOrders[commitment] = RevealedOrder({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            recipient: recipient,
            executionData: executionData
        });
        
        emit OrderRevealed(commitment, msg.sender, tokenIn, tokenOut, amountIn);
    }

    /*//////////////////////////////////////////////////////////////
                         EXECUTION FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Execute a revealed order
    /// @param commitment The order commitment
    function executeOrder(bytes32 commitment) external nonReentrant {
        CommittedOrder storage order = commitments[commitment];
        RevealedOrder storage revealed = revealedOrders[commitment];
        
        // Verify order state
        if (order.sender == address(0)) revert CommitmentNotFound();
        if (!order.revealed) revert CommitmentNotReady();
        if (order.executed) revert InvalidReveal();
        if (block.number > order.executionDeadline) revert CommitmentExpired();
        
        // Mark as executed
        order.executed = true;
        
        // Transfer tokens from sender
        IERC20 tokenIn = IERC20(revealed.tokenIn);
        if (tokenIn.balanceOf(order.sender) < revealed.amountIn) {
            revert InsufficientBalance();
        }
        
        // Transfer to this contract (or directly to executor)
        bool success = tokenIn.transferFrom(
            order.sender,
            address(this),
            revealed.amountIn
        );
        if (!success) revert TransferFailed();
        
        // Approve executor
        tokenIn.approve(executor, revealed.amountIn);
        
        // Execute swap through executor (DEX/Pool)
        // This is a simplified version - in production, use proper DEX interface
        uint256 amountOut = _executeSwap(
            revealed.tokenIn,
            revealed.tokenOut,
            revealed.amountIn,
            revealed.minAmountOut,
            revealed.executionData
        );
        
        // Transfer output to recipient
        IERC20(revealed.tokenOut).transfer(revealed.recipient, amountOut);
        
        emit OrderExecuted(commitment, order.sender, revealed.amountIn, amountOut);
    }
    
    /// @notice Cancel an expired or unexecuted order
    /// @param commitment The order commitment
    function cancelOrder(bytes32 commitment) external {
        CommittedOrder storage order = commitments[commitment];
        
        if (order.sender != msg.sender) revert Unauthorized();
        if (order.executed) revert InvalidReveal();
        
        // Can only cancel if past execution deadline or never revealed
        require(
            block.number > order.executionDeadline || !order.revealed,
            "Cannot cancel active order"
        );
        
        // Mark as executed to prevent further actions
        order.executed = true;
        
        emit OrderCancelled(commitment);
    }

    /*//////////////////////////////////////////////////////////////
                           VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Compute commitment hash
    function computeCommitment(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes32 salt,
        address sender,
        bytes calldata executionData
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            recipient,
            salt,
            sender,
            keccak256(executionData)
        ));
    }
    
    /// @notice Get user's active commitments
    /// @param user User address
    /// @return Active commitment hashes
    function getUserCommitments(address user) external view returns (bytes32[] memory) {
        return userCommitments[user];
    }
    
    /// @notice Check if a commitment can be revealed
    /// @param commitment The commitment hash
    /// @return canReveal Whether reveal is possible
    /// @return reason Reason if cannot reveal
    function canReveal(bytes32 commitment) external view returns (bool canReveal, string memory reason) {
        CommittedOrder storage order = commitments[commitment];
        
        if (order.sender == address(0)) return (false, "Commitment not found");
        if (order.revealed) return (false, "Already revealed");
        if (block.number < order.commitTime + timingConfig.minCommitPeriod) {
            return (false, "Reveal period not started");
        }
        if (block.number > order.revealDeadline) return (false, "Reveal period expired");
        
        return (true, "");
    }
    
    /// @notice Check if a commitment can be executed
    /// @param commitment The commitment hash
    /// @return canExecute Whether execution is possible
    /// @return reason Reason if cannot execute
    function canExecute(bytes32 commitment) external view returns (bool canExecute, string memory reason) {
        CommittedOrder storage order = commitments[commitment];
        
        if (order.sender == address(0)) return (false, "Commitment not found");
        if (!order.revealed) return (false, "Not revealed");
        if (order.executed) return (false, "Already executed");
        if (block.number > order.executionDeadline) return (false, "Execution period expired");
        
        return (true, "");
    }

    /*//////////////////////////////////////////////////////////////
                           ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Update timing configuration
    /// @param config New timing config
    function setTimingConfig(TimingConfig calldata config) external onlyOwner {
        timingConfig = config;
    }
    
    /// @notice Update executor address
    /// @param _executor New executor address
    function setExecutor(address _executor) external onlyOwner {
        executor = _executor;
    }
    
    /// @notice Transfer ownership
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    /// @notice Emergency withdraw stuck tokens
    /// @param token Token address
    /// @param to Recipient
    /// @param amount Amount to withdraw
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    /*//////////////////////////////////////////////////////////////
                         INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    
    /// @notice Execute swap through DEX
    /// @dev Override this for specific DEX integration
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory executionData
    ) internal virtual returns (uint256 amountOut) {
        // Simplified mock execution
        // In production, this would call the actual DEX
        
        // Decode execution data if needed
        if (executionData.length > 0) {
            // Handle specific execution instructions
        }
        
        // Mock: return minAmountOut (in production, actual swap)
        amountOut = minAmountOut;
        
        return amountOut;
    }
}

/// @title PrivateOrderPoolUniswapV4
/// @notice Extended version with Uniswap v4 integration
contract PrivateOrderPoolUniswapV4 is PrivateOrderPool {
    
    address public poolManager;
    
    constructor(address _executor, address _poolManager) PrivateOrderPool(_executor) {
        poolManager = _poolManager;
    }
    
    /// @notice Execute swap through Uniswap v4
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes memory executionData
    ) internal override returns (uint256 amountOut) {
        // Decode pool key and other params from executionData
        // Execute swap through Uniswap v4 PoolManager
        // This is a placeholder - actual implementation would use IPoolManager
        
        amountOut = minAmountOut;
        return amountOut;
    }
}
