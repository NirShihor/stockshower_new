// @ts-nocheck
import { DatabaseBacktestEngine, DatabaseBacktestConfig } from './databaseBacktestEngine.js';
import { Trade } from '../../db/models/Trade.js';

export interface StopLossTestConfig extends DatabaseBacktestConfig {
  minStopPercentage?: number;  // Minimum stop distance as percentage (e.g., 0.01 for 1%)
}

export class StopLossTestEngine extends DatabaseBacktestEngine {
  private minStopPct: number;

  constructor(config: StopLossTestConfig) {
    super(config);
    this.minStopPct = config.minStopPercentage || 0.01; // Default 1% minimum stop
  }

  protected async processHistoricalSignal(trade: any): Promise<void> {
    const signal = trade.signalData;
    
    if (!signal) {
      return;
    }

    // Check if signal meets threshold
    if (signal.score < (this.config as any).scoreThreshold!) {
      console.log(`Signal ${signal.pattern.name} score ${signal.score} below threshold ${(this.config as any).scoreThreshold}`);
      return;
    }

    // MODIFICATION: Adjust stop loss to minimum percentage
    const originalStop = signal.plan.stop;
    const entry = signal.plan.entry;
    const direction = signal.plan.direction;
    
    let newStop: number;
    const minDistance = entry * this.minStopPct;
    
    if (direction === 'long') {
      const originalDistance = entry - originalStop;
      if (originalDistance < minDistance) {
        newStop = entry - minDistance;
        console.log(`[STOP ADJUSTED] ${signal.symbol}: Original stop ${originalStop.toFixed(2)} (${(originalDistance/entry*100).toFixed(2)}%) -> New stop ${newStop.toFixed(2)} (${(this.minStopPct*100).toFixed(2)}%)`);
      } else {
        newStop = originalStop;
      }
    } else {
      const originalDistance = originalStop - entry;
      if (originalDistance < minDistance) {
        newStop = entry + minDistance;
        console.log(`[STOP ADJUSTED] ${signal.symbol}: Original stop ${originalStop.toFixed(2)} (${(originalDistance/entry*100).toFixed(2)}%) -> New stop ${newStop.toFixed(2)} (${(this.minStopPct*100).toFixed(2)}%)`);
      } else {
        newStop = originalStop;
      }
    }

    // Create modified signal with new stop
    const modifiedSignal = {
      ...signal,
      plan: {
        ...signal.plan,
        stop: newStop,
        risk: Math.abs(entry - newStop)
      }
    };

    // Update trade with modified signal
    const modifiedTrade = {
      ...trade,
      signalData: modifiedSignal
    };

    // Process with parent method
    return super.processHistoricalSignal(modifiedTrade);
  }
}