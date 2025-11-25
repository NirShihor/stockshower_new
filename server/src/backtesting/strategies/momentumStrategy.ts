import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';

export interface MomentumFilters {
  minTrendStrength: number;  // 0-100
  requireVolumeConfirmation: boolean;
  requireTrendAlignment: boolean;
  minADX?: number;  // Average Directional Index threshold
}

export class MomentumStrategy {
  private filters: MomentumFilters;

  constructor(filters: MomentumFilters = {
    minTrendStrength: 60,
    requireVolumeConfirmation: true,
    requireTrendAlignment: true,
    minADX: 25
  }) {
    this.filters = filters;
  }

  shouldTakeSignal(signal: ComprehensiveSignal): { take: boolean; reason?: string } {
    // Skip all reversal patterns - we want momentum
    if (signal.pattern.name.includes('Reversal')) {
      return { take: false, reason: 'Reversal patterns excluded in momentum strategy' };
    }

    // Accept all non-reversal patterns that show momentum
    // These patterns indicate continuation or breakout, not reversal
    const momentumPatterns = [
      'Bullish Engulfing',
      'Bearish Engulfing', 
      'Three White Soldiers',
      'Three Black Crows',
      'Bullish Marubozu',
      'Bearish Marubozu',
      'Three Inside Up',
      'Three Inside Down',
      'Tweezer Top',     // Can be continuation in downtrend
      'Tweezer Bottom',  // Can be continuation in uptrend
      'Morning Star',
      'Evening Star',
      'Shooting Star',   // In downtrend = continuation
      'Hammer'          // In uptrend = continuation
    ];

    const isGoodPattern = momentumPatterns.some(p => signal.pattern.name === p);
    if (!isGoodPattern) {
      return { take: false, reason: 'Not a momentum pattern' };
    }

    // Check trend alignment
    if (this.filters.requireTrendAlignment) {
      const isBullish = signal.pattern.direction === 'bullish' || signal.plan.direction === 'long';
      const trendUp = signal.context.trend === 'up';
      const trendDown = signal.context.trend === 'down';
      
      if (isBullish && !trendUp) {
        return { take: false, reason: 'Bullish signal against trend' };
      }
      if (!isBullish && !trendDown) {
        return { take: false, reason: 'Bearish signal against trend' };
      }
    }

    // Check volume
    if (this.filters.requireVolumeConfirmation && !signal.context.isHighVolume) {
      return { take: false, reason: 'Low volume' };
    }

    // Check trend strength (using pattern score as proxy)
    if (signal.score < this.filters.minTrendStrength) {
      return { take: false, reason: `Score ${signal.score} below threshold ${this.filters.minTrendStrength}` };
    }

    // Additional momentum checks
    // Avoid entries at strong resistance/support (momentum should break through)
    if (signal.pattern.direction === 'bullish' && signal.context.atResistance) {
      // OK if we're breaking through resistance with volume
      if (!signal.context.isHighVolume || signal.score < 80) {
        return { take: false, reason: 'Need high volume to break resistance' };
      }
    }

    if (signal.pattern.direction === 'bearish' && signal.context.atSupport) {
      // OK if we're breaking through support with volume
      if (!signal.context.isHighVolume || signal.score < 80) {
        return { take: false, reason: 'Need high volume to break support' };
      }
    }

    // Look for clean moves - avoid choppy markets
    const avgBody = signal.context.avgBody;
    const currentBody = Math.abs(signal.candle.close - signal.candle.open);
    
    // Current candle should be decisive (larger than average)
    if (currentBody < avgBody * 1.2) {
      return { take: false, reason: 'Candle body too small for momentum' };
    }

    return { take: true };
  }

  // Adjust stops for momentum trades (wider stops, let winners run)
  adjustTradeParameters(signal: ComprehensiveSignal): ComprehensiveSignal {
    const adjusted = { ...signal };
    
    // For momentum trades, we want:
    // 1. Wider stops (1.5% minimum instead of 1%)
    // 2. Further targets (1:2 and 1:3 instead of 1:1.5 and 1:2.5)
    
    const entryPrice = signal.plan.entry;
    const minStopDistance = entryPrice * 0.015; // 1.5% minimum
    
    if (signal.plan.direction === 'long') {
      const currentStopDistance = entryPrice - signal.plan.stop;
      if (currentStopDistance < minStopDistance) {
        adjusted.plan.stop = entryPrice - minStopDistance;
        
        // Recalculate targets for 1:2 and 1:3
        const risk = minStopDistance;
        adjusted.plan.targets = [
          entryPrice + (risk * 2),   // 1:2 R/R
          entryPrice + (risk * 3)    // 1:3 R/R
        ];
      }
    } else {
      const currentStopDistance = signal.plan.stop - entryPrice;
      if (currentStopDistance < minStopDistance) {
        adjusted.plan.stop = entryPrice + minStopDistance;
        
        // Recalculate targets for 1:2 and 1:3
        const risk = minStopDistance;
        adjusted.plan.targets = [
          entryPrice - (risk * 2),   // 1:2 R/R
          entryPrice - (risk * 3)    // 1:3 R/R
        ];
      }
    }
    
    return adjusted;
  }
}