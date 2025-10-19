import { CircuitBreakerConfig } from '../types/circuitBreaker.js';

// Circuit breaker configuration
// These values can be overridden via environment variables
export const circuitBreakerConfig: CircuitBreakerConfig = {
  // Daily loss limits
  maxDailyLossPercent: Number(process.env.CB_MAX_DAILY_LOSS_PERCENT) || 3,          // Stop if down 3% for the day
  maxDailyLossAmount: Number(process.env.CB_MAX_DAILY_LOSS_AMOUNT) || 1000,        // Stop if down $1000 for the day
  
  // Consecutive loss protection
  maxConsecutiveLosses: Number(process.env.CB_MAX_CONSECUTIVE_LOSSES) || 5,        // Stop after 5 losses in a row
  
  // Position limits
  maxPositionsOpen: Number(process.env.CB_MAX_POSITIONS_OPEN) || 10,              // Max 10 concurrent positions
  maxExposurePercent: Number(process.env.CB_MAX_EXPOSURE_PERCENT) || 20,          // Max 20% of account at risk
  maxSymbolExposurePercent: Number(process.env.CB_MAX_SYMBOL_EXPOSURE) || 5,      // Max 5% per symbol
  
  // Account protection
  minAccountBalance: Number(process.env.CB_MIN_ACCOUNT_BALANCE) || 1000,          // Min balance to trade
  
  // Market conditions
  volatilityMultiplier: Number(process.env.CB_VOLATILITY_MULTIPLIER) || 2,        // Reduce size in high volatility
  
  // Emergency controls
  emergencyStopEnabled: process.env.CB_EMERGENCY_STOP_ENABLED !== 'false'         // Global kill switch
};

// Helper to get circuit breaker status message
export function getCircuitBreakerStatusMessage(config: CircuitBreakerConfig): string {
  return `Circuit Breaker Configuration:
  • Daily Loss Limit: ${config.maxDailyLossPercent}% or $${config.maxDailyLossAmount}
  • Max Consecutive Losses: ${config.maxConsecutiveLosses}
  • Max Open Positions: ${config.maxPositionsOpen}
  • Max Total Exposure: ${config.maxExposurePercent}%
  • Max Per-Symbol Exposure: ${config.maxSymbolExposurePercent}%
  • Min Account Balance: $${config.minAccountBalance}
  • Emergency Stop: ${config.emergencyStopEnabled ? 'ENABLED' : 'DISABLED'}`;
}