import axios from 'axios';
import dotenv from 'dotenv';
import {
  FlexibleBacktestConfig,
  FlexibleTrade,
  FlexibleBacktestResult
} from '../types/flexibleBacktestTypes.js';
import {
  getIntradayBars as getCachedIntradayBars,
  getDailyData as getCachedDailyData,
  CachedBar
} from '../cache/dataCache.js';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

let USE_CACHE = true;

export function setUseCache(value: boolean): void {
  USE_CACHE = value;
}

export const LARGE_CAP_SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
  'JPM', 'V', 'PG', 'XOM', 'HD', 'CVX', 'MA', 'ABBV', 'MRK', 'LLY',
  'PEP', 'KO', 'PFE', 'COST', 'TMO', 'AVGO', 'MCD', 'WMT', 'CSCO', 'ACN',
  'ABT', 'DHR', 'BAC', 'CRM', 'ADBE', 'CMCSA', 'NKE', 'DIS', 'VZ', 'INTC',
  'NFLX', 'PM', 'TXN', 'WFC', 'AMD', 'NEE', 'RTX', 'UPS', 'HON', 'QCOM'
];

interface PolygonBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
  t: number;
}

async function makePolygonRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${POLYGON_BASE_URL}${endpoint}`);
  url.searchParams.append('apiKey', POLYGON_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  const response = await axios.get(url.toString());
  return response.data;
}

async function getIntradayBars(symbol: string, date: string, multiplier: number = 5, timespan: string = 'minute'): Promise<PolygonBar[]> {
  if (USE_CACHE) {
    const cached = await getCachedIntradayBars(symbol, date, true);
    return cached as PolygonBar[];
  }
  
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${date}/${date}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' }
    );
    return data.results || [];
  } catch {
    return [];
  }
}

async function getGroupedDaily(date: string, symbols: string[] = LARGE_CAP_SYMBOLS): Promise<Map<string, { o: number; h: number; l: number; c: number; v: number }>> {
  if (USE_CACHE) {
    const cached = await getCachedDailyData(date, symbols, true);
    const map = new Map<string, { o: number; h: number; l: number; c: number; v: number }>();
    for (const [symbol, data] of cached) {
      map.set(symbol, { o: data.o, h: data.h, l: data.l, c: data.c, v: data.v });
    }
    return map;
  }
  
  try {
    const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: 'true',
      include_otc: 'false'
    });
    const map = new Map<string, { o: number; h: number; l: number; c: number; v: number }>();
    if (data.results) {
      for (const bar of data.results) {
        map.set(bar.T, { o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function isMarketHours(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
}

function getMinutesSinceOpen(timestamp: number): number {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpenMinutes = 14 * 60 + 30;
  return totalMinutes - marketOpenMinutes;
}

function isInTradingWindow(timestamp: number, windowStart: number, windowEnd: number): boolean {
  const minutesSinceOpen = getMinutesSinceOpen(timestamp);
  return minutesSinceOpen >= windowStart && minutesSinceOpen < windowEnd;
}

function calculateVWAP(bars: PolygonBar[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  for (const bar of bars) {
    const typicalPrice = (bar.h + bar.l + bar.c) / 3;
    cumulativeTPV += typicalPrice * bar.v;
    cumulativeVolume += bar.v;
  }
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

function calculateATR(bars: PolygonBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;
  let atrSum = 0;
  for (let i = 1; i <= period; i++) {
    const current = bars[bars.length - i];
    const prev = bars[bars.length - i - 1];
    const tr = Math.max(
      current.h - current.l,
      Math.abs(current.h - prev.c),
      Math.abs(current.l - prev.c)
    );
    atrSum += tr;
  }
  return atrSum / period;
}

function checkEntryCondition(
  config: FlexibleBacktestConfig,
  bar: PolygonBar,
  openPrice: number,
  vwap: number,
  prevHigh: number,
  prevLow: number
): { triggered: boolean; direction: 'long' | 'short'; price: number; reason: string } | null {
  const currentPrice = bar.c;
  
  switch (config.entryStrategy) {
    case 'drop_from_open': {
      const dropPercent = ((openPrice - currentPrice) / openPrice) * 100;
      if (dropPercent >= config.entryThreshold && (config.direction === 'long' || config.direction === 'both')) {
        return { triggered: true, direction: 'long', price: currentPrice, reason: `Drop ${dropPercent.toFixed(1)}% from open` };
      }
      const risePercent = ((currentPrice - openPrice) / openPrice) * 100;
      if (risePercent >= config.entryThreshold && (config.direction === 'short' || config.direction === 'both')) {
        return { triggered: true, direction: 'short', price: currentPrice, reason: `Rise ${risePercent.toFixed(1)}% from open` };
      }
      break;
    }
    
    case 'drop_from_vwap': {
      const dropFromVwap = ((vwap - currentPrice) / vwap) * 100;
      if (dropFromVwap >= config.entryThreshold && (config.direction === 'long' || config.direction === 'both')) {
        return { triggered: true, direction: 'long', price: currentPrice, reason: `${dropFromVwap.toFixed(1)}% below VWAP` };
      }
      const riseFromVwap = ((currentPrice - vwap) / vwap) * 100;
      if (riseFromVwap >= config.entryThreshold && (config.direction === 'short' || config.direction === 'both')) {
        return { triggered: true, direction: 'short', price: currentPrice, reason: `${riseFromVwap.toFixed(1)}% above VWAP` };
      }
      break;
    }
    
    case 'below_vwap': {
      const belowVwap = ((vwap - currentPrice) / vwap) * 100;
      if (belowVwap >= config.entryThreshold && (config.direction === 'long' || config.direction === 'both')) {
        return { triggered: true, direction: 'long', price: currentPrice, reason: `${belowVwap.toFixed(1)}% below VWAP` };
      }
      break;
    }
    
    case 'breakout_high': {
      if (currentPrice > prevHigh && (config.direction === 'long' || config.direction === 'both')) {
        return { triggered: true, direction: 'long', price: currentPrice, reason: `Breakout above ${prevHigh.toFixed(2)}` };
      }
      break;
    }
    
    case 'breakout_low': {
      if (currentPrice < prevLow && (config.direction === 'short' || config.direction === 'both')) {
        return { triggered: true, direction: 'short', price: currentPrice, reason: `Breakdown below ${prevLow.toFixed(2)}` };
      }
      break;
    }
  }
  
  return null;
}

function calculateStopLoss(
  config: FlexibleBacktestConfig,
  entryPrice: number,
  direction: 'long' | 'short',
  intradayLow: number,
  intradayHigh: number,
  atr: number
): number {
  let stopDistance: number;
  
  switch (config.stopLossStrategy) {
    case 'fixed_percent':
      stopDistance = entryPrice * (config.stopLossValue / 100);
      break;
    
    case 'atr_based':
      stopDistance = atr * config.stopLossValue;
      break;
    
    case 'below_low':
      if (direction === 'long') {
        return intradayLow * (1 - 0.001);
      } else {
        return intradayHigh * (1 + 0.001);
      }
    
    case 'trailing':
      stopDistance = entryPrice * (config.stopLossValue / 100);
      break;
    
    default:
      stopDistance = entryPrice * 0.01;
  }
  
  if (direction === 'long') {
    return entryPrice - stopDistance;
  } else {
    return entryPrice + stopDistance;
  }
}

function calculateTarget(
  config: FlexibleBacktestConfig,
  entryPrice: number,
  stopLoss: number,
  direction: 'long' | 'short',
  vwap: number,
  openPrice: number
): number {
  const risk = Math.abs(entryPrice - stopLoss);
  
  switch (config.targetStrategy) {
    case 'fixed_rr':
      if (direction === 'long') {
        return entryPrice + (risk * config.targetValue);
      } else {
        return entryPrice - (risk * config.targetValue);
      }
    
    case 'fixed_percent':
      if (direction === 'long') {
        return entryPrice * (1 + config.targetValue / 100);
      } else {
        return entryPrice * (1 - config.targetValue / 100);
      }
    
    case 'vwap':
      return vwap;
    
    case 'open_price':
      return openPrice;
    
    case 'eod_hold':
      if (direction === 'long') {
        return entryPrice * 1.10;
      } else {
        return entryPrice * 0.90;
      }
    
    default:
      return direction === 'long' ? entryPrice * 1.02 : entryPrice * 0.98;
  }
}

async function simulateTrade(
  symbol: string,
  date: string,
  config: FlexibleBacktestConfig,
  dailyData: { o: number; h: number; l: number; c: number; v: number }
): Promise<FlexibleTrade | null> {
  const bars = await getIntradayBars(symbol, date, 5, 'minute');
  if (!bars || bars.length < 20) return null;
  
  const marketBars = bars.filter(b => isMarketHours(b.t));
  if (marketBars.length < 10) return null;
  
  const openPrice = marketBars[0].o;
  
  if (openPrice < config.minPrice || openPrice > config.maxPrice) return null;
  if (config.minVolume && dailyData.v < config.minVolume) return null;
  
  let entryBar: PolygonBar | null = null;
  let entryIndex = -1;
  let entryCondition: { triggered: boolean; direction: 'long' | 'short'; price: number; reason: string } | null = null;
  let prevHigh = marketBars[0].h;
  let prevLow = marketBars[0].l;
  let intradayLow = marketBars[0].l;
  let intradayHigh = marketBars[0].h;
  
  for (let i = 1; i < marketBars.length; i++) {
    const bar = marketBars[i];
    
    if (!isInTradingWindow(bar.t, config.tradingWindowStart, config.tradingWindowEnd)) {
      prevHigh = Math.max(prevHigh, bar.h);
      prevLow = Math.min(prevLow, bar.l);
      intradayLow = Math.min(intradayLow, bar.l);
      intradayHigh = Math.max(intradayHigh, bar.h);
      continue;
    }
    
    const barsUpToNow = marketBars.slice(0, i + 1);
    const vwap = calculateVWAP(barsUpToNow);
    
    const condition = checkEntryCondition(config, bar, openPrice, vwap, prevHigh, prevLow);
    
    if (condition && condition.triggered) {
      if (config.entryTiming === 'immediate') {
        entryBar = bar;
        entryIndex = i;
        entryCondition = condition;
        break;
      } else if (config.entryTiming === 'candle_close') {
        const confirmCandles = config.confirmationCandles || 1;
        if (i + confirmCandles < marketBars.length) {
          let confirmed = true;
          for (let j = 1; j <= confirmCandles; j++) {
            const confirmBar = marketBars[i + j];
            if (condition.direction === 'long' && confirmBar.c < bar.c) confirmed = false;
            if (condition.direction === 'short' && confirmBar.c > bar.c) confirmed = false;
          }
          if (confirmed) {
            entryBar = marketBars[i + confirmCandles];
            entryIndex = i + confirmCandles;
            entryCondition = condition;
            break;
          }
        }
      } else if (config.entryTiming === 'pullback') {
        for (let j = i + 1; j < Math.min(i + 12, marketBars.length); j++) {
          const pullbackBar = marketBars[j];
          if (condition.direction === 'long' && pullbackBar.l < bar.l * 0.998) {
            entryBar = pullbackBar;
            entryIndex = j;
            entryCondition = { ...condition, price: pullbackBar.c };
            break;
          }
          if (condition.direction === 'short' && pullbackBar.h > bar.h * 1.002) {
            entryBar = pullbackBar;
            entryIndex = j;
            entryCondition = { ...condition, price: pullbackBar.c };
            break;
          }
        }
        if (entryBar) break;
      }
    }
    
    prevHigh = Math.max(prevHigh, bar.h);
    prevLow = Math.min(prevLow, bar.l);
    intradayLow = Math.min(intradayLow, bar.l);
    intradayHigh = Math.max(intradayHigh, bar.h);
  }
  
  if (!entryBar || entryIndex < 0 || !entryCondition) return null;
  
  const slippage = entryCondition.price * (config.slippageBps / 10000);
  const entryPrice = entryCondition.direction === 'long' 
    ? entryCondition.price + slippage 
    : entryCondition.price - slippage;
  
  const barsForATR = marketBars.slice(0, entryIndex + 1);
  const atr = calculateATR(barsForATR);
  
  const stopLoss = calculateStopLoss(config, entryPrice, entryCondition.direction, intradayLow, intradayHigh, atr);
  const barsUpToEntry = marketBars.slice(0, entryIndex + 1);
  const vwapAtEntry = calculateVWAP(barsUpToEntry);
  const target = calculateTarget(config, entryPrice, stopLoss, entryCondition.direction, vwapAtEntry, openPrice);
  
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  const riskAmount = config.positionSize * 0.02;
  const shares = Math.floor(riskAmount / riskPerShare);
  
  if (shares < 1) return null;
  
  const positionValue = shares * entryPrice;
  const riskPercent = (riskPerShare / entryPrice) * 100;
  
  const trade: FlexibleTrade = {
    symbol,
    date,
    direction: entryCondition.direction,
    entryTime: new Date(entryBar.t).toISOString(),
    entryPrice,
    entryReason: entryCondition.reason,
    stopLoss,
    target,
    riskPercent,
    shares,
    positionValue,
    commission: config.commissionPerTrade,
    slippage,
    status: 'filled'
  };
  
  let trailingStop = stopLoss;
  let maxFavorable = entryPrice;
  
  for (let i = entryIndex + 1; i < marketBars.length; i++) {
    const bar = marketBars[i];
    
    if (config.stopLossStrategy === 'trailing') {
      if (entryCondition.direction === 'long') {
        if (bar.h > maxFavorable) {
          maxFavorable = bar.h;
          const profitPercent = ((maxFavorable - entryPrice) / entryPrice) * 100;
          if (profitPercent >= (config.trailingActivation || 0.5)) {
            const newStop = maxFavorable * (1 - (config.trailingDistance || config.stopLossValue) / 100);
            if (newStop > trailingStop) trailingStop = newStop;
          }
        }
      } else {
        if (bar.l < maxFavorable) {
          maxFavorable = bar.l;
          const profitPercent = ((entryPrice - maxFavorable) / entryPrice) * 100;
          if (profitPercent >= (config.trailingActivation || 0.5)) {
            const newStop = maxFavorable * (1 + (config.trailingDistance || config.stopLossValue) / 100);
            if (newStop < trailingStop) trailingStop = newStop;
          }
        }
      }
    }
    
    const effectiveStop = config.stopLossStrategy === 'trailing' ? trailingStop : stopLoss;
    
    if (entryCondition.direction === 'long') {
      if (bar.l <= effectiveStop) {
        trade.exitTime = new Date(bar.t).toISOString();
        trade.exitPrice = effectiveStop;
        trade.exitReason = config.stopLossStrategy === 'trailing' && trailingStop > stopLoss ? 'trailing_stop' : 'stop_loss';
        trade.status = 'closed';
        break;
      }
      if (config.targetStrategy !== 'eod_hold' && bar.h >= target) {
        trade.exitTime = new Date(bar.t).toISOString();
        trade.exitPrice = target;
        trade.exitReason = 'target';
        trade.status = 'closed';
        break;
      }
    } else {
      if (bar.h >= effectiveStop) {
        trade.exitTime = new Date(bar.t).toISOString();
        trade.exitPrice = effectiveStop;
        trade.exitReason = config.stopLossStrategy === 'trailing' && trailingStop < stopLoss ? 'trailing_stop' : 'stop_loss';
        trade.status = 'closed';
        break;
      }
      if (config.targetStrategy !== 'eod_hold' && bar.l <= target) {
        trade.exitTime = new Date(bar.t).toISOString();
        trade.exitPrice = target;
        trade.exitReason = 'target';
        trade.status = 'closed';
        break;
      }
    }
  }
  
  if (trade.status === 'filled') {
    const lastBar = marketBars[marketBars.length - 1];
    trade.exitTime = new Date(lastBar.t).toISOString();
    trade.exitPrice = lastBar.c;
    trade.exitReason = 'eod';
    trade.status = 'closed';
  }
  
  if (trade.exitPrice && trade.status === 'closed') {
    const exitSlippage = trade.exitPrice * (config.slippageBps / 10000);
    const adjustedExitPrice = entryCondition.direction === 'long'
      ? trade.exitPrice - exitSlippage
      : trade.exitPrice + exitSlippage;
    
    const pnlPerShare = entryCondition.direction === 'long'
      ? adjustedExitPrice - entryPrice
      : entryPrice - adjustedExitPrice;
    
    trade.pnl = (pnlPerShare * shares) - (config.commissionPerTrade * 2);
    trade.pnlPercent = (pnlPerShare / entryPrice) * 100;
  }
  
  return trade;
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

export async function runFlexibleBacktest(config: FlexibleBacktestConfig): Promise<FlexibleBacktestResult> {
  console.log('\n=== FLEXIBLE BACKTEST ENGINE ===');
  console.log(`Entry: ${config.entryStrategy} (${config.entryThreshold}%) - ${config.entryTiming}`);
  console.log(`Stop: ${config.stopLossStrategy} (${config.stopLossValue}${config.stopLossStrategy === 'atr_based' ? 'x ATR' : '%'})`);
  console.log(`Target: ${config.targetStrategy} (${config.targetValue}${config.targetStrategy === 'fixed_rr' ? ':1 R:R' : '%'})`);
  console.log(`Direction: ${config.direction}`);
  console.log(`Period: ${config.startDate} to ${config.endDate}`);
  
  const tradingDays = getTradingDays(config.startDate, config.endDate);
  console.log(`Testing ${tradingDays.length} trading days across ${config.symbols.length} symbols\n`);
  
  const allTrades: FlexibleTrade[] = [];
  
  for (const day of tradingDays) {
    const dailyData = await getGroupedDaily(day, config.symbols);
    
    if (dailyData.size === 0) {
      continue;
    }
    
    if (config.useSpyFilter) {
      const spy = dailyData.get('SPY');
      if (spy) {
        const spyChange = ((spy.c - spy.o) / spy.o) * 100;
        if (spyChange < -(config.spyFilterThreshold || 1.5)) {
          continue;
        }
      }
    }
    
    let dailyTrades = 0;
    const candidates: { symbol: string; data: { o: number; h: number; l: number; c: number; v: number } }[] = [];
    
    for (const symbol of config.symbols) {
      const data = dailyData.get(symbol);
      if (data && data.o >= config.minPrice && data.o <= config.maxPrice) {
        candidates.push({ symbol, data });
      }
    }
    
    for (const { symbol, data } of candidates) {
      if (dailyTrades >= config.maxDailyTrades) break;
      
      try {
        const trade = await simulateTrade(symbol, day, config, data);
        
        if (trade && trade.status === 'closed') {
          allTrades.push(trade);
          dailyTrades++;
          
          const emoji = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
          console.log(`${day} ${emoji} ${trade.symbol} ${trade.direction.toUpperCase()}: $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice?.toFixed(2)} (${trade.exitReason}) = $${trade.pnl?.toFixed(2)}`);
        }
        
        if (!USE_CACHE) await new Promise(resolve => setTimeout(resolve, 50));
      } catch {
        continue;
      }
    }
  }
  
  const winners = allTrades.filter(t => t.pnl && t.pnl > 0);
  const losers = allTrades.filter(t => t.pnl && t.pnl <= 0);
  
  const totalPnL = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossProfit = winners.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0));
  
  const avgWin = winners.length > 0 ? grossProfit / winners.length : 0;
  const avgLoss = losers.length > 0 ? grossLoss / losers.length : 0;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;
  
  for (const trade of allTrades) {
    runningPnL += trade.pnl || 0;
    if (runningPnL > peak) peak = runningPnL;
    const drawdown = peak - runningPnL;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  const maxDrawdownPercent = config.positionSize > 0 ? (maxDrawdown / config.positionSize) * 100 : 0;
  
  const avgHoldTime = allTrades.length > 0
    ? allTrades.reduce((sum, t) => {
        if (t.entryTime && t.exitTime) {
          return sum + (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / 60000;
        }
        return sum;
      }, 0) / allTrades.length
    : 0;
  
  const byExitReason = {
    target: { count: 0, pnl: 0 },
    stopLoss: { count: 0, pnl: 0 },
    trailingStop: { count: 0, pnl: 0 },
    eod: { count: 0, pnl: 0 }
  };
  
  for (const trade of allTrades) {
    if (trade.exitReason === 'target') {
      byExitReason.target.count++;
      byExitReason.target.pnl += trade.pnl || 0;
    } else if (trade.exitReason === 'stop_loss') {
      byExitReason.stopLoss.count++;
      byExitReason.stopLoss.pnl += trade.pnl || 0;
    } else if (trade.exitReason === 'trailing_stop') {
      byExitReason.trailingStop.count++;
      byExitReason.trailingStop.pnl += trade.pnl || 0;
    } else if (trade.exitReason === 'eod') {
      byExitReason.eod.count++;
      byExitReason.eod.pnl += trade.pnl || 0;
    }
  }
  
  const monthlyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const trade of allTrades) {
    const month = trade.date.substring(0, 7);
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { trades: 0, wins: 0, pnl: 0 });
    }
    const m = monthlyMap.get(month)!;
    m.trades++;
    m.pnl += trade.pnl || 0;
    if (trade.pnl && trade.pnl > 0) m.wins++;
  }
  
  const monthly = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({
      month,
      trades: stats.trades,
      wins: stats.wins,
      pnl: stats.pnl,
      winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0
    }));
  
  const bySymbol = new Map<string, { trades: number; wins: number; pnl: number; winRate: number }>();
  for (const trade of allTrades) {
    if (!bySymbol.has(trade.symbol)) {
      bySymbol.set(trade.symbol, { trades: 0, wins: 0, pnl: 0, winRate: 0 });
    }
    const s = bySymbol.get(trade.symbol)!;
    s.trades++;
    s.pnl += trade.pnl || 0;
    if (trade.pnl && trade.pnl > 0) s.wins++;
    s.winRate = (s.wins / s.trades) * 100;
  }
  
  const result: FlexibleBacktestResult = {
    config,
    trades: allTrades,
    summary: {
      totalTrades: allTrades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0,
      totalPnL,
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,
      avgRR,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      bestTrade: allTrades.length > 0 ? Math.max(...allTrades.map(t => t.pnl || 0)) : 0,
      worstTrade: allTrades.length > 0 ? Math.min(...allTrades.map(t => t.pnl || 0)) : 0,
      avgHoldTime,
      tradesPerDay: tradingDays.length > 0 ? allTrades.length / tradingDays.length : 0
    },
    byExitReason,
    monthly,
    bySymbol
  };
  
  console.log('\n=== RESULTS ===');
  console.log(`Total Trades: ${result.summary.totalTrades}`);
  console.log(`Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`Total P&L: $${result.summary.totalPnL.toFixed(2)}`);
  console.log(`Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`Avg Win: $${result.summary.avgWin.toFixed(2)} | Avg Loss: $${result.summary.avgLoss.toFixed(2)}`);
  console.log(`Avg R:R: ${result.summary.avgRR.toFixed(2)}`);
  console.log(`Max Drawdown: $${result.summary.maxDrawdown.toFixed(2)} (${result.summary.maxDrawdownPercent.toFixed(1)}%)`);
  console.log(`Avg Hold Time: ${result.summary.avgHoldTime.toFixed(0)} minutes`);
  
  console.log('\n=== BY EXIT REASON ===');
  console.log(`Target: ${byExitReason.target.count} trades, $${byExitReason.target.pnl.toFixed(2)}`);
  console.log(`Stop Loss: ${byExitReason.stopLoss.count} trades, $${byExitReason.stopLoss.pnl.toFixed(2)}`);
  console.log(`Trailing Stop: ${byExitReason.trailingStop.count} trades, $${byExitReason.trailingStop.pnl.toFixed(2)}`);
  console.log(`EOD: ${byExitReason.eod.count} trades, $${byExitReason.eod.pnl.toFixed(2)}`);
  
  console.log('\n=== MONTHLY ===');
  for (const m of monthly) {
    console.log(`${m.month} | ${m.trades} trades | ${m.winRate.toFixed(0)}% WR | $${m.pnl.toFixed(2)}`);
  }
  
  return result;
}
