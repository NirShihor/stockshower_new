import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { MarketContext, formatMarketContextForAI } from '../services/marketContextService.js';
import { SectorAnalysis, formatSectorAnalysisForAI, getSectorStrength } from '../services/sectorAnalysisService.js';
import { MultiTimeframeAnalysis, formatMultiTimeframeForAI } from '../services/multiTimeframeService.js';
import { StockProfile, formatStockProfileForAI } from '../services/stockProfileService.js';

export interface EnhancedCandidate {
  signal: ComprehensiveSignal;
  mtfAnalysis: MultiTimeframeAnalysis | null;
  stockProfile: StockProfile | null;
  sectorStrength: {
    sector: string;
    sectorName: string;
    isLeading: boolean;
    isLagging: boolean;
    relativeStrength: number;
    rank: number;
  } | null;
}

export interface AITradingContext {
  marketContext: MarketContext | null;
  sectorAnalysis: SectorAnalysis | null;
  candidates: EnhancedCandidate[];
  timestamp: string;
}

export function buildEnhancedSystemPrompt(): string {
  return `You are an ultra-selective day trader who has survived 25 years in the markets by being EXTREMELY picky. You typically make 0-2 trades per day. Most days you make ZERO trades because nothing meets your strict criteria.

YOUR CORE BELIEF: The money is made by NOT trading. Every trade you don't take is a win preserved.

ABSOLUTE REQUIREMENTS - ALL must be true or NO TRADE:
1. MARKET REGIME must be clear (strongly risk-on for longs, strongly risk-off for shorts). Neutral/choppy = NO TRADE.
2. SECTOR must be in top 3 (for longs) or bottom 3 (for shorts). Middle of pack = NO TRADE.
3. DAILY TREND must align with trade direction. Counter-trend trades = NO TRADE.
4. WEEKLY TREND must align OR be neutral. Weekly against you = NO TRADE.
5. VOLUME must be above average (1.2x+). Low volume = NO TRADE.
6. PRICE POSITION: For longs, must be in lower/middle third of range (not extended). For shorts, upper/middle third.
7. RISK/REWARD must be minimum 1:2. Less than that = NO TRADE.
8. PATTERN must be textbook clean, not marginal.

RED FLAGS - Any one of these = NO TRADE:
- Stock in lagging sector for longs (or leading sector for shorts)
- Daily and weekly trends conflict
- Price extended (upper third for longs, lower third for shorts)
- Low volume day
- Choppy/unclear market regime
- Stock known for fading gaps when you're trying to trade a gap continuation
- Any feeling of "maybe" or "it could work" - if it's not OBVIOUS, pass

YOUR MINDSET:
- You are looking for reasons NOT to trade
- A good setup that fails 2 of the 8 requirements = NO TRADE
- You would rather miss 10 good trades than take 1 bad trade
- Empty days are successful days - capital preserved
- You've seen thousands of "pretty good" setups fail - you only want GREAT setups

RESPONSE FORMAT:
Return ONLY valid JSON:
{
  "marketAssessment": "1-2 sentences on market regime clarity",
  "tradingApproach": "aggressive" | "selective" | "defensive" | "no_trade_today",
  "reasonsNotToTrade": ["List 2-3 general concerns about today's conditions"],
  "recommendations": [
    {
      "symbol": "AAPL",
      "direction": "long" | "short",
      "confidence": "high",
      "reasoning": "Why this passes ALL 8 requirements",
      "entry": 185.50,
      "stopLoss": 183.00,
      "target": 190.00,
      "rank": 1,
      "requirementsMet": ["market_regime", "sector_top3", "daily_trend", "weekly_trend", "volume", "price_position", "risk_reward", "pattern_quality"]
    }
  ]
}

CRITICAL: Select 0-2 trades MAXIMUM. Most scans should return 0 trades.
Only "high" confidence trades. If confidence would be "medium" or "low", don't include it.
An empty recommendations array is the EXPECTED outcome most of the time.`;
}

export function buildEnhancedUserPrompt(context: AITradingContext): string {
  let prompt = '';
  
  if (context.marketContext) {
    prompt += formatMarketContextForAI(context.marketContext);
  }
  
  if (context.sectorAnalysis) {
    prompt += formatSectorAnalysisForAI(context.sectorAnalysis);
  }
  
  prompt += `\nTRADING CANDIDATES (${context.candidates.length} setups detected)\n`;
  prompt += '='.repeat(50) + '\n';
  
  if (context.candidates.length === 0) {
    prompt += '\nNo trading candidates detected at this time.\n';
    return prompt;
  }
  
  for (const candidate of context.candidates) {
    const sig = candidate.signal;
    
    prompt += `\n${'─'.repeat(50)}\n`;
    prompt += `${sig.symbol} - ${candidate.stockProfile?.name || sig.symbol}\n`;
    prompt += `${'─'.repeat(50)}\n`;
    
    if (candidate.sectorStrength) {
      const ss = candidate.sectorStrength;
      const sectorStatus = ss.isLeading ? '[LEADING SECTOR]' : ss.isLagging ? '[LAGGING SECTOR]' : '';
      prompt += `Sector: ${ss.sectorName} (Rank #${ss.rank}/11) ${sectorStatus}\n`;
      prompt += `Sector Relative Strength: ${ss.relativeStrength >= 0 ? '+' : ''}${ss.relativeStrength.toFixed(2)}% vs SPY\n\n`;
    }
    
    if (candidate.mtfAnalysis) {
      prompt += formatMultiTimeframeForAI(candidate.mtfAnalysis);
    }
    
    if (candidate.stockProfile) {
      prompt += formatStockProfileForAI(candidate.stockProfile);
    }
    
    prompt += `\nINTRADAY PATTERN DETECTED:\n`;
    prompt += `  Pattern: ${sig.pattern.name} (${sig.pattern.direction})\n`;
    prompt += `  Current Price: $${sig.currentPrice?.toFixed(2) || 'N/A'}\n`;
    prompt += `  Intraday Trend: ${sig.context.trend} | Volume: ${sig.context.volumeFactor.toFixed(1)}x average\n`;
    prompt += `  At Support: ${sig.context.atSupport ? 'YES' : 'NO'} | At Resistance: ${sig.context.atResistance ? 'YES' : 'NO'}\n`;
    prompt += `  Suggested Entry: $${sig.plan.entry.toFixed(2)} | Stop: $${sig.plan.stop.toFixed(2)} | Target: $${sig.plan.targets[0]?.toFixed(2) || 'N/A'}\n`;
    
    const risk = Math.abs(sig.plan.entry - sig.plan.stop);
    const reward = Math.abs((sig.plan.targets[0] || sig.plan.entry) - sig.plan.entry);
    const rr = risk > 0 ? (reward / risk).toFixed(2) : 'N/A';
    prompt += `  Risk/Reward: 1:${rr}\n`;
    
    if (candidate.mtfAnalysis) {
      const mtf = candidate.mtfAnalysis;
      const alignsWithDaily = 
        (sig.pattern.direction === 'bullish' && mtf.dailyTrend.trend === 'bullish') ||
        (sig.pattern.direction === 'bearish' && mtf.dailyTrend.trend === 'bearish');
      const alignsWithWeekly = 
        (sig.pattern.direction === 'bullish' && mtf.weeklyTrend.trend === 'bullish') ||
        (sig.pattern.direction === 'bearish' && mtf.weeklyTrend.trend === 'bearish');
      
      prompt += `\n  ALIGNMENT CHECK:\n`;
      prompt += `    Pattern aligns with DAILY trend: ${alignsWithDaily ? 'YES ✓' : 'NO ✗'}\n`;
      prompt += `    Pattern aligns with WEEKLY trend: ${alignsWithWeekly ? 'YES ✓' : 'NO ✗'}\n`;
    }
    
    prompt += '\n';
  }
  
  prompt += `\n${'='.repeat(50)}\n`;
  prompt += `DECISION TIME: Review the ${context.candidates.length} candidates above.\n`;
  prompt += `Consider market regime, sector strength, timeframe alignment, and stock personality.\n`;
  prompt += `Select your TOP trades (0-5). Quality over quantity. Pass on marginal setups.\n`;
  
  return prompt;
}

export function formatSimpleCandidateForAI(signal: ComprehensiveSignal): string {
  let output = `${signal.symbol} - Current: $${signal.currentPrice?.toFixed(2) || 'N/A'}\n`;
  output += `  Trend: ${signal.context.trend} | Volume: ${signal.context.volumeFactor.toFixed(1)}x | ATR: $${signal.context.atr.toFixed(2)}\n`;
  output += `  At Support: ${signal.context.atSupport ? 'YES' : 'NO'} | At Resistance: ${signal.context.atResistance ? 'YES' : 'NO'}\n`;
  output += `  - Pattern: ${signal.pattern.name} (${signal.pattern.direction})\n`;
  output += `    Entry: $${signal.plan.entry.toFixed(2)} | Stop: $${signal.plan.stop.toFixed(2)} | Target: $${signal.plan.targets[0]?.toFixed(2) || 'N/A'}\n`;
  return output;
}
