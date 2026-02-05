import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { getMarketContext, MarketContext } from './marketContextService.js';

const GOLD_SYMBOL = 'GOLD';
const EMA_PERIOD = 20;
const MIN_CONSOLIDATION_DAYS = 5;
const MAX_CONSOLIDATION_DAYS = 20;
const CONSOLIDATION_RANGE_PERCENT = 5;
const VIX_ELEVATED_THRESHOLD = 18;

export interface GoldCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface GoldConsolidation {
  detected: boolean;
  high: number;
  low: number;
  days: number;
  rangePercent: number;
}

export interface GoldAnalysis {
  symbol: string;
  timestamp: string;
  currentPrice: number;
  ema20: number;
  trend: 'bullish' | 'bearish';
  consolidation: GoldConsolidation | null;
  breakoutLevel: number | null;
  score: number;
  maxScore: number;
  vixLevel: number;
  vixElevated: boolean;
  equityMarketRegime: string;
  equityMarketReason: string;
  recommendation: 'buy_stop' | 'wait' | 'not_favorable';
  reasons: string[];
}

function calculateEma(candles: GoldCandle[], period: number): number {
  if (candles.length < period) {
    return candles[candles.length - 1]?.close || 0;
  }

  const multiplier = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;

  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
  }

  return ema;
}

function detectConsolidation(candles: GoldCandle[]): GoldConsolidation | null {
  if (candles.length < MIN_CONSOLIDATION_DAYS) {
    return null;
  }

  const recentCandles = candles.slice(-MAX_CONSOLIDATION_DAYS);

  for (let days = MIN_CONSOLIDATION_DAYS; days <= recentCandles.length; days++) {
    const window = recentCandles.slice(-days);
    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);
    const windowHigh = Math.max(...highs);
    const windowLow = Math.min(...lows);
    const rangePercent = ((windowHigh - windowLow) / windowLow) * 100;

    if (rangePercent <= CONSOLIDATION_RANGE_PERCENT) {
      return {
        detected: true,
        high: windowHigh,
        low: windowLow,
        days: days,
        rangePercent: rangePercent
      };
    }
  }

  return null;
}

export async function analyzeGold(marketContext?: MarketContext): Promise<GoldAnalysis | null> {
  try {
    console.log('[GOLD] Fetching historical candles...');
    const result = await metaApiHandler.getHistoricalCandles(GOLD_SYMBOL, '1d', 60);

    if (!result.success || !result.candles?.length) {
      console.error('[GOLD] Failed to fetch candles:', result.error);
      return null;
    }

    const candles: GoldCandle[] = result.candles.sort(
      (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const currentPrice = candles[candles.length - 1].close;
    const ema20 = calculateEma(candles, EMA_PERIOD);
    const trend = currentPrice > ema20 ? 'bullish' : 'bearish';

    const consolidation = detectConsolidation(candles);
    const breakoutLevel = consolidation ? consolidation.high * 1.001 : null;

    let ctx: MarketContext | null | undefined = marketContext;
    if (!ctx) {
      const today = new Date().toISOString().split('T')[0];
      ctx = await getMarketContext(today);
    }

    const vixLevel = ctx?.vix?.current || 0;
    const vixElevated = vixLevel > VIX_ELEVATED_THRESHOLD;
    const equityMarketRegime = ctx?.regime || 'unknown';
    const equityMarketReason = ctx?.regimeReason || '';

    let score = 0;
    const reasons: string[] = [];

    if (trend === 'bullish') {
      score++;
      reasons.push(`Gold above 20 EMA ($${ema20.toFixed(2)})`);
    } else {
      reasons.push(`Gold below 20 EMA - trend not favorable`);
    }

    if (consolidation?.detected) {
      score++;
      reasons.push(`Consolidation detected: ${consolidation.days} days, ${consolidation.rangePercent.toFixed(1)}% range`);
    } else {
      reasons.push(`No consolidation pattern found`);
    }

    if (vixElevated) {
      score++;
      reasons.push(`VIX elevated at ${vixLevel.toFixed(1)} (risk-off sentiment favors gold)`);
    } else {
      reasons.push(`VIX at ${vixLevel.toFixed(1)} - not elevated`);
    }

    let recommendation: 'buy_stop' | 'wait' | 'not_favorable';
    if (equityMarketRegime === 'risk-on') {
      recommendation = 'not_favorable';
      reasons.push('Equity market is risk-on - CAN SLIM preferred over gold');
    } else if (score >= 2 && trend === 'bullish' && consolidation?.detected) {
      recommendation = 'buy_stop';
      reasons.push(`Score ${score}/3 - placing buy stop at $${breakoutLevel?.toFixed(2)}`);
    } else if (score >= 1) {
      recommendation = 'wait';
      reasons.push(`Score ${score}/3 - waiting for better setup`);
    } else {
      recommendation = 'not_favorable';
      reasons.push('Conditions not favorable for gold entry');
    }

    return {
      symbol: GOLD_SYMBOL,
      timestamp: new Date().toISOString(),
      currentPrice,
      ema20,
      trend,
      consolidation,
      breakoutLevel,
      score,
      maxScore: 3,
      vixLevel,
      vixElevated,
      equityMarketRegime,
      equityMarketReason,
      recommendation,
      reasons
    };
  } catch (error: any) {
    console.error('[GOLD] Error analyzing gold:', error.message);
    return null;
  }
}

export async function shouldTradeGold(marketContext?: MarketContext): Promise<boolean> {
  const analysis = await analyzeGold(marketContext);
  return analysis?.recommendation === 'buy_stop';
}
