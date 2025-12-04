import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';
import { Candle } from '../../candlestick/types/index.js';

export interface SupportResistanceConfig {
  lookbackPeriods: number;      // Periods to identify S/R levels
  touchTolerance: number;       // % tolerance for price to be at S/R (e.g., 0.2%)
  minBounces: number;          // Minimum touches to confirm level
  volumeConfirmation: boolean; // Require volume spike on bounce
  minRejectionWick: number;    // Min wick size as % of candle range
}

interface Level {
  price: number;
  touches: number;
  type: 'support' | 'resistance';
  lastTouch: Date;
  strength: number; // 0-100
}

export class SupportResistanceBounceStrategy {
  private config: SupportResistanceConfig;

  constructor(config: SupportResistanceConfig = {
    lookbackPeriods: 50,
    touchTolerance: 0.002, // 0.2%
    minBounces: 3,
    volumeConfirmation: true,
    minRejectionWick: 0.6 // 60% of candle range should be wick
  }) {
    this.config = config;
  }

  /**
   * Identifies key support and resistance levels
   */
  identifyLevels(candles: Candle[]): Level[] {
    if (candles.length < this.config.lookbackPeriods) {
      return [];
    }

    const levels: Level[] = [];
    const recentCandles = candles.slice(-this.config.lookbackPeriods);
    
    // Find local highs and lows
    const pivots: { price: number; type: 'high' | 'low'; timestamp: Date }[] = [];
    
    for (let i = 2; i < recentCandles.length - 2; i++) {
      const curr = recentCandles[i];
      const prev1 = recentCandles[i - 1];
      const prev2 = recentCandles[i - 2];
      const next1 = recentCandles[i + 1];
      const next2 = recentCandles[i + 2];
      
      // Check for pivot high
      if (curr.high > prev1.high && curr.high > prev2.high && 
          curr.high > next1.high && curr.high > next2.high) {
        pivots.push({ price: curr.high, type: 'high', timestamp: curr.timestamp });
      }
      
      // Check for pivot low
      if (curr.low < prev1.low && curr.low < prev2.low && 
          curr.low < next1.low && curr.low < next2.low) {
        pivots.push({ price: curr.low, type: 'low', timestamp: curr.timestamp });
      }
    }
    
    // Cluster nearby pivots into levels
    const tolerance = this.config.touchTolerance;
    const processedPivots = new Set<number>();
    
    for (let i = 0; i < pivots.length; i++) {
      if (processedPivots.has(i)) continue;
      
      const pivot = pivots[i];
      const nearbyPivots = [pivot];
      processedPivots.add(i);
      
      // Find nearby pivots
      for (let j = i + 1; j < pivots.length; j++) {
        if (processedPivots.has(j)) continue;
        
        const otherPivot = pivots[j];
        const priceDiff = Math.abs(pivot.price - otherPivot.price) / pivot.price;
        
        if (priceDiff <= tolerance) {
          nearbyPivots.push(otherPivot);
          processedPivots.add(j);
        }
      }
      
      // Only create level if we have enough touches
      if (nearbyPivots.length >= this.config.minBounces) {
        const avgPrice = nearbyPivots.reduce((sum, p) => sum + p.price, 0) / nearbyPivots.length;
        const lastTouch = nearbyPivots.reduce((latest, p) => 
          p.timestamp > latest ? p.timestamp : latest, nearbyPivots[0].timestamp);
        
        // Determine if support or resistance based on current price
        const currentPrice = candles[candles.length - 1].close;
        const type = avgPrice < currentPrice ? 'support' : 'resistance';
        
        // Calculate strength based on touches and recency
        const touchScore = Math.min(nearbyPivots.length / 10 * 50, 50); // Up to 50 points
        const recencyScore = this.calculateRecencyScore(lastTouch, candles[candles.length - 1].timestamp);
        
        levels.push({
          price: avgPrice,
          touches: nearbyPivots.length,
          type,
          lastTouch,
          strength: Math.round(touchScore + recencyScore)
        });
      }
    }
    
    // Sort by strength
    levels.sort((a, b) => b.strength - a.strength);
    
    return levels;
  }

  /**
   * Checks if current signal is a valid bounce off support/resistance
   */
  isBounce(signal: ComprehensiveSignal, levels: Level[], recentCandles: Candle[]): {
    isBounce: boolean;
    level: Level | null;
    direction: 'bullish' | 'bearish' | null;
    strength: number;
    reason?: string;
  } {
    const candle = signal.candle;
    const tolerance = this.config.touchTolerance;
    
    // Find nearby levels
    let nearestSupport: Level | null = null;
    let nearestResistance: Level | null = null;
    
    for (const level of levels) {
      const distance = Math.abs(candle.low - level.price) / level.price;
      
      if (level.type === 'support' && distance <= tolerance) {
        if (!nearestSupport || level.strength > nearestSupport.strength) {
          nearestSupport = level;
        }
      }
      
      const distanceHigh = Math.abs(candle.high - level.price) / level.price;
      if (level.type === 'resistance' && distanceHigh <= tolerance) {
        if (!nearestResistance || level.strength > nearestResistance.strength) {
          nearestResistance = level;
        }
      }
    }
    
    // Check for support bounce (bullish)
    if (nearestSupport) {
      const wickRatio = this.calculateLowerWickRatio(candle);
      
      if (wickRatio >= this.config.minRejectionWick) {
        // Strong rejection wick at support
        const volumeConfirmed = !this.config.volumeConfirmation || signal.context.isHighVolume;
        
        if (volumeConfirmed) {
          const strength = Math.round(
            nearestSupport.strength * 0.5 + // Level strength
            wickRatio * 50 // Rejection strength
          );
          
          return {
            isBounce: true,
            level: nearestSupport,
            direction: 'bullish',
            strength: Math.min(strength, 100),
            reason: `Support bounce at ${nearestSupport.price.toFixed(2)} (${nearestSupport.touches} touches)`
          };
        } else {
          return {
            isBounce: false,
            level: null,
            direction: null,
            strength: 0,
            reason: 'No volume confirmation'
          };
        }
      }
    }
    
    // Check for resistance bounce (bearish)
    if (nearestResistance) {
      const wickRatio = this.calculateUpperWickRatio(candle);
      
      if (wickRatio >= this.config.minRejectionWick) {
        // Strong rejection wick at resistance
        const volumeConfirmed = !this.config.volumeConfirmation || signal.context.isHighVolume;
        
        if (volumeConfirmed) {
          const strength = Math.round(
            nearestResistance.strength * 0.5 + // Level strength
            wickRatio * 50 // Rejection strength
          );
          
          return {
            isBounce: true,
            level: nearestResistance,
            direction: 'bearish',
            strength: Math.min(strength, 100),
            reason: `Resistance bounce at ${nearestResistance.price.toFixed(2)} (${nearestResistance.touches} touches)`
          };
        } else {
          return {
            isBounce: false,
            level: null,
            direction: null,
            strength: 0,
            reason: 'No volume confirmation'
          };
        }
      }
    }
    
    return {
      isBounce: false,
      level: null,
      direction: null,
      strength: 0,
      reason: 'No valid S/R bounce detected'
    };
  }

  /**
   * Creates a bounce signal with proper stop/target placement
   */
  createBounceSignal(
    originalSignal: ComprehensiveSignal,
    bounceInfo: { level: Level; direction: 'bullish' | 'bearish'; strength: number }
  ): ComprehensiveSignal {
    const signal = { ...originalSignal };
    const candle = signal.candle;
    const atr = signal.context.atr;
    const level = bounceInfo.level;
    
    // Override pattern info
    signal.pattern = {
      name: `${level.type} Bounce ${bounceInfo.direction}`,
      direction: bounceInfo.direction,
      reliability: bounceInfo.strength / 100,
      candleCount: 1
    };
    
    signal.score = bounceInfo.strength;
    
    if (bounceInfo.direction === 'bullish') {
      // Support bounce - go long
      const entry = candle.close;
      
      // Stop below the support level with buffer
      const stopBuffer = atr * 0.2;
      const stop = level.price - stopBuffer;
      
      // Ensure minimum 1% stop
      const minStop = entry * 0.99;
      const finalStop = Math.min(stop, minStop);
      
      // Targets based on next resistance or R/R
      const risk = entry - finalStop;
      const target1 = entry + (risk * 2);
      const target2 = entry + (risk * 3);
      
      signal.plan = {
        direction: 'long',
        entry,
        stop: finalStop,
        risk,
        targets: [target1, target2],
        positionQty: 1,
        riskRewardRatio: '1:2'
      };
    } else {
      // Resistance bounce - go short
      const entry = candle.close;
      
      // Stop above the resistance level with buffer
      const stopBuffer = atr * 0.2;
      const stop = level.price + stopBuffer;
      
      // Ensure minimum 1% stop
      const minStop = entry * 1.01;
      const finalStop = Math.max(stop, minStop);
      
      // Targets based on next support or R/R
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

  private calculateLowerWickRatio(candle: Candle): number {
    const bodyBottom = Math.min(candle.open, candle.close);
    const lowerWick = bodyBottom - candle.low;
    const totalRange = candle.high - candle.low;
    
    return totalRange > 0 ? lowerWick / totalRange : 0;
  }

  private calculateUpperWickRatio(candle: Candle): number {
    const bodyTop = Math.max(candle.open, candle.close);
    const upperWick = candle.high - bodyTop;
    const totalRange = candle.high - candle.low;
    
    return totalRange > 0 ? upperWick / totalRange : 0;
  }

  private calculateRecencyScore(lastTouch: Date, currentTime: Date): number {
    const hoursSinceTouch = (currentTime.getTime() - lastTouch.getTime()) / (1000 * 60 * 60);
    
    // More recent touches get higher scores
    if (hoursSinceTouch < 24) return 50; // Last 24 hours
    if (hoursSinceTouch < 48) return 40; // Last 2 days
    if (hoursSinceTouch < 120) return 30; // Last 5 days
    if (hoursSinceTouch < 240) return 20; // Last 10 days
    return 10; // Older than 10 days
  }

  /**
   * Validates bounce quality to avoid false signals
   */
  validateBounceQuality(signal: ComprehensiveSignal, level: Level): {
    isValid: boolean;
    reason?: string;
  } {
    const candle = signal.candle;
    
    // 1. Avoid bounces in low liquidity periods
    if (signal.context.avgVolume < 100000) {
      return { isValid: false, reason: 'Low liquidity period' };
    }
    
    // 2. Check that price hasn't broken through the level
    const breakthrough = level.type === 'support' 
      ? candle.close < level.price * 0.995 // Allow 0.5% penetration
      : candle.close > level.price * 1.005;
      
    if (breakthrough) {
      return { isValid: false, reason: 'Level broken - no bounce' };
    }
    
    // 3. Ensure level has been tested recently
    const hoursSinceLastTouch = (signal.timestamp.getTime() - level.lastTouch.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastTouch > 240) { // 10 days
      return { isValid: false, reason: 'Level too old' };
    }
    
    return { isValid: true };
  }
}