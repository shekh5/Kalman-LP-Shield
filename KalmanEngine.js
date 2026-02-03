class PriceKalmanFilter{
    constructor(R = 0.01, Q= 0.1){
        this.R = R; // Measurement noise: how much "static" the DEX has
        this.Q = Q; // Process noise: how much the "true price" actually varies
        this.x = null; // Filttered price(state)
        this.P = 1; // Estimation error covariance
    }

    filter(measurement){
        if(this.x === null){
            this.x = measurement; // Initialize with the first measurement
            return this.x;
        }

        //1. Prediction phase
        this.P = this.P + this.Q;

        //2. Update phase
        const K = this.P / (this.P + this.R); // Kalman Gain
        this.x = this.x + K * (measurement - this.x); // Update estimate with measurement
        this.P = (1 - K) * this.P; // Update error covariance

        return {
            filteredPrice: this.x,
            kalmanGain: K,
            innovation: Math.abs(measurement - this.x)// Difference between measurement and estimate(noise)
        }
    }
}

module.exports = PriceKalmanFilter;