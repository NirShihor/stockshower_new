import { Trade, ITrade } from '../db/models/Trade.js';
import { RiskState, IRiskState } from '../db/models/RiskState.js';
import { 
  CircuitBreakerConfig, 
  RiskMetrics, 
  TradeValidationResult,
  CircuitBreakerStatus,
  CircuitBreakerTrigger 
} from '../types/circuitBreaker.js';
import { circuitBreakerConfig } from '../config/circuitBreaker.js';

export class TradingCircuitBreaker {
  private config: CircuitBreakerConfig;
  
  constructor(config?: Partial<CircuitBreakerConfig>) {
    // Use default config from file, override with provided config
    this.config = {
      ...circuitBreakerConfig,
      ...config
    };
  }

  async validateTrade(signal: Partial<ITrade>, accountBalance: number): Promise<TradeValidationResult> {
    try {
      // Get or create today's risk state
      const today = new Date().toISOString().split('T')[0];
      let riskState = await RiskState.findOne({ date: today });
      
      if (!riskState) {
        riskState = await this.initializeRiskState(today, accountBalance);
      }

      // Check if circuit breaker is already active
      if (riskState.circuitBreakerActive) {
        return {
          isValid: false,
          reason: `Circuit breaker active: ${riskState.circuitBreakerReason}`,
          circuitBreakerStatus: {
            isActive: true,
            reason: riskState.circuitBreakerReason || undefined,
            triggeredAt: riskState.circuitBreakerTriggeredAt || undefined,
            willResetAt: riskState.circuitBreakerTriggeredAt ? this.getResetTime(riskState.circuitBreakerTriggeredAt) : undefined
          }
        };
      }

      // Run all circuit breaker checks
      const triggers: CircuitBreakerTrigger[] = [];
      
      // 1. Check daily loss limits
      const dailyLossCheck = await this.checkDailyLoss(riskState, accountBalance);
      if (dailyLossCheck) triggers.push(dailyLossCheck);

      // 2. Check consecutive losses
      const consecutiveLossCheck = await this.checkConsecutiveLosses(riskState);
      if (consecutiveLossCheck) triggers.push(consecutiveLossCheck);

      // 3. Check position limits
      const positionLimitCheck = await this.checkPositionLimits();
      if (positionLimitCheck) triggers.push(positionLimitCheck);

      // 4. Check exposure limits
      const exposureCheck = await this.checkExposureLimits(signal, accountBalance);
      if (exposureCheck) triggers.push(exposureCheck);

      // 5. Check symbol-specific limits
      if (signal.symbol) {
        const symbolCheck = await this.checkSymbolLimits(signal.symbol, riskState);
        if (symbolCheck) triggers.push(symbolCheck);
      }

      // 6. Check minimum balance
      if (accountBalance < this.config.minAccountBalance) {
        triggers.push({
          type: 'low_balance',
          value: accountBalance,
          threshold: this.config.minAccountBalance,
          triggeredAt: new Date(),
          message: `Account balance ($${accountBalance}) below minimum ($${this.config.minAccountBalance})`
        });
      }

      // If any circuit breakers triggered, activate and save
      if (triggers.length > 0) {
        const primaryTrigger = triggers[0];
        riskState.circuitBreakerActive = true;
        riskState.circuitBreakerReason = primaryTrigger.message;
        riskState.circuitBreakerTriggeredAt = new Date();
        riskState.triggers.push(...triggers);
        await riskState.save();

        return {
          isValid: false,
          reason: primaryTrigger.message,
          circuitBreakerStatus: {
            isActive: true,
            reason: primaryTrigger.message,
            triggeredAt: new Date(),
            willResetAt: this.getResetTime(new Date())
          },
          riskMetrics: this.extractRiskMetrics(riskState)
        };
      }

      // All checks passed
      return {
        isValid: true,
        riskMetrics: this.extractRiskMetrics(riskState)
      };

    } catch (error) {
      console.error('Circuit breaker validation error:', error);
      return {
        isValid: false,
        reason: 'Circuit breaker validation failed'
      };
    }
  }

  async updateTradeResult(trade: ITrade): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    let riskState = await RiskState.findOne({ date: today });
    
    if (!riskState) {
      riskState = await this.initializeRiskState(today, trade.actualEntryPrice || 10000);
    }

    // Update daily metrics
    riskState.tradesCount++;
    
    if (trade.pnlAmount) {
      riskState.dailyPnL += trade.pnlAmount;
      riskState.dailyPnLPercent = (riskState.dailyPnL / riskState.accountBalance) * 100;
      
      if (trade.pnlAmount > 0) {
        riskState.winCount++;
        riskState.consecutiveLosses = 0;
      } else {
        riskState.lossCount++;
        riskState.consecutiveLosses++;
      }
    }

    // Update symbol metrics
    if (!riskState.symbolMetrics) {
      riskState.symbolMetrics = {};
    }
    
    const symbolMetrics = riskState.symbolMetrics[trade.symbol] || {
      trades: 0,
      wins: 0,
      losses: 0,
      pnl: 0,
      consecutiveLosses: 0,
      isBlacklisted: false
    };

    symbolMetrics.trades++;
    if (trade.pnlAmount) {
      symbolMetrics.pnl += trade.pnlAmount;
      if (trade.pnlAmount > 0) {
        symbolMetrics.wins++;
        symbolMetrics.consecutiveLosses = 0;
      } else {
        symbolMetrics.losses++;
        symbolMetrics.consecutiveLosses++;
        
        // Blacklist symbol after 3 consecutive losses
        if (symbolMetrics.consecutiveLosses >= 3) {
          symbolMetrics.isBlacklisted = true;
        }
      }
    }

    riskState.symbolMetrics[trade.symbol] = symbolMetrics;
    riskState.lastUpdateTime = new Date();
    
    await riskState.save();
  }

  async getCircuitBreakerStatus(): Promise<CircuitBreakerStatus> {
    const today = new Date().toISOString().split('T')[0];
    const riskState = await RiskState.findOne({ date: today });
    
    if (!riskState || !riskState.circuitBreakerActive) {
      return { isActive: false };
    }

    return {
      isActive: true,
      reason: riskState.circuitBreakerReason || undefined,
      triggeredAt: riskState.circuitBreakerTriggeredAt || undefined,
      willResetAt: riskState.circuitBreakerTriggeredAt ? this.getResetTime(riskState.circuitBreakerTriggeredAt) : undefined
    };
  }

  async getRiskMetrics(): Promise<RiskMetrics> {
    const today = new Date().toISOString().split('T')[0];
    const riskState = await RiskState.findOne({ date: today });
    
    if (!riskState) {
      return this.getDefaultRiskMetrics();
    }

    return this.extractRiskMetrics(riskState);
  }

  async emergencyStop(reason: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    let riskState = await RiskState.findOne({ date: today });
    
    if (!riskState) {
      riskState = await this.initializeRiskState(today, 0);
    }

    riskState.circuitBreakerActive = true;
    riskState.circuitBreakerReason = `EMERGENCY STOP: ${reason}`;
    riskState.circuitBreakerTriggeredAt = new Date();
    riskState.triggers.push({
      type: 'emergency_stop',
      value: 0,
      threshold: 0,
      triggeredAt: new Date(),
      message: `Emergency stop activated: ${reason}`
    });
    
    await riskState.save();
  }

  async resetCircuitBreaker(force: boolean = false): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const riskState = await RiskState.findOne({ date: today });
    
    if (!riskState || !riskState.circuitBreakerActive) {
      return false;
    }

    // Only allow force reset or if enough time has passed
    if (riskState.circuitBreakerTriggeredAt) {
      const resetTime = this.getResetTime(riskState.circuitBreakerTriggeredAt);
      if (!force && new Date() < resetTime) {
        return false;
      }
    }

    riskState.circuitBreakerActive = false;
    riskState.circuitBreakerReason = undefined;
    riskState.circuitBreakerTriggeredAt = undefined;
    await riskState.save();
    
    return true;
  }

  // Private helper methods
  private async initializeRiskState(date: string, accountBalance: number) {
    const riskState = new RiskState({
      date,
      accountBalance,
      dailyPnL: 0,
      dailyPnLPercent: 0,
      tradesCount: 0,
      winCount: 0,
      lossCount: 0,
      consecutiveLosses: 0,
      maxDrawdown: 0,
      totalExposure: 0,
      circuitBreakerActive: false,
      symbolMetrics: {},
      triggers: []
    });
    
    return await riskState.save();
  }

  private async checkDailyLoss(riskState: any, accountBalance: number): Promise<CircuitBreakerTrigger | null> {
    const lossPercent = Math.abs(riskState.dailyPnLPercent);
    const lossAmount = Math.abs(riskState.dailyPnL);

    if (riskState.dailyPnL < 0 && lossPercent >= this.config.maxDailyLossPercent) {
      return {
        type: 'daily_loss',
        value: lossPercent,
        threshold: this.config.maxDailyLossPercent,
        triggeredAt: new Date(),
        message: `Daily loss (${lossPercent.toFixed(2)}%) exceeds limit (${this.config.maxDailyLossPercent}%)`
      };
    }

    if (riskState.dailyPnL < 0 && lossAmount >= this.config.maxDailyLossAmount) {
      return {
        type: 'daily_loss',
        value: lossAmount,
        threshold: this.config.maxDailyLossAmount,
        triggeredAt: new Date(),
        message: `Daily loss ($${lossAmount.toFixed(2)}) exceeds limit ($${this.config.maxDailyLossAmount})`
      };
    }

    return null;
  }

  private async checkConsecutiveLosses(riskState: any): Promise<CircuitBreakerTrigger | null> {
    if (riskState.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      return {
        type: 'consecutive_loss',
        value: riskState.consecutiveLosses,
        threshold: this.config.maxConsecutiveLosses,
        triggeredAt: new Date(),
        message: `Consecutive losses (${riskState.consecutiveLosses}) exceed limit (${this.config.maxConsecutiveLosses})`
      };
    }
    return null;
  }

  private async checkPositionLimits(): Promise<CircuitBreakerTrigger | null> {
    const openPositions = await Trade.countDocuments({
      status: { $in: ['placed', 'filled'] }
    });

    if (openPositions >= this.config.maxPositionsOpen) {
      return {
        type: 'position_limit',
        value: openPositions,
        threshold: this.config.maxPositionsOpen,
        triggeredAt: new Date(),
        message: `Open positions (${openPositions}) at limit (${this.config.maxPositionsOpen})`
      };
    }
    return null;
  }

  private async checkExposureLimits(signal: Partial<ITrade>, accountBalance: number): Promise<CircuitBreakerTrigger | null> {
    // Calculate total exposure from open positions
    const openTrades = await Trade.find({
      status: { $in: ['placed', 'filled'] }
    });

    let totalExposure = 0;
    for (const trade of openTrades) {
      const positionSize = (trade.volume || 0) * (trade.actualEntryPrice || trade.entryPrice);
      totalExposure += positionSize;
    }

    // Add the proposed trade
    if (signal.volume && signal.entryPrice) {
      totalExposure += signal.volume * signal.entryPrice;
    }

    const exposurePercent = (totalExposure / accountBalance) * 100;

    if (exposurePercent > this.config.maxExposurePercent) {
      return {
        type: 'exposure_limit',
        value: exposurePercent,
        threshold: this.config.maxExposurePercent,
        triggeredAt: new Date(),
        message: `Total exposure (${exposurePercent.toFixed(2)}%) exceeds limit (${this.config.maxExposurePercent}%)`
      };
    }
    return null;
  }

  private async checkSymbolLimits(symbol: string, riskState: any): Promise<CircuitBreakerTrigger | null> {
    const symbolMetrics = riskState.symbolMetrics?.[symbol];
    
    if (symbolMetrics?.isBlacklisted) {
      return {
        type: 'consecutive_loss',
        value: symbolMetrics.consecutiveLosses,
        threshold: 3,
        triggeredAt: new Date(),
        message: `Symbol ${symbol} is blacklisted after ${symbolMetrics.consecutiveLosses} consecutive losses`
      };
    }
    return null;
  }

  private extractRiskMetrics(riskState: any): RiskMetrics {
    return {
      dailyPnL: riskState.dailyPnL,
      dailyPnLPercent: riskState.dailyPnLPercent,
      weeklyPnL: 0, // TODO: Implement weekly tracking
      monthlyPnL: 0, // TODO: Implement monthly tracking
      consecutiveLosses: riskState.consecutiveLosses,
      openPositions: 0, // TODO: Get from Trade collection
      totalExposure: riskState.totalExposure,
      accountBalance: riskState.accountBalance,
      drawdownPercent: riskState.maxDrawdown,
      lastUpdateTime: riskState.lastUpdateTime
    };
  }

  private getDefaultRiskMetrics(): RiskMetrics {
    return {
      dailyPnL: 0,
      dailyPnLPercent: 0,
      weeklyPnL: 0,
      monthlyPnL: 0,
      consecutiveLosses: 0,
      openPositions: 0,
      totalExposure: 0,
      accountBalance: 0,
      drawdownPercent: 0,
      lastUpdateTime: new Date()
    };
  }

  private getResetTime(triggeredAt: Date): Date {
    // Reset at next trading day open (9:30 AM ET)
    const reset = new Date(triggeredAt);
    reset.setDate(reset.getDate() + 1);
    reset.setHours(9, 30, 0, 0);
    return reset;
  }
}