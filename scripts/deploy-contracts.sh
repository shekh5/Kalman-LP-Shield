#!/bin/bash
# KalmanGuard Smart Contract Deployment Script

set -e

echo "🔧 KalmanGuard Contract Deployment"
echo ""

# Default to localhost
NETWORK=${1:-localhost}
echo "📡 Deploying to network: $NETWORK"

# Check for foundry
command -v forge >/dev/null 2>&1 || { echo "❌ Foundry is required. Install from https://getfoundry.sh"; exit 1; }

# Load repo-root .env if present
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
    echo "📄 Loading environment from $ROOT_DIR/.env"
    set -a
    # shellcheck disable=SC1090
    . "$ROOT_DIR/.env"
    set +a
fi

# Navigate to contracts directory
cd "$ROOT_DIR/contracts"

# Build contracts
echo "🔨 Building contracts..."
forge build

# Run tests
echo "🧪 Running tests..."
forge test

# Deploy based on network
if [ "$NETWORK" = "localhost" ]; then
    echo "🚀 Deploying to local Anvil..."
    forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast
elif [ "$NETWORK" = "sepolia" ]; then
    echo "🚀 Deploying to Sepolia..."
    : "${RPC_URL_SEPOLIA:=https://0xrpc.io/sep}"
    echo "   RPC: ${RPC_URL_SEPOLIA}"
    echo "   Explorer: https://sepolia.etherscan.io"
    forge script script/Deploy.s.sol --rpc-url $RPC_URL_SEPOLIA --broadcast --verify
elif [ "$NETWORK" = "mainnet" ]; then
    echo "🚀 Deploying to Mainnet..."
    forge script script/Deploy.s.sol --rpc-url $RPC_URL_MAINNET --broadcast --verify
elif [ "$NETWORK" = "arbitrum" ]; then
    echo "🚀 Deploying to Arbitrum..."
    forge script script/Deploy.s.sol --rpc-url $RPC_URL_ARBITRUM --broadcast --verify
elif [ "$NETWORK" = "optimism" ]; then
    echo "🚀 Deploying to Optimism..."
    forge script script/Deploy.s.sol --rpc-url $RPC_URL_OPTIMISM --broadcast --verify
elif [ "$NETWORK" = "base" ]; then
    echo "🚀 Deploying to Base..."
    forge script script/Deploy.s.sol --rpc-url $RPC_URL_BASE --broadcast --verify
else
    echo "❌ Unknown network: $NETWORK"
    echo "   Supported networks: localhost, sepolia, mainnet, arbitrum, optimism, base"
    exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo "📝 Update your .env file with the deployed contract addresses"
