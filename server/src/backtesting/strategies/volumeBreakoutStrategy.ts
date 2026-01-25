// @ts-nocheck
import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';
import { Candle } from '../../candlestick/types/index.js';

export interface VolumeBreakoutConfig {
  volumeMultiplier: number;      // How much above average volume (e.g., 2 = 2x average)
  priceBreakoutPercent: number;  // Min price move to confirm breakout (e.g., 0.5%)
  lookbackPeriods: number;       // Periods to calculate average volume
  minATRMove: number;           // Minimum move in ATR terms (e.g., 0.5 ATR)
  requireTrendConfirmation: boolean;
}

export class VolumeBreakoutStrategy {
  private config: VolumeBreakoutConfig;

  constructor(config: VolumeBreakoutConfig = {
    volumeMultiplier: 2.0,
    priceBreakoutPercent: 0.5,
    lookbackPeriods: 20,
    minATRMove: 0.5,
    requireTrendConfirmation: true
  }) {
    this.config = config;
  }

  /**
   * Analyzes if current signal represents a valid volume breakout
   */
  isVolumeBreakout(signal: ComprehensiveSignal, recentCandles: Candle[]): { 
    isBreakout: boolean; 
    direction: 'bullish' | 'bearish' | null;
    strength: number; // 0-100
    reason?: string;
  } {
    const candle = signal.candle;
    const context = signal.context;
    
    // 1. Check volume spike
    if (!context.isHighVolume) {
      return { isBreakout: false, direction: null, strength: 0, reason: 'No volume spike' };
    }

    // Calculate actual volume multiplier
    const volumeRatio = candle.volume / context.avgVolume;
    if (volumeRatio < this.config.volumeMultiplier) {
      return { 
        isBreakout: false, 
        direction: null, 
        strength: 0, 
        reason: `Volume ratio ${volumeRatio.toFixed(1)}x below required ${this.config.volumeMultiplier}x` 
      };
    }

    // 2. Check price movement
    const priceMove = Math.abs(candle.close - candle.open) / candle.open * 100;
    if (priceMove < this.config.priceBreakoutPercent) {
      return { 
        isBreakout: false, 
        direction: null, 
        strength: 0, 
        reason: `Price move ${priceMove.toFixed(2)}% below required ${this.config.priceBreakoutPercent}%` 
      };
    }

    // 3. Check ATR-based movement
    const candleRange = candle.high - candle.low;
    const atrMove = candleRange / context.atr;
    if (atrMove < this.config.minATRMove) {
      return { 
        isBreakout: false, 
        direction: null, 
        strength: 0, 
        reason: `Range ${atrMove.toFixed(2)} ATR below required ${this.config.minATRMove} ATR` 
      };
    }

    // 4. Determine direction
    const isBullish = candle.close > candle.open;
    const direction = isBullish ? 'bullish' : 'bearish';

    // 5. Check trend confirmation if required
    if (this.config.requireTrendConfirmation) {
      if (isBullish && context.trend !== 'up') {
        return { 
          isBreakout: false, 
          direction: null, 
          strength: 0, 
          reason: 'Bullish breakout requires uptrend' 
        };
      }
      if (!isBullish && context.trend !== 'down') {
        return { 
          isBreakout: false, 
          direction: null, 
          strength: 0, 
          reason: 'Bearish breakout requires downtrend' 
        };
      }
    }

    // 6. Check if breaking key levels
    let levelBreakBonus = 0;
    if (isBullish && context.nearestResistance) {
      if (candle.close > context.nearestResistance && candle.open < context.nearestResistance) {
        levelBreakBonus = 20; // Breaking resistance
      }
    } else if (!isBullish && context.nearestSupport) {
      if (candle.close < context.nearestSupport && candle.open > context.nearestSupport) {
        levelBreakBonus = 20; // Breaking support
      }
    }

    // 7. Calculate breakout strength (0-100)
    const volumeScore = Math.min((volumeRatio / 4) * 40, 40); // Up to 40 points for 4x volume
    const priceScore = Math.min((priceMove / 2) * 30, 30);    // Up to 30 points for 2% move
    const atrScore = Math.min((atrMove / 2) * 30, 30);        // Up to 30 points for 2 ATR move
    
    const strength = Math.round(volumeScore + priceScore + atrScore + levelBreakBonus);

    return {
      isBreakout: true,
      direction,
      strength: Math.min(strength, 100),
      reason: `Volume ${volumeRatio.toFixed(1)}x, Price ${priceMove.toFixed(1)}%, ${atrMove.toFixed(1)} ATR`
    };
  }

  /**
   * Creates a breakout signal with proper stop/target placement
   */
  createBreakoutSignal(
    originalSignal: ComprehensiveSignal,
    breakoutInfo: { direction: 'bullish' | 'bearish'; strength: number }
  ): ComprehensiveSignal {
    const signal = { ...originalSignal };
    const candle = signal.candle;
    const atr = signal.context.atr;
    
    // Override pattern info with breakout info
    signal.pattern = {
      name: `Volume Breakout ${breakoutInfo.direction}`,
      direction: breakoutInfo.direction,
      reliability: breakoutInfo.strength / 100,
      candleCount: 1
    };
    
    // Set score based on breakout strength
    signal.score = breakoutInfo.strength;
    
    // Calculate entry, stop, and targets
    if (breakoutInfo.direction === 'bullish') {
      // Enter near the close of breakout candle
      const entry = candle.close;
      
      // Stop below the low or 1 ATR below entry (whichever is tighter)
      const stopFromLow = candle.low - (atr * 0.1); // Small buffer below low
      const stopFromATR = entry - atr;
      const stop = Math.max(stopFromLow, stopFromATR);
      
      // Ensure minimum stop distance of 1%
      const minStop = entry * 0.99;
      const finalStop = Math.min(stop, minStop);
      
      // Targets at 2:1 and 3:1 risk/reward
      const risk = entry - finalStop;
      const target1 = entry + (risk * 2);
      const target2 = entry + (risk * 3);
      
      signal.plan = {
        direction: 'long',
        entry,
        stop: finalStop,
        risk,
        targets: [target1, target2],
        positionQty: 1, // Will be calculated by position sizing
        riskRewardRatio: '1:2'
      };
    } else {
      // Bearish breakout
      const entry = candle.close;
      
      // Stop above the high or 1 ATR above entry
      const stopFromHigh = candle.high + (atr * 0.1);
      const stopFromATR = entry + atr;
      const stop = Math.min(stopFromHigh, stopFromATR);
      
      // Ensure minimum stop distance of 1%
      const minStop = entry * 1.01;
      const finalStop = Math.max(stop, minStop);
      
      // Targets at 2:1 and 3:1 risk/reward
      const risk = finalStop - entry;
      const target1 = entry - (risk * 2);
      const target2 = entry - (risk * 3);
      
      signal.plan = {
        direction: 'short',
        entry,
        stop: finalStop,
        risk,
        targets: [target1, target2],
        positionQty: 1,
        riskRewardRatio: '1:2'
      };
    }
    
    return signal;
  }

  /**
   * Additional filters to avoid false breakouts
   */
  validateBreakoutQuality(signal: ComprehensiveSignal, recentCandles: Candle[]): {
    isValid: boolean;
    reason?: string;
  } {
    const candle = signal.candle;
    
    // 1. Avoid breakouts with long wicks (indicates rejection)
    const bodySize = Math.abs(candle.close - candle.open);
    const candleRange = candle.high - candle.low;
    const bodyRatio = bodySize / candleRange;
    
    if (bodyRatio < 0.5) {
      return { isValid: false, reason: 'Weak body ratio - possible rejection' };
    }
    
    // 2. Check recent volatility (avoid breakouts in choppy markets)
    if (recentCandles.length >= 5) {
      const recent5 = recentCandles.slice(-5);
      const changes = recent5.map(c => Math.abs(c.close - c.open) / c.open);
      const avgChange = changes.reduce((a, b) => a + b) / changes.length;
      
      if (avgChange < 0.002) { // Less than 0.2% average moves
        return { isValid: false, reason: 'Market too quiet - false breakout likely' };
      }
    }
    
    // 3. Time of day filter - removed for now to get more signals
    // Can add back later if needed
    
    return { isValid: true };
  }
}