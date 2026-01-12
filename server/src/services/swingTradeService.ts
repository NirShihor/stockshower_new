import Anthropic from '@anthropic-ai/sdk';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { Candle } from '../candlestick/types/index.js';
import { getMarketContext, MarketContext } from './marketContextService.js';
import { getSectorAnalysis, SectorAnalysis, getStockSector } from './sectorAnalysisService.js';

const client = new Anthropic();

interface SwingCandidate {
  symbol: string;
  sector: string;
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
  recentPattern: string;
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

interface SwingBacktestResult {
  entryDate: string;
  exitDate: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  exitPrice: number;
  exitReason: 'target_hit' | 'stop_hit' | 'time_exit';
  daysHeld: number;
  pnlPercent: number;
}

interface SwingAnalysisResult {
  date: string;
  marketContext: MarketContext | null;
  sectorAnalysis: SectorAnalysis | null;
  candidates: SwingCandidate[];
  recommendations: SwingRecommendation[];
  aiAssessment: string;
}

const SWING_SYMBOLS = [
  // NASDAQ (.O suffix on FxPro MT5)
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
  // NYSE (.N suffix on FxPro MT5)
  'JNJ', 'JPM', 'V', 'PG', 'HD', 'MA', 'BAC', 'WMT', 'DIS', 'KO',
  'PFE', 'MRK', 'UNH', 'CVX', 'XOM', 'VZ', 'T', 'MMM', 'CAT', 'BA',
  'IBM', 'GE', 'GM', 'F', 'CRM', 'RTX', 'DHR', 'BSX', 'NKE', 'ABT',
  'TMO', 'WFC', 'GS', 'MS', 'AXP', 'LLY', 'ABBV', 'COP', 'SLB', 'OXY',
  'UNP', 'DE', 'LMT', 'MCD'
];

function calculateEma(candles: Candle[], period: number): number {
  if (candles.length < period) return candles[candles.length - 1]?.close || 0;
  const multiplier = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
  }
  return ema;
}

function calculateAtr(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function findSupportResistance(candles: Candle[]): { support: number; resistance: number } {
  const recent = candles.slice(-20);
  const lows = recent.map(c => c.low);
  const highs = recent.map(c => c.high);
  return {
    support: Math.min(...lows),
    resistance: Math.max(...highs)
  };
}

function detectTrend(candles: Candle[]): 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down' {
  if (candles.length < 20) return 'neutral';
  
  const ema20 = calculateEma(candles, 20);
  const ema50 = calculateEma(candles, 50);
  const current = candles[candles.length - 1].close;
  
  const aboveEma20 = current > ema20;
  const aboveEma50 = current > ema50;
  const ema20AboveEma50 = ema20 > ema50;
  
  const recent5 = candles.slice(-5);
  const higherHighs = recent5.filter((c, i) => i > 0 && c.high > recent5[i - 1].high).length;
  const lowerLows = recent5.filter((c, i) => i > 0 && c.low < recent5[i - 1].low).length;
  
  if (aboveEma20 && aboveEma50 && ema20AboveEma50 && higherHighs >= 3) return 'strong_up';
  if (aboveEma20 && aboveEma50) return 'up';
  if (!aboveEma20 && !aboveEma50 && !ema20AboveEma50 && lowerLows >= 3) return 'strong_down';
  if (!aboveEma20 && !aboveEma50) return 'down';
  return 'neutral';
}

function detectSetup(candles: Candle[], trend: string): string {
  const recent = candles.slice(-5);
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const ema20 = calculateEma(candles, 20);
  const priceNearEma = Math.abs(current.close - ema20) / ema20 < 0.02;
  
  if (trend === 'up' || trend === 'strong_up') {
    if (priceNearEma && current.close > current.open) {
      return 'pullback_to_ema20_bounce';
    }
    if (current.close > prev.high && current.volume > prev.volume * 1.5) {
      return 'breakout_with_volume';
    }
  }
  
  if (trend === 'down' || trend === 'strong_down') {
    if (priceNearEma && current.close < current.open) {
      return 'rally_to_ema20_rejection';
    }
    if (current.close < prev.low && current.volume > prev.volume * 1.5) {
      return 'breakdown_with_volume';
    }
  }
  
  const bodySize = Math.abs(current.close - current.open);
  const totalRange = current.high - current.low;
  if (totalRange > 0 && bodySize / totalRange < 0.3) {
    if (current.close > current.open) return 'hammer_doji';
    return 'shooting_star_doji';
  }
  
  return 'no_clear_setup';
}

async function buildSwingCandidates(date: string): Promise<SwingCandidate[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return [];
  
  const candidates: SwingCandidate[] = [];
  
  const endDate = date;
  const startDateObj = new Date(date);
  startDateObj.setDate(startDateObj.getDate() - 60);
  const startDate = startDateObj.toISOString().split('T')[0];
  
  console.log(`[SWING] Building candidates for ${date}, fetching ${SWING_SYMBOLS.length} symbols...`);
  
  for (const symbol of SWING_SYMBOLS) {
    try {
      const candles = await fetchHistoricalBars(apiKey, symbol, startDate, endDate, 'day', 1, 60);
      
      if (candles.length < 30) continue;
      
      const current = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const fiveDaysAgo = candles[candles.length - 6] || candles[0];
      const twentyDaysAgo = candles[candles.length - 21] || candles[0];
      
      const dailyChange = ((current.close - prev.close) / prev.close) * 100;
      const weeklyChange = ((current.close - fiveDaysAgo.close) / fiveDaysAgo.close) * 100;
      const monthlyChange = ((current.close - twentyDaysAgo.close) / twentyDaysAgo.close) * 100;
      
      const ema20 = calculateEma(candles, 20);
      const ema50 = calculateEma(candles, 50);
      const atr = calculateAtr(candles, 14);
      
      const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
      const volumeRatio = current.volume / avgVolume;
      
      const { support, resistance } = findSupportResistance(candles);
      const nearSupport = (current.close - support) / current.close < 0.03;
      const nearResistance = (resistance - current.close) / current.close < 0.03;
      
      const trend = detectTrend(candles);
      const setup = detectSetup(candles, trend);
      
      candidates.push({
        symbol,
        sector: getStockSector(symbol),
        currentPrice: current.close,
        dailyChange: Math.round(dailyChange * 100) / 100,
        weeklyChange: Math.round(weeklyChange * 100) / 100,
        monthlyChange: Math.round(monthlyChange * 100) / 100,
        trend,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        atr: Math.round(atr * 100) / 100,
        atrPercent: Math.round((atr / current.close) * 10000) / 100,
        priceVsEma20: Math.round(((current.close - ema20) / ema20) * 10000) / 100,
        priceVsEma50: Math.round(((current.close - ema50) / ema50) * 10000) / 100,
        nearSupport,
        nearResistance,
        recentPattern: setup !== 'no_clear_setup' ? setup : '',
        setup
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`[SWING] Error fetching ${symbol}:`, error);
    }
  }
  
  return candidates;
}

function formatSwingCandidatesForAI(
  candidates: SwingCandidate[],
  marketContext: MarketContext | null,
  sectorAnalysis: SectorAnalysis | null
): string {
  let prompt = `SWING TRADE ANALYSIS\n${'='.repeat(60)}\n\n`;
  
  if (marketContext) {
    prompt += `MARKET REGIME: ${marketContext.regime.toUpperCase()}\n`;
    prompt += `SPY: ${marketContext.spy.changePercent >= 0 ? '+' : ''}${marketContext.spy.changePercent}% today, `;
    prompt += `${marketContext.spy.weekChangePercent >= 0 ? '+' : ''}${marketContext.spy.weekChangePercent}% week, `;
    prompt += `trend: ${marketContext.spy.trend}\n`;
    prompt += `VIX: ${marketContext.vix.current} (${marketContext.vix.current < 15 ? 'low/complacent' : marketContext.vix.current > 20 ? 'elevated/fearful' : 'normal'})\n\n`;
  }
  
  if (sectorAnalysis) {
    prompt += `SECTOR RANKINGS:\n`;
    for (const sector of sectorAnalysis.sectors.slice(0, 5)) {
      prompt += `  ${sector.rank}. ${sector.name}: ${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent}%\n`;
    }
    prompt += `  ...\n`;
    for (const sector of sectorAnalysis.sectors.slice(-3)) {
      prompt += `  ${sector.rank}. ${sector.name}: ${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent}%\n`;
    }
    prompt += `\n`;
  }
  
  const withSetups = candidates.filter(c => c.setup !== 'no_clear_setup');
  const strongTrends = candidates.filter(c => c.trend === 'strong_up' || c.trend === 'strong_down');
  
  prompt += `CANDIDATES WITH SETUPS (${withSetups.length}):\n`;
  prompt += '-'.repeat(60) + '\n';
  
  for (const c of withSetups) {
    prompt += `\n${c.symbol} - $${c.currentPrice.toFixed(2)} | Sector: ${c.sector}\n`;
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

function buildSwingSystemPrompt(): string {
  return `You are an experienced swing trader who holds positions for 2-5 days. You focus on high-probability setups where the daily trend, weekly trend, and sector momentum all align.

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
   - Fighting sector rotation
   - Earnings within 5 days

RESPONSE FORMAT (JSON only):
{
  "marketAssessment": "1-2 sentences on whether this is a good swing trading environment",
  "bias": "bullish" | "bearish" | "neutral",
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

Select up to 30 swing trades if there are enough quality setups. Include all trades with clear trend alignment, sector support, and defined setups.`;
}

async function getSwingRecommendations(
  candidates: SwingCandidate[],
  marketContext: MarketContext | null,
  sectorAnalysis: SectorAnalysis | null
): Promise<{ recommendations: SwingRecommendation[]; assessment: string }> {
  const systemPrompt = buildSwingSystemPrompt();
  const userPrompt = formatSwingCandidatesForAI(candidates, marketContext, sectorAnalysis);
  
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    
    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    console.log(`[SWING] AI Assessment: ${parsed.marketAssessment}`);
    console.log(`[SWING] AI Bias: ${parsed.bias}, Recommendations: ${parsed.recommendations?.length || 0}`);
    
    return {
      recommendations: parsed.recommendations || [],
      assessment: parsed.marketAssessment || ''
    };
  } catch (error) {
    console.error('[SWING] Error getting AI recommendations:', error);
    return { recommendations: [], assessment: 'Error getting recommendations' };
  }
}

export async function analyzeSwingTrades(date: string): Promise<SwingAnalysisResult> {
  console.log(`[SWING] Analyzing swing trades for ${date}`);
  
  const [marketContext, candidates] = await Promise.all([
    getMarketContext(date),
    buildSwingCandidates(date)
  ]);
  
  const sectorAnalysis = await getSectorAnalysis(date, marketContext?.spy.changePercent || 0);
  
  console.log(`[SWING] Built ${candidates.length} candidates`);
  
  const { recommendations, assessment } = await getSwingRecommendations(
    candidates,
    marketContext,
    sectorAnalysis
  );
  
  return {
    date,
    marketContext,
    sectorAnalysis,
    candidates,
    recommendations,
    aiAssessment: assessment
  };
}

async function simulateSwingTrade(
  rec: SwingRecommendation,
  entryDate: string,
  maxDays: number = 5
): Promise<SwingBacktestResult | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  
  try {
    const startDate = entryDate;
    const endDateObj = new Date(entryDate);
    endDateObj.setDate(endDateObj.getDate() + maxDays + 5);
    const endDate = endDateObj.toISOString().split('T')[0];
    
    const candles = await fetchHistoricalBars(apiKey, rec.symbol, startDate, endDate, 'day', 1, 15);
    
    if (candles.length < 2) return null;
    
    const entryCandle = candles[0];
    const actualEntry = entryCandle.open;
    
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
    let exitReason: 'target_hit' | 'stop_hit' | 'time_exit' = 'time_exit';
    let exitDate = entryDate;
    let daysHeld = 0;
    
    for (let i = 1; i < Math.min(candles.length, maxDays + 1); i++) {
      const candle = candles[i];
      daysHeld = i;
      exitDate = candle.start.split('T')[0];
      
      if (rec.direction === 'long') {
        if (candle.low <= actualStop) {
          exitPrice = actualStop;
          exitReason = 'stop_hit';
          break;
        }
        if (candle.high >= actualTarget) {
          exitPrice = actualTarget;
          exitReason = 'target_hit';
          break;
        }
      } else {
        if (candle.high >= actualStop) {
          exitPrice = actualStop;
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
    
    return {
      entryDate,
      exitDate,
      symbol: rec.symbol,
      direction: rec.direction,
      entry: actualEntry,
      stopLoss: actualStop,
      target: actualTarget,
      exitPrice,
      exitReason,
      daysHeld,
      pnlPercent: Math.round(pnlPercent * 100) / 100
    };
  } catch (error) {
    console.error(`[SWING] Error simulating trade for ${rec.symbol}:`, error);
    return null;
  }
}

interface SwingBacktestSummary {
  startDate: string;
  endDate: string;
  totalDays: number;
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnlPercent: number;
  avgPnlPerTrade: number;
  avgDaysHeld: number;
  targetHits: number;
  stopHits: number;
  timeExits: number;
  allTrades: SwingBacktestResult[];
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const holidays = [
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29',
    '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02',
    '2024-11-28', '2024-12-25'
  ];
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dateStr)) {
      days.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

export async function runSwingBacktest(
  startDate: string,
  endDate: string
): Promise<SwingBacktestSummary> {
  console.log(`[SWING BACKTEST] Running from ${startDate} to ${endDate}`);
  
  const tradingDays = getTradingDays(startDate, endDate);
  console.log(`[SWING BACKTEST] ${tradingDays.length} trading days to analyze`);
  
  const allTrades: SwingBacktestResult[] = [];
  const activeTrades = new Set<string>();
  
  for (let i = 0; i < tradingDays.length; i++) {
    const date = tradingDays[i];
    console.log(`[SWING BACKTEST] Analyzing ${date} (${i + 1}/${tradingDays.length})`);
    
    try {
      const analysis = await analyzeSwingTrades(date);
      
      for (const rec of analysis.recommendations) {
        if (activeTrades.has(rec.symbol)) {
          console.log(`[SWING BACKTEST] Skipping ${rec.symbol} - already in active trade`);
          continue;
        }
        
        const result = await simulateSwingTrade(rec, date);
        
        if (result) {
          allTrades.push(result);
          activeTrades.add(rec.symbol);
          
          setTimeout(() => activeTrades.delete(rec.symbol), result.daysHeld * 24 * 60 * 60 * 1000);
          
          console.log(`[SWING BACKTEST] ${result.symbol} ${result.direction}: ${result.pnlPercent >= 0 ? '+' : ''}${result.pnlPercent}% (${result.exitReason}, ${result.daysHeld} days)`);
        }
      }
      
      activeTrades.clear();
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`[SWING BACKTEST] Error on ${date}:`, error);
    }
  }
  
  const winners = allTrades.filter(t => t.pnlPercent > 0);
  const losers = allTrades.filter(t => t.pnlPercent <= 0);
  const totalPnl = allTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgDaysHeld = allTrades.length > 0 
    ? allTrades.reduce((sum, t) => sum + t.daysHeld, 0) / allTrades.length 
    : 0;
  
  const targetHits = allTrades.filter(t => t.exitReason === 'target_hit').length;
  const stopHits = allTrades.filter(t => t.exitReason === 'stop_hit').length;
  const timeExits = allTrades.filter(t => t.exitReason === 'time_exit').length;
  
  console.log(`[SWING BACKTEST] Complete: ${allTrades.length} trades, ${winners.length}W/${losers.length}L, P&L: ${totalPnl.toFixed(2)}%`);
  
  return {
    startDate,
    endDate,
    totalDays: tradingDays.length,
    totalTrades: allTrades.length,
    winners: winners.length,
    losers: losers.length,
    winRate: allTrades.length > 0 ? Math.round((winners.length / allTrades.length) * 100) : 0,
    totalPnlPercent: Math.round(totalPnl * 100) / 100,
    avgPnlPerTrade: allTrades.length > 0 ? Math.round((totalPnl / allTrades.length) * 100) / 100 : 0,
    avgDaysHeld: Math.round(avgDaysHeld * 10) / 10,
    targetHits,
    stopHits,
    timeExits,
    allTrades
  };
}
