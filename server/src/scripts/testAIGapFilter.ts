import { 
  backtestGapAndGo, 
  analyzeGapAndGoSetup,
  simulateGapAndGoTrade,
  GapAndGoCandidate,
  GapAndGoTrade,
  BacktestResult
} from '../momentum/gapAndGoStrategy.js';
import { scoreGapCandidate, AIGapScore } from '../services/aiGapFilter.js';
import fs from 'fs';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface AIBacktestTrade extends GapAndGoTrade {
  aiScore?: number;
  aiConfidence?: string;
  aiReasoning?: string;
}

interface AIBacktestResult {
  config: any;
  trades: AIBacktestTrade[];
  skippedTrades: AIBacktestTrade[];
  summary: {
    totalCandidates: number;
    aiApproved: number;
    aiRejected: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    bestTrade: number;
    worstTrade: number;
    skippedPnL: number;
    skippedWinRate: number;
  };
  monthlyPerformance: { month: string; trades: number; pnl: number; winRate: number }[];
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

async function getGroupedDaily(date: string): Promise<Map<string, { o: number; c: number }>> {
  try {
    const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: 'true',
      include_otc: 'false'
    });
    
    const map = new Map<string, { o: number; c: number }>();
    if (data.results) {
      for (const bar of data.results) {
        map.set(bar.T, { o: bar.o, c: bar.c });
      }
    }
    return map;
  } catch (error) {
    return new Map();
  }
}

async function getTickerDetails(symbol: string): Promise<{ float?: number } | null> {
  try {
    const data = await makePolygonRequest(`/v3/reference/tickers/${symbol}`);
    if (data.results) {
      return {
        float: data.results.weighted_shares_outstanding || data.results.share_class_shares_outstanding
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function getIntradayBars(symbol: string, date: string): Promise<any[]> {
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/ticker/${symbol}/range/1/minute/${date}/${date}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' }
    );
    return data.results || [];
  } catch (error) {
    return [];
  }
}

function isPremarketBeforeCutoff(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 9 * 60 && totalMinutes < 14 * 60 + 25;
}

async function getPremarketLastPrice(symbol: string, date: string): Promise<number | null> {
  try {
    const bars = await getIntradayBars(symbol, date);
    if (!bars || bars.length === 0) return null;
    
    const premarketBars = bars.filter((b: any) => isPremarketBeforeCutoff(b.t));
    if (premarketBars.length === 0) return null;
    
    return premarketBars[premarketBars.length - 1].c;
  } catch {
    return null;
  }
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

async function runAIBacktest(config: {
  startDate: string;
  endDate: string;
  positionSize: number;
  maxDailyTrades: number;
  minScore: number;
  minGapPercent: number;
  maxGapPercent: number;
  minPrice: number;
  maxPrice: number;
  maxFloat?: number;
  delayedEntry?: boolean;
  aiMinScore: number;
}): Promise<AIBacktestResult> {
  console.log('\n=== AI-FILTERED GAP AND GO BACKTEST ===');
  console.log('Config:', config);
  
  const tradingDays = getTradingDays(config.startDate, config.endDate);
  console.log(`Testing ${tradingDays.length} trading days`);
  
  const allTrades: AIBacktestTrade[] = [];
  const skippedTrades: AIBacktestTrade[] = [];
  let totalCandidates = 0;
  let aiApproved = 0;
  let aiRejected = 0;
  
  let previousDayData: Map<string, { o: number; c: number }> = new Map();
  
  for (let i = 1; i < tradingDays.length; i++) {
    const today = tradingDays[i];
    const yesterday = tradingDays[i - 1];
    
    console.log(`\nProcessing ${today}...`);
    
    if (previousDayData.size === 0) {
      previousDayData = await getGroupedDaily(yesterday);
    }
    
    const todayData = await getGroupedDaily(today);
    
    if (todayData.size === 0) {
      console.log(`  No data for ${today}, skipping`);
      previousDayData = todayData;
      continue;
    }
    
    const candidates: { symbol: string; gapPercent: number; premarketPrice: number; prevClose: number }[] = [];
    const potentialGappers: { symbol: string; prevClose: number }[] = [];
    
    for (const [symbol, bar] of todayData) {
      const prevBar = previousDayData.get(symbol);
      if (!prevBar) continue;
      
      const roughGap = ((bar.o - prevBar.c) / prevBar.c) * 100;
      if (roughGap >= config.minGapPercent * 0.7 && 
          roughGap <= config.maxGapPercent * 1.3 &&
          bar.o >= config.minPrice * 0.8 &&
          bar.o <= config.maxPrice * 1.2) {
        potentialGappers.push({ symbol, prevClose: prevBar.c });
      }
    }
    
    for (const { symbol, prevClose } of potentialGappers.slice(0, 20)) {
      const premarketPrice = await getPremarketLastPrice(symbol, today);
      if (!premarketPrice) continue;
      
      const gapPercent = ((premarketPrice - prevClose) / prevClose) * 100;
      
      if (gapPercent >= config.minGapPercent && 
          gapPercent <= config.maxGapPercent &&
          premarketPrice >= config.minPrice &&
          premarketPrice <= config.maxPrice) {
        candidates.push({ symbol, gapPercent, premarketPrice, prevClose });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    candidates.sort((a, b) => b.gapPercent - a.gapPercent);
    const topCandidates = candidates.slice(0, 10);
    
    console.log(`  Found ${candidates.length} gap candidates, analyzing top ${topCandidates.length}`);
    
    let dailyTrades = 0;
    
    for (const cand of topCandidates) {
      if (dailyTrades >= config.maxDailyTrades) break;
      
      try {
        const details = await getTickerDetails(cand.symbol);
        const float = details?.float;
        
        if (config.maxFloat && float && float > config.maxFloat) {
          continue;
        }
        
        const setup = await analyzeGapAndGoSetup(cand.symbol, today, cand.prevClose, float);
        
        if (!setup || setup.score < config.minScore) {
          continue;
        }
        
        totalCandidates++;
        
        // AI SCORING
        console.log(`  🤖 AI evaluating ${setup.symbol}...`);
        const aiScore = await scoreGapCandidate(setup);
        
        console.log(`     Score: ${aiScore.score}/10 | ${aiScore.take ? 'TAKE' : 'SKIP'} | ${aiScore.confidence} | ${aiScore.reasoning}`);
        
        // Simulate the trade regardless (to track what we would have missed)
        const trade = await simulateGapAndGoTrade(setup, config.positionSize, config.delayedEntry || false);
        
        if (trade && trade.status === 'closed') {
          const aiTrade: AIBacktestTrade = {
            ...trade,
            aiScore: aiScore.score,
            aiConfidence: aiScore.confidence,
            aiReasoning: aiScore.reasoning
          };
          
          if (aiScore.score >= config.aiMinScore) {
            aiApproved++;
            allTrades.push(aiTrade);
            dailyTrades++;
            
            const emoji = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
            console.log(`  ${emoji} TOOK: ${trade.symbol}: Entry $${trade.entryPrice.toFixed(2)} -> Exit $${trade.exitPrice?.toFixed(2)} (${trade.exitReason}) = $${trade.pnl?.toFixed(2)}`);
          } else {
            aiRejected++;
            skippedTrades.push(aiTrade);
            
            const emoji = trade.pnl && trade.pnl > 0 ? '💚' : '💔';
            console.log(`  ${emoji} SKIPPED: ${trade.symbol}: Would have been $${trade.pnl?.toFixed(2)}`);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.warn(`  Error processing ${cand.symbol}:`, error);
      }
    }
    
    previousDayData = todayData;
  }
  
  // Calculate summary
  const winners = allTrades.filter(t => t.pnl && t.pnl > 0);
  const losers = allTrades.filter(t => t.pnl && t.pnl <= 0);
  
  const totalPnL = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + (t.pnl || 0), 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0) / losers.length) : 0;
  
  const grossProfit = winners.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0));
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
  
  // Skipped trade stats
  const skippedWinners = skippedTrades.filter(t => t.pnl && t.pnl > 0);
  const skippedPnL = skippedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const skippedWinRate = skippedTrades.length > 0 ? (skippedWinners.length / skippedTrades.length) * 100 : 0;
  
  // Monthly breakdown
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
  
  const monthlyPerformance = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({
      month,
      trades: stats.trades,
      pnl: stats.pnl,
      winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0
    }));
  
  const result: AIBacktestResult = {
    config,
    trades: allTrades,
    skippedTrades,
    summary: {
      totalCandidates,
      aiApproved,
      aiRejected,
      totalTrades: allTrades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      bestTrade: allTrades.length > 0 ? Math.max(...allTrades.map(t => t.pnl || 0)) : 0,
      worstTrade: allTrades.length > 0 ? Math.min(...allTrades.map(t => t.pnl || 0)) : 0,
      skippedPnL,
      skippedWinRate
    },
    monthlyPerformance
  };
  
  console.log('\n========================================');
  console.log('AI-FILTERED BACKTEST RESULTS');
  console.log('========================================');
  console.log(`\nAI FILTERING:`);
  console.log(`  Total Candidates: ${totalCandidates}`);
  console.log(`  AI Approved: ${aiApproved} (${(aiApproved/totalCandidates*100).toFixed(1)}%)`);
  console.log(`  AI Rejected: ${aiRejected} (${(aiRejected/totalCandidates*100).toFixed(1)}%)`);
  
  console.log(`\nTAKEN TRADES:`);
  console.log(`  Trades: ${result.summary.totalTrades}`);
  console.log(`  Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`  Total P&L: $${result.summary.totalPnL.toFixed(2)}`);
  console.log(`  Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`  Avg Win: $${result.summary.avgWin.toFixed(2)}`);
  console.log(`  Avg Loss: $${result.summary.avgLoss.toFixed(2)}`);
  console.log(`  Max Drawdown: $${result.summary.maxDrawdown.toFixed(2)}`);
  
  console.log(`\nSKIPPED TRADES (what we avoided):`);
  console.log(`  Count: ${skippedTrades.length}`);
  console.log(`  Win Rate: ${skippedWinRate.toFixed(1)}%`);
  console.log(`  Total P&L: $${skippedPnL.toFixed(2)}`);
  console.log(`  ${skippedPnL < 0 ? '✅ Good skips!' : '⚠️ Missed profits'}`);
  
  console.log('\n=== MONTHLY PERFORMANCE ===');
  for (const m of monthlyPerformance) {
    console.log(`${m.month} | Trades: ${m.trades} | WR: ${m.winRate.toFixed(1)}% | P&L: $${m.pnl.toFixed(2)}`);
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2025-01-01';
  const endDate = args[1] || '2025-03-31';
  const aiMinScore = parseInt(args[2] || '7');
  
  console.log(`\n🤖 AI-FILTERED GAP AND GO BACKTEST`);
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log(`AI Minimum Score: ${aiMinScore}/10`);
  
  const result = await runAIBacktest({
    startDate,
    endDate,
    positionSize: 10000,
    maxDailyTrades: 5,
    minScore: 50,
    minGapPercent: 5,
    maxGapPercent: 100,
    minPrice: 1,
    maxPrice: 20,
    maxFloat: 50000000,
    delayedEntry: true,
    aiMinScore
  });
  
  fs.writeFileSync('./gap_ai_backtest_results.json', JSON.stringify(result, null, 2));
  console.log('\nResults saved to gap_ai_backtest_results.json');
}

main().catch(console.error);
