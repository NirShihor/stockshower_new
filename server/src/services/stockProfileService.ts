import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { Candle } from '../candlestick/types/index.js';

interface StockCharacteristics {
  volatility: 'low' | 'medium' | 'high' | 'extreme';
  avgDailyRange: number;
  avgDailyRangePercent: number;
  beta: number;
  gapBehavior: 'fills_gaps' | 'extends_gaps' | 'mixed';
  trendFollowing: number;
  meanReverting: number;
  bestTimeOfDay: 'morning' | 'midday' | 'afternoon' | 'all_day';
  typicalPattern: string;
}

interface PatternHistory {
  bullishPatterns: number;
  bearishPatterns: number;
  winRateAfterBullish: number;
  winRateAfterBearish: number;
}

export interface StockProfile {
  symbol: string;
  name: string;
  sector: string;
  characteristics: StockCharacteristics;
  patternHistory: PatternHistory;
  personality: string;
  tradingNotes: string[];
}

const STOCK_INFO: Record<string, { name: string; sector: string; notes: string[] }> = {
  AAPL: { name: 'Apple Inc', sector: 'Technology', notes: ['Highly liquid', 'Respects round numbers', 'Often leads tech sector'] },
  MSFT: { name: 'Microsoft Corp', sector: 'Technology', notes: ['Steady mover', 'Less volatile than peers', 'Strong institutional ownership'] },
  GOOGL: { name: 'Alphabet Inc', sector: 'Technology', notes: ['Can gap significantly on news', 'Wide intraday ranges', 'Follows NASDAQ closely'] },
  AMZN: { name: 'Amazon.com Inc', sector: 'Consumer Discretionary', notes: ['High ATR', 'Momentum stock', 'Sensitive to e-commerce news'] },
  META: { name: 'Meta Platforms', sector: 'Technology', notes: ['Volatile on earnings', 'Social media sentiment matters', 'Can trend strongly'] },
  NVDA: { name: 'NVIDIA Corp', sector: 'Technology', notes: ['AI momentum play', 'Extremely volatile', 'Can move 5%+ intraday'] },
  TSLA: { name: 'Tesla Inc', sector: 'Consumer Discretionary', notes: ['Highly volatile', 'Driven by Musk tweets/news', 'Large retail following', 'Often mean-reverts intraday'] },
  AMD: { name: 'Advanced Micro Devices', sector: 'Technology', notes: ['Follows NVDA', 'High beta', 'Chip sector sensitive'] },
  JPM: { name: 'JPMorgan Chase', sector: 'Financials', notes: ['Bank sector leader', 'Rate sensitive', 'Steady trends'] },
  BAC: { name: 'Bank of America', sector: 'Financials', notes: ['Follows JPM', 'High volume', 'Range-bound often'] },
  XOM: { name: 'Exxon Mobil', sector: 'Energy', notes: ['Oil price correlation', 'Dividend stock behavior', 'Less volatile than tech'] },
  JNJ: { name: 'Johnson & Johnson', sector: 'Healthcare', notes: ['Defensive stock', 'Low volatility', 'Good for range trading'] },
  WMT: { name: 'Walmart Inc', sector: 'Consumer Staples', notes: ['Defensive', 'Steady mover', 'Consumer spending indicator'] },
  DIS: { name: 'Walt Disney Co', sector: 'Communications', notes: ['News driven', 'Streaming wars impact', 'Can gap on earnings'] },
  NFLX: { name: 'Netflix Inc', sector: 'Communications', notes: ['High earnings volatility', 'Subscriber numbers matter', 'Momentum trader favorite'] }
};

function calculateVolatilityProfile(candles: Candle[]): {
  volatility: 'low' | 'medium' | 'high' | 'extreme';
  avgDailyRange: number;
  avgDailyRangePercent: number;
} {
  const ranges = candles.map(c => ((c.high - c.low) / c.open) * 100);
  const avgRangePercent = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const avgDailyRange = candles.map(c => c.high - c.low).reduce((a, b) => a + b, 0) / candles.length;
  
  let volatility: 'low' | 'medium' | 'high' | 'extreme';
  if (avgRangePercent < 1.5) volatility = 'low';
  else if (avgRangePercent < 3) volatility = 'medium';
  else if (avgRangePercent < 5) volatility = 'high';
  else volatility = 'extreme';
  
  return {
    volatility,
    avgDailyRange: Math.round(avgDailyRange * 100) / 100,
    avgDailyRangePercent: Math.round(avgRangePercent * 100) / 100
  };
}

function calculateBeta(stockCandles: Candle[], spyCandles: Candle[]): number {
  if (stockCandles.length !== spyCandles.length || stockCandles.length < 20) return 1;
  
  const stockReturns: number[] = [];
  const spyReturns: number[] = [];
  
  for (let i = 1; i < stockCandles.length; i++) {
    stockReturns.push((stockCandles[i].close - stockCandles[i - 1].close) / stockCandles[i - 1].close);
    spyReturns.push((spyCandles[i].close - spyCandles[i - 1].close) / spyCandles[i - 1].close);
  }
  
  const avgStock = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const avgSpy = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
  
  let covariance = 0;
  let spyVariance = 0;
  
  for (let i = 0; i < stockReturns.length; i++) {
    covariance += (stockReturns[i] - avgStock) * (spyReturns[i] - avgSpy);
    spyVariance += (spyReturns[i] - avgSpy) ** 2;
  }
  
  if (spyVariance === 0) return 1;
  
  return Math.round((covariance / spyVariance) * 100) / 100;
}

function analyzeGapBehavior(candles: Candle[]): 'fills_gaps' | 'extends_gaps' | 'mixed' {
  let gapsFilled = 0;
  let gapsExtended = 0;
  
  for (let i = 1; i < candles.length; i++) {
    const gap = candles[i].open - candles[i - 1].close;
    const gapPercent = Math.abs(gap) / candles[i - 1].close * 100;
    
    if (gapPercent > 0.5) {
      const isGapUp = gap > 0;
      
      if (isGapUp) {
        if (candles[i].low <= candles[i - 1].close) gapsFilled++;
        else if (candles[i].close > candles[i].open) gapsExtended++;
      } else {
        if (candles[i].high >= candles[i - 1].close) gapsFilled++;
        else if (candles[i].close < candles[i].open) gapsExtended++;
      }
    }
  }
  
  const total = gapsFilled + gapsExtended;
  if (total < 5) return 'mixed';
  
  const fillRate = gapsFilled / total;
  if (fillRate > 0.6) return 'fills_gaps';
  if (fillRate < 0.4) return 'extends_gaps';
  return 'mixed';
}

function analyzeTrendBehavior(candles: Candle[]): { trendFollowing: number; meanReverting: number } {
  let followsThrough = 0;
  let reverts = 0;
  
  for (let i = 2; i < candles.length; i++) {
    const prevMove = candles[i - 1].close - candles[i - 2].close;
    const currentMove = candles[i].close - candles[i - 1].close;
    
    if (Math.abs(prevMove) / candles[i - 2].close > 0.005) {
      if (Math.sign(prevMove) === Math.sign(currentMove)) followsThrough++;
      else reverts++;
    }
  }
  
  const total = followsThrough + reverts;
  if (total === 0) return { trendFollowing: 50, meanReverting: 50 };
  
  const trendFollowing = Math.round((followsThrough / total) * 100);
  return { trendFollowing, meanReverting: 100 - trendFollowing };
}

function generatePersonality(
  symbol: string,
  characteristics: StockCharacteristics,
  info: { name: string; sector: string; notes: string[] } | undefined
): string {
  const parts: string[] = [];
  
  parts.push(`${characteristics.volatility} volatility ${info?.sector || 'stock'}`);
  
  if (characteristics.beta > 1.3) parts.push('moves more than market');
  else if (characteristics.beta < 0.7) parts.push('defensive/stable');
  
  if (characteristics.gapBehavior === 'fills_gaps') parts.push('tends to fill gaps');
  else if (characteristics.gapBehavior === 'extends_gaps') parts.push('gaps often continue');
  
  if (characteristics.trendFollowing > 60) parts.push('trend-following');
  else if (characteristics.meanReverting > 60) parts.push('mean-reverting');
  
  return parts.join(', ');
}

export async function getStockProfile(
  symbol: string,
  date: string,
  spyCandles?: Candle[]
): Promise<StockProfile | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('[STOCK-PROFILE] No Polygon API key configured');
    return null;
  }
  
  try {
    const endDate = date;
    const startDateObj = new Date(date);
    startDateObj.setDate(startDateObj.getDate() - 60);
    const startDate = startDateObj.toISOString().split('T')[0];
    
    const candles = await fetchHistoricalBars(apiKey, symbol, startDate, endDate, 'day', 1, 60);
    
    if (candles.length < 20) {
      console.log(`[STOCK-PROFILE] Insufficient data for ${symbol}`);
      return null;
    }
    
    let spyData = spyCandles;
    if (!spyData) {
      spyData = await fetchHistoricalBars(apiKey, 'SPY', startDate, endDate, 'day', 1, 60);
    }
    
    const minLength = Math.min(candles.length, spyData?.length || 0);
    const alignedStock = candles.slice(-minLength);
    const alignedSpy = spyData?.slice(-minLength) || [];
    
    const volatilityProfile = calculateVolatilityProfile(candles);
    const beta = alignedSpy.length > 0 ? calculateBeta(alignedStock, alignedSpy) : 1;
    const gapBehavior = analyzeGapBehavior(candles);
    const trendBehavior = analyzeTrendBehavior(candles);
    
    const info = STOCK_INFO[symbol];
    
    const characteristics: StockCharacteristics = {
      ...volatilityProfile,
      beta,
      gapBehavior,
      trendFollowing: trendBehavior.trendFollowing,
      meanReverting: trendBehavior.meanReverting,
      bestTimeOfDay: 'all_day',
      typicalPattern: volatilityProfile.volatility === 'high' || volatilityProfile.volatility === 'extreme' 
        ? 'breakout' : 'range'
    };
    
    const personality = generatePersonality(symbol, characteristics, info);
    
    return {
      symbol,
      name: info?.name || symbol,
      sector: info?.sector || 'Unknown',
      characteristics,
      patternHistory: {
        bullishPatterns: 0,
        bearishPatterns: 0,
        winRateAfterBullish: 50,
        winRateAfterBearish: 50
      },
      personality,
      tradingNotes: info?.notes || []
    };
  } catch (error) {
    console.error(`[STOCK-PROFILE] Error getting profile for ${symbol}:`, error);
    return null;
  }
}

export function formatStockProfileForAI(profile: StockProfile): string {
  let output = `\nSTOCK PROFILE: ${profile.symbol} (${profile.name})\n`;
  output += '-'.repeat(40) + '\n';
  
  output += `Sector: ${profile.sector}\n`;
  output += `Personality: ${profile.personality}\n\n`;
  
  output += `CHARACTERISTICS:\n`;
  output += `  Volatility: ${profile.characteristics.volatility.toUpperCase()} (avg daily range: ${profile.characteristics.avgDailyRangePercent}%)\n`;
  output += `  Beta: ${profile.characteristics.beta} (${profile.characteristics.beta > 1.2 ? 'more volatile than market' : profile.characteristics.beta < 0.8 ? 'less volatile than market' : 'market-like'})\n`;
  output += `  Gap behavior: ${profile.characteristics.gapBehavior.replace('_', ' ')}\n`;
  output += `  Trend vs Mean-Reversion: ${profile.characteristics.trendFollowing}% trend-following / ${profile.characteristics.meanReverting}% mean-reverting\n\n`;
  
  if (profile.tradingNotes.length > 0) {
    output += `TRADING NOTES:\n`;
    for (const note of profile.tradingNotes) {
      output += `  - ${note}\n`;
    }
  }
  
  return output;
}

const profileCache = new Map<string, { profile: StockProfile; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function getCachedStockProfile(
  symbol: string,
  date: string,
  spyCandles?: Candle[]
): Promise<StockProfile | null> {
  const cacheKey = `${symbol}-${date}`;
  const cached = profileCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.profile;
  }
  
  const profile = await getStockProfile(symbol, date, spyCandles);
  
  if (profile) {
    profileCache.set(cacheKey, { profile, timestamp: Date.now() });
  }
  
  return profile;
}
