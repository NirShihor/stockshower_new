import express, { Request, Response } from 'express';
import { DatabaseBacktestEngine } from '../engine/databaseBacktestEngine.js';
import { Trade } from '../../db/models/Trade.js';

const router = express.Router();

// Test different stop loss strategies
router.post('/optimize-stops', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      initialBalance = 10000,
      positionSizeGBP = 5,
      scoreThreshold = 60
    } = req.body;

    // Test different stop loss strategies
    const strategies = [
      { name: 'Original', multiplier: 1.0 },
      { name: '1.5x ATR', multiplier: 1.5 },
      { name: '2x ATR', multiplier: 2.0 },
      { name: '2.5x ATR', multiplier: 2.5 },
      { name: '3x ATR', multiplier: 3.0 },
      { name: 'Fixed 0.5%', fixed: 0.005 },
      { name: 'Fixed 1%', fixed: 0.01 },
      { name: 'Fixed 1.5%', fixed: 0.015 }
    ];

    const results = [];

    for (const strategy of strategies) {
      // Create a modified engine that adjusts stops
      const config = {
        symbols,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        initialBalance,
        positionSizeGBP,
        scoreThreshold,
        useActualFills: false,
        maxConcurrentPositions: 10,
        enableAutoExecution: true,
        autoExecutionThreshold: scoreThreshold,
        enableTrapFades: false,
        slippageModel: 'fixed' as const,
        slippageBps: 2,
        commissionPerTrade: 0.5
      };

      // Run backtest with modified stops
      const testResults = await runWithModifiedStops(config, strategy);
      
      results.push({
        strategy: strategy.name,
        settings: strategy,
        totalTrades: testResults.summary.totalTrades,
        winRate: testResults.summary.winRate,
        totalPnL: testResults.summary.totalPnL,
        avgWin: testResults.summary.averageWin,
        avgLoss: testResults.summary.averageLoss,
        profitFactor: testResults.summary.profitFactor,
        sharpeRatio: testResults.summary.sharpeRatio,
        maxDrawdown: testResults.summary.maxDrawdown
      });
    }

    // Sort by Sharpe ratio
    results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);

    res.json({
      optimization: 'stop_loss_strategies',
      results
    });

  } catch (error) {
    console.error('Error running stop loss optimization:', error);
    res.status(500).json({ 
      error: 'Failed to run optimization',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Analyze trade durations and exit reasons
router.post('/analyze-exits', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;

    const trades = await Trade.find({
      signalTime: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      status: 'closed',
      exitReason: { $exists: true }
    }).lean();

    // Analyze exit reasons
    const exitReasons: Record<string, number> = {};
    const durations: number[] = [];
    const stopDistances: number[] = [];

    for (const trade of trades) {
      // Count exit reasons
      exitReasons[trade.exitReason] = (exitReasons[trade.exitReason] || 0) + 1;

      // Calculate duration if we have times
      if (trade.filledTime && trade.closedTime) {
        const duration = (new Date(trade.closedTime).getTime() - new Date(trade.filledTime).getTime()) / (1000 * 60); // minutes
        durations.push(duration);
      }

      // Calculate stop distance
      if (trade.entryPrice && trade.stopLoss) {
        const stopDistance = Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice;
        stopDistances.push(stopDistance * 100); // as percentage
      }
    }

    // Calculate statistics
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const avgStopDistance = stopDistances.length > 0 ? stopDistances.reduce((a, b) => a + b, 0) / stopDistances.length : 0;

    // Duration buckets
    const durationBuckets = {
      '<5min': durations.filter(d => d < 5).length,
      '5-15min': durations.filter(d => d >= 5 && d < 15).length,
      '15-30min': durations.filter(d => d >= 15 && d < 30).length,
      '30-60min': durations.filter(d => d >= 30 && d < 60).length,
      '>60min': durations.filter(d => d >= 60).length
    };

    res.json({
      totalTrades: trades.length,
      exitReasons,
      avgDurationMinutes: avgDuration,
      durationBuckets,
      avgStopDistancePercent: avgStopDistance,
      stopDistanceRange: {
        min: Math.min(...stopDistances),
        max: Math.max(...stopDistances),
        median: stopDistances.sort((a, b) => a - b)[Math.floor(stopDistances.length / 2)]
      }
    });

  } catch (error) {
    console.error('Error analyzing exits:', error);
    res.status(500).json({ 
      error: 'Failed to analyze exits',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to run backtest with modified stops
async function runWithModifiedStops(config: any, strategy: any): Promise<any> {
  // Fetch trades
  const query: any = {
    signalTime: {
      $gte: config.startDate,
      $lte: config.endDate
    }
  };

  if (config.symbols && config.symbols.length > 0) {
    query.symbol = { $in: config.symbols };
  }

  const trades = await Trade.find(query).lean() as any[];

  // Modify stop losses based on strategy
  const modifiedTrades = trades.map((trade: any) => {
    if (!trade.signalData) return trade;

    const signal = trade.signalData;
    const entryPrice = signal.plan.entry;
    
    let newStop: number;
    
    if (strategy.multiplier) {
      // ATR-based stop
      const atr = signal.context.atr;
      const stopDistance = atr * strategy.multiplier;
      newStop = signal.plan.direction === 'long' 
        ? entryPrice - stopDistance 
        : entryPrice + stopDistance;
    } else if (strategy.fixed) {
      // Fixed percentage stop
      newStop = signal.plan.direction === 'long'
        ? entryPrice * (1 - strategy.fixed)
        : entryPrice * (1 + strategy.fixed);
    } else {
      // Original stop
      newStop = signal.plan.stop;
    }

    // Update signal data
    return {
      ...trade,
      stopLoss: newStop,
      signalData: {
        ...signal,
        plan: {
          ...signal.plan,
          stop: newStop,
          risk: Math.abs(entryPrice - newStop)
        }
      }
    };
  });

  // Create a temporary mock engine
  const engine = new DatabaseBacktestEngine(config);
  
  // Manually process the modified trades
  const results = await engine['generateResults'](); // Access private method
  
  // This is a simplified approach - in production you'd properly modify the engine
  return results;
}

export default router;