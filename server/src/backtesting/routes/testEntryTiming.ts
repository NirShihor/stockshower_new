import express, { Request, Response } from 'express';
import { DatabaseBacktestEngine, DatabaseBacktestConfig } from '../engine/databaseBacktestEngine.js';

const router = express.Router();

// Test different entry strategies
router.post('/test-entry-buffer', async (req: Request, res: Response) => {
  try {
    const {
      startDate = "2025-11-18",
      endDate = "2025-11-24",
      entryBufferPercent = 0.002, // 0.2% above trigger by default
      scoreThreshold = 60,
      initialBalance = 10000,
      positionSizeGBP = 5
    } = req.body;

    // First run original backtest
    const originalConfig = {
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

    const originalEngine = new DatabaseBacktestEngine(originalConfig);
    const originalResults = await originalEngine.run();

    // Now run with entry buffer - we'll need to modify signals
    class EntryBufferEngine extends DatabaseBacktestEngine {
      protected async processHistoricalSignal(trade: any): Promise<void> {
        const signal = trade.signalData;
        
        if (!signal || signal.score < scoreThreshold) {
          return;
        }

        // Add buffer to entry price
        const originalEntry = signal.plan.entry;
        const direction = signal.plan.direction;
        
        const newEntry = direction === 'long' 
          ? originalEntry * (1 + entryBufferPercent)  // Buy higher (more conservative)
          : originalEntry * (1 - entryBufferPercent); // Sell lower (more conservative)

        console.log(`[ENTRY ADJUSTED] ${signal.symbol}: Original entry ${originalEntry.toFixed(2)} -> New entry ${newEntry.toFixed(2)} (${(entryBufferPercent*100).toFixed(1)}% buffer)`);

        // Create modified signal
        const modifiedSignal = {
          ...signal,
          plan: {
            ...signal.plan,
            entry: newEntry
          }
        };

        const modifiedTrade = {
          ...trade,
          signalData: modifiedSignal
        };

        return super.processHistoricalSignal(modifiedTrade);
      }
    }

    const bufferedEngine = new EntryBufferEngine(originalConfig);
    const bufferedResults = await bufferedEngine.run();

    res.json({
      testConfig: {
        entryBufferPercent: entryBufferPercent * 100,
        scoreThreshold
      },
      original: {
        totalTrades: originalResults.summary.totalTrades,
        winRate: originalResults.summary.winRate,
        totalPnL: originalResults.summary.totalPnL
      },
      withBuffer: {
        totalTrades: bufferedResults.summary.totalTrades,
        winRate: bufferedResults.summary.winRate,
        totalPnL: bufferedResults.summary.totalPnL
      },
      improvement: {
        winRateChange: bufferedResults.summary.winRate - originalResults.summary.winRate,
        pnlChange: bufferedResults.summary.totalPnL - originalResults.summary.totalPnL,
        betterOrWorse: bufferedResults.summary.totalPnL > originalResults.summary.totalPnL ? 'BETTER' : 'WORSE'
      }
    });

  } catch (error) {
    console.error('Error testing entry buffer:', error);
    res.status(500).json({ 
      error: 'Failed to test entry buffer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;