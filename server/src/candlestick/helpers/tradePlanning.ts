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
  // Minimal buffer for aggressive entry timing - reduced for more executions
  const priceBasedBuffer = confirmation.triggerPrice * 0.0001; // 0.01% of price - very small
  const atrBasedBuffer = context.atr * 0.02; // 2% of ATR - much smaller
  const entryBuffer = Math.max(priceBasedBuffer, atrBasedBuffer, tickSize * 1); // Just 1 tick minimum
  
  if (pattern.direction === 'bullish') {
    // MOMENTUM APPROACH: Enter on breakout ABOVE pattern high (confirming upward momentum)
    const entry = pattern.patternHigh + entryBuffer; // Enter above pattern high + buffer for momentum confirmation
    const stop = findOptimalStopLoss(pattern, context, 'long');
    const risk = entry - stop;
    
    if (risk <= 0) {
      // Fallback if risk calculation is invalid
      return createFallbackTradePlan(entry, 'long', context.atr, params, accountBalance);
    }
    
    // PROFIT INTEGRITY FILTERS:
    // 1. Precision Volatility Cap: Reject if risk > 1.6% (Standard Institutional Stop)
    const riskPct = risk / entry;
    if (riskPct > 0.016) {
      console.log(`[TRADE-PLAN] REJECTED: Risk too wide (${(riskPct * 100).toFixed(2)}% > 1.6%)`);
      return { ...createFallbackTradePlan(entry, 'long', context.atr, params, accountBalance), risk: -1 };
    }

    // 2. Minimum 1.5x R/R Enforcement:
    // With V4, MFT requires high-payoff winners to filter out M5 noise.
    const minTargetDistance = Math.max(risk * 1.5, entry * 0.01);
    
    const targets = [
      Number((entry + minTargetDistance).toFixed(2)),
      Number((entry + minTargetDistance * 1.5).toFixed(2))
    ];
    
    const positionQty = calculatePositionSize(risk, params.riskPerTradePct, accountBalance);

    return {
      direction: 'long',
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      risk: Number(risk.toFixed(2)),
      targets: targets,
      positionQty,
      riskRewardRatio: `1:${(minTargetDistance / risk).toFixed(2)}`
    };
    
  } else {
    // SHORT DIRECTION
    const entry = pattern.patternLow - entryBuffer;
    const stop = findOptimalStopLoss(pattern, context, 'short');
    const risk = stop - entry;
    
    if (risk <= 0) {
      return createFallbackTradePlan(entry, 'short', context.atr, params, accountBalance);
    }

    // PROFIT INTEGRITY FILTERS:
    // 1. Precision Volatility Cap: Reject if risk > 1.6%
    const riskPct = risk / entry;
    if (riskPct > 0.016) {
      console.log(`[TRADE-PLAN] REJECTED: Risk too wide (${(riskPct * 100).toFixed(2)}% > 1.6%)`);
      return { ...createFallbackTradePlan(entry, 'short', context.atr, params, accountBalance), risk: -1 };
    }

    // 2. Minimum 1.5x R/R Enforcement:
    const minTargetDistance = Math.max(risk * 1.5, entry * 0.01);
    
    const targets = [
      Number((entry - minTargetDistance).toFixed(2)),
      Number((entry - minTargetDistance * 1.5).toFixed(2))
    ];
    
    const positionQty = calculatePositionSize(risk, params.riskPerTradePct, accountBalance);

    return {
      direction: 'short',
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      risk: Number(risk.toFixed(2)),
      targets: targets,
      positionQty,
      riskRewardRatio: `1:${(minTargetDistance / risk).toFixed(2)}`
    };
  }
}

function findOptimalStopLoss(
  pattern: PatternDetails,
  context: MarketContext,
  direction: 'long' | 'short'
): number {
  // Get the trigger price (where we expect to enter)
  const entryPrice = direction === 'long' ? pattern.patternHigh : pattern.patternLow;
  
  // Calculate minimum distance as percentage of entry price (1.5% minimum for better survival)
  const minDistancePercent = entryPrice * 0.015; 
  // Restore 2.0x ATR stops to survive choppy market noise
  const minDistance = Math.max(context.atr * 2.0, minDistancePercent);
  
  if (direction === 'long') {
    // For long trades, stop below pattern low
    let stopLevel = pattern.patternLow;
    
    // Use nearest support if it's lower and reasonable
    if (context.nearestSupport && context.nearestSupport < stopLevel) {
      const distanceToSupport = pattern.patternLow - context.nearestSupport;
      if (distanceToSupport <= context.atr * 2) {
        stopLevel = context.nearestSupport;
      }
    }
    
    // Ensure stop is at least minDistance below the expected entry
    const stopFromEntry = entryPrice - minDistance;
    return Math.min(stopLevel, stopFromEntry);
    
  } else {
    // For short trades, stop above pattern high
    let stopLevel = pattern.patternHigh;
    
    // Use nearest resistance if it's higher and reasonable
    if (context.nearestResistance && context.nearestResistance > stopLevel) {
      const distanceToResistance = context.nearestResistance - pattern.patternHigh;
      if (distanceToResistance <= context.atr * 2) {
        stopLevel = context.nearestResistance;
      }
    }
    
    // Ensure stop is at least minDistance above the expected entry
    const stopFromEntry = entryPrice + minDistance;
    return Math.max(stopLevel, stopFromEntry);
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