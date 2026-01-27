import { 
  BacktestConfig, 
  BacktestState, 
  BacktestResults, 
  BacktestCandle,
  BacktestPosition 
} from '../types/backtestTypes.js';
import { HistoricalDataLoader } from './dataLoader.js';
import { MT5Simulator } from './mt5Simulator.js';
import { ComprehensiveScanner } from '../../candlestick/comprehensiveScanner.js';
import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';
import { Candle } from '../../candlestick/types/index.js';
import { TradingCircuitBreaker } from '../../helpers/circuitBreaker.js';
import { detectTrend } from '../../candlestick/helpers/marketStructure.js';
import { evaluateSignalWithAI, updateRollingStats } from '../../services/aiSignalFilter.js';

export class BacktestEngine {
  private config: BacktestConfig;
  private dataLoader: HistoricalDataLoader;
  private mt5Simulator: MT5Simulator;
  private scanner: ComprehensiveScanner;
  private circuitBreaker: TradingCircuitBreaker;
  private state: BacktestState;
  private symbolCandleIndex: Map<string, Map<number, BacktestCandle>> = new Map();

  constructor(config: BacktestConfig) {
    this.config = config;
    this.dataLoader = new HistoricalDataLoader(config.source || 'polygon');
    this.mt5Simulator = new MT5Simulator(config.slippageBps || 2, config.commissionPerTrade);
    this.scanner = new ComprehensiveScanner();
    this.circuitBreaker = new TradingCircuitBreaker();
    console.log(`[BACKTEST] Engine initialized. Circuit Breaker is ${config.enableCircuitBreaker ? 'ENABLED' : 'DISABLED'}`);
    
    // Initialize state
    this.state = {
      currentBalance: config.initialBalance,
      openPositions: new Map(),
      closedPositions: [],
      pendingSignals: new Map(),
      lastSignalTime: new Map(),
      consecutiveLosses: 0,
      dailyStats: {
        trades: 0,
        pnl: 0,
        wins: 0,
        losses: 0
      },
      equityCurve: [],
      maxBalance: config.initialBalance,
      maxDrawdown: 0
    };
  }

  async run(): Promise<BacktestResults> {
    console.log('Starting backtest...');
    console.log('Config:', this.config);

    // Load historical data for all symbols
    const allData = await this.dataLoader.loadMultipleSymbols(
      this.config.symbols,
      this.config.startDate,
      this.config.endDate
    );

    if (allData.size === 0) {
      throw new Error('No historical data loaded');
    }

    // Build candle index for fast lookup
    console.log('Building candle index...');
    for (const [symbol, candles] of allData) {
      const index = new Map<number, BacktestCandle>();
      for (const candle of candles) {
        candle.symbol = symbol; // Ensure symbol is attached for simulator checks
        index.set(candle.timestamp.getTime(), candle);
      }
      this.symbolCandleIndex.set(symbol, index);
    }

    // Get all unique timestamps across all symbols
    const allTimestamps = this.getAllTimestamps(allData);
    console.log(`Processing ${allTimestamps.length} time points...`);

    // Process each timestamp
    let processedCount = 0;
    for (const timestamp of allTimestamps) {
      await this.processTimestamp(timestamp, allData);
      
      processedCount++;
      if (processedCount % 1000 === 0) {
        console.log(`Processed ${processedCount}/${allTimestamps.length} timestamps...`);
      }
    }

    // Close any remaining open positions at end of backtest
    this.closeAllPositions(allTimestamps[allTimestamps.length - 1], allData);

    // Generate results
    return this.generateResults();
  }

  private getAllTimestamps(data: Map<string, BacktestCandle[]>): Date[] {
    const timestampSet = new Set<number>();
    
    for (const candles of data.values()) {
      for (const candle of candles) {
        timestampSet.add(candle.timestamp.getTime());
      }
    }

    return Array.from(timestampSet)
      .sort((a, b) => a - b)
      .map(ts => new Date(ts));
  }

  private async processTimestamp(
    timestamp: Date, 
    allData: Map<string, BacktestCandle[]>
  ): Promise<void> {
    // Check positions for exit
    this.checkPositionExits(timestamp, allData);

    // Check pending orders for fills
    this.checkPendingOrderFills(timestamp, allData);

    // Every 5 minutes, scan for new signals
    if (timestamp.getMinutes() % 5 === 0) {
      await this.scanForSignals(timestamp, allData);
    }

    // Update equity curve
    this.updateEquityCurve(timestamp);

    // Reset daily stats at market close
    if (timestamp.getHours() === 16 && timestamp.getMinutes() === 0) {
      this.resetDailyStats();
    }
  }

  private checkPositionExits(timestamp: Date, allData: Map<string, BacktestCandle[]>): void {
    for (const [positionId, position] of this.state.openPositions) {
      const candles = allData.get(position.symbol);
      if (!candles) continue;

      const currentCandle = this.symbolCandleIndex.get(position.symbol)?.get(timestamp.getTime());
      if (!currentCandle) continue;

      const exit = this.mt5Simulator.checkPositionExit(position, currentCandle);
      if (exit) {
        this.closePosition(position, exit.exitPrice, exit.exitReason, timestamp);
      }
    }
  }

  private checkPendingOrderFills(timestamp: Date, allData: Map<string, BacktestCandle[]>): void {
    for (const symbol of this.config.symbols) {
      const candles = allData.get(symbol);
      if (!candles) continue;

      const currentCandle = this.symbolCandleIndex.get(symbol)?.get(timestamp.getTime());
      if (!currentCandle) continue;

      const filledPositions = this.mt5Simulator.checkPendingOrders(currentCandle);
      
      for (const position of filledPositions) {
        // Check if we can take this position (circuit breaker, position limits)
        if (this.canAddPosition()) {
          this.state.openPositions.set(position.id, position);
          console.log(`Position filled: ${position.symbol} @ ${position.entryPrice}`);
        } else {
          console.log(`Position rejected due to limits: ${position.symbol}`);
        }
      }
    }
  }

  private async scanForSignals(timestamp: Date, allData: Map<string, BacktestCandle[]>): Promise<void> {
    for (const symbol of this.config.symbols) {
      const candles = allData.get(symbol);
      if (!candles) continue;

      // Get recent candles for M5 aggregation
      const recentM5History = this.getRecentCandles(candles, timestamp, 500);
      if (recentM5History.length < 20) continue;

      // Get recent candles for H1 aggregation (need ~50 hours for 50-SMA)
      const recentH1History = this.getRecentCandles(candles, timestamp, 4500); // 4500 mins lookback
      
      // Aggregate to 5-minute candles
      const fiveMinCandles = this.dataLoader.aggregateCandles(recentM5History, 5);
      
      // Aggregate to H1 candles
      const h1BacktestCandles = this.dataLoader.aggregateCandles(recentH1History, 60);

      // Detect H1 trend direction
      let h1Trend: 'up' | 'down' | 'sideways' = 'sideways';
      if (h1BacktestCandles.length >= 20) {
        const h1Candles: Candle[] = h1BacktestCandles.map(c => ({
          symbol: c.symbol,
          timeframe: '1h',
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          start: c.timestamp.toISOString(),
          end: new Date(c.timestamp.getTime() + 60 * 60 * 1000).toISOString()
        }));
        h1Trend = detectTrend(h1Candles, 20, 50);
      }
      
      // Scan for patterns using the last candle
      if (fiveMinCandles.length > 0) {
        const lastCandle = fiveMinCandles[fiveMinCandles.length - 1];
        const candleForScanner: Candle = {
          symbol: symbol,
          timeframe: '5m',
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume,
          start: lastCandle.timestamp.toISOString(),
          end: new Date(lastCandle.timestamp.getTime() + 5 * 60 * 1000).toISOString()
        };
        
        // Scan with H1 trend context
        const signals = this.scanner.scan(candleForScanner, h1Trend);
        
        for (const signal of signals) {
          await this.processSignal(signal, timestamp);
        }
      }
    }
  }

  private async processSignal(signal: ComprehensiveSignal, timestamp: Date): Promise<void> {
    // PATTERN FILTER: Only allow Tweezer Top (historically profitable)
    if (signal.pattern.name !== 'Tweezer Top') {
      return;
    }

    // SYMBOL FILTER: Exclude consistently unprofitable symbols
    const excludedSymbols = ['CSCO'];
    if (excludedSymbols.includes(signal.symbol)) {
      return;
    }

    // Check if we already have this signal or recent signal for symbol
    const lastSignal = this.state.lastSignalTime.get(signal.symbol);
    if (lastSignal && timestamp.getTime() - lastSignal.getTime() < 20 * 60 * 1000) {
      return; // Skip if signal within 20 minutes
    }

    // Check auto-execution criteria
    const shouldAutoExecute = this.config.enableAutoExecution && 
      signal.score >= this.config.autoExecutionThreshold;

    // Handle trap fade if enabled
    if (this.config.enableTrapFades && signal.trapRisk === 'high') {
      // Create opposite trade
      const fadeSignal = this.createFadeSignal(signal);
      if (fadeSignal) {
        signal = fadeSignal;
      }
    }

    if (shouldAutoExecute) {
      console.log(`[BACKTEST] Signal ${signal.symbol} ${signal.pattern.name} is candidate for execution...`);
      
      // V6 HYBRID BACKTEST: AI Gatekeeper
      if (process.env.AI_SIGNAL_FILTER === 'true') {
         console.log(`[BACKTEST] 🤖 Consulting AI for ${signal.symbol}...`);
         try {
             // We pass empty array for recentCandles for now as loading them in backtest specific format is extra work, 
             // but scanner signal usually has enough data or the function handles it.
             const decision = await evaluateSignalWithAI(signal);
             
             if (!decision.execute) {
                 console.log(`[BACKTEST] 🛑 AI BLOCKED trade: ${decision.reasoning}`);
                 return; // SIGNAL REJECTED BY AI
             }
             
             if (decision.action === 'invert') {
                 console.log(`[BACKTEST] 🔄 AI INVERTED trade! (Note: Inversion logic simulation simplified - using AI parameters)`);
                 // Apply inversion parameters if present
                 if (decision.adjustedEntry && decision.adjustedStop) {
                     signal.plan.direction = decision.adjustedEntry > decision.adjustedStop ? 'long' : 'short'; // Rough deduction
                     // Actually better to trust explicit invert direction logic from filter
                     const originalDir = signal.plan.direction;
                     signal.plan.direction = originalDir === 'long' ? 'short' : 'long';
                     signal.plan.entry = decision.adjustedEntry;
                     signal.plan.stop = decision.adjustedStop;
                     signal.plan.targets[0] = decision.adjustedTarget || signal.plan.targets[0];
                 }
             }
             
             console.log(`[BACKTEST] ✅ AI APPROVED trade.`);
         } catch (err) {
             console.error(`[BACKTEST] AI Check Failed, skipping trade for safety:`, err);
             return;
         }
      }

      let isValid = true;
      let reason = '';

      if (this.config.enableCircuitBreaker) {
        const validation = await this.circuitBreaker.validateTrade(
          {
            symbol: signal.symbol,
            mt5Symbol: signal.symbol,
            patternName: signal.pattern.name,
            patternScore: signal.score,
            entryPrice: signal.plan.entry,
            stopLoss: signal.plan.stop,
            takeProfit: signal.plan.targets[0],
            direction: signal.plan.direction === 'long' ? 'long' : 'short',
            orderType: 'market',
            volume: this.config.positionSizeGBP / signal.plan.entry,
            signalTime: new Date(timestamp)
          },
          this.state.currentBalance
        );
        isValid = validation.isValid;
        reason = validation.reason || 'Unknown circuit breaker reason';
      }

      if (isValid && this.canAddPosition()) {
        // Place order
        console.log(`[BACKTEST] ✅ Validating and placing order for ${signal.symbol}`);
        const position = this.mt5Simulator.placeOrder(
          signal,
          this.config.positionSizeGBP,
          { symbol: signal.symbol, timestamp, open: signal.currentPrice || signal.plan.entry, high: signal.currentPrice || signal.plan.entry, low: signal.currentPrice || signal.plan.entry, close: signal.currentPrice || signal.plan.entry, volume: 0 }
        );
        
        console.log(`Order placed: ${signal.symbol} - ${signal.pattern.name} (Score: ${signal.score})`);
        this.state.lastSignalTime.set(signal.symbol, timestamp);
      } else {
        console.log(`[BACKTEST] ❌ Order REJECTED: ${!isValid ? reason : 'Buffer full / concurrent limits'}`);
      }
    }
  }

  private createFadeSignal(signal: ComprehensiveSignal): ComprehensiveSignal | null {
    // Implement trap fade logic
    const oppositeDirection = signal.plan.direction === 'long' ? 'short' : 'long';
    const currentPrice = signal.currentPrice || signal.plan.entry;
    const fadeEntry = signal.plan.direction === 'long' 
      ? currentPrice * 0.999 
      : currentPrice * 1.001;
    
    return {
      ...signal,
      pattern: {
        ...signal.pattern,
        name: `${signal.pattern.name} (FADE)`,
        direction: oppositeDirection === 'long' ? 'bullish' : 'bearish'
      },
      plan: {
        direction: oppositeDirection,
        entry: fadeEntry,
        stop: signal.plan.direction === 'long' ? signal.plan.targets[0] : signal.plan.stop,
        risk: Math.abs(fadeEntry - (signal.plan.direction === 'long' ? signal.plan.targets[0] : signal.plan.stop)),
        targets: [
          fadeEntry + (oppositeDirection === 'long' ? 1 : -1) * signal.context.atr * 1.5,
          fadeEntry + (oppositeDirection === 'long' ? 1 : -1) * signal.context.atr * 2.5
        ],
        positionQty: signal.plan.positionQty,
        riskRewardRatio: signal.plan.riskRewardRatio
      },
      score: 75,
      notes: [`Trap fade trade: ${signal.notes.join(', ')}`]
    };
  }

  private closePosition(
    position: BacktestPosition, 
    exitPrice: number, 
    exitReason: 'stop_loss' | 'take_profit' | 'signal' | 'end_of_data',
    exitTime: Date
  ): void {
    const closedPosition = this.mt5Simulator.closePosition(
      position,
      exitPrice,
      exitReason,
      exitTime
    );

    // Update state
    this.state.openPositions.delete(position.id);
    this.state.closedPositions.push(closedPosition);

    // Update balance
    this.state.currentBalance += closedPosition.pnl!;

    // Update daily stats
    this.state.dailyStats.trades++;
    this.state.dailyStats.pnl += closedPosition.pnl!;
    
    if (closedPosition.pnl! > 0) {
      this.state.dailyStats.wins++;
      this.state.consecutiveLosses = 0;
    } else {
      this.state.dailyStats.losses++;
      this.state.consecutiveLosses++;
    }

    // Update circuit breaker
    this.circuitBreaker.updateTradeResult({
      symbol: closedPosition.symbol,
      mt5Symbol: closedPosition.symbol,
      patternName: closedPosition.signal.pattern.name,
      patternScore: closedPosition.signal.score,
      entryPrice: closedPosition.plannedEntryPrice,
      actualEntryPrice: closedPosition.entryPrice,
      exitPrice: closedPosition.exitPrice!,
      stopLoss: closedPosition.stopLoss,
      takeProfit: closedPosition.takeProfit,
      direction: closedPosition.direction,
      orderType: 'market',
      volume: closedPosition.size,
      pnlAmount: closedPosition.pnl!,
      pnlPercentage: closedPosition.pnlPercent!,
      status: 'closed',
      timeframe: '5m',
      signalTime: new Date(closedPosition.signal.time),
      closedTime: closedPosition.exitTime!
    });

    console.log(`[TRADE_CLOSE] ${position.symbol} ${position.direction} | Entry: ${position.entryPrice.toFixed(2)} | Exit: ${exitPrice.toFixed(2)} | PnL: $${closedPosition.pnl!.toFixed(2)} | Reason: ${exitReason}`);
    
    // V9 ADAPTIVE: Report result to AI
    if (process.env.AI_SIGNAL_FILTER === 'true') {
        updateRollingStats(closedPosition.pnl! > 0);
    }
  }

  private closeAllPositions(timestamp: Date, allData: Map<string, BacktestCandle[]>): void {
    for (const [positionId, position] of this.state.openPositions) {
      const candles = allData.get(position.symbol);
      if (!candles) continue;

      const lastCandle = candles[candles.length - 1];
      this.closePosition(position, lastCandle.close, 'end_of_data', timestamp);
    }
  }

  private canAddPosition(): boolean {
    return this.state.openPositions.size < this.config.maxConcurrentPositions;
  }

  private getRecentCandles(candles: BacktestCandle[], timestamp: Date, minutes: number): BacktestCandle[] {
    const startTime = timestamp.getTime() - minutes * 60 * 1000;
    return candles.filter(c => 
      c.timestamp.getTime() > startTime && 
      c.timestamp.getTime() <= timestamp.getTime()
    );
  }

  private updateEquityCurve(timestamp: Date): void {
    // Calculate current equity
    let equity = this.state.currentBalance;
    
    // Add unrealized P&L
    for (const position of this.state.openPositions.values()) {
      // Estimate current value (would need current price in real implementation)
      // For now, we'll skip unrealized P&L
    }

    // Update max balance and drawdown
    if (equity > this.state.maxBalance) {
      this.state.maxBalance = equity;
    }
    
    const drawdown = this.state.maxBalance > 0 
      ? (this.state.maxBalance - equity) / this.state.maxBalance * 100
      : 0;
    
    if (drawdown > this.state.maxDrawdown) {
      this.state.maxDrawdown = drawdown;
    }

    // Add to equity curve (sample every hour)
    if (timestamp.getMinutes() === 0) {
      this.state.equityCurve.push({
        timestamp,
        balance: equity,
        drawdown,
        openPositions: this.state.openPositions.size
      });
    }
  }

  private resetDailyStats(): void {
    this.state.dailyStats = {
      trades: 0,
      pnl: 0,
      wins: 0,
      losses: 0
    };
  }

  private generateResults(): BacktestResults {
    const trades = this.state.closedPositions;
    const winningTrades = trades.filter(t => t.pnl! > 0);
    const losingTrades = trades.filter(t => t.pnl! <= 0);

    // Calculate metrics
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl!, 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl!, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0));
    
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;

    // Pattern performance
    const patternPerformance = new Map<string, any>();
    for (const trade of trades) {
      const patternName = trade.signal.pattern.name;
      if (!patternPerformance.has(patternName)) {
        patternPerformance.set(patternName, {
          count: 0,
          wins: 0,
          totalPnL: 0,
          trades: []
        });
      }
      
      const stats = patternPerformance.get(patternName)!;
      stats.count++;
      stats.totalPnL += trade.pnl!;
      if (trade.pnl! > 0) stats.wins++;
      stats.trades.push(trade);
    }

    // Convert pattern performance to final format
    const patternStats = new Map();
    for (const [pattern, stats] of patternPerformance) {
      patternStats.set(pattern, {
        count: stats.count,
        winRate: (stats.wins / stats.count) * 100,
        avgPnL: stats.totalPnL / stats.count,
        totalPnL: stats.totalPnL
      });
    }

    return {
      config: this.config,
      summary: {
        totalTrades: trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate,
        totalPnL,
        totalPnLPercent: (totalPnL / this.config.initialBalance) * 100,
        maxDrawdown: this.state.maxDrawdown,
        maxDrawdownPercent: this.state.maxDrawdown,
        sharpeRatio: this.calculateSharpeRatio(),
        profitFactor,
        averageWin: avgWin,
        averageLoss: avgLoss,
        largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl!)) : 0,
        largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl!)) : 0,
        consecutiveWins: this.calculateMaxConsecutive(trades, true),
        consecutiveLosses: this.calculateMaxConsecutive(trades, false),
        timeInMarket: this.calculateTimeInMarket()
      },
      trades: trades,
      equityCurve: this.state.equityCurve,
      patternPerformance: patternStats,
      dailyStats: this.calculateDailyStats()
    };
  }

  private calculateSharpeRatio(): number {
    // Simplified Sharpe ratio calculation
    const returns = this.state.equityCurve.map((point, idx) => {
      if (idx === 0) return 0;
      return (point.balance - this.state.equityCurve[idx - 1].balance) / this.state.equityCurve[idx - 1].balance;
    });

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
  }

  private calculateMaxConsecutive(trades: BacktestPosition[], wins: boolean): number {
    let maxConsecutive = 0;
    let currentConsecutive = 0;

    for (const trade of trades) {
      if ((wins && trade.pnl! > 0) || (!wins && trade.pnl! <= 0)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }

    return maxConsecutive;
  }

  private calculateTimeInMarket(): number {
    // Calculate percentage of time with open positions
    // This is simplified - would need more granular tracking in production
    return 50; // Placeholder
  }

  private calculateDailyStats(): any[] {
    // Group trades by day and calculate stats
    // This is simplified - would need proper implementation
    return [];
  }
}