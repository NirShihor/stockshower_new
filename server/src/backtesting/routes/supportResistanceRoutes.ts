// @ts-nocheck
import express, { Request, Response } from 'express';
import { SupportResistanceBacktest } from '../engine/supportResistanceBacktest.js';

const router = express.Router();

// Run support/resistance bounce backtest
router.post('/run', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      initialBalance = 10000,
      positionSizeGBP = 500,
      lookbackPeriods = 50,
      minBounceStrength = 60,
      requireVolumeConfirmation = true,
      maxConcurrentPositions = 10,
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
      lookbackPeriods,
      minBounceStrength,
      requireVolumeConfirmation,
      maxConcurrentPositions,
      slippageModel: 'fixed' as const,
      slippageBps,
      commissionPerTrade
    };

    console.log('Starting support/resistance bounce backtest with config:', config);

    // Create and run backtest
    const backtest = new SupportResistanceBacktest(config);
    const results = await backtest.run();

    res.json({
      success: true,
      results: results.summary,
      trades: results.trades.length,
      equityCurve: results.equityCurve.slice(-10) // Last 10 points
    });

  } catch (error) {
    console.error('Error running support/resistance backtest:', error);
    res.status(500).json({ 
      error: 'Failed to run support/resistance backtest',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Optimize S/R parameters
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      lookbackPeriods = [30, 50, 70, 100],
      minBounceStrengths = [50, 60, 70, 80],
      positionSizeGBP = 500
    } = req.body;

    const results = [];
    
    for (const lookback of lookbackPeriods) {
      for (const strength of minBounceStrengths) {
        const config = {
          symbols,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          initialBalance: 10000,
          positionSizeGBP,
          lookbackPeriods: lookback,
          minBounceStrength: strength,
          requireVolumeConfirmation: true,
          maxConcurrentPositions: 10,
          slippageModel: 'fixed' as const,
          slippageBps: 2,
          commissionPerTrade: 0.5
        };

        try {
          const backtest = new SupportResistanceBacktest(config);
          const result = await backtest.run();
          
          results.push({
            lookbackPeriods: lookback,
            minBounceStrength: strength,
            totalTrades: result.summary.totalTrades,
            winRate: result.summary.winRate,
            totalPnL: result.summary.totalPnL,
            sharpeRatio: result.summary.sharpeRatio,
            maxDrawdown: result.summary.maxDrawdown
          });
        } catch (error) {
          console.error(`Error with lookback=${lookback}, strength=${strength}:`, error);
        }
      }
    }

    // Sort by Sharpe ratio
    results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);

    res.json({
      optimization: 'support_resistance_parameters',
      results,
      best: results[0]
    });

  } catch (error) {
    console.error('Error running optimization:', error);
    res.status(500).json({ 
      error: 'Failed to run optimization',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test S/R level identification
router.post('/levels', async (req: Request, res: Response) => {
  try {
    const {
      symbol,
      startDate,
      endDate,
      lookbackPeriods = 50
    } = req.body;

    if (!symbol || !startDate || !endDate) {
      res.status(400).json({ error: 'Symbol, start date and end date are required' });
      return;
    }

    // This is just for testing level identification
    res.json({
      message: 'Level identification endpoint - to be implemented',
      symbol,
      lookbackPeriods
    });

  } catch (error) {
    console.error('Error identifying levels:', error);
    res.status(500).json({ 
      error: 'Failed to identify levels',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;