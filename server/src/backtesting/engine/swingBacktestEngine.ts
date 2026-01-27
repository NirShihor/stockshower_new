import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const client = new Anthropic();

interface DailyBar {
  symbol: string;
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface SwingCandidate {
  symbol: string;
  currentPrice: number;
  dailyChange: number;
  weeklyChange: number;
  monthlyChange: number;
  trend: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down';
  volumeRatio: number;
  atr: number;
  atrPercent: number;
  priceVsEma20: number;
  priceVsEma50: number;
  nearSupport: boolean;
  nearResistance: boolean;
  setup: string;
}

interface SwingRecommendation {
  symbol: string;
  direction: 'long' | 'short';
  confidence: 'high' | 'medium';
  reasoning: string;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  expectedDays: number;
  riskRewardRatio: number;
  rank: number;
}

interface SwingTrade {
  symbol: string;
  entryDate: string;
  exitDate: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  exitPrice: number;
  exitReason: 'target_hit' | 'stop_hit' | 'time_exit';
  daysHeld: number;
  pnl: number;
  pnlPercent: number;
  confidence: string;
  reasoning: string;
}

interface SwingBacktestConfig {
  startDate: string;
  endDate: string;
  symbols: string[];
  maxHoldDays: number;
  positionSize: number;
  maxConcurrentTrades: number;
  maxDailyTrades: number;
  useAI: boolean;
  stopLossPercent: number;
  targetPercent: number;
}

interface SwingBacktestResult {
  config: SwingBacktestConfig;
  trades: SwingTrade[];
  summary: {
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    totalPnL: number;
    avgPnlPerTrade: number;
    avgDaysHeld: number;
    profitFactor: number;
    maxDrawdown: number;
    targetHits: number;
    stopHits: number;
    timeExits: number;
  };
  monthly: Array<{ month: string; trades: number; winRate: number; pnl: number }>;
}

const CACHE_DIR = path.resolve(process.cwd(), 'data_cache');
const DAILY_DIR = path.join(CACHE_DIR, 'daily');

function loadDailyCache(date: string): Map<string, DailyBar> {
  const cachePath = path.join(DAILY_DIR, `${date}.json`);
  const result = new Map<string, DailyBar>();
  
  if (fs.existsSync(cachePath)) {
    const data: DailyBar[] = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    for (const bar of data) {
      result.set(bar.symbol, bar);
    }
  }
  
  return result;
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

function getHistoricalBars(symbol: string, endDate: string, lookback: number, allDays: string[]): DailyBar[] {
  const endIdx = allDays.indexOf(endDate);
  if (endIdx < 0) return [];
  
  const bars: DailyBar[] = [];
  const startIdx = Math.max(0, endIdx - lookback + 1);
  
  for (let i = startIdx; i <= endIdx; i++) {
    const dayData = loadDailyCache(allDays[i]);
    const bar = dayData.get(symbol);
    if (bar) bars.push(bar);
  }
  
  return bars;
}

function calculateEma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] || 0;
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((sum, c) => sum + c, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateAtr(bars: DailyBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c)
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function detectTrend(bars: DailyBar[]): SwingCandidate['trend'] {
  if (bars.length < 20) return 'neutral';
  
  const closes = bars.map(b => b.c);
  const ema20 = calculateEma(closes, 20);
  const ema50 = calculateEma(closes, 50);
  const current = closes[closes.length - 1];
  
  const aboveEma20 = current > ema20;
  const aboveEma50 = current > ema50;
  const ema20AboveEma50 = ema20 > ema50;
  
  const recent5 = bars.slice(-5);
  const higherHighs = recent5.filter((c, i) => i > 0 && c.h > recent5[i - 1].h).length;
  const lowerLows = recent5.filter((c, i) => i > 0 && c.l < recent5[i - 1].l).length;
  
  if (aboveEma20 && aboveEma50 && ema20AboveEma50 && higherHighs >= 3) return 'strong_up';
  if (aboveEma20 && aboveEma50) return 'up';
  if (!aboveEma20 && !aboveEma50 && !ema20AboveEma50 && lowerLows >= 3) return 'strong_down';
  if (!aboveEma20 && !aboveEma50) return 'down';
  return 'neutral';
}

function detectSetup(bars: DailyBar[], trend: string): string {
  if (bars.length < 5) return 'no_clear_setup';
  
  const closes = bars.map(b => b.c);
  const current = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const ema20 = calculateEma(closes, 20);
  const priceNearEma = Math.abs(current.c - ema20) / ema20 < 0.02;
  
  if (trend === 'up' || trend === 'strong_up') {
    if (priceNearEma && current.c > current.o) return 'pullback_to_ema20_bounce';
    if (current.c > prev.h && current.v > prev.v * 1.5) return 'breakout_with_volume';
  }
  
  if (trend === 'down' || trend === 'strong_down') {
    if (priceNearEma && current.c < current.o) return 'rally_to_ema20_rejection';
    if (current.c < prev.l && current.v > prev.v * 1.5) return 'breakdown_with_volume';
  }
  
  const bodySize = Math.abs(current.c - current.o);
  const totalRange = current.h - current.l;
  if (totalRange > 0 && bodySize / totalRange < 0.3) {
    if (current.c > current.o) return 'hammer_doji';
    return 'shooting_star_doji';
  }
  
  return 'no_clear_setup';
}

function buildCandidates(date: string, symbols: string[], allDays: string[]): SwingCandidate[] {
  const candidates: SwingCandidate[] = [];
  const currentData = loadDailyCache(date);
  
  for (const symbol of symbols) {
    const current = currentData.get(symbol);
    if (!current) continue;
    
    const bars = getHistoricalBars(symbol, date, 60, allDays);
    if (bars.length < 30) continue;
    
    const prev = bars[bars.length - 2];
    const fiveDaysAgo = bars[bars.length - 6] || bars[0];
    const twentyDaysAgo = bars[bars.length - 21] || bars[0];
    
    const dailyChange = ((current.c - prev.c) / prev.c) * 100;
    const weeklyChange = ((current.c - fiveDaysAgo.c) / fiveDaysAgo.c) * 100;
    const monthlyChange = ((current.c - twentyDaysAgo.c) / twentyDaysAgo.c) * 100;
    
    const closes = bars.map(b => b.c);
    const ema20 = calculateEma(closes, 20);
    const ema50 = calculateEma(closes, 50);
    const atr = calculateAtr(bars, 14);
    
    const avgVolume = bars.slice(-20).reduce((sum, b) => sum + b.v, 0) / 20;
    const volumeRatio = current.v / avgVolume;
    
    const recent20 = bars.slice(-20);
    const support = Math.min(...recent20.map(b => b.l));
    const resistance = Math.max(...recent20.map(b => b.h));
    const nearSupport = (current.c - support) / current.c < 0.03;
    const nearResistance = (resistance - current.c) / current.c < 0.03;
    
    const trend = detectTrend(bars);
    const setup = detectSetup(bars, trend);
    
    candidates.push({
      symbol,
      currentPrice: current.c,
      dailyChange: Math.round(dailyChange * 100) / 100,
      weeklyChange: Math.round(weeklyChange * 100) / 100,
      monthlyChange: Math.round(monthlyChange * 100) / 100,
      trend,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      atr: Math.round(atr * 100) / 100,
      atrPercent: Math.round((atr / current.c) * 10000) / 100,
      priceVsEma20: Math.round(((current.c - ema20) / ema20) * 10000) / 100,
      priceVsEma50: Math.round(((current.c - ema50) / ema50) * 10000) / 100,
      nearSupport,
      nearResistance,
      setup
    });
  }
  
  return candidates;
}

function formatCandidatesForAI(candidates: SwingCandidate[]): string {
  const withSetups = candidates.filter(c => c.setup !== 'no_clear_setup');
  const strongTrends = candidates.filter(c => c.trend === 'strong_up' || c.trend === 'strong_down');
  
  let prompt = `SWING TRADE CANDIDATES (${candidates.length} total)\n${'='.repeat(60)}\n\n`;
  
  prompt += `CANDIDATES WITH SETUPS (${withSetups.length}):\n`;
  prompt += '-'.repeat(60) + '\n';
  
  for (const c of withSetups.slice(0, 30)) {
    prompt += `\n${c.symbol} - $${c.currentPrice.toFixed(2)}\n`;
    prompt += `  Trend: ${c.trend.toUpperCase()} | Setup: ${c.setup}\n`;
    prompt += `  Daily: ${c.dailyChange >= 0 ? '+' : ''}${c.dailyChange}% | Week: ${c.weeklyChange >= 0 ? '+' : ''}${c.weeklyChange}% | Month: ${c.monthlyChange >= 0 ? '+' : ''}${c.monthlyChange}%\n`;
    prompt += `  vs EMA20: ${c.priceVsEma20 >= 0 ? '+' : ''}${c.priceVsEma20}% | vs EMA50: ${c.priceVsEma50 >= 0 ? '+' : ''}${c.priceVsEma50}%\n`;
    prompt += `  ATR: $${c.atr} (${c.atrPercent}%) | Volume: ${c.volumeRatio}x avg\n`;
    prompt += `  Near Support: ${c.nearSupport ? 'YES' : 'no'} | Near Resistance: ${c.nearResistance ? 'YES' : 'no'}\n`;
  }
  
  if (strongTrends.length > 0) {
    prompt += `\n\nSTRONG TREND STOCKS (${strongTrends.length}):\n`;
    prompt += '-'.repeat(60) + '\n';
    for (const c of strongTrends.filter(c => !withSetups.includes(c)).slice(0, 10)) {
      prompt += `${c.symbol}: ${c.trend} | Week: ${c.weeklyChange >= 0 ? '+' : ''}${c.weeklyChange}% | Month: ${c.monthlyChange >= 0 ? '+' : ''}${c.monthlyChange}%\n`;
    }
  }
  
  return prompt;
}

function getSwingSystemPrompt(): string {
  return `You are an experienced swing trader who holds positions for 2-5 days. You focus on high-probability setups where the daily trend, weekly trend align.

YOUR SWING TRADING RULES:

1. TREND ALIGNMENT (Required):
   - For LONGS: Daily trend UP or STRONG_UP, price above EMA20 and EMA50
   - For SHORTS: Daily trend DOWN or STRONG_DOWN, price below EMA20 and EMA50
   - Never counter-trend trade

2. SECTOR AWARENESS (Optional):
   - Consider sector momentum as additional context
   - Stronger sectors favor longs, weaker sectors favor shorts
   - But don't let sector alone disqualify a good setup

3. SETUPS YOU LOOK FOR:
   - Pullback to EMA20 in uptrend (buy the dip)
   - Rally to EMA20 in downtrend (short the rip)
   - Breakout with volume (continuation)
   - Breakdown with volume (continuation)

4. RISK MANAGEMENT:
   - Stop loss: 1-2x ATR from entry
   - Target: 2-3x ATR (minimum 1:2 risk/reward)
   - Position held 2-5 days typically
   - Exit at target OR after 5 days max

5. AVOID:
   - Neutral/choppy trends
   - Stocks extended far from EMAs (>5%)
   - Low volume moves

RESPONSE FORMAT (JSON only):
{
  "recommendations": [
    {
      "symbol": "AAPL",
      "direction": "long",
      "confidence": "high",
      "reasoning": "2-3 sentences on why this setup works",
      "entry": 185.00,
      "stopLoss": 180.00,
      "target1": 193.00,
      "target2": 198.00,
      "expectedDays": 3,
      "riskRewardRatio": 2.5,
      "rank": 1
    }
  ]
}

Select 3-5 swing trades maximum. Be extremely selective - only the highest probability setups with perfect trend alignment. Quality over quantity. Most days should have 0-3 recommendations. Skip the day entirely if market conditions are unfavorable.`;
}

async function getAIRecommendations(candidates: SwingCandidate[]): Promise<SwingRecommendation[]> {
  if (candidates.length === 0) return [];
  
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: getSwingSystemPrompt(),
      messages: [{ role: 'user', content: formatCandidatesForAI(candidates) }]
    });
    
    const content = response.content[0];
    if (content.type !== 'text') return [];
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.recommendations || [];
  } catch (error) {
    console.error('AI recommendation error:', error);
    return [];
  }
}

function getRuleBasedRecommendations(candidates: SwingCandidate[], config: SwingBacktestConfig): SwingRecommendation[] {
  const recommendations: SwingRecommendation[] = [];
  
  const withSetups = candidates.filter(c => 
    c.setup !== 'no_clear_setup' &&
    (c.trend === 'strong_up' || c.trend === 'strong_down') &&
    Math.abs(c.priceVsEma20) < 3 &&
    c.volumeRatio > 0.8
  );
  
  for (const c of withSetups.slice(0, Math.min(5, config.maxDailyTrades))) {
    const isLong = c.trend === 'up' || c.trend === 'strong_up';
    const direction: 'long' | 'short' = isLong ? 'long' : 'short';
    
    const stopDistance = c.atr * 1.5;
    const targetDistance = c.atr * 3;
    
    const entry = c.currentPrice;
    const stopLoss = isLong ? entry - stopDistance : entry + stopDistance;
    const target1 = isLong ? entry + targetDistance : entry - targetDistance;
    const target2 = isLong ? entry + targetDistance * 1.5 : entry - targetDistance * 1.5;
    
    recommendations.push({
      symbol: c.symbol,
      direction,
      confidence: c.trend.startsWith('strong') ? 'high' : 'medium',
      reasoning: `${c.setup} in ${c.trend} trend`,
      entry,
      stopLoss,
      target1,
      target2,
      expectedDays: 3,
      riskRewardRatio: targetDistance / stopDistance,
      rank: recommendations.length + 1
    });
  }
  
  return recommendations;
}

function simulateTrade(
  rec: SwingRecommendation,
  entryDate: string,
  allDays: string[],
  maxDays: number
): SwingTrade | null {
  const entryIdx = allDays.indexOf(entryDate);
  if (entryIdx < 0 || entryIdx >= allDays.length - 1) return null;
  
  const nextDay = allDays[entryIdx + 1];
  const nextDayData = loadDailyCache(nextDay);
  const entryBar = nextDayData.get(rec.symbol);
  if (!entryBar) return null;
  
  const actualEntry = entryBar.o;
  const riskAmount = Math.abs(rec.entry - rec.stopLoss);
  const targetDistance = Math.abs(rec.target1 - rec.entry);
  
  let actualStop: number;
  let actualTarget: number;
  
  if (rec.direction === 'long') {
    actualStop = actualEntry - riskAmount;
    actualTarget = actualEntry + targetDistance;
  } else {
    actualStop = actualEntry + riskAmount;
    actualTarget = actualEntry - targetDistance;
  }
  
  let exitPrice = actualEntry;
  let exitReason: SwingTrade['exitReason'] = 'time_exit';
  let exitDate = nextDay;
  let daysHeld = 0;
  
  for (let i = entryIdx + 1; i < Math.min(entryIdx + maxDays + 1, allDays.length); i++) {
    const day = allDays[i];
    const dayData = loadDailyCache(day);
    const bar = dayData.get(rec.symbol);
    if (!bar) continue;
    
    daysHeld++;
    exitDate = day;
    
    if (rec.direction === 'long') {
      if (bar.l <= actualStop) {
        exitPrice = actualStop;
        exitReason = 'stop_hit';
        break;
      }
      if (bar.h >= actualTarget) {
        exitPrice = actualTarget;
        exitReason = 'target_hit';
        break;
      }
    } else {
      if (bar.h >= actualStop) {
        exitPrice = actualStop;
        exitReason = 'stop_hit';
        break;
      }
      if (bar.l <= actualTarget) {
        exitPrice = actualTarget;
        exitReason = 'target_hit';
        break;
      }
    }
    
    exitPrice = bar.c;
  }
  
  const pnlPercent = rec.direction === 'long'
    ? ((exitPrice - actualEntry) / actualEntry) * 100
    : ((actualEntry - exitPrice) / actualEntry) * 100;
  
  return {
    symbol: rec.symbol,
    entryDate: nextDay,
    exitDate,
    direction: rec.direction,
    entry: actualEntry,
    stopLoss: actualStop,
    target: actualTarget,
    exitPrice,
    exitReason,
    daysHeld,
    pnl: pnlPercent * 100,
    pnlPercent: Math.round(pnlPercent * 100) / 100,
    confidence: rec.confidence,
    reasoning: rec.reasoning
  };
}

export async function runSwingBacktest(config: SwingBacktestConfig): Promise<SwingBacktestResult> {
  console.log('\n=== SWING TRADING BACKTEST ===');
  console.log(`Period: ${config.startDate} to ${config.endDate}`);
  console.log(`Symbols: ${config.symbols.length}`);
  console.log(`Max Hold Days: ${config.maxHoldDays}`);
  console.log(`Using AI: ${config.useAI}`);
  console.log('');
  
  const allDays = getTradingDays(config.startDate, config.endDate);
  console.log(`Trading days: ${allDays.length}`);
  
  const allTrades: SwingTrade[] = [];
  const activePositions = new Set<string>();
  
  for (let dayIdx = 60; dayIdx < allDays.length - config.maxHoldDays; dayIdx++) {
    const date = allDays[dayIdx];
    
    if (activePositions.size >= config.maxConcurrentTrades) continue;
    
    const dayData = loadDailyCache(date);
    const spy = dayData.get('SPY');
    if (spy) {
      const spyChange = ((spy.c - spy.o) / spy.o) * 100;
      if (spyChange < -2) {
        console.log(`${date} ⏸️ Skipping - SPY down ${spyChange.toFixed(1)}% (market crash filter)`);
        continue;
      }
    }
    
    const candidates = buildCandidates(date, config.symbols, allDays);
    if (candidates.length === 0) continue;
    
    let recommendations: SwingRecommendation[];
    if (config.useAI) {
      recommendations = await getAIRecommendations(candidates);
      await new Promise(r => setTimeout(r, 500));
    } else {
      recommendations = getRuleBasedRecommendations(candidates, config);
    }
    
    const availableSlots = config.maxConcurrentTrades - activePositions.size;
    const toExecute = recommendations
      .filter(r => !activePositions.has(r.symbol) && r.confidence === 'high')
      .slice(0, Math.min(availableSlots, 5));
    
    for (const rec of toExecute) {
      const trade = simulateTrade(rec, date, allDays, config.maxHoldDays);
      if (trade) {
        allTrades.push(trade);
        activePositions.add(rec.symbol);
        
        setTimeout(() => activePositions.delete(rec.symbol), trade.daysHeld * 24 * 60 * 60 * 1000);
        
        const emoji = trade.pnlPercent > 0 ? '✅' : '❌';
        console.log(`${date} ${emoji} ${trade.symbol} ${trade.direction}: ${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent}% (${trade.exitReason}, ${trade.daysHeld}d)`);
      }
    }
    
    activePositions.clear();
  }
  
  const winners = allTrades.filter(t => t.pnlPercent > 0);
  const losers = allTrades.filter(t => t.pnlPercent <= 0);
  const totalPnL = allTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgDaysHeld = allTrades.length > 0
    ? allTrades.reduce((sum, t) => sum + t.daysHeld, 0) / allTrades.length
    : 0;
  
  const grossProfit = winners.reduce((sum, t) => sum + t.pnlPercent, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;
  for (const trade of allTrades) {
    runningPnL += trade.pnlPercent;
    if (runningPnL > peak) peak = runningPnL;
    const dd = peak - runningPnL;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  
  const targetHits = allTrades.filter(t => t.exitReason === 'target_hit').length;
  const stopHits = allTrades.filter(t => t.exitReason === 'stop_hit').length;
  const timeExits = allTrades.filter(t => t.exitReason === 'time_exit').length;
  
  const monthlyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const trade of allTrades) {
    const month = trade.entryDate.substring(0, 7);
    if (!monthlyMap.has(month)) monthlyMap.set(month, { trades: 0, wins: 0, pnl: 0 });
    const m = monthlyMap.get(month)!;
    m.trades++;
    m.pnl += trade.pnlPercent;
    if (trade.pnlPercent > 0) m.wins++;
  }
  
  const monthly = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({
      month,
      trades: stats.trades,
      winRate: stats.trades > 0 ? Math.round((stats.wins / stats.trades) * 100) : 0,
      pnl: Math.round(stats.pnl * 100) / 100
    }));
  
  const result: SwingBacktestResult = {
    config,
    trades: allTrades,
    summary: {
      totalTrades: allTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: allTrades.length > 0 ? Math.round((winners.length / allTrades.length) * 100) : 0,
      totalPnL: Math.round(totalPnL * 100) / 100,
      avgPnlPerTrade: allTrades.length > 0 ? Math.round((totalPnL / allTrades.length) * 100) / 100 : 0,
      avgDaysHeld: Math.round(avgDaysHeld * 10) / 10,
      profitFactor: Math.round(profitFactor * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      targetHits,
      stopHits,
      timeExits
    },
    monthly
  };
  
  console.log('\n=== SWING BACKTEST RESULTS ===');
  console.log(`Total Trades: ${result.summary.totalTrades}`);
  console.log(`Win Rate: ${result.summary.winRate}%`);
  console.log(`Total P&L: ${result.summary.totalPnL}%`);
  console.log(`Avg P&L/Trade: ${result.summary.avgPnlPerTrade}%`);
  console.log(`Profit Factor: ${result.summary.profitFactor}`);
  console.log(`Avg Days Held: ${result.summary.avgDaysHeld}`);
  console.log(`Max Drawdown: ${result.summary.maxDrawdown}%`);
  console.log(`\nExit Reasons: Target ${targetHits} | Stop ${stopHits} | Time ${timeExits}`);
  
  console.log('\n=== MONTHLY ===');
  for (const m of monthly) {
    console.log(`${m.month} | ${m.trades} trades | ${m.winRate}% WR | ${m.pnl >= 0 ? '+' : ''}${m.pnl}%`);
  }
  
  return result;
}

export const SWING_SYMBOLS = [
  'AAPL', 'ABNB', 'ADBE', 'ADI', 'ADP', 'ADSK', 'AFRM', 'AKAM', 'ALGN', 'ALNY',
  'AMAT', 'AMD', 'AMGN', 'AMZN', 'APP', 'ARGX', 'ARM', 'ASML', 'AVGO', 'AXON',
  'BIDU', 'BIIB', 'BILI', 'BKR', 'BMRN', 'BNTX',
  'CDNS', 'CDW', 'CHKP', 'CHRW', 'CHTR', 'CME', 'CMCSA', 'COIN', 'COST', 'CPRT',
  'CRWD', 'CSCO', 'CSGP', 'CSX', 'CTAS', 'CTSH',
  'DASH', 'DDOG', 'DKNG', 'DLTR', 'DOCU', 'DXCM',
  'EA', 'EBAY', 'ENPH', 'EQIX', 'EXAS',
  'FANG', 'FAST', 'FISV', 'FTNT',
  'GEN', 'GFS', 'GILD', 'GOOG', 'GOOGL',
  'HBAN', 'HOLX', 'HON', 'HOOD',
  'IDXX', 'ILMN', 'INCY', 'INTC', 'INTU', 'ISRG',
  'JD',
  'KDP', 'KHC', 'KLAC',
  'LCID', 'LRCX', 'LULU', 'LYFT',
  'MAR', 'MARA', 'MCHP', 'MDLZ', 'MELI', 'META', 'MNST', 'MRNA', 'MRVL', 'MSFT',
  'MSTR', 'MTCH', 'MU',
  'NFLX', 'NTES', 'NTAP', 'NTNX', 'NVAX', 'NVDA', 'NXPI',
  'ODFL', 'OKTA', 'ON', 'ORLY',
  'PANW', 'PAYX', 'PCAR', 'PDD', 'PEP', 'PLTR', 'PLUG', 'PYPL',
  'QCOM',
  'REGN', 'RIOT', 'RIVN', 'RKLB', 'ROKU', 'ROP', 'ROST',
  'SBUX', 'SEDG', 'SHOP', 'SMCI', 'SNPS', 'SOFI', 'SPLK', 'SSNC', 'STX', 'SWKS',
  'TEAM', 'TER', 'TMUS', 'TSLA', 'TTD', 'TTWO', 'TXN',
  'UAL', 'ULTA',
  'VRSK', 'VRSN', 'VRTX',
  'WDAY', 'WDC',
  'XEL',
  'ZM', 'ZS',
  'JNJ', 'JPM', 'V', 'PG', 'HD', 'MA', 'BAC', 'WMT', 'DIS', 'KO',
  'PFE', 'MRK', 'UNH', 'CVX', 'XOM', 'VZ', 'T', 'MMM', 'CAT', 'BA',
  'IBM', 'GE', 'GM', 'F', 'CRM', 'RTX', 'DHR', 'BSX', 'NKE', 'ABT',
  'TMO', 'WFC', 'GS', 'MS', 'AXP', 'LLY', 'ABBV', 'COP', 'SLB', 'OXY',
  'UNP', 'DE', 'LMT', 'MCD'
];
