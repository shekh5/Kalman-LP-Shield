require("dotenv").config();
const {ethers} = require("ethers");
const PriceKalmanFilter = require("./KalmanEngine");

const provider = new ethers.providers.WebSocketProvider(process.env.ALCHEMY_WS_URL);
const Kf = new PriceKalmanFilter(0.02,0.1);


const poolAddress = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";
const poolAbi = ["event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"];

async function startTracking(){
    const contract = new ethers.Contract(poolAddress, poolAbi, provider);
    contract.on("swap",(sender, recipient, amount0, amount1, sqrtPriceX96)=>{
        //convert sqrtPriceX96 to human readable price
        const price = (sqrtPriceX96 / (2**96)) ** 2 *1e12; //adhust for decimals
        const result = Kf.filter(price);

        console.log(`--- New Trade Detected ---`);
        console.log(`Raw Price: $${price.toFixed(2)}`);
        console.log(`Kalman Price: $${result.filteredPrice.toFixed(2)}`);
        console.log(`Innovation (Noise): ${result.innovation.toFixed(4)}`);

        // Trigger Phase 3 (Update Hook) if Innovation > Threshold
        if (result.innovation > 5.0) {
            console.log("⚠️ TOXIC FLOW DETECTED - Alerting Hook...");
            // triggerHookUpdate(result.innovation);
        }
});
}

startTracking();