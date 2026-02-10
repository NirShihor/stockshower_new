import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { fetchUKHistoricalBars } from '../handlers/ukDataAPI.js';
import { Candle } from '../candlestick/types/index.js';

interface MarketIndex {
  symbol: string;
  name: string;
  current: number;
  open: number;
  high: number;
  low: number;
  changePercent: number;
  weekChangePercent: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  aboveEma20: boolean;
}

interface MarketBreadth {
  advancers: number;
  decliners: number;
  advancerPercent: number;
}

export interface MarketContext {
  timestamp: string;
  spy: MarketIndex;
  qqq: MarketIndex;
  vix: MarketIndex;
  regime: 'risk-on' | 'risk-off' | 'neutral';
  regimeReason: string;
  breadth: MarketBreadth;
  summary: string;
  vixSpike: boolean;
  vixSpikePercent: number;
  marketDeteriorating: boolean;
}

const US_MARKET_SYMBOLS = {
  INDEX: 'SPY',      // S&P 500 ETF
  TECH: 'QQQ',       // Nasdaq 100 ETF
  VIX: 'VIXY'        // VIX ETF proxy
};

// UK market proxies using major FTSE 100 stocks (no ETFs available on FxPro)
const UK_MARKET_SYMBOLS = {
  INDEX: 'SHEL',     // Shell - largest UK stock, proxy for market
  TECH: 'AZN',       // AstraZeneca - large cap proxy
  VIX: 'BARC'        // Barclays - financials tend to be volatile, proxy for fear
};

function calculateEma(candles: Candle[], period: number): number {
  if (candles.length < period) return candles[candles.length - 1]?.close || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateWeekChange(dailyCandles: Candle[]): number {
  if (dailyCandles.length < 5) return 0;
  const fiveDaysAgo = dailyCandles[dailyCandles.length - 5]?.open || dailyCandles[0].open;
  const current = dailyCandles[dailyCandles.length - 1].close;
  return ((current - fiveDaysAgo) / fiveDaysAgo) * 100;
}

function determineTrend(candles: Candle[], ema20: number): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < 3) return 'neutral';
  
  const current = candles[candles.length - 1].close;
  const prev1 = candles[candles.length - 2].close;
  const prev2 = candles[candles.length - 3].close;
  
  const aboveEma = current > ema20;
  const higherHighs = current > prev1 && prev1 > prev2;
  const lowerLows = current < prev1 && prev1 < prev2;
  
  if (aboveEma && higherHighs) return 'bullish';
  if (!aboveEma && lowerLows) return 'bearish';
  return 'neutral';
}

async function fetchIndexData(
  symbol: string,
  name: string,
  date: string,
  market: 'US' | 'UK' = 'US'
): Promise<MarketIndex | null> {
  try {
    const endDate = date;
    const startDateObj = new Date(date);
    startDateObj.setDate(startDateObj.getDate() - 60);
    const startDate = startDateObj.toISOString().split('T')[0];

    let dailyCandles;

    if (market === 'UK') {
      dailyCandles = await fetchUKHistoricalBars(
        symbol,
        startDate,
        endDate,
        'day',
        60
      );
    } else {
      const apiKey = process.env.POLYGON_API_KEY;
      if (!apiKey) {
        console.error('[MARKET-CONTEXT] No Polygon API key');
        return null;
      }

      dailyCandles = await fetchHistoricalBars(
        apiKey,
        symbol,
        startDate,
        endDate,
        'day',
        1,
        60
      );
    }

    if (dailyCandles.length === 0) return null;

    const latest = dailyCandles[dailyCandles.length - 1];
    const prevDay = dailyCandles.length > 1 ? dailyCandles[dailyCandles.length - 2] : latest;

    const ema20 = calculateEma(dailyCandles, 20);
    const weekChange = calculateWeekChange(dailyCandles);
    const changePercent = ((latest.close - prevDay.close) / prevDay.close) * 100;

    return {
      symbol,
      name,
      current: latest.close,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      changePercent: Math.round(changePercent * 100) / 100,
      weekChangePercent: Math.round(weekChange * 100) / 100,
      trend: determineTrend(dailyCandles, ema20),
      aboveEma20: latest.close > ema20
    };
  } catch (error) {
    console.error(`[MARKET-CONTEXT] Error fetching ${symbol}:`, error);
    return null;
  }
}

function determineMarketRegime(
  spy: MarketIndex,
  qqq: MarketIndex,
  vix: MarketIndex
): { regime: 'risk-on' | 'risk-off' | 'neutral'; reason: string } {
  const signals: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  
  if (spy.trend === 'bullish') {
    bullishScore += 2;
    signals.push('SPY bullish trend');
  } else if (spy.trend === 'bearish') {
    bearishScore += 2;
    signals.push('SPY bearish trend');
  }
  
  if (qqq.trend === 'bullish') {
    bullishScore += 1;
    signals.push('QQQ bullish');
  } else if (qqq.trend === 'bearish') {
    bearishScore += 1;
    signals.push('QQQ bearish');
  }
  
  if (vix.current < 15) {
    bullishScore += 1;
    signals.push('VIX low (complacent)');
  } else if (vix.current > 20) {
    bearishScore += 1;
    signals.push('VIX elevated (fear)');
  } else if (vix.current > 25) {
    bearishScore += 2;
    signals.push('VIX high (high fear)');
  }
  
  if (spy.aboveEma20) {
    bullishScore += 1;
    signals.push('SPY above 20 EMA');
  } else {
    bearishScore += 1;
    signals.push('SPY below 20 EMA');
  }
  
  if (spy.weekChangePercent > 1) {
    bullishScore += 1;
    signals.push('SPY up on week');
  } else if (spy.weekChangePercent < -0.5) {
    bearishScore += 1;
    signals.push('SPY weakening on week');
  }
  
  if (spy.weekChangePercent < -1.5) {
    bearishScore += 1;
    signals.push('SPY down >1.5% on week');
  }
  
  const netScore = bullishScore - bearishScore;
  
  if (netScore >= 2) {
    return { regime: 'risk-on', reason: signals.join(', ') };
  } else if (netScore <= -2) {
    return { regime: 'risk-off', reason: signals.join(', ') };
  }
  return { regime: 'neutral', reason: signals.join(', ') };
}

function generateSummary(
  spy: MarketIndex,
  qqq: MarketIndex,
  vix: MarketIndex,
  regime: string
): string {
  const spyDir = spy.changePercent >= 0 ? 'up' : 'down';
  const qqqDir = qqq.changePercent >= 0 ? 'up' : 'down';
  const vixLevel = vix.current < 15 ? 'low' : vix.current > 20 ? 'elevated' : 'moderate';
  
  return `Market is ${regime}. SPY ${spyDir} ${Math.abs(spy.changePercent).toFixed(1)}% (${spy.trend}), ` +
    `QQQ ${qqqDir} ${Math.abs(qqq.changePercent).toFixed(1)}% (${qqq.trend}), ` +
    `VIX at ${vix.current.toFixed(1)} (${vixLevel}). ` +
    `Weekly: SPY ${spy.weekChangePercent > 0 ? '+' : ''}${spy.weekChangePercent.toFixed(1)}%, ` +
    `QQQ ${qqq.weekChangePercent > 0 ? '+' : ''}${qqq.weekChangePercent.toFixed(1)}%.`;
}

export async function getMarketContext(date: string, market: 'US' | 'UK' = 'US'): Promise<MarketContext | null> {
  const symbols = market === 'UK' ? UK_MARKET_SYMBOLS : US_MARKET_SYMBOLS;
  const indexName = market === 'UK' ? 'FTSE 100 ETF' : 'S&P 500 ETF';
  const techName = market === 'UK' ? 'UK Tech Proxy' : 'Nasdaq 100 ETF';

  console.log(`[MARKET-CONTEXT] Fetching ${market} market context for ${date}`);

  const [indexData, techData, vixData] = await Promise.all([
    fetchIndexData(symbols.INDEX, indexName, date, market),
    fetchIndexData(symbols.TECH, techName, date, market),
    fetchIndexData(symbols.VIX, 'VIX Proxy', date, market)
  ]);

  if (!indexData) {
    console.error(`[MARKET-CONTEXT] Failed to fetch ${symbols.INDEX} for ${market} market`);
    return null;
  }

  // Use index data as fallback for tech if not available
  const tech = techData || indexData;

  const estimateVixFromProxy = (proxyWeekChange: number): number => {
    let baseVix = 16;
    if (proxyWeekChange > 20) baseVix = 30;
    else if (proxyWeekChange > 10) baseVix = 25;
    else if (proxyWeekChange > 5) baseVix = 20;
    else if (proxyWeekChange < -10) baseVix = 12;
    else if (proxyWeekChange < -5) baseVix = 14;
    return baseVix;
  };

  const vixSpikePercent = vixData?.weekChangePercent || 0;
  const estimatedVix = vixData ? estimateVixFromProxy(vixData.weekChangePercent) : 16;
  const vixSpike = vixSpikePercent > 20 || estimatedVix > 25;

  const vix: MarketIndex = vixData ? {
    ...vixData,
    symbol: 'VIX',
    name: 'Volatility Index',
    current: estimateVixFromProxy(vixData.weekChangePercent)
  } : {
    symbol: 'VIX',
    name: 'Volatility Index',
    current: 16,
    open: 16,
    high: 16,
    low: 16,
    changePercent: 0,
    weekChangePercent: 0,
    trend: 'neutral',
    aboveEma20: false
  };

  const { regime, reason } = determineMarketRegime(indexData, tech, vix);
  const summary = generateSummary(indexData, tech, vix, regime);

  console.log(`[MARKET-CONTEXT] ${market}: ${summary}`);

  const marketDeteriorating = indexData.aboveEma20 && indexData.weekChangePercent < -0.5;

  return {
    timestamp: new Date().toISOString(),
    spy: indexData,  // For UK this is ISF, for US this is SPY
    qqq: tech,       // For UK this is tech proxy, for US this is QQQ
    vix,
    regime,
    regimeReason: reason,
    breadth: {
      advancers: 0,
      decliners: 0,
      advancerPercent: 50
    },
    summary,
    vixSpike,
    vixSpikePercent,
    marketDeteriorating
  };
}

export function formatMarketContextForAI(ctx: MarketContext): string {
  let output = `MARKET CONTEXT (${ctx.timestamp.split('T')[0]})\n`;
  output += '='.repeat(50) + '\n\n';
  
  output += `REGIME: ${ctx.regime.toUpperCase()} - ${ctx.regimeReason}\n\n`;
  
  output += `SPY (S&P 500): $${ctx.spy.current.toFixed(2)}\n`;
  output += `  Today: ${ctx.spy.changePercent >= 0 ? '+' : ''}${ctx.spy.changePercent.toFixed(2)}% | `;
  output += `Week: ${ctx.spy.weekChangePercent >= 0 ? '+' : ''}${ctx.spy.weekChangePercent.toFixed(2)}%\n`;
  output += `  Trend: ${ctx.spy.trend.toUpperCase()} | ${ctx.spy.aboveEma20 ? 'Above' : 'Below'} 20 EMA\n\n`;
  
  output += `QQQ (Nasdaq 100): $${ctx.qqq.current.toFixed(2)}\n`;
  output += `  Today: ${ctx.qqq.changePercent >= 0 ? '+' : ''}${ctx.qqq.changePercent.toFixed(2)}% | `;
  output += `Week: ${ctx.qqq.weekChangePercent >= 0 ? '+' : ''}${ctx.qqq.weekChangePercent.toFixed(2)}%\n`;
  output += `  Trend: ${ctx.qqq.trend.toUpperCase()} | ${ctx.qqq.aboveEma20 ? 'Above' : 'Below'} 20 EMA\n\n`;
  
  output += `VIX (Fear Index): ${ctx.vix.current.toFixed(2)}\n`;
  output += `  Today: ${ctx.vix.changePercent >= 0 ? '+' : ''}${ctx.vix.changePercent.toFixed(2)}%\n`;
  const vixLevel = ctx.vix.current < 15 ? 'LOW (complacent/bullish)' : 
                   ctx.vix.current > 25 ? 'HIGH (fearful/bearish)' :
                   ctx.vix.current > 20 ? 'ELEVATED (cautious)' : 'MODERATE';
  output += `  Level: ${vixLevel}\n\n`;
  
  return output;
}
