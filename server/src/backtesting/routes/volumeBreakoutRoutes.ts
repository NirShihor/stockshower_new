// @ts-nocheck
import express, { Request, Response } from 'express';
import { VolumeBreakoutBacktest } from '../engine/volumeBreakoutBacktest.js';

const router = express.Router();

// Run volume breakout backtest
router.post('/run', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      initialBalance = 10000,
      positionSizeGBP = 500,
      volumeMultiplier = 2.0,
      priceBreakoutPercent = 0.5,
      minBreakoutStrength = 60,
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
      volumeMultiplier,
      priceBreakoutPercent,
      minBreakoutStrength,
      maxConcurrentPositions,
      slippageModel: 'fixed' as const,
      slippageBps,
      commissionPerTrade
    };

    console.log('Starting volume breakout backtest with config:', config);

    // Create and run backtest
    const backtest = new VolumeBreakoutBacktest(config);
    const results = await backtest.run();

    res.json({
      success: true,
      results: results.summary,
      trades: results.trades.length,
      equityCurve: results.equityCurve.slice(-10) // Last 10 points
    });

  } catch (error) {
    console.error('Error running volume breakout backtest:', error);
    res.status(500).json({ 
      error: 'Failed to run volume breakout backtest',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Optimize volume parameters
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      volumeMultipliers = [1.5, 2.0, 2.5, 3.0],
      priceBreakoutPercents = [0.3, 0.5, 0.7, 1.0],
      positionSizeGBP = 500
    } = req.body;

    const results = [];
    
    for (const volMult of volumeMultipliers) {
      for (const priceBreak of priceBreakoutPercents) {
        const config = {
          symbols,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          initialBalance: 10000,
          positionSizeGBP,
          volumeMultiplier: volMult,
          priceBreakoutPercent: priceBreak,
          minBreakoutStrength: 50,
          maxConcurrentPositions: 10,
          slippageModel: 'fixed' as const,
          slippageBps: 2,
          commissionPerTrade: 0.5
        };

        try {
          const backtest = new VolumeBreakoutBacktest(config);
          const result = await backtest.run();
          
          results.push({
            volumeMultiplier: volMult,
            priceBreakoutPercent: priceBreak,
            totalTrades: result.summary.totalTrades,
            winRate: result.summary.winRate,
            totalPnL: result.summary.totalPnL,
            sharpeRatio: result.summary.sharpeRatio,
            maxDrawdown: result.summary.maxDrawdown
          });
        } catch (error) {
          console.error(`Error with vol=${volMult}, price=${priceBreak}:`, error);
        }
      }
    }

    // Sort by Sharpe ratio
    results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);

    res.json({
      optimization: 'volume_breakout_parameters',
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

export default router;