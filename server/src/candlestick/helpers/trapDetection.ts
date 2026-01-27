import { Candle } from '../types/index.js';
import { PatternDetails, MarketContext, TradingParameters } from '../types/comprehensive.js';

export interface TrapWarning {
  type: 'bull_trap' | 'bear_trap' | 'stop_hunt' | 'liquidity_grab' | 'volume_divergence';
  severity: 'low' | 'medium' | 'high';
  description: string;
  penaltyPoints: number;
}

export function detectTraps(
  pattern: PatternDetails,
  context: MarketContext,
  candles: Candle[],
  params: TradingParameters
): TrapWarning[] {
  const warnings: TrapWarning[] = [];
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  
  // 1. Check for patterns at wrong levels (classic traps)
  const wrongLevelTrap = checkWrongLevelPattern(pattern, context, current);
  if (wrongLevelTrap) warnings.push(wrongLevelTrap);
  
  // 2. Check for stop loss hunting
  const stopHuntTrap = checkStopLossHunting(pattern, candles, context);
  if (stopHuntTrap) warnings.push(stopHuntTrap);
  
  // 3. Check for round number traps
  const roundNumberTrap = checkRoundNumberTrap(pattern, current);
  if (roundNumberTrap) warnings.push(roundNumberTrap);
  
  // 4. Check for volume divergence
  const volumeTrap = checkVolumeDivergence(pattern, candles, context);
  if (volumeTrap) warnings.push(volumeTrap);
  
  // 5. Check for time-based traps
  const timeTrap = checkTimingTraps(pattern, current);
  if (timeTrap) warnings.push(timeTrap);
  
  // 6. Check for exhaustion patterns
  const exhaustionTrap = checkExhaustionPattern(pattern, candles, context);
  if (exhaustionTrap) warnings.push(exhaustionTrap);
  
  return warnings;
}

function checkWrongLevelPattern(
  pattern: PatternDetails,
  context: MarketContext,
  current: Candle
): TrapWarning | null {
  // Bullish patterns at resistance = potential bull trap
  if (pattern.direction === 'bullish' && context.atResistance) {
    return {
      type: 'bull_trap',
      severity: 'medium', // Reduced from high
      description: 'Bullish pattern at resistance - proceed with caution',
      penaltyPoints: 5 // Further reduced - patterns at levels can be valid
    };
  }
  
  // Bearish patterns at support = potential bear trap
  if (pattern.direction === 'bearish' && context.atSupport) {
    return {
      type: 'bear_trap',
      severity: 'medium', // Reduced from high
      description: 'Bearish pattern at support - proceed with caution',
      penaltyPoints: 5 // Further reduced - patterns at levels can be valid
    };
  }
  
  // Reversal patterns against strong trend
  if (pattern.direction === 'bullish' && context.trend === 'down' && context.volumeFactor > 2) {
    return {
      type: 'bull_trap',
      severity: 'medium',
      description: 'Bullish pattern against strong downtrend with high volume',
      penaltyPoints: 5
    };
  }
  
  if (pattern.direction === 'bearish' && context.trend === 'up' && context.volumeFactor > 2) {
    return {
      type: 'bear_trap',
      severity: 'medium',
      description: 'Bearish pattern against strong uptrend with high volume',
      penaltyPoints: 5
    };
  }
  
  return null;
}

function checkStopLossHunting(
  pattern: PatternDetails,
  candles: Candle[],
  context: MarketContext
): TrapWarning | null {
  const current = candles[candles.length - 1];
  const wickRatio = Math.max(
    (current.high - Math.max(current.open, current.close)) / (current.high - current.low),
    (Math.min(current.open, current.close) - current.low) / (current.high - current.low)
  );
  
  // Only flag extremely long wicks (>60%) - more conservative
  if (wickRatio > 0.6) {
    // Check if high/low is near round numbers or previous levels
    const highNearRound = isNearRoundNumber(current.high, 2);
    const lowNearRound = isNearRoundNumber(current.low, 2);
    
    if (highNearRound || lowNearRound) {
      return {
        type: 'stop_hunt',
        severity: 'high',
        description: `Long wick (${(wickRatio * 100).toFixed(1)}%) reaching round number - possible stop hunt`,
        penaltyPoints: 8
      };
    }
    
    // Check if touching previous highs/lows from recent candles
    const recentHighs = candles.slice(-20).map(c => c.high).sort((a, b) => b - a);
    const recentLows = candles.slice(-20).map(c => c.low).sort((a, b) => a - b);
    
    const nearRecentHigh = recentHighs.some(h => Math.abs(current.high - h) / h < 0.003);
    const nearRecentLow = recentLows.some(l => Math.abs(current.low - l) / l < 0.003);
    
    if (nearRecentHigh || nearRecentLow) {
      return {
        type: 'stop_hunt',
        severity: 'medium',
        description: `Long wick touching recent high/low - possible stop hunt`,
        penaltyPoints: 5
      };
    }
  }
  
  return null;
}

function checkRoundNumberTrap(
  pattern: PatternDetails,
  current: Candle
): TrapWarning | null {
  const price = (current.high + current.low + current.close) / 3;
  
  // Only check major round numbers with tighter threshold
  if (isNearRoundNumber(price, 0.5)) { // Much tighter - within 0.5%
    const nearestMajorRound = findNearestMajorRound(price);
    return {
      type: 'liquidity_grab',
      severity: 'low', // Reduced severity
      description: `Pattern near major round number ($${nearestMajorRound}) - watch for rejection`,
      penaltyPoints: 5 // Reduced penalty
    };
  }
  
  return null;
}

function findNearestMajorRound(price: number): number {
  const majorRounds = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
  
  if (price > 1000) {
    return Math.round(price / 100) * 100;
  }
  
  return majorRounds.reduce((closest, current) => 
    Math.abs(current - price) < Math.abs(closest - price) ? current : closest
  );
}

function checkVolumeDivergence(
  pattern: PatternDetails,
  candles: Candle[],
  context: MarketContext
): TrapWarning | null {
  if (candles.length < 10) return null;
  
  const recent = candles.slice(-5);
  const avgVolume = recent.reduce((sum, c) => sum + (c.volume ?? 0), 0) / recent.length;
  const current = candles[candles.length - 1];
  
  // High volume on opposite direction candles
  if (pattern.direction === 'bullish') {
    const redCandlesWithHighVolume = recent.filter(c => 
      c.close < c.open && (c.volume ?? 0) > avgVolume * 1.5
    ).length;
    
    if (redCandlesWithHighVolume >= 2) {
      return {
        type: 'volume_divergence',
        severity: 'medium',
        description: 'High volume on red candles suggests selling pressure',
        penaltyPoints: 5
      };
    }
  } else if (pattern.direction === 'bearish') {
    const greenCandlesWithHighVolume = recent.filter(c => 
      c.close > c.open && (c.volume ?? 0) > avgVolume * 1.5
    ).length;
    
    if (greenCandlesWithHighVolume >= 2) {
      return {
        type: 'volume_divergence',
        severity: 'medium',
        description: 'High volume on green candles suggests buying support',
        penaltyPoints: 5
      };
    }
  }
  
  // Pattern formed on unusually low volume
  if ((current.volume ?? 0) < avgVolume * 0.5) {
    return {
      type: 'volume_divergence',
      severity: 'medium',
      description: 'Pattern formed on weak volume - lacks conviction',
      penaltyPoints: 12
    };
  }
  
  return null;
}

function checkTimingTraps(
  pattern: PatternDetails,
  current: Candle
): TrapWarning | null {
  const date = new Date(current.start);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Market open traps (9:30-10:00 AM ET) - only flag first 15 minutes
  if (timeInMinutes >= 570 && timeInMinutes <= 585) { // 9:30-9:45 AM only
    return {
      type: 'liquidity_grab',
      severity: 'low',
      description: 'Pattern during market open - elevated volatility',
      penaltyPoints: 3 // Much reduced
    };
  }
  
  // Market close traps (3:45-4:00 PM ET) - only last 15 minutes
  if (timeInMinutes >= 945 && timeInMinutes <= 960) { // 3:45-4:00 PM only
    return {
      type: 'liquidity_grab',
      severity: 'low',
      description: 'Pattern near market close - end-of-day flows',
      penaltyPoints: 3 // Much reduced
    };
  }
  
  return null;
}

function checkExhaustionPattern(
  pattern: PatternDetails,
  candles: Candle[],
  context: MarketContext
): TrapWarning | null {
  if (candles.length < 10) return null;
  
  const recent = candles.slice(-10);
  const current = candles[candles.length - 1];
  
  // Check for exhaustion gaps or extreme moves
  if (pattern.direction === 'bullish') {
    // Look for series of green candles before reversal pattern
    const consecutiveGreen = recent.reverse().findIndex(c => c.close <= c.open);
    if (consecutiveGreen >= 5) {
      return {
        type: 'bull_trap',
        severity: 'medium',
        description: `Bullish pattern after ${consecutiveGreen} consecutive up candles - possible exhaustion`,
        penaltyPoints: 5
      };
    }
  } else if (pattern.direction === 'bearish') {
    // Look for series of red candles before reversal pattern
    const consecutiveRed = recent.reverse().findIndex(c => c.close >= c.open);
    if (consecutiveRed >= 5) {
      return {
        type: 'bear_trap',
        severity: 'medium',
        description: `Bearish pattern after ${consecutiveRed} consecutive down candles - possible exhaustion`,
        penaltyPoints: 5
      };
    }
  }
  
  // Check for extreme RSI-like conditions (using simple price momentum)
  const priceChange = (current.close - recent[0].open) / recent[0].open;
  if (Math.abs(priceChange) > 0.1) { // 10% move in 10 candles
    return {
      type: pattern.direction === 'bullish' ? 'bull_trap' : 'bear_trap',
      severity: 'high',
      description: `Pattern after extreme ${(priceChange * 100).toFixed(1)}% move - likely exhaustion`,
      penaltyPoints: 20
    };
  }
  
  return null;
}

function isNearRoundNumber(price: number, percentThreshold: number): boolean {
  // Only flag truly significant round numbers
  const majorRounds = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
  
  // Check if we're near a major round number
  for (const roundNum of majorRounds) {
    const difference = Math.abs(price - roundNum);
    const percentDiff = (difference / price) * 100;
    if (percentDiff <= percentThreshold) {
      return true;
    }
  }
  
  // For very high prices (>1000), check every $100
  if (price > 1000) {
    const nearestHundred = Math.round(price / 100) * 100;
    const difference = Math.abs(price - nearestHundred);
    const percentDiff = (difference / price) * 100;
    return percentDiff <= percentThreshold;
  }
  
  return false;
}

export function calculateTrapPenalty(warnings: TrapWarning[]): { totalPenalty: number, warningMessage: string } {
  const totalPenalty = warnings.reduce((sum, warning) => sum + warning.penaltyPoints, 0);
  
  const highSeverityWarnings = warnings.filter(w => w.severity === 'high');
  if (highSeverityWarnings.length > 0) {
    return {
      totalPenalty,
      warningMessage: `⚠️ HIGH RISK: ${highSeverityWarnings[0].description}`
    };
  }
  
  const mediumSeverityWarnings = warnings.filter(w => w.severity === 'medium');
  if (mediumSeverityWarnings.length > 0) {
    return {
      totalPenalty,
      warningMessage: `⚠️ CAUTION: ${mediumSeverityWarnings[0].description}`
    };
  }
  
  if (warnings.length > 0) {
    return {
      totalPenalty,
      warningMessage: `⚠️ MINOR: ${warnings[0].description}`
    };
  }
  
  return { totalPenalty: 0, warningMessage: '' };
}