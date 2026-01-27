export interface TradingParameters {
  atrLen: number;
  maFast: number;
  maSlow: number;
  srLookback: number;
  srToleranceATR: number;
  volSpikeFactor: number;
  minVolumeMultiplier: number;
  minBodyPct: number;
  dojiBodyPctMax: number;
  longWickPctMin: number;
  marubozuWickPctMax: number;
  engulfLookback: number;
  starGapMinPctATR: number;
  confirmBars: number;
  rMultiple1: number;
  rMultiple2: number;
  riskPerTradePct: number;
}

export const DEFAULT_PARAMS: TradingParameters = {
  atrLen: 14,
  maFast: 20,
  maSlow: 50,
  srLookback: 200,
  srToleranceATR: 0.25,
  volSpikeFactor: 1.5,
  minVolumeMultiplier: 1.0,  // Relaxed from 1.2 - normal volume is fine
  minBodyPct: 0.08,          // Relaxed from 0.15 - catch smaller patterns
  dojiBodyPctMax: 0.35,      // Relaxed from 0.25 - more doji variations
  longWickPctMin: 0.25,      // Relaxed from 0.35 - shorter wicks still valid
  marubozuWickPctMax: 0.20,  // Relaxed from 0.15 - allow some wicks
  engulfLookback: 1,
  starGapMinPctATR: 0.02,    // Relaxed from 0.05 - tiny gaps count
  confirmBars: 1,
  rMultiple1: 2.0,           // First target - need larger wins to offset losses
  rMultiple2: 3.0,           // Second target - extended profit taking  
  riskPerTradePct: 0.5
};

export interface CandleMetrics {
  body: number;
  upperWick: number;
  lowerWick: number;
  trueRange: number;
  bodyPctOfRange: number;
  upperWickPctOfRange: number;
  lowerWickPctOfRange: number;
  closePos: number;
  openPos: number;
  isBullish: boolean;
  isBearish: boolean;
}

export interface MarketContext {
  trend: 'up' | 'down' | 'sideways';
  atSupport: boolean;
  atResistance: boolean;
  nearestSupport?: number;
  nearestResistance?: number;
  atr: number;
  volumeFactor: number;
  isHighVolume: boolean;
  isWideRange: boolean;
  maSlope: number; // Normalized slope (bps per candle)
  h1Trend?: 'up' | 'down' | 'sideways';
}

export interface PatternDetails {
  name: string;
  class: 'single' | 'double' | 'triple';
  direction: 'bullish' | 'bearish' | 'neutral';
  barsInvolved: number;
  patternHigh: number;
  patternLow: number;
}

export interface ConfirmationPlan {
  triggerSide: 'above_high' | 'below_low';
  triggerPrice: number;
  invalidationPrice: number;
  validForBars: number;
}

export interface TradePlan {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  risk: number;
  targets: number[];
  positionQty: number;
  riskRewardRatio: string;
}

export interface ComprehensiveSignal {
  id: string;
  symbol: string;
  timeframe: string;
  time: string;
  pattern: PatternDetails;
  context: MarketContext;
  confirmation: ConfirmationPlan;
  plan: TradePlan;
  score: number;
  notes: string[];
  currentPrice?: number;
  trapRisk?: 'none' | 'low' | 'medium' | 'high';
}

export interface SupportResistanceLevel {
  price: number;
  strength: number;
  type: 'support' | 'resistance';
  touches: number;
}