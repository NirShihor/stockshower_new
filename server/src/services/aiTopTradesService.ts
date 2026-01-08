import Anthropic from '@anthropic-ai/sdk';
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { buildMarketContext } from '../candlestick/helpers/marketStructure.js';
import { calculateATR } from '../candlestick/helpers/preprocessing.js';
import { DEFAULT_PARAMS } from '../candlestick/types/comprehensive.js';
import { detectSingleCandlePatterns } from '../candlestick/patterns/singleCandle.js';
import { detectDoubleCandlePatterns } from '../candlestick/patterns/doubleCandle.js';
import { detectTripleCandlePatterns } from '../candlestick/patterns/tripleCandle.js';
import { buildTradePlan, buildConfirmationPlan } from '../candlestick/helpers/tradePlanning.js';
import { Candle } from '../candlestick/types/index.js';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';

const client = new Anthropic();

interface TopTradeRecommendation {
  symbol: string;
  direction: 'long' | 'short';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  entry: number;
  stopLoss: number;
  target: number;
  rank: number;
}

interface AiTopTradesResult {
  timestamp: string;
  recommendations: TopTradeRecommendation[];
  executedTrades: string[];
  skippedTrades: string[];
  error?: string;
}

interface ServiceStatus {
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastResult: AiTopTradesResult | null;
  isRunning: boolean;
}

let serviceEnabled = false;
let intervalId: NodeJS.Timeout | null = null;
let lastResult: AiTopTradesResult | null = null;
let isRunning = false;
let lastRunTime: Date | null = null;

let getCandleHistory: (() => Map<string, { symbol: string; candles: Candle[] }>) | null = null;

export function setCandleHistoryAccessor(accessor: () => Map<string, { symbol: string; candles: Candle[] }>) {
  getCandleHistory = accessor;
}

function isWithinTradingHours(): boolean {
  const now = new Date();
  const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const hour = ukTime.getHours();
  const minute = ukTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  const startTime = 15 * 60;
  const endTime = 19 * 60 + 30;
  
  return timeInMinutes >= startTime && timeInMinutes <= endTime;
}

function getNextRunTime(): Date | null {
  if (!serviceEnabled) return null;
  
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const hour = ukNow.getHours();
  const minute = ukNow.getMinutes();
  
  const nextMinute = Math.ceil(minute / 15) * 15;
  const next = new Date(ukNow);
  
  if (nextMinute >= 60) {
    next.setHours(hour + 1, 0, 0, 0);
  } else {
    next.setMinutes(nextMinute, 0, 0);
  }
  
  return next;
}

async function buildCandidateSignals(): Promise<ComprehensiveSignal[]> {
  if (!getCandleHistory) {
    console.log('[AI-TOP-TRADES] No candle history accessor set');
    return [];
  }
  
  const historyMap = getCandleHistory();
  const candidates: ComprehensiveSignal[] = [];
  
  console.log(`[AI-TOP-TRADES] Scanning ${historyMap.size} symbols for candidates...`);
  
  for (const [symbol, history] of historyMap) {
    const candles = history.candles;
    
    if (candles.length < 10) continue;
    
    const current = candles[candles.length - 1];
    const context = buildMarketContext(candles, DEFAULT_PARAMS);
    const atr = calculateATR(candles, DEFAULT_PARAMS.atrLen);
    
    const patterns = [];
    
    if (candles.length >= 1) {
      const prev = candles.length > 1 ? candles[candles.length - 2] : null;
      patterns.push(...detectSingleCandlePatterns(current, prev, DEFAULT_PARAMS, context.trend));
    }
    
    if (candles.length >= 2) {
      const prev = candles[candles.length - 2];
      patterns.push(...detectDoubleCandlePatterns(prev, current, DEFAULT_PARAMS, atr));
    }
    
    if (candles.length >= 3) {
      const c1 = candles[candles.length - 3];
      const c2 = candles[candles.length - 2];
      const c3 = current;
      patterns.push(...detectTripleCandlePatterns(c1, c2, c3, DEFAULT_PARAMS, atr));
    }
    
    for (const pattern of patterns) {
      const confirmation = buildConfirmationPlan(pattern, DEFAULT_PARAMS);
      const plan = buildTradePlan(pattern, context, confirmation, DEFAULT_PARAMS);
      
      const signal: ComprehensiveSignal = {
        id: `${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        timeframe: current.timeframe,
        time: current.start,
        pattern,
        context,
        confirmation,
        plan,
        score: 70,
        notes: [],
        currentPrice: current.close
      };
      
      candidates.push(signal);
    }
  }
  
  console.log(`[AI-TOP-TRADES] Found ${candidates.length} candidate signals across all symbols`);
  return candidates;
}

function formatCandidatesForAI(candidates: ComprehensiveSignal[]): string {
  if (candidates.length === 0) {
    return 'No trading candidates found at this time.';
  }
  
  let output = `CURRENT TRADING CANDIDATES (${candidates.length} total)\n`;
  output += '='.repeat(50) + '\n\n';
  
  const bySymbol = new Map<string, ComprehensiveSignal[]>();
  for (const c of candidates) {
    if (!bySymbol.has(c.symbol)) {
      bySymbol.set(c.symbol, []);
    }
    bySymbol.get(c.symbol)!.push(c);
  }
  
  for (const [symbol, signals] of bySymbol) {
    const first = signals[0];
    output += `${symbol} - Current: $${first.currentPrice?.toFixed(2) || 'N/A'}\n`;
    output += `  Trend: ${first.context.trend} | Volume: ${first.context.volumeFactor.toFixed(1)}x | ATR: $${first.context.atr.toFixed(2)}\n`;
    output += `  At Support: ${first.context.atSupport ? 'YES' : 'NO'} | At Resistance: ${first.context.atResistance ? 'YES' : 'NO'}\n`;
    
    for (const sig of signals) {
      output += `  - Pattern: ${sig.pattern.name} (${sig.pattern.direction})\n`;
      output += `    Entry: $${sig.plan.entry.toFixed(2)} | Stop: $${sig.plan.stop.toFixed(2)} | Target: $${sig.plan.targets[0]?.toFixed(2) || 'N/A'}\n`;
    }
    output += '\n';
  }
  
  return output;
}

async function getAITopTradesRecommendation(candidates: ComprehensiveSignal[]): Promise<TopTradeRecommendation[]> {
  const systemPrompt = `You are an expert day trader with 15+ years of experience. Your job is to analyze a batch of trading candidates and select the TOP 5 best opportunities for immediate execution.

You must consider:
- Pattern quality and reliability
- Risk/reward ratio
- Market context (trend, volume, support/resistance)
- Current price action
- Sector dynamics

Be highly selective. Only recommend trades with genuine edge.

Respond ONLY with valid JSON in this exact format:
{
  "recommendations": [
    {
      "symbol": "AAPL",
      "direction": "long" or "short",
      "confidence": "high", "medium", or "low",
      "reasoning": "Brief explanation (1-2 sentences)",
      "entry": 185.50,
      "stopLoss": 184.00,
      "target": 188.00,
      "rank": 1
    }
  ]
}

If there are fewer than 5 good opportunities, return fewer. If there are NO good opportunities, return an empty array.`;

  const userPrompt = `Please analyze the following trading candidates and select the TOP 5 best day trading opportunities.

${formatCandidatesForAI(candidates)}

Remember: Only select trades with genuine edge. Quality over quantity.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.recommendations || [];
  } catch (error) {
    console.error('[AI-TOP-TRADES] Error getting AI recommendation:', error);
    return [];
  }
}

async function executeTopTrades(recommendations: TopTradeRecommendation[], candidates: ComprehensiveSignal[]): Promise<{ executed: string[]; skipped: string[] }> {
  const executed: string[] = [];
  const skipped: string[] = [];
  
  for (const rec of recommendations) {
    const candidate = candidates.find(c => 
      c.symbol === rec.symbol && 
      c.plan.direction === rec.direction
    );
    
    if (!candidate) {
      console.log(`[AI-TOP-TRADES] No matching candidate for ${rec.symbol} ${rec.direction}`);
      skipped.push(`${rec.symbol} - no matching signal`);
      continue;
    }
    
    const signalToExecute: ComprehensiveSignal = {
      ...candidate,
      plan: {
        ...candidate.plan,
        entry: rec.entry,
        stop: rec.stopLoss,
        targets: [rec.target, rec.target * 1.5],
        risk: Math.abs(rec.entry - rec.stopLoss)
      },
      notes: [
        ...candidate.notes,
        `AI Top 5 Trade - Rank #${rec.rank}`,
        `AI Confidence: ${rec.confidence}`,
        `AI Reasoning: ${rec.reasoning}`
      ]
    };
    
    try {
      console.log(`[AI-TOP-TRADES] Executing #${rec.rank}: ${rec.symbol} ${rec.direction} @ $${rec.entry}`);
      const result = await metaApiHandler.placeOrder(signalToExecute);
      
      if (result.success) {
        executed.push(`${rec.symbol} ${rec.direction} @ $${rec.entry}`);
        console.log(`[AI-TOP-TRADES] Successfully executed: ${rec.symbol}`);
      } else {
        skipped.push(`${rec.symbol} - execution failed: ${result.error}`);
        console.log(`[AI-TOP-TRADES] Failed to execute: ${rec.symbol} - ${result.error}`);
      }
    } catch (error) {
      skipped.push(`${rec.symbol} - exception: ${error}`);
      console.error(`[AI-TOP-TRADES] Exception executing ${rec.symbol}:`, error);
    }
  }
  
  return { executed, skipped };
}

async function runAiTopTradesScan(): Promise<AiTopTradesResult> {
  const timestamp = new Date().toISOString();
  
  if (!isWithinTradingHours()) {
    console.log('[AI-TOP-TRADES] Outside trading hours (3pm-7:30pm UK), skipping scan');
    return {
      timestamp,
      recommendations: [],
      executedTrades: [],
      skippedTrades: [],
      error: 'Outside trading hours'
    };
  }
  
  if (isRunning) {
    console.log('[AI-TOP-TRADES] Scan already in progress, skipping');
    return {
      timestamp,
      recommendations: [],
      executedTrades: [],
      skippedTrades: [],
      error: 'Scan already in progress'
    };
  }
  
  isRunning = true;
  console.log('[AI-TOP-TRADES] Starting scheduled scan...');
  
  try {
    const candidates = await buildCandidateSignals();
    
    if (candidates.length === 0) {
      console.log('[AI-TOP-TRADES] No candidates found');
      return {
        timestamp,
        recommendations: [],
        executedTrades: [],
        skippedTrades: [],
        error: 'No candidates found'
      };
    }
    
    const recommendations = await getAITopTradesRecommendation(candidates);
    console.log(`[AI-TOP-TRADES] AI recommended ${recommendations.length} trades`);
    
    const { executed, skipped } = await executeTopTrades(recommendations, candidates);
    
    const result: AiTopTradesResult = {
      timestamp,
      recommendations,
      executedTrades: executed,
      skippedTrades: skipped
    };
    
    lastResult = result;
    lastRunTime = new Date();
    
    console.log(`[AI-TOP-TRADES] Scan complete. Executed: ${executed.length}, Skipped: ${skipped.length}`);
    
    return result;
  } catch (error) {
    console.error('[AI-TOP-TRADES] Error during scan:', error);
    return {
      timestamp,
      recommendations: [],
      executedTrades: [],
      skippedTrades: [],
      error: String(error)
    };
  } finally {
    isRunning = false;
  }
}

export function startAiTopTradesService(): void {
  if (serviceEnabled) {
    console.log('[AI-TOP-TRADES] Service already running');
    return;
  }
  
  serviceEnabled = true;
  
  intervalId = setInterval(async () => {
    await runAiTopTradesScan();
  }, 15 * 60 * 1000);
  
  console.log('[AI-TOP-TRADES] Service started - will scan every 15 minutes between 3pm-7:30pm UK');
}

export function stopAiTopTradesService(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  serviceEnabled = false;
  console.log('[AI-TOP-TRADES] Service stopped');
}

export async function triggerManualScan(): Promise<AiTopTradesResult> {
  console.log('[AI-TOP-TRADES] Manual scan triggered');
  return await runAiTopTradesScan();
}

export function getServiceStatus(): ServiceStatus {
  return {
    enabled: serviceEnabled,
    lastRun: lastRunTime?.toISOString() || null,
    nextRun: getNextRunTime()?.toISOString() || null,
    lastResult,
    isRunning
  };
}

export function getLastResult(): AiTopTradesResult | null {
  return lastResult;
}

interface BacktestResult {
  date: string;
  scanTime: string;
  symbolsScanned: number;
  candidatesFound: number;
  recommendations: TopTradeRecommendation[];
  hypotheticalOutcomes?: HypotheticalOutcome[];
  error?: string;
}

interface HypotheticalOutcome {
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  exitPrice: number;
  exitReason: 'target_hit' | 'stop_hit' | 'end_of_day';
  pnlPercent: number;
  pnlAmount: number;
}

const BACKTEST_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
  'NFLX', 'ADBE', 'PYPL', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'MU', 'AMAT', 'LRCX',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'V', 'MA', 'AXP', 'BLK',
  'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT', 'BMY', 'AMGN',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'VLO', 'MPC', 'PSX', 'HAL',
  'BA', 'CAT', 'HON', 'GE', 'MMM', 'UNP', 'RTX', 'DE', 'LMT', 'NOC',
  'KO', 'PEP', 'WMT', 'PG', 'COST', 'HD', 'NKE', 'MCD', 'SBUX', 'TGT',
  'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR', 'NFLX'
];

function buildCandidatesFromHistoricalData(
  historicalData: Map<string, Candle[]>,
  scanTime: Date
): ComprehensiveSignal[] {
  const candidates: ComprehensiveSignal[] = [];
  
  for (const [symbol, candles] of historicalData) {
    if (candles.length < 10) continue;
    
    const candlesUpToScanTime = candles.filter(c => new Date(c.start) <= scanTime);
    if (candlesUpToScanTime.length < 10) continue;
    
    const relevantCandles = candlesUpToScanTime.slice(-100);
    const current = relevantCandles[relevantCandles.length - 1];
    const context = buildMarketContext(relevantCandles, DEFAULT_PARAMS);
    const atr = calculateATR(relevantCandles, DEFAULT_PARAMS.atrLen);
    
    const patterns = [];
    
    if (relevantCandles.length >= 1) {
      const prev = relevantCandles.length > 1 ? relevantCandles[relevantCandles.length - 2] : null;
      patterns.push(...detectSingleCandlePatterns(current, prev, DEFAULT_PARAMS, context.trend));
    }
    
    if (relevantCandles.length >= 2) {
      const prev = relevantCandles[relevantCandles.length - 2];
      patterns.push(...detectDoubleCandlePatterns(prev, current, DEFAULT_PARAMS, atr));
    }
    
    if (relevantCandles.length >= 3) {
      const c1 = relevantCandles[relevantCandles.length - 3];
      const c2 = relevantCandles[relevantCandles.length - 2];
      const c3 = current;
      patterns.push(...detectTripleCandlePatterns(c1, c2, c3, DEFAULT_PARAMS, atr));
    }
    
    for (const pattern of patterns) {
      const confirmation = buildConfirmationPlan(pattern, DEFAULT_PARAMS);
      const plan = buildTradePlan(pattern, context, confirmation, DEFAULT_PARAMS);
      
      const signal: ComprehensiveSignal = {
        id: `${symbol}-backtest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        symbol,
        timeframe: current.timeframe,
        time: current.start,
        pattern,
        context,
        confirmation,
        plan,
        score: 70,
        notes: [],
        currentPrice: current.close
      };
      
      candidates.push(signal);
    }
  }
  
  return candidates;
}

function calculateHypotheticalOutcome(
  rec: TopTradeRecommendation,
  candles: Candle[],
  entryTime: Date
): HypotheticalOutcome | null {
  const candlesAfterEntry = candles.filter(c => new Date(c.start) > entryTime);
  
  if (candlesAfterEntry.length === 0) {
    return null;
  }
  
  const entryCandle = candlesAfterEntry[0];
  const actualEntry = entryCandle.open;
  
  const riskFromAI = Math.abs(rec.entry - rec.stopLoss);
  const rewardFromAI = Math.abs(rec.target - rec.entry);
  const rrRatio = rewardFromAI / riskFromAI;
  
  let actualStopLoss: number;
  let actualTarget: number;
  
  if (rec.direction === 'long') {
    actualStopLoss = actualEntry - riskFromAI;
    actualTarget = actualEntry + rewardFromAI;
  } else {
    actualStopLoss = actualEntry + riskFromAI;
    actualTarget = actualEntry - rewardFromAI;
  }
  
  let exitPrice = actualEntry;
  let exitReason: 'target_hit' | 'stop_hit' | 'end_of_day' = 'end_of_day';
  
  for (const candle of candlesAfterEntry) {
    if (rec.direction === 'long') {
      if (candle.low <= actualStopLoss) {
        exitPrice = actualStopLoss;
        exitReason = 'stop_hit';
        break;
      }
      if (candle.high >= actualTarget) {
        exitPrice = actualTarget;
        exitReason = 'target_hit';
        break;
      }
    } else {
      if (candle.high >= actualStopLoss) {
        exitPrice = actualStopLoss;
        exitReason = 'stop_hit';
        break;
      }
      if (candle.low <= actualTarget) {
        exitPrice = actualTarget;
        exitReason = 'target_hit';
        break;
      }
    }
    exitPrice = candle.close;
  }
  
  const pnlPercent = rec.direction === 'long'
    ? ((exitPrice - actualEntry) / actualEntry) * 100
    : ((actualEntry - exitPrice) / actualEntry) * 100;
  
  const pnlAmount = pnlPercent * 0.01 * 100;
  
  return {
    symbol: rec.symbol,
    direction: rec.direction,
    entry: actualEntry,
    stopLoss: actualStopLoss,
    target: actualTarget,
    exitPrice,
    exitReason,
    pnlPercent: Math.round(pnlPercent * 100) / 100,
    pnlAmount: Math.round(pnlAmount * 100) / 100
  };
}

export async function runBacktest(
  date: string,
  scanTimeUk: string = '15:30'
): Promise<BacktestResult> {
  console.log(`[AI-TOP-TRADES BACKTEST] Running backtest for ${date} at ${scanTimeUk} UK time`);
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return {
      date,
      scanTime: scanTimeUk,
      symbolsScanned: 0,
      candidatesFound: 0,
      recommendations: [],
      error: 'No Polygon API key configured'
    };
  }
  
  const [hours, minutes] = scanTimeUk.split(':').map(Number);
  const scanTimeUtc = new Date(`${date}T${String(hours - 0).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`);
  
  const marketOpen = `${date}T13:30:00Z`;
  const marketClose = `${date}T20:00:00Z`;
  
  console.log(`[AI-TOP-TRADES BACKTEST] Fetching data from ${marketOpen} to ${marketClose}`);
  console.log(`[AI-TOP-TRADES BACKTEST] Scan time: ${scanTimeUtc.toISOString()}`);
  
  const historicalData = new Map<string, Candle[]>();
  let fetchedCount = 0;
  
  for (const symbol of BACKTEST_SYMBOLS) {
    try {
      const candles = await fetchHistoricalBars(
        apiKey,
        symbol,
        date,
        date,
        'minute',
        5,
        500
      );
      
      if (candles.length > 0) {
        historicalData.set(symbol, candles);
        fetchedCount++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[AI-TOP-TRADES BACKTEST] Error fetching ${symbol}:`, error);
    }
  }
  
  console.log(`[AI-TOP-TRADES BACKTEST] Fetched data for ${fetchedCount} symbols`);
  
  const candidates = buildCandidatesFromHistoricalData(historicalData, scanTimeUtc);
  console.log(`[AI-TOP-TRADES BACKTEST] Found ${candidates.length} candidates`);
  
  if (candidates.length === 0) {
    return {
      date,
      scanTime: scanTimeUk,
      symbolsScanned: fetchedCount,
      candidatesFound: 0,
      recommendations: [],
      error: 'No candidates found'
    };
  }
  
  const recommendations = await getAITopTradesRecommendation(candidates);
  console.log(`[AI-TOP-TRADES BACKTEST] AI recommended ${recommendations.length} trades`);
  
  const hypotheticalOutcomes: HypotheticalOutcome[] = [];
  for (const rec of recommendations) {
    const symbolCandles = historicalData.get(rec.symbol);
    if (symbolCandles) {
      const outcome = calculateHypotheticalOutcome(rec, symbolCandles, scanTimeUtc);
      if (outcome) {
        hypotheticalOutcomes.push(outcome);
      }
    }
  }
  
  const totalPnl = hypotheticalOutcomes.reduce((sum, o) => sum + o.pnlPercent, 0);
  const winners = hypotheticalOutcomes.filter(o => o.pnlPercent > 0).length;
  const losers = hypotheticalOutcomes.filter(o => o.pnlPercent < 0).length;
  
  console.log(`[AI-TOP-TRADES BACKTEST] Results: ${winners}W/${losers}L, Total P&L: ${totalPnl.toFixed(2)}%`);
  
  return {
    date,
    scanTime: scanTimeUk,
    symbolsScanned: fetchedCount,
    candidatesFound: candidates.length,
    recommendations,
    hypotheticalOutcomes
  };
}

interface MonthlyResult {
  month: string;
  tradingDays: number;
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnlPercent: number;
  avgPnlPerTrade: number;
  bestTrade: { symbol: string; pnlPercent: number } | null;
  worstTrade: { symbol: string; pnlPercent: number } | null;
}

interface MultiMonthBacktestResult {
  startDate: string;
  endDate: string;
  scanTime: string;
  monthlyResults: MonthlyResult[];
  overallSummary: {
    totalDays: number;
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    totalPnlPercent: number;
    avgPnlPerTrade: number;
    avgPnlPerDay: number;
  };
  allTrades: Array<{
    date: string;
    symbol: string;
    direction: string;
    entry: number;
    stopLoss: number;
    target: number;
    exitPrice: number;
    exitReason: string;
    pnlPercent: number;
  }>;
  error?: string;
}

function getTradingDaysInRange(startDate: string, endDate: string): string[] {
  const tradingDays: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const usHolidays2024 = [
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29',
    '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02',
    '2024-11-28', '2024-12-25'
  ];
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !usHolidays2024.includes(dateStr)) {
      tradingDays.push(dateStr);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return tradingDays;
}

export async function runMultiMonthBacktest(
  startDate: string,
  endDate: string,
  scanTimeUk: string = '15:30'
): Promise<MultiMonthBacktestResult> {
  console.log(`[AI-TOP-TRADES BACKTEST] Running 6-month backtest from ${startDate} to ${endDate}`);
  
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return {
      startDate,
      endDate,
      scanTime: scanTimeUk,
      monthlyResults: [],
      overallSummary: {
        totalDays: 0,
        totalTrades: 0,
        winners: 0,
        losers: 0,
        winRate: 0,
        totalPnlPercent: 0,
        avgPnlPerTrade: 0,
        avgPnlPerDay: 0
      },
      allTrades: [],
      error: 'No Polygon API key configured'
    };
  }
  
  const tradingDays = getTradingDaysInRange(startDate, endDate);
  console.log(`[AI-TOP-TRADES BACKTEST] Found ${tradingDays.length} trading days`);
  
  const allTrades: Array<{
    date: string;
    symbol: string;
    direction: string;
    entry: number;
    stopLoss: number;
    target: number;
    exitPrice: number;
    exitReason: string;
    pnlPercent: number;
  }> = [];
  
  const tradesByMonth = new Map<string, typeof allTrades>();
  
  for (let i = 0; i < tradingDays.length; i++) {
    const date = tradingDays[i];
    const month = date.substring(0, 7);
    
    console.log(`[AI-TOP-TRADES BACKTEST] Processing ${date} (${i + 1}/${tradingDays.length})`);
    
    try {
      const dayResult = await runBacktest(date, scanTimeUk);
      
      if (dayResult.hypotheticalOutcomes && dayResult.hypotheticalOutcomes.length > 0) {
        for (const outcome of dayResult.hypotheticalOutcomes) {
          const trade = {
            date,
            symbol: outcome.symbol,
            direction: outcome.direction,
            entry: outcome.entry,
            stopLoss: outcome.stopLoss,
            target: outcome.target,
            exitPrice: outcome.exitPrice,
            exitReason: outcome.exitReason,
            pnlPercent: outcome.pnlPercent
          };
          
          allTrades.push(trade);
          
          if (!tradesByMonth.has(month)) {
            tradesByMonth.set(month, []);
          }
          tradesByMonth.get(month)!.push(trade);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`[AI-TOP-TRADES BACKTEST] Error on ${date}:`, error);
    }
  }
  
  const monthlyResults: MonthlyResult[] = [];
  const sortedMonths = Array.from(tradesByMonth.keys()).sort();
  
  for (const month of sortedMonths) {
    const trades = tradesByMonth.get(month)!;
    const winners = trades.filter(t => t.pnlPercent > 0);
    const losers = trades.filter(t => t.pnlPercent < 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
    
    const tradingDaysInMonth = tradingDays.filter(d => d.startsWith(month)).length;
    
    const bestTrade = trades.length > 0
      ? trades.reduce((best, t) => t.pnlPercent > best.pnlPercent ? t : best)
      : null;
    const worstTrade = trades.length > 0
      ? trades.reduce((worst, t) => t.pnlPercent < worst.pnlPercent ? t : worst)
      : null;
    
    monthlyResults.push({
      month,
      tradingDays: tradingDaysInMonth,
      totalTrades: trades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: trades.length > 0 ? Math.round((winners.length / trades.length) * 100) : 0,
      totalPnlPercent: Math.round(totalPnl * 100) / 100,
      avgPnlPerTrade: trades.length > 0 ? Math.round((totalPnl / trades.length) * 100) / 100 : 0,
      bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnlPercent: bestTrade.pnlPercent } : null,
      worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnlPercent: worstTrade.pnlPercent } : null
    });
  }
  
  const totalWinners = allTrades.filter(t => t.pnlPercent > 0).length;
  const totalLosers = allTrades.filter(t => t.pnlPercent < 0).length;
  const totalPnl = allTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
  
  const overallSummary = {
    totalDays: tradingDays.length,
    totalTrades: allTrades.length,
    winners: totalWinners,
    losers: totalLosers,
    winRate: allTrades.length > 0 ? Math.round((totalWinners / allTrades.length) * 100) : 0,
    totalPnlPercent: Math.round(totalPnl * 100) / 100,
    avgPnlPerTrade: allTrades.length > 0 ? Math.round((totalPnl / allTrades.length) * 100) / 100 : 0,
    avgPnlPerDay: tradingDays.length > 0 ? Math.round((totalPnl / tradingDays.length) * 100) / 100 : 0
  };
  
  console.log(`[AI-TOP-TRADES BACKTEST] 6-month backtest complete!`);
  console.log(`[AI-TOP-TRADES BACKTEST] Total: ${allTrades.length} trades, ${totalWinners}W/${totalLosers}L (${overallSummary.winRate}%), P&L: ${totalPnl.toFixed(2)}%`);
  
  return {
    startDate,
    endDate,
    scanTime: scanTimeUk,
    monthlyResults,
    overallSummary,
    allTrades
  };
}
