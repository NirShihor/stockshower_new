export interface TradingParameters {
  atrLen: number;
  maFast: number;
  maSlow: number;
  srLookback: number;
  srToleranceATR: number;
  volSpikeFactor: number;
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
  minBodyPct: 0.35,
  dojiBodyPctMax: 0.1,
  longWickPctMin: 0.6,
  marubozuWickPctMax: 0.05,
  engulfLookback: 1,
  starGapMinPctATR: 0.15,
  confirmBars: 1,
  rMultiple1: 2,
  rMultiple2: 3,
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
}

export interface SupportResistanceLevel {
  price: number;
  strength: number;
  type: 'support' | 'resistance';
  touches: number;
}