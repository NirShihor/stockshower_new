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

const historyBySymbol = new Map<string, CandleHistory>();

export class ComprehensiveScanner {
  private params: TradingParameters;
  
  constructor(params: TradingParameters = DEFAULT_PARAMS) {
    this.params = params;
  }
  
  public scan(candle: Candle): ComprehensiveSignal[] {
    const { symbol } = candle;
    
    // Initialize or update history
    if (!historyBySymbol.has(symbol)) {
      historyBySymbol.set(symbol, { symbol, candles: [] });
    }
    
    const history = historyBySymbol.get(symbol)!;
    
    // Avoid processing the same candle twice
    if (history.lastProcessedTime === candle.start) {
      return [];
    }
    
    history.candles.push(candle);
    history.lastProcessedTime = candle.start;
    
    // Keep only necessary history
    const maxHistory = Math.max(this.params.srLookback, 100);
    if (history.candles.length > maxHistory) {
      history.candles = history.candles.slice(-maxHistory);
    }
    
    // Need at least minimum candles for analysis
    if (history.candles.length < Math.max(this.params.atrLen, 20)) {
      return [];
    }
    
    return this.detectPatterns(history.candles);
  }
  
  private detectPatterns(candles: Candle[]): ComprehensiveSignal[] {
    const signals: ComprehensiveSignal[] = [];
    const current = candles[candles.length - 1];
    const symbol = current.symbol;
    
    // Build market context
    const context = buildMarketContext(candles, this.params);
    const atr = calculateATR(candles, this.params.atrLen);
    
    // Collect all possible patterns
    const allPatterns: PatternDetails[] = [];
    
    // Single candle patterns
    if (candles.length >= 1) {
      const prev = candles.length > 1 ? candles[candles.length - 2] : null;
      const singlePatterns = detectSingleCandlePatterns(current, prev, this.params, context.trend);
      allPatterns.push(...singlePatterns);
    }
    
    // Double candle patterns
    if (candles.length >= 2) {
      const prev = candles[candles.length - 2];
      const doublePatterns = detectDoubleCandlePatterns(prev, current, this.params, atr);
      allPatterns.push(...doublePatterns);
    }
    
    // Triple candle patterns
    if (candles.length >= 3) {
      const candle1 = candles[candles.length - 3];
      const candle2 = candles[candles.length - 2];
      const candle3 = candles[candles.length - 1];
      const triplePatterns = detectTripleCandlePatterns(candle1, candle2, candle3, this.params, atr);
      allPatterns.push(...triplePatterns);
    }
    
    // Process each pattern
    for (const pattern of allPatterns) {
      const signal = this.buildComprehensiveSignal(
        pattern,
        context,
        candles,
        symbol
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
    symbol: string
  ): ComprehensiveSignal | null {
    const current = candles[candles.length - 1];
    
    // Score the pattern
    const { score, notes } = scorePattern(pattern, context, candles, this.params);
    
    // Filter out low-quality signals
    const strength = classifySignalStrength(score);
    if (strength === 'ignore') {
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
      notes
    };
    
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