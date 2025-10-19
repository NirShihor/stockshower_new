export interface CircuitBreakerConfig {
  maxDailyLossPercent: number;
  maxDailyLossAmount: number;
  maxConsecutiveLosses: number;
  maxPositionsOpen: number;
  maxExposurePercent: number;
  maxSymbolExposurePercent: number;
  minAccountBalance: number;
  volatilityMultiplier: number;
  emergencyStopEnabled: boolean;
}

export interface RiskMetrics {
  dailyPnL: number;
  dailyPnLPercent: number;
  weeklyPnL: number;
  monthlyPnL: number;
  consecutiveLosses: number;
  openPositions: number;
  totalExposure: number;
  accountBalance: number;
  drawdownPercent: number;
  lastUpdateTime: Date;
}

export interface SymbolRiskMetrics {
  symbol: string;
  consecutiveLosses: number;
  dailyLosses: number;
  totalTrades: number;
  winRate: number;
  lastTradeTime: Date;
  isBlacklisted: boolean;
  blacklistUntil?: Date;
}

export interface CircuitBreakerStatus {
  isActive: boolean;
  reason?: string;
  triggeredAt?: Date;
  willResetAt?: Date;
}

export interface TradeValidationResult {
  isValid: boolean;
  reason?: string;
  riskMetrics?: RiskMetrics;
  circuitBreakerStatus?: CircuitBreakerStatus;
}

export interface CircuitBreakerTrigger {
  type: 'daily_loss' | 'consecutive_loss' | 'drawdown' | 'position_limit' | 'exposure_limit' | 'low_balance' | 'emergency_stop';
  value: number;
  threshold: number;
  triggeredAt: Date;
  message: string;
}