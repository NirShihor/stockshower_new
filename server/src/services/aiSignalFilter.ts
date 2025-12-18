import Anthropic from '@anthropic-ai/sdk';
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { DecisionLog } from '../db/models/DecisionLog.js';
import fs from 'fs';
import path from 'path';

interface AIDecision {
  action: 'execute' | 'skip' | 'invert';
  execute: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  adjustedEntry?: number;
  adjustedStop?: number;
  adjustedTarget?: number;
}

interface RecentCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface PatternPerformance {
  pattern: string;
  directionAccuracy: number;
  count: number;
  recommendation: 'preferred' | 'acceptable' | 'avoid';
  avgMfe: number;
  winRate: number;
  avgPnlPercent: number;
  avgHoldMinutes?: number;
  byPatternClass?: { single: number; double: number; triple: number };
  byVolume?: { high: { winRate: number; count: number }; low: { winRate: number; count: number } };
  byTrend?: { aligned: { winRate: number; count: number }; counter: { winRate: number; count: number } };
}

interface SymbolPerformance {
  symbol: string;
  totalTrades: number;
  wins: number;
  winRate: number;
  avgPnlPercent: number;
  avgHoldMinutes?: number;
  bestPattern?: string;
  worstPattern?: string;
  bestTimeOfDay?: string;
  worstTimeOfDay?: string;
}

interface TimeOfDayPerformance {
  period: string;
  winRate: number;
  count: number;
  avgPnlPercent: number;
}

interface PatternClassPerformance {
  class: 'single' | 'double' | 'triple';
  winRate: number;
  count: number;
  avgPnlPercent: number;
  bestPatterns: string[];
  worstPatterns: string[];
}

interface VolumePerformance {
  highVolume: { winRate: number; count: number; avgPnlPercent: number };
  lowVolume: { winRate: number; count: number; avgPnlPercent: number };
}

interface TrendAlignmentPerformance {
  aligned: { winRate: number; count: number; avgPnlPercent: number };
  counter: { winRate: number; count: number; avgPnlPercent: number };
}

interface SlippageStats {
  avgSlippagePercent: number;
  maxSlippagePercent: number;
  slippageByOrderType: { market: number; stop: number };
}

interface ExitReasonStats {
  tpHit: { count: number; avgHoldMinutes: number };
  slHit: { count: number; avgHoldMinutes: number };
  cancelled: { count: number; reasons: Record<string, number> };
  manual: { count: number; avgPnlPercent: number };
}

interface WarningCorrelation {
  warning: string;
  occurrences: number;
  winRate: number;
  avgPnlPercent: number;
}

interface TrainingInsights {
  directionAccuracy: number;
  averageMfe: number;
  averageMae: number;
  optimalStopPercent: number;
  optimalTargetPercent: number;
  patternRankings: PatternPerformance[];
  keyInsights: string[];
  patternsToAvoid: string[];
  patternsToPrefer: string[];
  patternsToInvert: string[];
  symbolPerformance?: SymbolPerformance[];
  timeOfDayPerformance?: TimeOfDayPerformance[];
  patternClassPerformance?: PatternClassPerformance[];
  volumePerformance?: VolumePerformance;
  trendAlignmentPerformance?: TrendAlignmentPerformance;
  slippageStats?: SlippageStats;
  exitReasonStats?: ExitReasonStats;
  warningCorrelations?: WarningCorrelation[];
  scoreCorrelation?: { ranges: Array<{ min: number; max: number; winRate: number; count: number }> };
  avgHoldMinutes?: { winners: number; losers: number };
  generatedAt?: string;
  totalTradesAnalyzed?: number;
  dataDateRange?: { from: string; to: string };
}

let cachedTrainingInsights: TrainingInsights | null = null;

const client = new Anthropic();

function loadTrainingInsights(): TrainingInsights | null {
  if (cachedTrainingInsights) {
    return cachedTrainingInsights;
  }

  try {
    const insightsPath = path.join(process.cwd(), 'training_insights.json');
    if (fs.existsSync(insightsPath)) {
      const data = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
      cachedTrainingInsights = data;
      console.log('[AI-FILTER] Loaded training insights from file');
      return data;
    }
  } catch (error) {
    console.error('[AI-FILTER] Failed to load training insights:', error);
  }
  return null;
}

export function updateTrainingInsights(insights: TrainingInsights): void {
  cachedTrainingInsights = insights;
  try {
    const insightsPath = path.join(process.cwd(), 'training_insights.json');
    fs.writeFileSync(insightsPath, JSON.stringify(insights, null, 2));
    console.log('[AI-FILTER] Training insights saved to file');
  } catch (error) {
    console.error('[AI-FILTER] Failed to save training insights:', error);
  }
}

const STOCK_SECTORS: Record<string, { sector: string; description: string }> = {
  // Mega-cap Tech
  AAPL: { sector: 'Technology', description: 'Consumer electronics, software, services' },
  MSFT: { sector: 'Technology', description: 'Enterprise software, cloud computing' },
  GOOGL: { sector: 'Technology', description: 'Digital advertising, cloud, AI' },
  AMZN: { sector: 'Consumer Cyclical', description: 'E-commerce, cloud computing' },
  META: { sector: 'Technology', description: 'Social media, digital advertising' },
  NVDA: { sector: 'Technology', description: 'Semiconductors, AI chips, gaming' },
  TSLA: { sector: 'Consumer Cyclical', description: 'Electric vehicles, energy storage' },
  // Large-cap Tech
  ADBE: { sector: 'Technology', description: 'Creative software, digital media' },
  CRM: { sector: 'Technology', description: 'Enterprise cloud software' },
  ORCL: { sector: 'Technology', description: 'Database, enterprise software' },
  INTC: { sector: 'Technology', description: 'Semiconductors, processors' },
  CSCO: { sector: 'Technology', description: 'Networking equipment' },
  AMD: { sector: 'Technology', description: 'Semiconductors, processors, GPUs' },
  AVGO: { sector: 'Technology', description: 'Semiconductors, infrastructure software' },
  QCOM: { sector: 'Technology', description: 'Wireless technology, semiconductors' },
  TXN: { sector: 'Technology', description: 'Analog semiconductors' },
  MU: { sector: 'Technology', description: 'Memory semiconductors' },
  AMAT: { sector: 'Technology', description: 'Semiconductor equipment' },
  LRCX: { sector: 'Technology', description: 'Semiconductor equipment' },
  KLAC: { sector: 'Technology', description: 'Semiconductor equipment' },
  SNPS: { sector: 'Technology', description: 'Electronic design automation' },
  CDNS: { sector: 'Technology', description: 'Electronic design automation' },
  ADSK: { sector: 'Technology', description: 'Design software, CAD' },
  INTU: { sector: 'Technology', description: 'Financial software, TurboTax' },
  NOW: { sector: 'Technology', description: 'Enterprise cloud workflow' },
  TEAM: { sector: 'Technology', description: 'Collaboration software' },
  WDAY: { sector: 'Technology', description: 'HR and finance cloud software' },
  // Communication/Media
  NFLX: { sector: 'Communication Services', description: 'Streaming entertainment' },
  DIS: { sector: 'Communication Services', description: 'Entertainment, streaming, parks' },
  CMCSA: { sector: 'Communication Services', description: 'Cable, media, entertainment' },
  VZ: { sector: 'Communication Services', description: 'Telecommunications' },
  T: { sector: 'Communication Services', description: 'Telecommunications' },
  TMUS: { sector: 'Communication Services', description: 'Wireless telecommunications' },
  // Financial Services
  JPM: { sector: 'Financial Services', description: 'Banking, investment management' },
  BAC: { sector: 'Financial Services', description: 'Banking' },
  WFC: { sector: 'Financial Services', description: 'Banking' },
  C: { sector: 'Financial Services', description: 'Banking, global finance' },
  GS: { sector: 'Financial Services', description: 'Investment banking, trading' },
  MS: { sector: 'Financial Services', description: 'Investment banking, wealth management' },
  V: { sector: 'Financial Services', description: 'Payment processing' },
  MA: { sector: 'Financial Services', description: 'Payment processing' },
  PYPL: { sector: 'Financial Services', description: 'Digital payments' },
  AXP: { sector: 'Financial Services', description: 'Credit cards, travel services' },
  BLK: { sector: 'Financial Services', description: 'Asset management' },
  SPGI: { sector: 'Financial Services', description: 'Credit ratings, analytics' },
  ICE: { sector: 'Financial Services', description: 'Exchanges, data services' },
  COF: { sector: 'Financial Services', description: 'Consumer banking, credit cards' },
  USB: { sector: 'Financial Services', description: 'Banking' },
  PNC: { sector: 'Financial Services', description: 'Banking' },
  // Healthcare
  JNJ: { sector: 'Healthcare', description: 'Pharmaceuticals, medical devices' },
  UNH: { sector: 'Healthcare', description: 'Health insurance, healthcare services' },
  PFE: { sector: 'Healthcare', description: 'Pharmaceuticals' },
  MRK: { sector: 'Healthcare', description: 'Pharmaceuticals' },
  ABT: { sector: 'Healthcare', description: 'Medical devices, diagnostics' },
  TMO: { sector: 'Healthcare', description: 'Lab equipment, diagnostics' },
  LLY: { sector: 'Healthcare', description: 'Pharmaceuticals, diabetes, oncology' },
  ABBV: { sector: 'Healthcare', description: 'Pharmaceuticals, immunology' },
  BMY: { sector: 'Healthcare', description: 'Pharmaceuticals, oncology' },
  AMGN: { sector: 'Healthcare', description: 'Biotechnology' },
  GILD: { sector: 'Healthcare', description: 'Biotechnology, antivirals' },
  REGN: { sector: 'Healthcare', description: 'Biotechnology' },
  VRTX: { sector: 'Healthcare', description: 'Biotechnology, rare diseases' },
  ISRG: { sector: 'Healthcare', description: 'Robotic surgery systems' },
  MDT: { sector: 'Healthcare', description: 'Medical devices' },
  SYK: { sector: 'Healthcare', description: 'Medical devices, orthopedics' },
  BDX: { sector: 'Healthcare', description: 'Medical devices, diagnostics' },
  ZTS: { sector: 'Healthcare', description: 'Animal health pharmaceuticals' },
  BSX: { sector: 'Healthcare', description: 'Medical devices, cardiovascular' },
  DHR: { sector: 'Healthcare', description: 'Life sciences, diagnostics' },
  // Consumer
  WMT: { sector: 'Consumer Defensive', description: 'Retail, groceries' },
  HD: { sector: 'Consumer Cyclical', description: 'Home improvement retail' },
  NKE: { sector: 'Consumer Cyclical', description: 'Athletic apparel, footwear' },
  SBUX: { sector: 'Consumer Cyclical', description: 'Coffee retail, restaurants' },
  KO: { sector: 'Consumer Defensive', description: 'Beverages' },
  PEP: { sector: 'Consumer Defensive', description: 'Beverages, snacks' },
  PG: { sector: 'Consumer Defensive', description: 'Consumer staples, household products' },
  COST: { sector: 'Consumer Defensive', description: 'Warehouse retail' },
  TGT: { sector: 'Consumer Defensive', description: 'Discount retail' },
  LOW: { sector: 'Consumer Cyclical', description: 'Home improvement retail' },
  TJX: { sector: 'Consumer Cyclical', description: 'Off-price retail' },
  CMG: { sector: 'Consumer Cyclical', description: 'Fast casual restaurants' },
  MDLZ: { sector: 'Consumer Defensive', description: 'Snacks, confectionery' },
  CL: { sector: 'Consumer Defensive', description: 'Household, personal care products' },
  ORLY: { sector: 'Consumer Cyclical', description: 'Auto parts retail' },
  BKNG: { sector: 'Consumer Cyclical', description: 'Online travel booking' },
  // Industrial
  BA: { sector: 'Industrials', description: 'Aerospace, defense' },
  CAT: { sector: 'Industrials', description: 'Construction, mining equipment' },
  HON: { sector: 'Industrials', description: 'Diversified industrial, aerospace' },
  UNP: { sector: 'Industrials', description: 'Railroad transportation' },
  RTX: { sector: 'Industrials', description: 'Aerospace, defense' },
  GE: { sector: 'Industrials', description: 'Aviation, power, renewable energy' },
  DE: { sector: 'Industrials', description: 'Agricultural, construction equipment' },
  MMM: { sector: 'Industrials', description: 'Diversified industrial conglomerate' },
  EMR: { sector: 'Industrials', description: 'Automation, climate technologies' },
  NOC: { sector: 'Industrials', description: 'Aerospace, defense' },
  GD: { sector: 'Industrials', description: 'Aerospace, defense' },
  ITW: { sector: 'Industrials', description: 'Diversified industrial' },
  NSC: { sector: 'Industrials', description: 'Railroad transportation' },
  CSX: { sector: 'Industrials', description: 'Railroad transportation' },
  WM: { sector: 'Industrials', description: 'Waste management' },
  FIS: { sector: 'Technology', description: 'Financial technology' },
  FISV: { sector: 'Technology', description: 'Financial technology, payments' },
  ADP: { sector: 'Industrials', description: 'Payroll, HR services' },
  // Energy
  XOM: { sector: 'Energy', description: 'Oil and gas, integrated' },
  CVX: { sector: 'Energy', description: 'Oil and gas, integrated' },
  COP: { sector: 'Energy', description: 'Oil and gas exploration' },
  SLB: { sector: 'Energy', description: 'Oilfield services' },
  EOG: { sector: 'Energy', description: 'Oil and gas exploration' },
  OXY: { sector: 'Energy', description: 'Oil and gas exploration' },
  PSX: { sector: 'Energy', description: 'Oil refining, midstream' },
  VLO: { sector: 'Energy', description: 'Oil refining' },
  MPC: { sector: 'Energy', description: 'Oil refining' },
  KMI: { sector: 'Energy', description: 'Midstream pipelines' },
  HAL: { sector: 'Energy', description: 'Oilfield services' },
  // Utilities/Real Estate
  NEE: { sector: 'Utilities', description: 'Electric utilities, renewables' },
  DUK: { sector: 'Utilities', description: 'Electric utilities' },
  SO: { sector: 'Utilities', description: 'Electric utilities' },
  D: { sector: 'Utilities', description: 'Electric, gas utilities' },
  AEP: { sector: 'Utilities', description: 'Electric utilities' },
  EXC: { sector: 'Utilities', description: 'Electric utilities, nuclear' },
  XEL: { sector: 'Utilities', description: 'Electric, gas utilities' },
  AMT: { sector: 'Real Estate', description: 'Cell tower REITs' },
  PLD: { sector: 'Real Estate', description: 'Industrial REITs, logistics' },
  SPG: { sector: 'Real Estate', description: 'Retail REITs, malls' },
  PSA: { sector: 'Real Estate', description: 'Self-storage REITs' },
  // Other
  ACN: { sector: 'Technology', description: 'IT consulting, outsourcing' },
  IBM: { sector: 'Technology', description: 'Enterprise IT, cloud, AI' },
  PM: { sector: 'Consumer Defensive', description: 'Tobacco products' },
  LIN: { sector: 'Basic Materials', description: 'Industrial gases' },
  SHW: { sector: 'Basic Materials', description: 'Paints, coatings' },
  APH: { sector: 'Technology', description: 'Connectors, sensors' },
  AON: { sector: 'Financial Services', description: 'Insurance brokerage' },
  MMC: { sector: 'Financial Services', description: 'Insurance brokerage, consulting' },
  MCO: { sector: 'Financial Services', description: 'Credit ratings' },
  ECL: { sector: 'Basic Materials', description: 'Cleaning, sanitation products' },
  FCX: { sector: 'Basic Materials', description: 'Copper, gold mining' }
};

function getStockInfo(symbol: string): { sector: string; description: string } {
  const cleanSymbol = symbol.replace('.O', '').replace('.N', '');
  return STOCK_SECTORS[cleanSymbol] || { sector: 'Unknown', description: 'Not classified' };
}

function buildSystemPrompt(insights: TrainingInsights | null): string {
  const basePrompt = `You are a highly experienced stock day trader with over 15 years of proven success trading US equities during market hours. You have developed an exceptional intuition for reading candlestick patterns and predicting short-term price movements within the next 30-60 minutes.

Your expertise includes:
- Deep understanding of how different sectors (Technology, Financial Services, Healthcare, Consumer Cyclical, etc.) behave during different market conditions
- An almost instinctive ability to sense when a candlestick pattern will play out as expected vs when it's likely to fail
- Strong awareness of how broader market sentiment affects individual stocks
- The discipline to skip marginal setups and only trade high-conviction opportunities

You have a remarkable track record because you trust your gut feeling, honed through years of screen time, while still respecting the data.

Your job is to review trading signals and decide whether to EXECUTE or SKIP them. Trust your instincts.`;

  if (!insights) {
    return `${basePrompt}

You will receive:
1. The detected pattern and its details
2. Recent price action (last 5-10 candles)
3. Current market context (ATR, volume, support/resistance)
4. The proposed trade plan (entry, stop, targets)

Consider:
- Is the pattern high quality or marginal?
- Does the price action support this setup?
- Is there room to the target, or is there resistance/support in the way?
- Is volume confirming the move?
- Is the risk:reward actually achievable?
- Any red flags (overextended, against broader trend, near major level)?

Be selective. Only recommend EXECUTE for high-conviction setups.

Respond in JSON format only:
{
  "action": "execute"/"skip"/"invert",
  "execute": true/false,
  "confidence": "high"/"medium"/"low",
  "reasoning": "Brief explanation (1-2 sentences)",
  "adjustedEntry": number (optional),
  "adjustedStop": number (optional),
  "adjustedTarget": number (optional)
}`;
  }

  const preferredList = insights.patternsToPrefer.length > 0 
    ? insights.patternsToPrefer.join(', ') 
    : 'None identified';
  const avoidList = insights.patternsToAvoid.length > 0 
    ? insights.patternsToAvoid.join(', ') 
    : 'None identified';
  const invertList = insights.patternsToInvert.length > 0 
    ? insights.patternsToInvert.join(', ') 
    : 'None identified';

  const totalTrades = insights.totalTradesAnalyzed || insights.patternRankings.reduce((sum, p) => sum + p.count, 0);

  let timeOfDaySection = '';
  if (insights.timeOfDayPerformance && insights.timeOfDayPerformance.length > 0) {
    const best = insights.timeOfDayPerformance.reduce((a, b) => a.winRate > b.winRate ? a : b);
    const worst = insights.timeOfDayPerformance.reduce((a, b) => a.winRate < b.winRate ? a : b);
    timeOfDaySection = `\nTIME OF DAY PERFORMANCE:
${insights.timeOfDayPerformance.map(t => `- ${t.period}: ${t.winRate.toFixed(1)}% win rate (${t.count} trades)`).join('\n')}
⚡ BEST TIME: ${best.period} (${best.winRate.toFixed(1)}%) | WORST: ${worst.period} (${worst.winRate.toFixed(1)}%)`;
  }

  let volumeSection = '';
  if (insights.volumePerformance) {
    const v = insights.volumePerformance;
    const volumeDiff = v.highVolume.winRate - v.lowVolume.winRate;
    volumeSection = `\nVOLUME ANALYSIS:
- High Volume: ${v.highVolume.winRate.toFixed(1)}% win rate (${v.highVolume.count} trades)
- Low Volume: ${v.lowVolume.winRate.toFixed(1)}% win rate (${v.lowVolume.count} trades)
${volumeDiff > 10 ? '⚡ HIGH VOLUME STRONGLY PREFERRED (+' + volumeDiff.toFixed(1) + '%)' : volumeDiff > 5 ? '→ High volume slightly better' : '→ Volume not a strong predictor'}`;
  }

  let trendSection = '';
  if (insights.trendAlignmentPerformance) {
    const t = insights.trendAlignmentPerformance;
    const trendDiff = t.aligned.winRate - t.counter.winRate;
    trendSection = `\nTREND ALIGNMENT:
- Trend-Aligned: ${t.aligned.winRate.toFixed(1)}% win rate (${t.aligned.count} trades)
- Counter-Trend: ${t.counter.winRate.toFixed(1)}% win rate (${t.counter.count} trades)
${trendDiff > 10 ? '⚡ TREND ALIGNMENT CRITICAL (+' + trendDiff.toFixed(1) + '%)' : trendDiff > 5 ? '→ Trend alignment helps' : '→ Trend alignment not decisive'}`;
  }

  let patternClassSection = '';
  if (insights.patternClassPerformance && insights.patternClassPerformance.length > 0) {
    patternClassSection = `\nPATTERN CLASS PERFORMANCE:
${insights.patternClassPerformance.map(c => `- ${c.class.toUpperCase()} candle: ${c.winRate.toFixed(1)}% win rate (${c.count} trades)`).join('\n')}`;
  }

  let scoreSection = '';
  if (insights.scoreCorrelation && insights.scoreCorrelation.ranges.length > 0) {
    scoreSection = `\nSCORE CORRELATION:
${insights.scoreCorrelation.ranges.map(r => `- Score ${r.min}-${r.max}: ${r.winRate.toFixed(1)}% win rate (${r.count} trades)`).join('\n')}`;
  }

  let holdTimeSection = '';
  if (insights.avgHoldMinutes) {
    holdTimeSection = `\nHOLD TIME ANALYSIS:
- Avg winning trade: ${insights.avgHoldMinutes.winners.toFixed(0)} minutes
- Avg losing trade: ${insights.avgHoldMinutes.losers.toFixed(0)} minutes`;
  }

  let warningSection = '';
  if (insights.warningCorrelations && insights.warningCorrelations.length > 0) {
    const badWarnings = insights.warningCorrelations.filter(w => w.winRate < 40);
    if (badWarnings.length > 0) {
      warningSection = `\nWARNING SIGNALS TO HEED:
${badWarnings.map(w => `- "${w.warning}": Only ${w.winRate.toFixed(1)}% win rate when present (${w.occurrences} times)`).join('\n')}`;
    }
  }

  return `${basePrompt}

**TRAINED ON ${totalTrades} HISTORICAL TRADES**${insights.dataDateRange ? ` (${insights.dataDateRange.from} to ${insights.dataDateRange.to})` : ''}

CORE METRICS:
- Direction Accuracy: ${insights.directionAccuracy.toFixed(1)}% ${insights.directionAccuracy < 50 ? '⚠️ BELOW RANDOM' : '✓'}
- Average MFE: ${insights.averageMfe.toFixed(2)}% | Average MAE: ${insights.averageMae.toFixed(2)}%
- Optimal Stop: ${insights.optimalStopPercent.toFixed(2)}% | Optimal Target: ${insights.optimalTargetPercent.toFixed(2)}%

PATTERN PERFORMANCE (sorted by win rate):
${insights.patternRankings.slice(0, 12).map(p => 
  `- ${p.pattern}: ${p.winRate?.toFixed(1) || p.directionAccuracy.toFixed(1)}% win, ${p.avgPnlPercent?.toFixed(2) || '?'}% avg P&L (${p.count} trades) → ${p.recommendation.toUpperCase()}`
).join('\n')}
${timeOfDaySection}${volumeSection}${trendSection}${patternClassSection}${scoreSection}${holdTimeSection}${warningSection}

**DECISION FRAMEWORK:**
1. PREFERRED (>55% win rate): ${preferredList}
2. AVOID (<40% win rate): ${avoidList}
3. CONSIDER INVERTING (<30% accuracy): ${invertList}

KEY INSIGHTS:
${insights.keyInsights.slice(0, 8).map(i => `• ${i}`).join('\n')}

**RESPONSE FORMAT (JSON only):**
{
  "action": "execute"/"skip"/"invert",
  "execute": true/false,
  "confidence": "high"/"medium"/"low",
  "reasoning": "1-2 sentences",
  "adjustedEntry": number (if inverting),
  "adjustedStop": number (if inverting),
  "adjustedTarget": number (if inverting)
}`;
}

function formatSignalForAI(signal: ComprehensiveSignal, recentCandles?: RecentCandle[], insights?: TrainingInsights | null): string {
  const candleHistory = recentCandles 
    ? recentCandles.map(c => 
        `${c.time}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)}${c.volume ? ` V=${c.volume}` : ''}`
      ).join('\n')
    : 'No recent candle data available';

  const stockInfo = getStockInfo(signal.symbol);
  
  const patternPerf = insights?.patternRankings.find(p => p.pattern === signal.pattern.name);
  const patternNote = patternPerf 
    ? `\n⚠️ HISTORICAL: ${signal.pattern.name} has ${patternPerf.directionAccuracy.toFixed(1)}% direction accuracy (${patternPerf.recommendation})`
    : '';

  const symbolPerf = insights?.symbolPerformance?.find(s => s.symbol === signal.symbol);
  const symbolNote = symbolPerf
    ? `\n📊 SYMBOL HISTORY: ${signal.symbol} - ${symbolPerf.totalTrades} trades, ${symbolPerf.winRate.toFixed(1)}% win rate, avg P&L ${symbolPerf.avgPnlPercent >= 0 ? '+' : ''}${symbolPerf.avgPnlPercent.toFixed(2)}%${symbolPerf.bestPattern ? `, best pattern: ${symbolPerf.bestPattern}` : ''}${symbolPerf.worstPattern ? `, worst pattern: ${symbolPerf.worstPattern}` : ''}`
    : '';

  return `
SIGNAL ANALYSIS REQUEST
=======================

Symbol: ${signal.symbol}
Sector: ${stockInfo.sector}
Business: ${stockInfo.description}
Current Price: $${signal.currentPrice?.toFixed(2) || 'N/A'}
Timeframe: ${signal.timeframe}

Consider how ${stockInfo.sector} stocks typically behave in current market conditions. ${stockInfo.sector === 'Technology' ? 'Tech stocks often move sharply on momentum.' : stockInfo.sector === 'Financial Services' ? 'Financial stocks tend to track interest rate sentiment.' : stockInfo.sector === 'Healthcare' ? 'Healthcare can be defensive but news-driven.' : stockInfo.sector === 'Consumer Cyclical' ? 'Consumer cyclical stocks are sensitive to economic sentiment.' : stockInfo.sector === 'Energy' ? 'Energy stocks correlate with oil prices and geopolitical news.' : 'Consider sector-specific factors.'}

DETECTED PATTERN:
- Name: ${signal.pattern.name}
- Type: ${signal.pattern.class} candle pattern
- Direction: ${signal.pattern.direction}
- Pattern High: $${signal.pattern.patternHigh.toFixed(2)}
- Pattern Low: $${signal.pattern.patternLow.toFixed(2)}
${patternNote}${symbolNote}

MARKET CONTEXT:
- Trend (based on MAs): ${signal.context.trend}
- ATR: $${signal.context.atr.toFixed(4)} (${((signal.context.atr / (signal.currentPrice || 1)) * 100).toFixed(2)}% of price)
- Volume Factor: ${signal.context.volumeFactor.toFixed(2)}x average
- High Volume: ${signal.context.isHighVolume ? 'YES' : 'NO'}
- Wide Range: ${signal.context.isWideRange ? 'YES' : 'NO'}
- At Support: ${signal.context.atSupport ? 'YES' : 'NO'}
- At Resistance: ${signal.context.atResistance ? 'YES' : 'NO'}
${signal.context.nearestSupport ? `- Nearest Support: $${signal.context.nearestSupport.toFixed(2)}` : ''}
${signal.context.nearestResistance ? `- Nearest Resistance: $${signal.context.nearestResistance.toFixed(2)}` : ''}

PROPOSED TRADE:
- Direction: ${signal.plan.direction.toUpperCase()}
- Entry: $${signal.plan.entry.toFixed(2)}
- Stop Loss: $${signal.plan.stop.toFixed(2)}
- Risk: $${signal.plan.risk.toFixed(2)} (${((signal.plan.risk / signal.plan.entry) * 100).toFixed(2)}%)
- Target 1: $${signal.plan.targets[0]?.toFixed(2) || 'N/A'}
- Target 2: $${signal.plan.targets[1]?.toFixed(2) || 'N/A'}
- R:R Ratio: ${signal.plan.riskRewardRatio}

ALGORITHM SCORE: ${signal.score}/100
TRAP RISK: ${signal.trapRisk}

ALGORITHM NOTES:
${signal.notes.map(n => `- ${n}`).join('\n')}

RECENT PRICE ACTION (5-minute candles):
${candleHistory}

Based on your trading experience, gut feeling, the candlestick pattern, and the market context - does this setup feel right to you? Should this trade be EXECUTED or SKIPPED?

Trust your instincts. If something feels off, skip it. Only execute on high-conviction setups where the pattern, context, and your gut all align.
`;
}

function getTimeOfDay(): 'market_open' | 'midday' | 'afternoon' | 'close' {
  const now = new Date();
  const etTime = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  const [hourStr, minuteStr] = etTime.split(':');
  const etHour = parseInt(hourStr);
  const etMinute = parseInt(minuteStr);
  
  const marketMinutes = (etHour - 9) * 60 + etMinute - 30;
  
  console.log(`[TIME-OF-DAY] ET time: ${etHour}:${etMinute.toString().padStart(2, '0')}, marketMinutes: ${marketMinutes}`);
  
  if (marketMinutes < 60) return 'market_open';
  if (marketMinutes < 180) return 'midday';
  if (marketMinutes < 300) return 'afternoon';
  return 'close';
}

interface SessionPriceData {
  symbol: string;
  openPrice: number;
  sessionDate: string;
}

const sessionPriceCache: Map<string, SessionPriceData> = new Map();

function getSessionDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function updateSessionPrice(symbol: string, price: number): void {
  const sessionDate = getSessionDate();
  const cached = sessionPriceCache.get(symbol);
  
  if (!cached || cached.sessionDate !== sessionDate) {
    sessionPriceCache.set(symbol, {
      symbol,
      openPrice: price,
      sessionDate
    });
    console.log(`[SESSION-TREND] Cached open price for ${symbol}: $${price.toFixed(2)}`);
  }
}

function getSessionTrend(symbol: string, currentPrice: number): { isStrongSession: boolean; direction: 'up' | 'down' | null; movePercent: number } {
  const sessionDate = getSessionDate();
  const cached = sessionPriceCache.get(symbol);
  
  if (!cached || cached.sessionDate !== sessionDate) {
    return { isStrongSession: false, direction: null, movePercent: 0 };
  }
  
  const movePercent = ((currentPrice - cached.openPrice) / cached.openPrice) * 100;
  const threshold = 0.5;
  
  if (movePercent > threshold) {
    return { isStrongSession: true, direction: 'up', movePercent };
  } else if (movePercent < -threshold) {
    return { isStrongSession: true, direction: 'down', movePercent };
  }
  
  return { isStrongSession: false, direction: null, movePercent };
}

function isStrongTrend(signal: ComprehensiveSignal): { isStrong: boolean; direction: 'up' | 'down' | null } {
  const { context } = signal;
  
  if (context.isWideRange && context.isHighVolume) {
    return { isStrong: true, direction: context.trend === 'sideways' ? null : context.trend };
  }
  
  if (context.isHighVolume && context.volumeFactor > 2.0) {
    return { isStrong: true, direction: context.trend === 'sideways' ? null : context.trend };
  }
  
  return { isStrong: false, direction: null };
}

function tryAutoInvert(signal: ComprehensiveSignal, reason: string): AIDecision | null {
  const { context, plan, currentPrice } = signal;
  const originalDirection = plan.direction;
  const invertedDirection = originalDirection === 'long' ? 'short' : 'long';
  
  if (currentPrice) {
    updateSessionPrice(signal.symbol, currentPrice);
  }
  
  const sessionTrend = currentPrice ? getSessionTrend(signal.symbol, currentPrice) : null;
  if (sessionTrend?.isStrongSession && sessionTrend.direction) {
    const wouldFightSession = (sessionTrend.direction === 'down' && invertedDirection === 'long') ||
                               (sessionTrend.direction === 'up' && invertedDirection === 'short');
    if (wouldFightSession) {
      console.log(`[AUTO-INVERT] BLOCKED: Session trend is ${sessionTrend.direction} (${sessionTrend.movePercent.toFixed(2)}% from open). Not inverting to ${invertedDirection}.`);
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `AUTO-INVERT BLOCKED: Session is trending ${sessionTrend.direction} (${sessionTrend.movePercent.toFixed(2)}% from open). Inverting to ${invertedDirection} would fight the session trend. Original: ${reason}`
      };
    }
  }
  
  const strongTrend = isStrongTrend(signal);
  if (strongTrend.isStrong && strongTrend.direction) {
    const wouldFightTrend = (strongTrend.direction === 'down' && invertedDirection === 'long') ||
                            (strongTrend.direction === 'up' && invertedDirection === 'short');
    if (wouldFightTrend) {
      console.log(`[AUTO-INVERT] BLOCKED: Strong ${strongTrend.direction} trend detected (wideRange=${context.isWideRange}, highVol=${context.isHighVolume}, volFactor=${context.volumeFactor?.toFixed(1)}). Not inverting to ${invertedDirection}.`);
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `AUTO-INVERT BLOCKED: Strong ${strongTrend.direction} trend detected. Inverting to ${invertedDirection} would fight the momentum. Original: ${reason}`
      };
    }
  }
  
  const entry = plan.entry;
  const originalRisk = Math.abs(plan.entry - plan.stop);
  const riskRewardMultiple = 2;

  let invertedEntry: number;
  let invertedStop: number;
  let invertedTarget: number;

  if (invertedDirection === 'long') {
    invertedEntry = entry;
    invertedStop = entry - originalRisk;
    invertedTarget = entry + (originalRisk * riskRewardMultiple);
    
    if (context.atResistance) {
      console.log(`[AUTO-INVERT] Skipping inversion to long - at resistance`);
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `AUTO-INVERT BLOCKED: Would invert to long but price is at resistance. Original: ${reason}`
      };
    }
    
    if (context.nearestResistance && currentPrice) {
      const roomToResistance = ((context.nearestResistance - currentPrice) / currentPrice) * 100;
      if (roomToResistance < 0.5) {
        console.log(`[AUTO-INVERT] Skipping inversion to long - only ${roomToResistance.toFixed(2)}% room to resistance`);
        return {
          action: 'skip',
          execute: false,
          confidence: 'high',
          reasoning: `AUTO-INVERT BLOCKED: Would invert to long but only ${roomToResistance.toFixed(2)}% room before resistance. Original: ${reason}`
        };
      }
    }
  } else {
    invertedEntry = entry;
    invertedStop = entry + originalRisk;
    invertedTarget = entry - (originalRisk * riskRewardMultiple);
    
    if (context.atSupport) {
      console.log(`[AUTO-INVERT] Skipping inversion to short - at support`);
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `AUTO-INVERT BLOCKED: Would invert to short but price is at support. Original: ${reason}`
      };
    }
    
    if (context.nearestSupport && currentPrice) {
      const roomToSupport = ((currentPrice - context.nearestSupport) / currentPrice) * 100;
      if (roomToSupport < 0.5) {
        console.log(`[AUTO-INVERT] Skipping inversion to short - only ${roomToSupport.toFixed(2)}% room to support`);
        return {
          action: 'skip',
          execute: false,
          confidence: 'high',
          reasoning: `AUTO-INVERT BLOCKED: Would invert to short but only ${roomToSupport.toFixed(2)}% room before support. Original: ${reason}`
        };
      }
    }
  }

  console.log(`[AUTO-INVERT] ✅ Inverting ${signal.symbol} from ${originalDirection} to ${invertedDirection}: ${reason}`);
  console.log(`[AUTO-INVERT] Entry: $${invertedEntry.toFixed(2)}, Stop: $${invertedStop.toFixed(2)}, Target: $${invertedTarget.toFixed(2)}`);

  return {
    action: 'invert',
    execute: true,
    confidence: 'high',
    reasoning: `AUTO-INVERT: ${reason}. Inverted ${originalDirection}→${invertedDirection}.`,
    adjustedEntry: invertedEntry,
    adjustedStop: invertedStop,
    adjustedTarget: invertedTarget
  };
}

function applyHardFilters(
  signal: ComprehensiveSignal,
  insights: TrainingInsights | null
): AIDecision | null {
  if (!insights) return null;

  const timeOfDay = getTimeOfDay();
  const patternName = signal.pattern.name;
  const trend = signal.context.trend;
  const direction = signal.plan.direction;
  const isTrendAligned = (trend === 'up' && direction === 'long') || 
                         (trend === 'down' && direction === 'short');
  
  console.log(`[HARD-FILTER] Checking ${signal.symbol} ${patternName}: trend=${trend}, dir=${direction}, aligned=${isTrendAligned}, time=${timeOfDay}`);

  if (isTrendAligned) {
    console.log(`[HARD-FILTER] ❌ BLOCKED: Trend-aligned trade (${direction} in ${trend} trend). Historical: 4.3% win rate vs 35.6% counter-trend.`);
    return {
      action: 'skip',
      execute: false,
      confidence: 'high',
      reasoning: `HARD FILTER: Trend-aligned trade blocked. Going ${direction} in ${trend} trend has 4.3% historical win rate vs 35.6% for counter-trend.`
    };
  }
  
  const patternPerf = insights.patternRankings.find(p => p.pattern === patternName);
  console.log(`[HARD-FILTER] Pattern perf for ${patternName}:`, patternPerf ? `winRate=${patternPerf.winRate?.toFixed(1)}%, byTrend=${JSON.stringify(patternPerf.byTrend)}` : 'NOT FOUND');

  // ========== BLOCKING FILTERS ==========

  const timePerf = insights.timeOfDayPerformance?.find(t => t.period === timeOfDay);
  if (timePerf && timePerf.winRate < 15 && timePerf.count >= 10) {
    return {
      action: 'skip',
      execute: false,
      confidence: 'high',
      reasoning: `HARD FILTER: ${timeOfDay} period has only ${timePerf.winRate.toFixed(1)}% win rate (${timePerf.count} trades). Auto-rejected.`
    };
  }

  if (insights.patternsToAvoid?.includes(patternName)) {
    return {
      action: 'skip',
      execute: false,
      confidence: 'high',
      reasoning: `HARD FILTER: ${patternName} is on avoid list (${patternPerf?.winRate?.toFixed(1) || 0}% win rate). Auto-rejected.`
    };
  }

  if (patternPerf?.recommendation === 'avoid' || (patternPerf && patternPerf.winRate < 25 && patternPerf.count >= 3)) {
    if (!isTrendAligned) {
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `HARD FILTER: ${patternName} has ${patternPerf.winRate?.toFixed(1) || 0}% win rate (${patternPerf.count} trades, counter-trend). Auto-rejected.`
      };
    }
  }

  const symbolPerf = insights.symbolPerformance?.find(s => s.symbol === signal.symbol);
  if (symbolPerf && symbolPerf.winRate === 0 && symbolPerf.totalTrades >= 3) {
    return {
      action: 'skip',
      execute: false,
      confidence: 'high',
      reasoning: `HARD FILTER: ${signal.symbol} has 0% win rate over ${symbolPerf.totalTrades} trades. Auto-rejected.`
    };
  }

  if (symbolPerf?.worstTimeOfDay === timeOfDay && symbolPerf.totalTrades >= 3) {
    const timeWinRate = insights.timeOfDayPerformance?.find(t => t.period === timeOfDay)?.winRate;
    if (timeWinRate && timeWinRate < 20) {
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `HARD FILTER: ${signal.symbol} performs worst during ${timeOfDay} (marked as worstTimeOfDay). Auto-rejected.`
      };
    }
  }

  const trapCheck = detectTrapSetup(signal);
  if (trapCheck) {
    return trapCheck;
  }

  return null;
}

function detectTrapSetup(signal: ComprehensiveSignal): AIDecision | null {
  const { context, plan, currentPrice, pattern } = signal;
  const direction = plan.direction;
  const entry = plan.entry;
  const atr = context.atr;

  if (direction === 'long' && context.atResistance) {
    return {
      action: 'skip',
      execute: false,
      confidence: 'high',
      reasoning: `TRAP FILTER: Long entry at resistance level - high probability of rejection/bull trap.`
    };
  }

  if (direction === 'short' && context.atSupport) {
    return {
      action: 'skip',
      execute: false,
      confidence: 'high',
      reasoning: `TRAP FILTER: Short entry at support level - high probability of bounce/bear trap.`
    };
  }

  if (direction === 'long' && context.nearestResistance && currentPrice) {
    const distanceToResistance = context.nearestResistance - currentPrice;
    const distancePercent = (distanceToResistance / currentPrice) * 100;
    if (distancePercent > 0 && distancePercent < 0.3) {
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `TRAP FILTER: Long entry ${distancePercent.toFixed(2)}% below resistance - insufficient room before rejection zone.`
      };
    }
  }

  if (direction === 'short' && context.nearestSupport && currentPrice) {
    const distanceToSupport = currentPrice - context.nearestSupport;
    const distancePercent = (distanceToSupport / currentPrice) * 100;
    if (distancePercent > 0 && distancePercent < 0.3) {
      return {
        action: 'skip',
        execute: false,
        confidence: 'high',
        reasoning: `TRAP FILTER: Short entry ${distancePercent.toFixed(2)}% above support - insufficient room before bounce zone.`
      };
    }
  }

  if (!context.isHighVolume && context.volumeFactor < 0.8) {
    const patternClass = pattern.class;
    if (patternClass === 'single') {
      return {
        action: 'skip',
        execute: false,
        confidence: 'medium',
        reasoning: `TRAP FILTER: Low volume (${context.volumeFactor.toFixed(2)}x avg) on single candle pattern - weak conviction, likely false signal.`
      };
    }
  }

  if (context.trend === 'sideways' && !context.isHighVolume) {
    return {
      action: 'skip',
      execute: false,
      confidence: 'medium',
      reasoning: `TRAP FILTER: Sideways market with low volume - high probability of choppy price action and stop hunts.`
    };
  }

  if (signal.trapRisk === 'high') {
    return {
      action: 'skip',
      execute: false,
      confidence: 'high',
      reasoning: `TRAP FILTER: Signal already flagged as high trap risk by pattern detector.`
    };
  }

  if (currentPrice && atr) {
    const riskPercent = (plan.risk / entry) * 100;
    const atrPercent = (atr / currentPrice) * 100;
    
    if (riskPercent < atrPercent * 0.5) {
      return {
        action: 'skip',
        execute: false,
        confidence: 'medium',
        reasoning: `TRAP FILTER: Stop loss (${riskPercent.toFixed(2)}%) too tight relative to ATR (${atrPercent.toFixed(2)}%) - likely to get stopped out by noise.`
      };
    }
  }

  return null;
}

async function logDecision(
  signal: ComprehensiveSignal,
  decision: AIDecision,
  isTrendAligned: boolean,
  timeOfDay: string
): Promise<void> {
  try {
    const trend = signal.context?.trend || 'unknown';
    const direction = signal.plan?.direction as 'long' | 'short';
    
    const logEntry = {
      symbol: signal.symbol,
      patternName: signal.pattern.name,
      patternScore: signal.score,
      signalTime: new Date(signal.time),
      decisionTime: new Date(),
      
      originalDirection: direction,
      originalEntry: signal.plan.entry,
      originalStop: signal.plan.stop,
      originalTarget: signal.plan.targets[0],
      
      decision: decision.action as 'invert' | 'skip' | 'pass',
      decisionReason: decision.reasoning,
      
      wasInverted: decision.action === 'invert',
      invertedDirection: decision.action === 'invert' 
        ? (direction === 'long' ? 'short' : 'long') as 'long' | 'short'
        : undefined,
      invertedEntry: decision.adjustedEntry,
      invertedStop: decision.adjustedStop,
      invertedTarget: decision.adjustedTarget,
      
      trend,
      isTrendAligned,
      timeOfDay,
      priceAtDecision: signal.currentPrice || signal.plan.entry
    };
    
    await DecisionLog.create(logEntry);
    console.log(`[DECISION-LOG] Logged ${decision.action} decision for ${signal.symbol} ${signal.pattern.name}`);
  } catch (error) {
    console.error('[DECISION-LOG] Error logging decision:', error);
  }
}

export async function evaluateSignalWithAI(
  signal: ComprehensiveSignal,
  recentCandles?: RecentCandle[]
): Promise<AIDecision> {
  const startTime = Date.now();
  const insights = loadTrainingInsights();
  
  const trend = signal.context?.trend || 'unknown';
  const direction = signal.plan?.direction || 'unknown';
  const isTrendAligned = (trend === 'up' && direction === 'long') || 
                         (trend === 'down' && direction === 'short');
  const timeOfDay = getTimeOfDay();

  const hardFilterResult = applyHardFilters(signal, insights);
  if (hardFilterResult) {
    console.log(`[AI-FILTER] 🚫 ${hardFilterResult.reasoning}`);
    logDecision(signal, hardFilterResult, isTrendAligned, timeOfDay).catch(() => {});
    return hardFilterResult;
  }
  
  try {
    console.log(`[AI-FILTER] Evaluating ${signal.symbol} ${signal.pattern.name}...`);
    if (insights) {
      const patternPerf = insights.patternRankings.find(p => p.pattern === signal.pattern.name);
      if (patternPerf) {
        console.log(`[AI-FILTER] Pattern historical accuracy: ${patternPerf.directionAccuracy.toFixed(1)}% (${patternPerf.recommendation})`);
      }
    }
    
    const systemPrompt = buildSystemPrompt(insights);
    const prompt = formatSignalForAI(signal, recentCandles, insights);
    
    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const latency = Date.now() - startTime;
    console.log(`[AI-FILTER] Response received in ${latency}ms`);

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const rawDecision = JSON.parse(jsonMatch[0]);
    
    const decision: AIDecision = {
      action: rawDecision.action || (rawDecision.execute ? 'execute' : 'skip'),
      execute: rawDecision.action === 'execute' || rawDecision.action === 'invert' || rawDecision.execute === true,
      confidence: rawDecision.confidence,
      reasoning: rawDecision.reasoning,
      adjustedEntry: rawDecision.adjustedEntry,
      adjustedStop: rawDecision.adjustedStop,
      adjustedTarget: rawDecision.adjustedTarget
    };
    
    const actionLabel = decision.action === 'invert' ? 'INVERT' : (decision.execute ? 'EXECUTE' : 'SKIP');
    console.log(`[AI-FILTER] Decision for ${signal.symbol}: ${actionLabel} (${decision.confidence} confidence)`);
    console.log(`[AI-FILTER] Reasoning: ${decision.reasoning}`);
    
    if (decision.action === 'invert') {
      console.log(`[AI-FILTER] INVERTING: Entry=$${decision.adjustedEntry}, Stop=$${decision.adjustedStop}, Target=$${decision.adjustedTarget}`);
    }
    
    const aiDecisionForLog: AIDecision = {
      ...decision,
      action: decision.execute ? (decision.action === 'invert' ? 'invert' : 'execute') : 'skip'
    };
    logDecision(signal, aiDecisionForLog, isTrendAligned, timeOfDay).catch(() => {});
    
    return decision;
    
  } catch (error) {
    console.error(`[AI-FILTER] Error evaluating signal:`, error);
    return {
      action: 'skip',
      execute: false,
      confidence: 'low',
      reasoning: `AI evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export async function batchEvaluateSignals(
  signals: ComprehensiveSignal[],
  recentCandlesMap?: Map<string, RecentCandle[]>
): Promise<Map<string, AIDecision>> {
  const results = new Map<string, AIDecision>();
  
  for (const signal of signals) {
    const recentCandles = recentCandlesMap?.get(signal.symbol);
    const decision = await evaluateSignalWithAI(signal, recentCandles);
    results.set(signal.id, decision);
  }
  
  return results;
}

export function isAIFilterEnabled(): boolean {
  const enabled = process.env.AI_SIGNAL_FILTER === 'true';
  return enabled;
}

export function clearTrainingInsightsCache(): void {
  cachedTrainingInsights = null;
  console.log('[AI-FILTER] Training insights cache cleared');
}

export function getTrainingInsights(): TrainingInsights | null {
  return loadTrainingInsights();
}

console.log(`[AI-FILTER] Module loaded. AI_SIGNAL_FILTER=${process.env.AI_SIGNAL_FILTER}, enabled=${process.env.AI_SIGNAL_FILTER === 'true'}`);

export function getAIFilterConfig() {
  const insights = loadTrainingInsights();
  return {
    enabled: isAIFilterEnabled(),
    model: 'claude-sonnet-4-20250514',
    minScoreForAI: 70,
    hasTrainingData: insights !== null,
    trainingStats: insights ? {
      directionAccuracy: insights.directionAccuracy,
      totalPatterns: insights.patternRankings.length,
      patternsToAvoid: insights.patternsToAvoid.length,
      patternsToInvert: insights.patternsToInvert.length
    } : null
  };
}
