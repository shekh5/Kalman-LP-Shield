#!/bin/bash
# KalmanGuard Smart Contract Deployment Script

set -e

echo "🔧 KalmanGuard Contract Deployment"
echo ""

NETWORK=${1:-localhost}
echo "📡 Deploying to network: $NETWORK"

# Check for foundry
command -v forge >/dev/null 2>&1 || { echo "❌ Foundry is required. Install from https://getfoundry.sh"; exit 1; }

# Load repo-root .env if present
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
    echo "📄 Loading environment from $ROOT_DIR/.env"
    # Use a subshell to export variables without carriage returns
    while IFS= read -r line || [ -n "$line" ]; do
        # Strip carriage return and ignore comments/empty lines
        clean_line=$(echo "$line" | tr -d '\r')
        if [[ ! "$clean_line" =~ ^# && ! -z "$clean_line" ]]; then
            export "$clean_line"
        fi
    done < "$ROOT_DIR/.env"
fi

# Navigate to contracts directory
cd "$ROOT_DIR/contracts"

# Install dependencies if lib is missing
if [ ! -d "lib" ] || [ -z "$(ls -A lib 2>/dev/null)" ]; then
    echo "📦 Installing contract dependencies..."
    mkdir -p lib
    
    # Install core dependencies
    echo "   Installing forge-std..."
    forge install foundry-rs/forge-std --no-git
    echo "   Installing openzeppelin-contracts..."
    forge install OpenZeppelin/openzeppelin-contracts --no-git
    echo "   Installing v4-core..."
    forge install Uniswap/v4-core --no-git
    echo "   Installing v4-periphery..."
    forge install Uniswap/v4-periphery --no-git
fi

# Build contracts
echo "🔨 Building contracts..."
forge build --force

# Run tests
echo "🧪 Running tests..."
forge test

# Deploy based on network
if [ "$NETWORK" = "localhost" ]; then
    echo "🚀 Deploying to local Anvil..."
    forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast
elif [ "$NETWORK" = "sepolia" ]; then
    echo "🚀 Deploying to Sepolia..."
    # Use default if not set in .env
    : "${RPC_URL_SEPOLIA:=https://ethereum-sepolia-rpc.publicnode.com}"
    echo "   RPC: ${RPC_URL_SEPOLIA}"
    echo "   Explorer: https://sepolia.etherscan.io"
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url "$RPC_URL_SEPOLIA" --broadcast --verify
elif [ "$NETWORK" = "mainnet" ]; then
    echo "🚀 Deploying to Mainnet..."
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url "$RPC_URL_MAINNET" --broadcast --verify
elif [ "$NETWORK" = "arbitrum" ]; then
    echo "🚀 Deploying to Arbitrum..."
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url "$RPC_URL_ARBITRUM" --broadcast --verify
elif [ "$NETWORK" = "optimism" ]; then
    echo "🚀 Deploying to Optimism..."
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url "$RPC_URL_OPTIMISM" --broadcast --verify
elif [ "$NETWORK" = "base" ]; then
    echo "🚀 Deploying to Base..."
    forge script script/Deploy.s.sol:DeployKalmanGuard --rpc-url "$RPC_URL_BASE" --broadcast --verify
else
    echo "❌ Unknown network: $NETWORK"
    echo "   Supported networks: localhost, sepolia, mainnet, arbitrum, optimism, base"
    exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo "📝 Update your .env file with the deployed contract addresses"
