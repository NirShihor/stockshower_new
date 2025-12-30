import { Candle } from './types/index.js';
import { 
  ComprehensiveSignal, 
  TradingParameters, 
  DEFAULT_PARAMS,
  PatternDetails,
  MarketContext
} from './types/comprehensive.js';

import { buildMarketContext } from './helpers/marketStructure.js';
import { scorePattern, classifySignalStrength } from './helpers/scoring.js';
import { buildConfirmationPlan, buildTradePlan, validateTradePlan } from './helpers/tradePlanning.js';
import { detectTraps } from './helpers/trapDetection.js';

// Pattern detectors
import { detectSingleCandlePatterns } from './patterns/singleCandle.js';
import { detectDoubleCandlePatterns } from './patterns/doubleCandle.js';
import { detectTripleCandlePatterns } from './patterns/tripleCandle.js';
import { calculateATR } from './helpers/preprocessing.js';

interface CandleHistory {
  symbol: string;
  candles: Candle[];
  lastProcessedTime?: string;
}

interface RecentSignal {
  symbol: string;
  patternName: string;
  timestamp: number;
}

const historyBySymbol = new Map<string, CandleHistory>();
const recentSignals: RecentSignal[] = [];

export class ComprehensiveScanner {
  private params: TradingParameters;
  private duplicateBlockMinutes: number = 360; // Block duplicates for 6 hours (One trade per symbol per session)
  private signalRateLimiter: Map<string, number[]> = new Map(); // Track signals per hour
  private maxSignalsPerHour: number = 5; // Maximum signals per hour per symbol
  
  constructor(params: TradingParameters = DEFAULT_PARAMS) {
    this.params = params;
  }
  
  private isDuplicateSignal(symbol: string, patternName: string, nowOverride?: number): boolean {
    const now = nowOverride || Date.now();
    const blockDurationMs = this.duplicateBlockMinutes * 60 * 1000;
    
    // Clean old signals
    const cutoff = now - blockDurationMs;
    for (let i = recentSignals.length - 1; i >= 0; i--) {
      if (recentSignals[i].timestamp < cutoff) {
        recentSignals.splice(i, 1);
      }
    }
    
    // Check for duplicate
    return recentSignals.some(signal => 
      signal.symbol === symbol && 
      signal.patternName === patternName &&
      signal.timestamp > cutoff
    );
  }
  
  private addToRecentSignals(symbol: string, patternName: string, nowOverride?: number): void {
    recentSignals.push({
      symbol,
      patternName,
      timestamp: nowOverride || Date.now()
    });
  }
  
  private isRateLimited(symbol: string, nowOverride?: number): boolean {
    const now = nowOverride || Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Get or create rate limit tracker for symbol
    if (!this.signalRateLimiter.has(symbol)) {
      this.signalRateLimiter.set(symbol, []);
    }
    
    const timestamps = this.signalRateLimiter.get(symbol)!;
    
    // Remove timestamps older than 1 hour
    const recentTimestamps = timestamps.filter(ts => ts > oneHourAgo);
    this.signalRateLimiter.set(symbol, recentTimestamps);
    
    // Check if we've exceeded the limit
    if (recentTimestamps.length >= this.maxSignalsPerHour) {
      console.log(`[RATE-LIMIT] Symbol ${symbol} has reached max signals per hour (${this.maxSignalsPerHour})`);
      return true;
    }
    
    return false;
  }
  
  private recordSignal(symbol: string, nowOverride?: number): void {
    if (!this.signalRateLimiter.has(symbol)) {
      this.signalRateLimiter.set(symbol, []);
    }
    
    this.signalRateLimiter.get(symbol)!.push(nowOverride || Date.now());
  }
  
  public scan(candle: Candle, h1Trend?: 'up' | 'down' | 'sideways'): ComprehensiveSignal[] {
    const { symbol } = candle;
    
    console.log(`[COMPREHENSIVE] Scanning ${symbol} candle: ${candle.start} - O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}`);
    
    // Initialize or update history
    if (!historyBySymbol.has(symbol)) {
      historyBySymbol.set(symbol, { symbol, candles: [] });
      console.log(`[COMPREHENSIVE] Initialized new history for ${symbol}`);
    }
    
    const history = historyBySymbol.get(symbol)!;
    
    // Avoid processing the same candle twice
    if (history.lastProcessedTime === candle.start) {
      console.log(`[COMPREHENSIVE] Skipping duplicate candle for ${symbol}: ${candle.start}`);
      return [];
    }
    
    history.candles.push(candle);
    history.lastProcessedTime = candle.start;
    
    // Keep only necessary history
    const maxHistory = Math.max(this.params.srLookback, 100);
    if (history.candles.length > maxHistory) {
      history.candles = history.candles.slice(-maxHistory);
    }
    
    console.log(`[COMPREHENSIVE] ${symbol} now has ${history.candles.length} candles in history`);
    
    // Need at least minimum candles for analysis - optimal for real trading
    const minRequired = 5; // Good balance: enough for context, fast enough for real trading
    if (history.candles.length < minRequired) {
      console.log(`[COMPREHENSIVE] ${symbol} needs ${minRequired} candles, only has ${history.candles.length} - skipping analysis`);
      return [];
    }
    
    return this.detectPatterns(history.candles, h1Trend);
  }
  
  private detectPatterns(candles: Candle[], h1Trend?: 'up' | 'down' | 'sideways'): ComprehensiveSignal[] {
    const signals: ComprehensiveSignal[] = [];
    const current = candles[candles.length - 1];
    const symbol = current.symbol;
    
    console.log(`[SCANNER] Detecting patterns for ${symbol} with ${candles.length} candles history`);
    
    // Build market context
    const context = buildMarketContext(candles, this.params, h1Trend);
    const atr = calculateATR(candles, this.params.atrLen);
    
    // Collect all possible patterns
    const allPatterns: PatternDetails[] = [];
    
    // Single candle patterns
    if (candles.length >= 1) {
      const prev = candles.length > 1 ? candles[candles.length - 2] : null;
      console.log(`[SCANNER] Checking single candle patterns for ${symbol}`);
      const singlePatterns = detectSingleCandlePatterns(current, prev, this.params, context.trend);
      console.log(`[SCANNER] Found ${singlePatterns.length} single candle patterns: ${singlePatterns.map(p => p.name).join(', ')}`);
      allPatterns.push(...singlePatterns);
    }
    
    // Double candle patterns
    if (candles.length >= 2) {
      const prev = candles[candles.length - 2];
      console.log(`[SCANNER] Checking double candle patterns for ${symbol}`);
      const doublePatterns = detectDoubleCandlePatterns(prev, current, this.params, atr);
      console.log(`[SCANNER] Found ${doublePatterns.length} double candle patterns: ${doublePatterns.map(p => p.name).join(', ')}`);
      allPatterns.push(...doublePatterns);
    }
    
    // Triple candle patterns
    if (candles.length >= 3) {
      const candle1 = candles[candles.length - 3];
      const candle2 = candles[candles.length - 2];
      const candle3 = candles[candles.length - 1];
      console.log(`[SCANNER] Checking triple candle patterns for ${symbol}`);
      const triplePatterns = detectTripleCandlePatterns(candle1, candle2, candle3, this.params, atr);
      console.log(`[SCANNER] Found ${triplePatterns.length} triple candle patterns: ${triplePatterns.map(p => p.name).join(', ')}`);
      allPatterns.push(...triplePatterns);
    }
    
    console.log(`[SCANNER] Total raw patterns found for ${symbol}: ${allPatterns.length} - ${allPatterns.map(p => p.name).join(', ')}`);
    
    // Process each pattern
    for (const pattern of allPatterns) {
      const signal = this.buildComprehensiveSignal(
        pattern,
        context,
        candles,
        symbol,
        h1Trend
      );
      
      if (signal) {
        signals.push(signal);
      }
    }
    
    // Remove duplicate patterns and keep highest scored
    return this.deduplicateSignals(signals);
  }
  
  private buildComprehensiveSignal(
    pattern: PatternDetails,
    context: MarketContext,
    candles: Candle[],
    symbol: string,
    h1Trend?: 'up' | 'down' | 'sideways'
  ): ComprehensiveSignal | null {
    const current = candles[candles.length - 1];
    const { score, notes } = scorePattern(pattern, context, candles, this.params);
    
    // Filter out low-quality signals
    const strength = classifySignalStrength(score);
    if (strength === 'ignore') {
      console.log(`[SCANNER] Pattern ${pattern.name} scored ${score} - ignoring (below threshold)`);
      return null;
    }

    // V3 SESSION FILTER: "Golden Hours" (13:30 - 18:30 UTC / 9:30 AM - 2:30 PM EST)
    const date = new Date(current.start);
    const hour = date.getUTCHours(); 
    const minutes = date.getUTCMinutes();
    const marketTimeMinutes = (hour * 60) + minutes;
    
    // Covers 9:30 AM - 1:30 PM EST across both Standard and Daylight time.
    const startLimit = (13 * 60) + 30; 
    const endLimit = (18 * 60) + 30; 
    
    if (marketTimeMinutes < startLimit || marketTimeMinutes > endLimit) {
      console.log(`[SCANNER] Blocking signal: ${pattern.name} at ${hour}:${minutes.toString().padStart(2, '0')} UTC - outside Institutional Hours`);
      return null;
    }

    // ADAPTIVE TREND EXECUTION FILTER:
    // Only take BULLISH signals in an UP trend, BEARISH in a DOWN trend.
    const isBullAligned = pattern.direction === 'bullish' && context.trend === 'up';
    const isBearAligned = pattern.direction === 'bearish' && context.trend === 'down';
    
    if (!isBullAligned && !isBearAligned) {
      console.log(`[SCANNER] Blocking signal: ${pattern.name} is Counter-Trend in ${context.trend} market`);
      return null;
    }

    // V4 H1 SENTINEL FILTER: Strategic Direction Confirmation
    if (!h1Trend || h1Trend === 'sideways') {
      console.log(`[SCANNER] Blocking signal: ${pattern.name} - No clear H1 trend direction`);
      return null;
    }

    if (pattern.direction === 'bullish' && h1Trend !== 'up') {
      console.log(`[SCANNER] Blocking signal: Bullish ${pattern.name} vs Bearish H1 Trend`);
      return null;
    }

    if (pattern.direction === 'bearish' && h1Trend !== 'down') {
      console.log(`[SCANNER] Blocking signal: Bearish ${pattern.name} vs Bullish H1 Trend`);
      return null;
    }

    console.log(`[SCANNER] V4 Sentinel Approved: ${pattern.name} aligned with H1 ${h1Trend} trend`);

    // V5 STRUCTURE MANDATE: LOCATION OR BUST
    // A trade is FORBIDDEN unless it triggers at a verified Major Key Level.
    if (pattern.direction === 'bullish' && !context.atSupport) {
      console.log(`[SCANNER] Blocking signal: Bullish ${pattern.name} is floating (Not at Support)`);
      return null;
    }

    if (pattern.direction === 'bearish' && !context.atResistance) {
      console.log(`[SCANNER] Blocking signal: Bearish ${pattern.name} is floating (Not at Resistance)`);
      return null;
    }
    
    console.log(`[SCANNER] V5 Structure Approved: ${pattern.name} at verified ${pattern.direction === 'bullish' ? 'Support' : 'Resistance'}`);

    console.log(`[SCANNER] Pattern ${pattern.name} scored ${score} - ${strength} signal`);
    
    // Check for duplicate signals
    const candleTime = new Date(current.start).getTime();
    if (this.isDuplicateSignal(symbol, pattern.name, candleTime)) {
      console.log(`[SCANNER] Blocking duplicate signal: ${pattern.name} for ${symbol} (already generated within ${this.duplicateBlockMinutes} minutes)`);
      return null;
    }
    
    // Build confirmation plan
    const confirmation = buildConfirmationPlan(pattern, this.params);
    
    // Build trade plan
    const plan = buildTradePlan(pattern, context, confirmation, this.params);
    
    // Validate trade plan
    if (!validateTradePlan(plan)) {
      console.log(`Invalid trade plan for ${pattern.name} on ${symbol}`);
      return null;
    }
    
    // Assess trap risk
    const trapWarnings = detectTraps(pattern, context, candles, this.params);
    let trapRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    
    if (trapWarnings.length > 0) {
      const highSeverity = trapWarnings.some(w => w.severity === 'high');
      const mediumSeverity = trapWarnings.some(w => w.severity === 'medium');
      
      if (highSeverity) {
        trapRisk = 'high';
      } else if (mediumSeverity) {
        trapRisk = 'medium';
      } else {
        trapRisk = 'low';
      }
    }
    
    // Create comprehensive signal
    const signal: ComprehensiveSignal = {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      timeframe: current.timeframe,
      time: current.start,
      pattern,
      context,
      confirmation,
      plan,
      score,
      notes,
      currentPrice: current.close,
      trapRisk
    };
    
    // Add to recent signals to prevent duplicates
    this.addToRecentSignals(symbol, pattern.name, candleTime);
    console.log(`[SCANNER] Added ${pattern.name} for ${symbol} to duplicate prevention cache`);
    
    return signal;
  }
  
  private deduplicateSignals(signals: ComprehensiveSignal[]): ComprehensiveSignal[] {
    if (signals.length <= 1) return signals;
    
    // Group by pattern direction
    const bullishSignals = signals.filter(s => s.pattern.direction === 'bullish');
    const bearishSignals = signals.filter(s => s.pattern.direction === 'bearish');
    const neutralSignals = signals.filter(s => s.pattern.direction === 'neutral');
    
    const result: ComprehensiveSignal[] = [];
    
    // Keep only the highest scored signal per direction
    if (bullishSignals.length > 0) {
      const best = bullishSignals.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      result.push(best);
    }
    
    if (bearishSignals.length > 0) {
      const best = bearishSignals.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      result.push(best);
    }
    
    if (neutralSignals.length > 0) {
      const best = neutralSignals.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      result.push(best);
    }
    
    return result;
  }
  
  public clearHistory(symbol?: string): void {
    if (symbol) {
      historyBySymbol.delete(symbol);
    } else {
      historyBySymbol.clear();
    }
  }
  
  public getHistorySize(symbol: string): number {
    return historyBySymbol.get(symbol)?.candles.length || 0;
  }
  
  public updateParameters(newParams: Partial<TradingParameters>): void {
    this.params = { ...this.params, ...newParams };
  }
}

// Export singleton instance
export const comprehensiveScanner = new ComprehensiveScanner();