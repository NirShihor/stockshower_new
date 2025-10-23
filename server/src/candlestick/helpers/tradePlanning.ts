import { Candle } from '../types/index.js';
import { PatternDetails, ConfirmationPlan, TradePlan, MarketContext, TradingParameters } from '../types/comprehensive.js';

export function buildConfirmationPlan(
  pattern: PatternDetails,
  params: TradingParameters
): ConfirmationPlan {
  if (pattern.direction === 'bullish') {
    return {
      triggerSide: 'above_high',
      triggerPrice: pattern.patternHigh,
      invalidationPrice: pattern.patternLow,
      validForBars: params.confirmBars
    };
  } else {
    return {
      triggerSide: 'below_low', 
      triggerPrice: pattern.patternLow,
      invalidationPrice: pattern.patternHigh,
      validForBars: params.confirmBars
    };
  }
}

export function buildTradePlan(
  pattern: PatternDetails,
  context: MarketContext,
  confirmation: ConfirmationPlan,
  params: TradingParameters,
  accountBalance: number = 10000 // Default for position sizing
): TradePlan {
  const tickSize = 0.01; // Assume penny stocks, adjust as needed
  // Use ATR-based buffer for better fills (minimum 0.05% of price or 0.1 * ATR)
  const priceBasedBuffer = confirmation.triggerPrice * 0.0005; // 0.05% of price
  const atrBasedBuffer = context.atr * 0.1; // 10% of ATR
  const entryBuffer = Math.max(priceBasedBuffer, atrBasedBuffer, tickSize * 5); // At least 5 ticks
  
  if (pattern.direction === 'bullish') {
    const entry = confirmation.triggerPrice + entryBuffer; // Use buffer instead of just tickSize
    const stop = findOptimalStopLoss(pattern, context, 'long');
    const risk = entry - stop;
    
    if (risk <= 0) {
      // Fallback if risk calculation is invalid
      return createFallbackTradePlan(entry, 'long', context.atr, params, accountBalance);
    }
    
    const targets = [
      entry + (risk * params.rMultiple1),
      entry + (risk * params.rMultiple2)
    ];
    
    const positionQty = calculatePositionSize(risk, params.riskPerTradePct, accountBalance);
    
    return {
      direction: 'long',
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      risk: Number(risk.toFixed(2)),
      targets: targets.map(t => Number(t.toFixed(2))),
      positionQty,
      riskRewardRatio: `1:${params.rMultiple1}`
    };
    
  } else {
    const entry = confirmation.triggerPrice - entryBuffer; // Use buffer instead of just tickSize
    const stop = findOptimalStopLoss(pattern, context, 'short');
    const risk = stop - entry;
    
    if (risk <= 0) {
      // Fallback if risk calculation is invalid
      return createFallbackTradePlan(entry, 'short', context.atr, params, accountBalance);
    }
    
    const targets = [
      entry - (risk * params.rMultiple1),
      entry - (risk * params.rMultiple2)
    ];
    
    const positionQty = calculatePositionSize(risk, params.riskPerTradePct, accountBalance);
    
    return {
      direction: 'short',
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      risk: Number(risk.toFixed(2)),
      targets: targets.map(t => Number(t.toFixed(2))),
      positionQty,
      riskRewardRatio: `1:${params.rMultiple1}`
    };
  }
}

function findOptimalStopLoss(
  pattern: PatternDetails,
  context: MarketContext,
  direction: 'long' | 'short'
): number {
  const minDistance = Math.max(context.atr * 0.75, 0.15); // Increased minimum distance for better stops
  
  if (direction === 'long') {
    // For long trades, stop below pattern low
    let stopLevel = pattern.patternLow;
    
    // Use nearest support if it's lower and reasonable
    if (context.nearestSupport && context.nearestSupport < stopLevel) {
      const distanceToSupport = pattern.patternLow - context.nearestSupport;
      if (distanceToSupport <= context.atr * 2) {
        stopLevel = context.nearestSupport - minDistance;
      }
    }
    
    return stopLevel - minDistance;
    
  } else {
    // For short trades, stop above pattern high
    let stopLevel = pattern.patternHigh;
    
    // Use nearest resistance if it's higher and reasonable
    if (context.nearestResistance && context.nearestResistance > stopLevel) {
      const distanceToResistance = context.nearestResistance - pattern.patternHigh;
      if (distanceToResistance <= context.atr * 2) {
        stopLevel = context.nearestResistance + minDistance;
      }
    }
    
    return stopLevel + minDistance;
  }
}

function calculatePositionSize(
  riskPerShare: number,
  riskPercentage: number,
  accountBalance: number
): number {
  const maxRiskAmount = accountBalance * (riskPercentage / 100);
  const shares = Math.floor(maxRiskAmount / riskPerShare);
  
  // Ensure minimum position size and maximum reasonable size
  return Math.max(1, Math.min(shares, 1000));
}

function createFallbackTradePlan(
  entry: number,
  direction: 'long' | 'short',
  atr: number,
  params: TradingParameters,
  accountBalance: number
): TradePlan {
  // Fallback plan using ATR-based stops
  const atrStop = atr * 1.5;
  
  if (direction === 'long') {
    const stop = entry - atrStop;
    const risk = entry - stop;
    const targets = [
      entry + (risk * params.rMultiple1),
      entry + (risk * params.rMultiple2)
    ];
    
    return {
      direction,
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      risk: Number(risk.toFixed(2)),
      targets: targets.map(t => Number(t.toFixed(2))),
      positionQty: calculatePositionSize(risk, params.riskPerTradePct, accountBalance),
      riskRewardRatio: `1:${params.rMultiple1}`
    };
  } else {
    const stop = entry + atrStop;
    const risk = stop - entry;
    const targets = [
      entry - (risk * params.rMultiple1),
      entry - (risk * params.rMultiple2)
    ];
    
    return {
      direction,
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      risk: Number(risk.toFixed(2)),
      targets: targets.map(t => Number(t.toFixed(2))),
      positionQty: calculatePositionSize(risk, params.riskPerTradePct, accountBalance),
      riskRewardRatio: `1:${params.rMultiple1}`
    };
  }
}

export function validateTradePlan(plan: TradePlan): boolean {
  // Basic validation checks
  if (plan.risk <= 0) return false;
  if (plan.positionQty <= 0) return false;
  
  if (plan.direction === 'long') {
    if (plan.entry <= plan.stop) return false;
    if (plan.targets[0] <= plan.entry) return false;
  } else {
    if (plan.entry >= plan.stop) return false;
    if (plan.targets[0] >= plan.entry) return false;
  }
  
  return true;
}