import express, { Request, Response } from 'express';
import { StopLossTestEngine } from '../engine/stopLossTestEngine.js';

const router = express.Router();

router.post('/test-stop-distance', async (req: Request, res: Response) => {
  try {
    const {
      startDate = "2025-11-18",
      endDate = "2025-11-24",
      minStopPercentage = 0.01, // 1% default
      scoreThreshold = 60,
      initialBalance = 10000,
      positionSizeGBP = 5
    } = req.body;

    const config = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialBalance,
      positionSizeGBP,
      scoreThreshold,
      minStopPercentage,
      useActualFills: false,
      maxConcurrentPositions: 10,
      enableAutoExecution: true,
      autoExecutionThreshold: scoreThreshold,
      enableTrapFades: false,
      slippageModel: 'fixed' as const,
      slippageBps: 2,
      commissionPerTrade: 0.5
    };

    console.log(`Testing with minimum stop distance: ${(minStopPercentage * 100).toFixed(2)}%`);

    const engine = new StopLossTestEngine(config);
    const results = await engine.run();

    res.json({
      testConfig: {
        minStopPercentage: minStopPercentage * 100,
        scoreThreshold
      },
      summary: {
        totalTrades: results.summary.totalTrades,
        winRate: results.summary.winRate,
        winningTrades: results.summary.winningTrades,
        losingTrades: results.summary.losingTrades,
        totalPnL: results.summary.totalPnL,
        avgWin: results.summary.averageWin,
        avgLoss: results.summary.averageLoss,
        sharpeRatio: results.summary.sharpeRatio,
        profitFactor: results.summary.profitFactor
      },
      improvement: {
        originalWinRate: 0,
        newWinRate: results.summary.winRate,
        originalPnL: -5.05,
        newPnL: results.summary.totalPnL
      }
    });

  } catch (error) {
    console.error('Error testing stop loss:', error);
    res.status(500).json({ 
      error: 'Failed to test stop loss',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;