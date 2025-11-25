import express, { Request, Response } from 'express';
import { BacktestEngine } from '../engine/backtestEngine.js';
import { BacktestConfig } from '../types/backtestTypes.js';
import { PerformanceAnalyzer } from '../analysis/performanceMetrics.js';
import databaseBacktestRoutes from './databaseBacktestRoutes.js';

const router = express.Router();

// Mount database backtest routes
router.use('/database', databaseBacktestRoutes);

// Store running backtests
const runningBacktests = new Map<string, { engine: BacktestEngine; startTime: Date; status: string }>();

// Run a new backtest
router.post('/run', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      initialBalance = 10000,
      positionSizeGBP = 5,
      maxConcurrentPositions = 10,
      enableAutoExecution = true,
      autoExecutionThreshold = 60,
      enableTrapFades = true,
      slippageModel = 'fixed',
      slippageBps = 2,
      commissionPerTrade = 0.5
    } = req.body;

    // Validate inputs
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({ error: 'Symbols array is required' });
      return;
    }

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Start date and end date are required' });
      return;
    }

    // Create config
    const config: BacktestConfig = {
      symbols,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialBalance,
      positionSizeGBP,
      maxConcurrentPositions,
      enableAutoExecution,
      autoExecutionThreshold,
      enableTrapFades,
      slippageModel,
      slippageBps,
      commissionPerTrade
    };

    // Generate backtest ID
    const backtestId = `backtest_${Date.now()}`;

    // Create and start backtest
    const engine = new BacktestEngine(config);
    runningBacktests.set(backtestId, {
      engine,
      startTime: new Date(),
      status: 'running'
    });

    // Run backtest asynchronously
    engine.run()
      .then(results => {
        const backtest = runningBacktests.get(backtestId);
        if (backtest) {
          backtest.status = 'completed';
          // Store results (in production, this would go to database)
          (backtest as any).results = results;
        }
      })
      .catch(error => {
        const backtest = runningBacktests.get(backtestId);
        if (backtest) {
          backtest.status = 'error';
          (backtest as any).error = error.message;
        }
        console.error('Backtest error:', error);
      });

    res.json({
      backtestId,
      status: 'started',
      message: 'Backtest started successfully'
    });

  } catch (error) {
    console.error('Error starting backtest:', error);
    res.status(500).json({ 
      error: 'Failed to start backtest',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get backtest status
router.get('/status/:backtestId', (req: Request, res: Response) => {
  const { backtestId } = req.params;
  const backtest = runningBacktests.get(backtestId);

  if (!backtest) {
    res.status(404).json({ error: 'Backtest not found' });
    return;
  }

  const response: any = {
    backtestId,
    status: backtest.status,
    startTime: backtest.startTime,
    runningTime: (Date.now() - backtest.startTime.getTime()) / 1000
  };

  if (backtest.status === 'error' && (backtest as any).error) {
    response.error = (backtest as any).error;
  }

  res.json(response);
});

// Get backtest results
router.get('/results/:backtestId', (req: Request, res: Response) => {
  const { backtestId } = req.params;
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

// Get detailed performance report
router.get('/report/:backtestId', (req: Request, res: Response) => {
  const { backtestId } = req.params;
  const backtest = runningBacktests.get(backtestId);

  if (!backtest || backtest.status !== 'completed') {
    res.status(404).json({ error: 'Backtest results not found' });
    return;
  }

  const results = (backtest as any).results;
  const report = PerformanceAnalyzer.generateDetailedReport(results);

  res.type('text/plain').send(report);
});

// Get performance metrics
router.get('/metrics/:backtestId', (req: Request, res: Response) => {
  const { backtestId } = req.params;
  const backtest = runningBacktests.get(backtestId);

  if (!backtest || backtest.status !== 'completed') {
    res.status(404).json({ error: 'Backtest results not found' });
    return;
  }

  const results = (backtest as any).results;

  const metrics = {
    summary: results.summary,
    monthlyReturns: Array.from(PerformanceAnalyzer.calculateMonthlyReturns(results).entries()),
    timeOfDayAnalysis: Array.from(PerformanceAnalyzer.analyzeTimeOfDay(results).entries()),
    holdingPeriods: PerformanceAnalyzer.analyzeHoldingPeriods(results),
    bestWorstDays: PerformanceAnalyzer.findBestAndWorstDays(results),
    riskMetrics: PerformanceAnalyzer.calculateRiskAdjustedMetrics(results)
  };

  res.json(metrics);
});

// Export trades to CSV
router.get('/export/:backtestId', (req: Request, res: Response) => {
  const { backtestId } = req.params;
  const backtest = runningBacktests.get(backtestId);

  if (!backtest || backtest.status !== 'completed') {
    res.status(404).json({ error: 'Backtest results not found' });
    return;
  }

  const results = (backtest as any).results;
  const csv = PerformanceAnalyzer.generateCSVExport(results);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${backtestId}_trades.csv"`);
  res.send(csv);
});

// List all backtests
router.get('/list', (req: Request, res: Response) => {
  const backtests = Array.from(runningBacktests.entries()).map(([id, backtest]) => ({
    id,
    status: backtest.status,
    startTime: backtest.startTime,
    runningTime: (Date.now() - backtest.startTime.getTime()) / 1000,
    symbols: backtest.status === 'completed' ? (backtest as any).results?.config.symbols : undefined
  }));

  res.json(backtests);
});

// Clean up old backtests (keep only last 10)
router.post('/cleanup', (req: Request, res: Response) => {
  const backtests = Array.from(runningBacktests.entries())
    .sort((a, b) => b[1].startTime.getTime() - a[1].startTime.getTime());

  if (backtests.length > 10) {
    const toDelete = backtests.slice(10);
    for (const [id] of toDelete) {
      runningBacktests.delete(id);
    }
  }

  res.json({ 
    message: 'Cleanup completed',
    deleted: Math.max(0, backtests.length - 10)
  });
});

export default router;