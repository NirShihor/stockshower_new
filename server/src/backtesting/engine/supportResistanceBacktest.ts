import { 
  BacktestState, 
  BacktestResults, 
  BacktestPosition,
  BacktestCandle
} from '../types/backtestTypes.js';
import { DatabaseBacktestConfig } from './databaseBacktestEngine.js';
import { HistoricalDataLoader } from './dataLoader.js';
import { MT5Simulator } from './mt5Simulator.js';
import { SupportResistanceBounceStrategy } from '../strategies/supportResistanceBounceStrategy.js';
import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';
import { Candle } from '../../candlestick/types/index.js';

export interface SupportResistanceConfig extends Omit<DatabaseBacktestConfig, 'scoreThreshold'> {
  lookbackPeriods?: number;
  minBounceStrength?: number; // 0-100
  requireVolumeConfirmation?: boolean;
}

export class SupportResistanceBacktest {
  private config: SupportResistanceConfig;
  private dataLoader: HistoricalDataLoader;
  private mt5Simulator: MT5Simulator;
  private bounceStrategy: SupportResistanceBounceStrategy;
  private state: BacktestState;

  constructor(config: SupportResistanceConfig) {
    this.config = config;
    this.dataLoader = new HistoricalDataLoader();
    this.mt5Simulator = new MT5Simulator(config.slippageBps || 2, config.commissionPerTrade);
    
    this.bounceStrategy = new SupportResistanceBounceStrategy({
      lookbackPeriods: config.lookbackPeriods || 50,
      touchTolerance: 0.002, // 0.2%
      minBounces: 3,
      volumeConfirmation: config.requireVolumeConfirmation ?? true,
      minRejectionWick: 0.6 // 60% wick
    });
    
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
    console.log('Starting support/resistance bounce backtest...');
    console.log('Config:', {
      ...this.config,
      lookbackPeriods: this.config.lookbackPeriods || 50,
      minBounceStrength: this.config.minBounceStrength || 60
    });

    const symbols = this.config.symbols || this.getDefaultSymbols();
    
    // Process each symbol
    for (const symbol of symbols) {
      await this.processSymbol(symbol);
    }

    // Close any remaining positions
    this.closeAllPositions();

    return this.generateResults();
  }

  private async processSymbol(symbol: string): Promise<void> {
    try {
      // Load historical data for the symbol
      const candles = await this.dataLoader.loadData(
        symbol,
        this.config.startDate,
        this.config.endDate,
        '5' // 5-minute candles
      );

      if (candles.length === 0) {
        console.log(`No data available for ${symbol}`);
        return;
      }

      console.log(`Processing ${symbol}: ${candles.length} candles`);

      // Need at least lookback periods for S/R identification
      const lookback = this.config.lookbackPeriods || 50;
      
      for (let i = lookback; i < candles.length; i++) {
        const currentCandle = candles[i];
        const historicalCandles = candles.slice(0, i);
        const recentCandles = candles.slice(i - 20, i);
        
        // Check open positions for exits
        this.checkExits(currentCandle);
        
        // Identify support/resistance levels
        const levels = this.bounceStrategy.identifyLevels(historicalCandles);
        
        // Check for new bounce signals
        if (this.canCreateNewSignal(symbol) && levels.length > 0) {
          const signal = this.createSignalFromCandle(
            currentCandle,
            recentCandles,
            symbol
          );
          
          if (signal) {
            // Check if it's a valid bounce
            const bounceInfo = this.bounceStrategy.isBounce(signal, levels, recentCandles);
            
            if (bounceInfo.isBounce && bounceInfo.level && 
                bounceInfo.strength >= (this.config.minBounceStrength || 60)) {
              
              console.log(`Bounce detected: ${symbol} ${bounceInfo.direction} strength=${bounceInfo.strength} reason="${bounceInfo.reason}"`);
              
              // Validate bounce quality
              const validation = this.bounceStrategy.validateBounceQuality(signal, bounceInfo.level);
              
              if (validation.isValid) {
                // Create bounce signal with proper stops/targets
                const bounceSignal = this.bounceStrategy.createBounceSignal(signal, {
                  level: bounceInfo.level,
                  direction: bounceInfo.direction!,
                  strength: bounceInfo.strength
                });
                
                // Place the order
                const position = this.mt5Simulator.placeOrder(
                  bounceSignal,
                  this.config.positionSizeGBP!,
                  currentCandle
                );
                
                // Check if filled immediately
                const filled = this.mt5Simulator.checkPendingOrders(currentCandle);
                if (filled.length > 0) {
                  this.state.openPositions.set(position.id, filled[0]);
                  this.state.lastSignalTime.set(symbol, currentCandle.timestamp);
                  console.log(`Bounce position opened: ${symbol} ${bounceInfo.direction} @ ${filled[0].entryPrice}`);
                }
              } else {
                console.log(`Bounce rejected for ${symbol}: ${validation.reason}`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${symbol}:`, error);
    }
  }

  private createSignalFromCandle(
    candle: BacktestCandle,
    recentCandles: BacktestCandle[],
    symbol: string
  ): ComprehensiveSignal | null {
    // Calculate context
    const volumes = recentCandles.map(c => c.volume);
    const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
    
    // Calculate ATR
    const atr = this.calculateATR(recentCandles);
    
    // Determine trend
    const sma20 = recentCandles.reduce((sum, c) => sum + c.close, 0) / recentCandles.length;
    const trend = candle.close > sma20 ? 'up' : 'down';
    
    // Create a basic signal structure
    const signal: ComprehensiveSignal = {
      id: `${symbol}_${candle.timestamp.getTime()}`,
      symbol,
      timestamp: candle.timestamp,
      candle: {
        ...candle,
        timestamp: candle.timestamp
      },
      pattern: {
        name: 'Pending',
        direction: 'bullish',
        reliability: 0,
        candleCount: 1
      },
      context: {
        atr,
        avgVolume,
        avgBody: this.calculateAvgBody(recentCandles),
        isHighVolume: candle.volume > avgVolume * 1.5,
        trend,
        trendStrength: Math.abs(candle.close - sma20) / sma20 * 100,
        volatility: atr / candle.close * 100,
        volumeRatio: candle.volume / avgVolume,
        nearestSupport: null,
        nearestResistance: null,
        atSupport: false,
        atResistance: false
      },
      score: 0,
      plan: {
        direction: 'long',
        entry: 0,
        stop: 0,
        risk: 0,
        targets: [],
        positionQty: 0,
        riskRewardRatio: '1:2'
      },
      confidence: {
        pattern: 0,
        context: 0,
        overall: 0
      }
    };

    return signal;
  }

  private calculateATR(candles: BacktestCandle[]): number {
    if (candles.length < 2) return 0;
    
    const trueRanges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const prev = candles[i - 1];
      
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close)
      );
      
      trueRanges.push(tr);
    }
    
    return trueRanges.reduce((a, b) => a + b) / trueRanges.length;
  }

  private calculateAvgBody(candles: BacktestCandle[]): number {
    const bodies = candles.map(c => Math.abs(c.close - c.open));
    return bodies.reduce((a, b) => a + b) / bodies.length;
  }

  private canCreateNewSignal(symbol: string): boolean {
    // Check position limits
    if (this.state.openPositions.size >= (this.config.maxConcurrentPositions || 10)) {
      return false;
    }
    
    // Check for recent signal on same symbol (avoid overtrading)
    const lastSignal = this.state.lastSignalTime.get(symbol);
    if (lastSignal) {
      const timeSinceLastSignal = Date.now() - lastSignal.getTime();
      if (timeSinceLastSignal < 60 * 60 * 1000) { // 1 hour
        return false;
      }
    }
    
    // Check daily loss limit
    if (this.state.dailyStats.pnl < -this.state.currentBalance * 0.03) {
      return false;
    }
    
    return true;
  }

  private checkExits(candle: BacktestCandle): void {
    for (const [id, position] of this.state.openPositions) {
      const exit = this.mt5Simulator.checkPositionExit(position, candle);
      
      if (exit) {
        const closedPosition = this.mt5Simulator.closePosition(
          position,
          exit.exitPrice,
          exit.exitReason,
          candle.timestamp
        );
        
        this.state.openPositions.delete(id);
        this.state.closedPositions.push(closedPosition);
        this.updateStateAfterTrade(closedPosition);
        
        console.log(`Position closed: ${position.symbol} ${exit.exitReason} P&L: ${closedPosition.pnl?.toFixed(2)}`);
      }
    }
  }

  private closeAllPositions(): void {
    for (const [id, position] of this.state.openPositions) {
      const closedPosition = this.mt5Simulator.closePosition(
        position,
        position.entryPrice, // Close at entry for simplicity
        'end_of_data',
        this.config.endDate
      );
      
      this.state.closedPositions.push(closedPosition);
      this.updateStateAfterTrade(closedPosition);
    }
    this.state.openPositions.clear();
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

  private getDefaultSymbols(): string[] {
    return ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'JNJ'];
  }

  private generateResults(): BacktestResults {
    const trades = this.state.closedPositions;
    const winningTrades = trades.filter(t => t.pnl! > 0);
    const losingTrades = trades.filter(t => t.pnl! <= 0);

    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + t.pnl!, 0) / winningTrades.length
      : 0;
    
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0) / losingTrades.length)
      : 0;

    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    return {
      config: {
        symbols: this.config.symbols || [],
        startDate: this.config.startDate,
        endDate: this.config.endDate,
        initialBalance: this.config.initialBalance,
        positionSizeGBP: this.config.positionSizeGBP!,
        maxConcurrentPositions: this.config.maxConcurrentPositions!,
        enableAutoExecution: true,
        autoExecutionThreshold: 60,
        enableTrapFades: false,
        slippageModel: this.config.slippageModel!,
        slippageBps: this.config.slippageBps,
        commissionPerTrade: this.config.commissionPerTrade
      },
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
        timeInMarket: 75 // Simplified
      },
      trades,
      equityCurve: this.state.equityCurve,
      patternPerformance: new Map(), // Not applicable for S/R strategy
      dailyStats: []
    };
  }

  private calculateSharpeRatio(): number {
    if (this.state.equityCurve.length < 2) return 0;

    const returns = this.state.equityCurve.map((point, idx) => {
      if (idx === 0) return 0;
      return (point.balance - this.state.equityCurve[idx - 1].balance) / this.state.equityCurve[idx - 1].balance;
    }).slice(1);

    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
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
}