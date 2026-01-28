import express, { Request, Response } from 'express';
import { DatabaseBacktestEngine } from '../engine/databaseBacktestEngine.js';
import { PerformanceAnalyzer } from '../analysis/performanceMetrics.js';
import { Trade } from '../../db/models/Trade.js';
import stopLossOptimizationRoutes from './stopLossOptimizationRoutes.js';
import testStopLoss from './testStopLoss.js';
import testEntryTiming from './testEntryTiming.js';
import analyzePatterns from './analyzePatterns.js';

const router = express.Router();

// Mount stop loss optimization routes
router.use('/stops', stopLossOptimizationRoutes);
router.use('/test', testStopLoss);
router.use('/entry', testEntryTiming);
router.use('/patterns', analyzePatterns);

// Store running backtests
const runningBacktests = new Map<string, { 
  engine: DatabaseBacktestEngine; 
  startTime: Date; 
  status: string;
  type: 'database' | 'simulation';
}>();

// Get available date range and symbols from database
router.get('/available-data', async (req: Request, res: Response) => {
  try {
    // Get date range
    const dateRange = await Trade.aggregate([
      {
        $group: {
          _id: null,
          minDate: { $min: '$signalTime' },
          maxDate: { $max: '$signalTime' },
          totalTrades: { $sum: 1 }
        }
      }
    ]);

    // Get symbols with trade counts
    const symbols = await Trade.aggregate([
      {
        $group: {
          _id: '$symbol',
          count: { $sum: 1 },
          firstTrade: { $min: '$signalTime' },
          lastTrade: { $max: '$signalTime' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get pattern statistics
    const patterns = await Trade.aggregate([
      {
        $group: {
          _id: '$patternName',
          count: { $sum: 1 },
          avgScore: { $avg: '$patternScore' },
          winRate: {
            $avg: {
              $cond: [
                { $and: [{ $ne: ['$pnlAmount', null] }, { $gt: ['$pnlAmount', 0] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      dateRange: dateRange[0] || { minDate: null, maxDate: null, totalTrades: 0 },
      symbols: symbols.map(s => ({
        symbol: s._id,
        tradeCount: s.count,
        firstTrade: s.firstTrade,
        lastTrade: s.lastTrade
      })),
      patterns: patterns.map(p => ({
        pattern: p._id,
        count: p.count,
        avgScore: p.avgScore,
        winRate: p.winRate * 100
      }))
    });

  } catch (error) {
    console.error('Error fetching available data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch available data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Run database-driven backtest
router.post('/run-database', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      initialBalance = 10000,
      positionSizeGBP = 5,
      scoreThreshold = 60,
      useActualFills = true,
      maxConcurrentPositions = 10,
      enableAutoExecution = true,
      autoExecutionThreshold = 60,
      enableTrapFades = true,
      slippageModel = 'fixed',
      slippageBps = 2,
      commissionPerTrade = 0.5
    } = req.body;

    // Validate inputs
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Start date and end date are required' });
      return;
    }

    // Create config
    const config = {
      symbols,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialBalance,
      positionSizeGBP,
      scoreThreshold,
      useActualFills,
      maxConcurrentPositions,
      enableAutoExecution,
      autoExecutionThreshold,
      enableTrapFades,
      slippageModel: slippageModel as 'fixed' | 'dynamic',
      slippageBps,
      commissionPerTrade
    };

    // Generate backtest ID
    const backtestId = `db_backtest_${Date.now()}`;

    // Create and start backtest
    const engine = new DatabaseBacktestEngine(config);
    runningBacktests.set(backtestId, {
      engine,
      startTime: new Date(),
      status: 'running',
      type: 'database'
    });

    // Run backtest asynchronously
    engine.run()
      .then(results => {
        const backtest = runningBacktests.get(backtestId);
        if (backtest) {
          backtest.status = 'completed';
          (backtest as any).results = results;
        }
      })
      .catch(error => {
        const backtest = runningBacktests.get(backtestId);
        if (backtest) {
          backtest.status = 'error';
          (backtest as any).error = error.message;
        }
        console.error('Database backtest error:', error);
      });

    res.json({
      backtestId,
      status: 'started',
      message: 'Database backtest started successfully',
      type: 'database'
    });

  } catch (error) {
    console.error('Error starting database backtest:', error);
    res.status(500).json({ 
      error: 'Failed to start database backtest',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test different score thresholds
router.post('/optimize-threshold', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      thresholds = [20, 30, 40, 50, 60, 70, 80],
      useActualFills = true,
      initialBalance = 10000,
      positionSizeGBP = 5
    } = req.body;

    const results = [];
    
    for (const threshold of thresholds) {
      const config = {
        symbols,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        initialBalance,
        positionSizeGBP,
        scoreThreshold: threshold,
        useActualFills,
        maxConcurrentPositions: 10,
        enableAutoExecution: true,
        autoExecutionThreshold: threshold,
        enableTrapFades: true,
        slippageModel: 'fixed' as const,
        slippageBps: 2,
        commissionPerTrade: 0.5
      };

      const engine = new DatabaseBacktestEngine(config);
      const result = await engine.run();
      
      results.push({
        threshold,
        totalTrades: result.summary.totalTrades,
        winRate: result.summary.winRate,
        totalPnL: result.summary.totalPnL,
        sharpeRatio: result.summary.sharpeRatio,
        maxDrawdown: result.summary.maxDrawdown
      });
    }

    res.json({
      optimization: 'score_threshold',
      results: results.sort((a, b) => b.sharpeRatio - a.sharpeRatio)
    });

  } catch (error) {
    console.error('Error running optimization:', error);
    res.status(500).json({ 
      error: 'Failed to run optimization',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get backtest status (works for both types)
router.get('/status/:backtestId', (req: Request, res: Response) => {
  const backtestId = req.params.backtestId as string;
  const backtest = runningBacktests.get(backtestId);

  if (!backtest) {
    res.status(404).json({ error: 'Backtest not found' });
    return;
  }

  const response: any = {
    backtestId,
    status: backtest.status,
    type: backtest.type,
    startTime: backtest.startTime,
    runningTime: (Date.now() - backtest.startTime.getTime()) / 1000
  };

  if (backtest.status === 'error' && (backtest as any).error) {
    response.error = (backtest as any).error;
  }

  res.json(response);
});

// Get results (works for both types)
router.get('/results/:backtestId', (req: Request, res: Response) => {
  const backtestId = req.params.backtestId as string;
  const backtest = runningBacktests.get(backtestId);

  if (!backtest) {
    res.status(404).json({ error: 'Backtest not found' });
    return;
  }

  if (backtest.status !== 'completed') {
    res.status(400).json({ 
      error: 'Backtest not completed',
      status: backtest.status
    });
    return;
  }

  const results = (backtest as any).results;
  if (!results) {
    res.status(500).json({ error: 'Results not available' });
    return;
  }

  res.json(results);
});

// Export all routes under a single default export
export default router;