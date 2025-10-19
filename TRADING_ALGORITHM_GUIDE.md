# Trading Algorithm Guide

## Overview

This document describes how the StockShower trading algorithms work, including pattern detection, scoring, filtering, and execution logic.

## Pattern Detection Flow

1. **Real-time Candle Processing**: System receives 5-minute candles from Polygon WebSocket
2. **Pattern Recognition**: Scans for single/double/triple candlestick patterns (Engulfing, Hammer, Doji, etc.)
3. **Market Context Analysis**: Evaluates trend, support/resistance, volume, and ATR
4. **Scoring & Filtering**: Applies comprehensive scoring system with quality filters
5. **Signal Generation**: Creates trading signals with entry/exit plans
6. **Order Execution**: Places orders via MT5 integration

## Entry Logic

- **Trigger Price**: Pattern high (bullish) or low (bearish)
- **Entry Price**: Trigger + 2 ticks (0.02) for tighter fills
- **Order Type**: Buy/Sell Stop orders placed above/below current market

## Scoring System (0-100 points)

### Base Scores
- **Triple patterns**: +30 (strongest)
- **Double patterns**: +22  
- **Single patterns**: +15

### Bonuses
- **At support/resistance**: +20
- **High volume (1.5x+)**: +15
- **Trend alignment**: +15 (sideways: +8)
- **Wide range candle**: +10
- **Above average body**: +10
- **Clear invalidation**: +10

### Penalties
- **Low volume (<1.2x)**: -20
- **Counter-trend patterns**: -15
- **Near opposing levels**: -10
- **Overextended price**: -10
- **News spike risk**: -5
- **Trap detection**: up to -20

## Quality Filters

### 1. Score Thresholds
- **60+**: Actionable (tradeable)
- **20-59**: Watch only
- **<20**: Ignored

### 2. Volume Requirements
- Minimum 1.2x average volume required
- Patterns below this threshold receive -20 point penalty

### 3. Duplicate Prevention
- 20-minute block on same pattern/symbol combinations
- Prevents signal spam and redundant trades

### 4. Market Context
- Penalizes counter-trend patterns in strong trends
- Reduces scoring for sideways market patterns

## Risk Management

### Position Sizing
- **Risk per trade**: 0.5% of account balance
- **Position calculation**: Based on stop loss distance

### Stop Loss Placement
- **Long positions**: Below pattern low with ATR buffer
- **Short positions**: Above pattern high with ATR buffer
- **Minimum distance**: 0.75x ATR or $0.15

### Take Profit Targets
- **Target 1**: 1.5R (1.5x risk amount)
- **Target 2**: 2.5R (2.5x risk amount)

### Circuit Breakers
- System-wide risk controls
- Daily loss limits
- Maximum position limits

## Pattern Types Detected

### Reversal Patterns
- **Hammer**: Bullish reversal with long lower wick
- **Shooting Star**: Bearish reversal with long upper wick
- **Bullish/Bearish Engulfing**: Large candle engulfs previous
- **Tweezer Tops/Bottoms**: Double highs/lows at same level

### Continuation Patterns
- **Marubozu**: Strong directional candles with minimal wicks

### Complex Patterns
- **Morning Star**: Three-candle bullish reversal
- **Evening Star**: Three-candle bearish reversal
- **Three White Soldiers**: Three consecutive bullish candles
- **Harami**: Small candle inside previous large candle

## Market Context Analysis

### Trend Detection
- **Fast MA (20)** vs **Slow MA (50)** comparison
- **Up trend**: Fast > Slow
- **Down trend**: Fast < Slow  
- **Sideways**: Close alignment

### Support/Resistance
- **Lookback period**: 200 candles
- **Tolerance**: 0.25x ATR
- **Strength**: Based on number of touches

### Volume Analysis
- **Volume MA**: 20-period average
- **High volume**: 1.5x+ average
- **Volume spike**: 3x+ average (news risk)

### Volatility (ATR)
- **Period**: 14 candles
- **Uses**: Stop placement, pattern validation, overextension detection

## Trading Parameters

```typescript
{
  atrLen: 14,                    // ATR calculation period
  maFast: 20,                    // Fast moving average
  maSlow: 50,                    // Slow moving average
  srLookback: 200,               // Support/resistance lookback
  srToleranceATR: 0.25,          // S/R tolerance as ATR multiple
  volSpikeFactor: 1.5,           // Volume spike threshold
  minVolumeMultiplier: 1.2,      // Minimum volume requirement
  minBodyPct: 0.15,              // Minimum candle body percentage
  confirmBars: 1,                // Bars to wait for confirmation
  rMultiple1: 1.5,               // First target R-multiple
  rMultiple2: 2.5,               // Second target R-multiple
  riskPerTradePct: 0.5           // Risk percentage per trade
}
```

## Signal Classification

### Actionable Signals (60+ points)
- High-quality patterns with strong confirmation
- Automatically trigger trade orders
- Meet all quality requirements

### Watch Signals (20-59 points)
- Moderate quality patterns
- Displayed for analysis but not traded
- May lack volume or have mixed context

### Ignored Signals (<20 points)
- Low quality patterns
- Filtered out completely
- Usually have multiple negative factors

## Recent Algorithm Improvements

### October 2024 Updates
1. **Tighter Entry Logic**: Changed from ATR-based to 2-tick buffer
2. **Volume Filtering**: Added 1.2x minimum volume requirement
3. **Duplicate Prevention**: 20-minute blocking for same pattern/symbol
4. **Raised Score Threshold**: Increased from 55 to 60 for actionable signals
5. **Market Context Weighting**: Reduced sideways bonuses, added counter-trend penalties

These improvements target the 100% cancellation rate issue by:
- Reducing slippage with tighter entries
- Filtering weak volume patterns
- Preventing signal spam
- Raising quality standards
- Better trend awareness

## File Locations

### Core Algorithm Files
- **Pattern Detection**: `/server/src/candlestick/comprehensiveScanner.ts`
- **Scoring Logic**: `/server/src/candlestick/helpers/scoring.ts`
- **Trade Planning**: `/server/src/candlestick/helpers/tradePlanning.ts`
- **Market Context**: `/server/src/candlestick/helpers/marketStructure.ts`

### Pattern Detectors
- **Single Patterns**: `/server/src/candlestick/patterns/singleCandle.ts`
- **Double Patterns**: `/server/src/candlestick/patterns/doubleCandle.ts`
- **Triple Patterns**: `/server/src/candlestick/patterns/tripleCandle.ts`

### Trading Integration
- **Order Execution**: `/server/src/handlers/metaApiRestHandler.ts`
- **WebSocket Server**: `/server/src/websocket/server.ts`
- **Routes**: `/server/src/routes/candlestick.ts`