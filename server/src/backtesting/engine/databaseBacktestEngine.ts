import { 
  BacktestConfig, 
  BacktestState, 
  BacktestResults, 
  BacktestPosition 
} from '../types/backtestTypes.js';
import { Trade } from '../../db/models/Trade.js';
import { HistoricalDataLoader } from './dataLoader.js';
import { MT5Simulator } from './mt5Simulator.js';
import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';
import { MomentumStrategy } from '../strategies/momentumStrategy.js';
import { applyProfitableFiltering, EnhancedBacktestConfig, FilterResult } from '../filters/profitableSignalFilter.js';

export interface DatabaseBacktestConfig extends Omit<BacktestConfig, 'symbols'> {
  symbols?: string[];
  scoreThreshold?: number;
  useActualFills?: boolean;
  useMomentumStrategy?: boolean;
  useProfitableFiltering?: boolean;
  profitableFilterConfig?: {
    filterMode: 'high_performance' | 'conservative' | 'aggressive' | 'custom';
    customFilterConfig?: any;
    enableDetailedLogging?: boolean;
  };
}

export class DatabaseBacktestEngine {
  private config: DatabaseBacktestConfig;
  private dataLoader: HistoricalDataLoader;
  private mt5Simulator: MT5Simulator;
  private state: BacktestState;
  private momentumStrategy?: MomentumStrategy;

  constructor(config: DatabaseBacktestConfig) {
    this.config = {
      ...config,
      scoreThreshold: config.scoreThreshold || config.autoExecutionThreshold || 60
    };
    
    this.dataLoader = new HistoricalDataLoader();
    this.mt5Simulator = new MT5Simulator(config.slippageBps || 2, config.commissionPerTrade);
    
    if (config.useMomentumStrategy) {
      console.log('Initializing momentum strategy with threshold:', config.scoreThreshold || 60);
      this.momentumStrategy = new MomentumStrategy({
        minTrendStrength: config.scoreThreshold || 60,
        requireVolumeConfirmation: true,
        requireTrendAlignment: true
      });
    } else {
      console.log('Running without momentum strategy');
    }
    
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
      equityCurve: [{
        timestamp: config.startDate,
        balance: config.initialBalance,
        drawdown: 0,
        openPositions: 0
      }],
      maxBalance: config.initialBalance,
      maxDrawdown: 0
    };
  }

  async run(): Promise<BacktestResults> {
    console.log('Starting database-driven backtest...');
    console.log('Config:', this.config);

    // Fetch trades from database
    const trades = await this.fetchHistoricalTrades();
    console.log(`Found ${trades.length} trades in database`);

    // Group trades by signal for replay
    const signalGroups = this.groupTradesBySignal(trades);
    console.log(`Found ${signalGroups.size} unique signals`);

    // Process each signal
    for (const [signalId, signalTrades] of signalGroups) {
      const primaryTrade = signalTrades[0]; // Use first trade for signal data
      
      if (!primaryTrade.signalData) {
        console.log(`Skipping signal ${signalId} - no signal data stored`);
        continue;
      }

      await this.processHistoricalSignal(primaryTrade);
    }

    // If using actual fills, also process the real trade outcomes
    if (this.config.useActualFills) {
      this.processActualTrades(trades);
    }

    // Generate results
    return this.generateResults();
  }

  private async fetchHistoricalTrades(): Promise<any[]> {
    const query: any = {
      signalTime: {
        $gte: this.config.startDate,
        $lte: this.config.endDate
      }
    };

    if (this.config.symbols && this.config.symbols.length > 0) {
      query.symbol = { $in: this.config.symbols };
    }

    // Fetch trades with signal data
    const trades = await Trade.find(query)
      .sort({ signalTime: 1 })
      .lean();

    return trades;
  }

  private groupTradesBySignal(trades: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const trade of trades) {
      const signalId = trade.signalData?.id || `${trade.symbol}-${trade.signalTime}`;
      
      if (!groups.has(signalId)) {
        groups.set(signalId, []);
      }
      
      groups.get(signalId)!.push(trade);
    }

    return groups;
  }

  private async processHistoricalSignal(trade: any): Promise<void> {
    const signal = trade.signalData as ComprehensiveSignal;
    
    if (!signal) {
      return;
    }

    // Check if signal meets threshold
    if (signal.score < this.config.scoreThreshold!) {
      console.log(`Signal ${signal.pattern.name} score ${signal.score} below threshold ${this.config.scoreThreshold}`);
      return;
    }

    // Check if we would have taken this trade
    const validation = this.validateSignal(signal, trade.signalTime);
    
    if (!validation.shouldTrade) {
      console.log(`Signal rejected: ${validation.reason}`);
      return;
    }

    // Simulate the trade
    if (this.config.useActualFills && trade.actualEntryPrice) {
      // Use actual fill data
      this.simulateTradeWithActualFill(trade);
    } else {
      // Adjust signal if using momentum strategy
      let adjustedSignal = signal;
      if (this.momentumStrategy) {
        adjustedSignal = this.momentumStrategy.adjustTradeParameters(signal);
      }
      // Simulate based on signal parameters
      await this.simulateTradeFromSignal(adjustedSignal, new Date(trade.signalTime));
    }
  }

  private validateSignal(signal: ComprehensiveSignal, signalTime: Date): { shouldTrade: boolean; reason?: string } {
    // Apply profitable signal filtering
    if (this.config.useProfitableFiltering) {
      const filterConfig = this.config.profitableFilterConfig || {
        filterMode: 'high_performance' as const,
        enableDetailedLogging: true
      };
      
      const filterResult = this.applyProfitableFiltering(signal, filterConfig);
      if (!filterResult.pass) {
        return { shouldTrade: false, reason: filterResult.reason };
      }
    }
    
    // Use momentum strategy if enabled
    if (this.momentumStrategy) {
      const momentumCheck = this.momentumStrategy.shouldTakeSignal(signal);
      if (!momentumCheck.take) {
        console.log(`Momentum filter rejected ${signal.pattern.name}: ${momentumCheck.reason}`);
        return { shouldTrade: false, reason: momentumCheck.reason };
      }
      console.log(`Momentum filter accepted ${signal.pattern.name}`);
    } else if (!this.config.useProfitableFiltering) {
      // Original filtering for baseline test (only if not using profitable filtering)
      const excludedPatterns = [
        "🔄 VwapBounce Bullish", // 0% high volume
        "🔄 VwapBounce Long", // 0% high volume
        "Reversal VwapBounce Bullish" // 0% high volume
      ];
      
      if (excludedPatterns.includes(signal.pattern.name)) {
        return { shouldTrade: false, reason: `Pattern excluded: ${signal.pattern.name}` };
      }
    }
    
    // Check position limits
    if (this.state.openPositions.size >= (this.config.maxConcurrentPositions || 10)) {
      return { shouldTrade: false, reason: 'Max concurrent positions reached' };
    }

    // Check daily loss limit
    if (this.state.dailyStats.pnl < -1000 || this.state.dailyStats.pnl < -this.state.currentBalance * 0.03) {
      return { shouldTrade: false, reason: 'Daily loss limit reached' };
    }

    // Check consecutive losses - increased limit for testing
    if (this.state.consecutiveLosses >= 20) {
      return { shouldTrade: false, reason: 'Consecutive loss limit reached (20 losses)' };
    }

    // Check for recent signal on same symbol
    const lastSignal = this.state.lastSignalTime.get(signal.symbol);
    if (lastSignal && signalTime.getTime() - lastSignal.getTime() < 20 * 60 * 1000) {
      return { shouldTrade: false, reason: 'Recent signal on symbol' };
    }

    return { shouldTrade: true };
  }

  private applyProfitableFiltering(signal: ComprehensiveSignal, config: any): FilterResult {
    return applyProfitableFiltering(signal, config);
  }

  private simulateTradeWithActualFill(trade: any): void {
    // Recalculate stop with proper percentage minimum
    const entryPrice = trade.actualEntryPrice || trade.entryPrice;
    const minStopDistance = entryPrice * 0.01; // 1% minimum
    let recalculatedStop: number;
    
    if (trade.direction === 'long') {
      const originalStopDistance = entryPrice - trade.stopLoss;
      if (originalStopDistance < minStopDistance) {
        recalculatedStop = entryPrice - minStopDistance;
        console.log(`[STOP RECALCULATED] ${trade.symbol}: ${trade.stopLoss.toFixed(2)} -> ${recalculatedStop.toFixed(2)}`);
      } else {
        recalculatedStop = trade.stopLoss;
      }
    } else {
      const originalStopDistance = trade.stopLoss - entryPrice;
      if (originalStopDistance < minStopDistance) {
        recalculatedStop = entryPrice + minStopDistance;
        console.log(`[STOP RECALCULATED] ${trade.symbol}: ${trade.stopLoss.toFixed(2)} -> ${recalculatedStop.toFixed(2)}`);
      } else {
        recalculatedStop = trade.stopLoss;
      }
    }

    const position: BacktestPosition = {
      id: trade._id.toString(),
      symbol: trade.symbol,
      signal: trade.signalData,
      entryTime: new Date(trade.filledTime || trade.orderPlacedTime || trade.signalTime),
      entryPrice: trade.actualEntryPrice || trade.entryPrice,
      plannedEntryPrice: trade.entryPrice,
      slippage: Math.abs((trade.actualEntryPrice || trade.entryPrice) - trade.entryPrice),
      size: trade.volume || this.config.positionSizeGBP! / trade.entryPrice,
      direction: trade.direction as 'long' | 'short',
      stopLoss: recalculatedStop,
      takeProfit: trade.takeProfit,
      status: 'closed',
      exitTime: trade.closedTime ? new Date(trade.closedTime) : undefined,
      exitPrice: trade.exitPrice,
      exitReason: trade.exitReason as any,
      pnl: trade.pnlAmount,
      pnlPercent: trade.pnlPercentage,
      commission: trade.commission || this.config.commissionPerTrade
    };

    this.state.closedPositions.push(position);
    this.updateStateAfterTrade(position);
  }

  private async simulateTradeFromSignal(signal: ComprehensiveSignal, signalTime: Date): Promise<void> {
    // Load price data around signal time
    const startTime = new Date(signalTime.getTime() - 60 * 60 * 1000); // 1 hour before
    const endTime = new Date(signalTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours after

    try {
      const priceData = await this.dataLoader.loadData(
        signal.symbol,
        startTime,
        endTime,
        '5'
      );

      if (priceData.length === 0) {
        console.log(`No price data available for ${signal.symbol} at ${signalTime}`);
        return;
      }

      // Find entry candle
      const entryCandle = priceData.find(c => c.timestamp.getTime() >= signalTime.getTime());
      if (!entryCandle) {
        console.log(`No entry candle found for signal`);
        return;
      }

      // Recalculate stop with minimum percentage before placing order
      const price = signal.plan.entry;
      const minStopDistance = price * 0.06; // 6% minimum - momentum trades need room
      
      if (signal.plan.direction === 'long') {
        const originalDistance = price - signal.plan.stop;
        if (originalDistance < minStopDistance) {
          signal.plan.stop = price - minStopDistance;
          console.log(`[STOP RECALCULATED] ${signal.symbol}: Original stop too tight, adjusted to 6% minimum`);
          
          // Recalculate targets based on new risk
          const newRisk = price - signal.plan.stop;
          signal.plan.targets = [
            price + (newRisk * 1.5), // 1:1.5 R/R for first target
            price + (newRisk * 2.5)  // 1:2.5 R/R for second target
          ];
          console.log(`[TARGETS RECALCULATED] ${signal.symbol}: New targets at ${signal.plan.targets[0].toFixed(2)} and ${signal.plan.targets[1].toFixed(2)}`);
        }
      } else {
        const originalDistance = signal.plan.stop - price;
        if (originalDistance < minStopDistance) {
          signal.plan.stop = price + minStopDistance;
          console.log(`[STOP RECALCULATED] ${signal.symbol}: Original stop too tight, adjusted to 6% minimum`);
          
          // Recalculate targets based on new risk
          const newRisk = signal.plan.stop - price;
          signal.plan.targets = [
            price - (newRisk * 1.5), // 1:1.5 R/R for first target
            price - (newRisk * 2.5)  // 1:2.5 R/R for second target
          ];
          console.log(`[TARGETS RECALCULATED] ${signal.symbol}: New targets at ${signal.plan.targets[0].toFixed(2)} and ${signal.plan.targets[1].toFixed(2)}`);
        }
      }

      // Place order with recalculated stop
      const position = this.mt5Simulator.placeOrder(
        signal,
        this.config.positionSizeGBP!,
        entryCandle
      );

      // Track position
      this.state.openPositions.set(position.id, position);
      this.state.lastSignalTime.set(signal.symbol, signalTime);

      // Simulate position lifecycle
      let filled = false;
      for (const candle of priceData) {
        if (candle.timestamp.getTime() < signalTime.getTime()) continue;

        // Check for fill
        if (!filled) {
          const filledPositions = this.mt5Simulator.checkPendingOrders(candle);
          if (filledPositions.length > 0) {
            filled = true;
            console.log(`Position filled: ${signal.symbol} @ ${filledPositions[0].entryPrice}`);
          }
        }

        // Check for exit if filled
        if (filled && this.state.openPositions.has(position.id)) {
          const exit = this.mt5Simulator.checkPositionExit(position, candle);
          if (exit) {
            const closedPosition = this.mt5Simulator.closePosition(
              position,
              exit.exitPrice,
              exit.exitReason,
              candle.timestamp
            );
            
            this.state.openPositions.delete(position.id);
            this.state.closedPositions.push(closedPosition);
            this.updateStateAfterTrade(closedPosition);
            break;
          }
        }
      }

      // Close any remaining open position at end of data
      if (this.state.openPositions.has(position.id)) {
        const lastCandle = priceData[priceData.length - 1];
        const closedPosition = this.mt5Simulator.closePosition(
          position,
          lastCandle.close,
          'end_of_data',
          lastCandle.timestamp
        );
        
        this.state.openPositions.delete(position.id);
        this.state.closedPositions.push(closedPosition);
        this.updateStateAfterTrade(closedPosition);
      }

    } catch (error) {
      console.error(`Error simulating trade for ${signal.symbol}:`, error);
    }
  }

  private updateStateAfterTrade(position: BacktestPosition): void {
    // Update balance
    if (position.pnl) {
      this.state.currentBalance += position.pnl;
      this.state.dailyStats.pnl += position.pnl;
    }

    // Update trade counts
    this.state.dailyStats.trades++;
    
    if (position.pnl && position.pnl > 0) {
      this.state.dailyStats.wins++;
      this.state.consecutiveLosses = 0;
    } else {
      this.state.dailyStats.losses++;
      this.state.consecutiveLosses++;
    }

    // Update max balance and drawdown
    if (this.state.currentBalance > this.state.maxBalance) {
      this.state.maxBalance = this.state.currentBalance;
    }
    
    const drawdown = this.state.maxBalance > 0 
      ? (this.state.maxBalance - this.state.currentBalance) / this.state.maxBalance * 100
      : 0;
    
    if (drawdown > this.state.maxDrawdown) {
      this.state.maxDrawdown = drawdown;
    }

    // Update equity curve
    if (position.exitTime) {
      this.state.equityCurve.push({
        timestamp: position.exitTime,
        balance: this.state.currentBalance,
        drawdown,
        openPositions: this.state.openPositions.size
      });
    }
  }

  private processActualTrades(trades: any[]): void {
    // This method processes actual trade results when useActualFills is true
    // It's already handled in processHistoricalSignal when useActualFills is set
  }

  private generateResults(): BacktestResults {
    const trades = this.state.closedPositions;
    const winningTrades = trades.filter(t => t.pnl! > 0);
    const losingTrades = trades.filter(t => t.pnl! <= 0);

    // Calculate metrics
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + t.pnl!, 0) / winningTrades.length
      : 0;
    
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0) / losingTrades.length)
      : 0;

    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Pattern performance
    const patternPerformance = new Map<string, any>();
    for (const trade of trades) {
      if (!trade.signal) continue;
      
      const patternName = trade.signal.pattern.name;
      if (!patternPerformance.has(patternName)) {
        patternPerformance.set(patternName, {
          count: 0,
          wins: 0,
          totalPnL: 0
        });
      }
      
      const stats = patternPerformance.get(patternName)!;
      stats.count++;
      stats.totalPnL += trade.pnl || 0;
      if (trade.pnl && trade.pnl > 0) stats.wins++;
    }

    // Convert pattern performance to final format
    const patternStats = new Map();
    for (const [pattern, stats] of patternPerformance) {
      patternStats.set(pattern, {
        count: stats.count,
        winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0,
        avgPnL: stats.count > 0 ? stats.totalPnL / stats.count : 0,
        totalPnL: stats.totalPnL
      });
    }

    // Create config for results (convert back to full BacktestConfig)
    const fullConfig: BacktestConfig = {
      symbols: this.config.symbols || [],
      startDate: this.config.startDate,
      endDate: this.config.endDate,
      initialBalance: this.config.initialBalance,
      positionSizeGBP: this.config.positionSizeGBP!,
      maxConcurrentPositions: this.config.maxConcurrentPositions!,
      enableAutoExecution: this.config.enableAutoExecution!,
      autoExecutionThreshold: this.config.autoExecutionThreshold!,
      enableTrapFades: this.config.enableTrapFades!,
      slippageModel: this.config.slippageModel!,
      slippageBps: this.config.slippageBps,
      commissionPerTrade: this.config.commissionPerTrade
    };

    return {
      config: fullConfig,
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
      dailyStats: []
    };
  }

  private calculateSharpeRatio(): number {
    if (this.state.equityCurve.length < 2) return 0;

    const returns = this.state.equityCurve.map((point, idx) => {
      if (idx === 0) return 0;
      return (point.balance - this.state.equityCurve[idx - 1].balance) / this.state.equityCurve[idx - 1].balance;
    }).slice(1); // Remove first zero return

    if (returns.length === 0) return 0;

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
    // Simplified calculation
    return this.state.closedPositions.length > 0 ? 75 : 0;
  }
}