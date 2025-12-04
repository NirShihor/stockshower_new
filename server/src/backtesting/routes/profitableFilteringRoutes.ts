import express from 'express';
import { DatabaseBacktestEngine } from '../engine/databaseBacktestEngine.js';

const router = express.Router();

// Test profitable filtering with different configurations
router.post('/test-filtering', async (req, res) => {
  try {
    const {
      startDate = new Date('2024-01-01'),
      endDate = new Date(),
      initialBalance = 10000,
      positionSizeGBP = 500,
      filterMode = 'high_performance',
      enableDetailedLogging = false
    } = req.body;

    console.log(`🧪 Testing ${filterMode} filtering from ${startDate} to ${endDate}`);

    const config = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialBalance,
      positionSizeGBP,
      maxConcurrentPositions: 10,
      enableAutoExecution: false,
      autoExecutionThreshold: 60,
      enableTrapFades: false,
      slippageModel: 'fixed' as const,
      slippageBps: 5,
      commissionPerTrade: 1,
      useProfitableFiltering: true,
      profitableFilterConfig: {
        filterMode: filterMode as 'high_performance' | 'conservative' | 'aggressive',
        enableDetailedLogging
      }
    };

    const backtest = new DatabaseBacktestEngine(config);
    const results = await backtest.run();

    res.json({
      success: true,
      config: {
        filterMode,
        dateRange: { startDate, endDate },
        positionSizeGBP,
        initialBalance
      },
      results: {
        summary: results.summary,
        totalTrades: results.summary.totalTrades,
        winRate: results.summary.winRate,
        totalPnL: results.summary.totalPnL,
        profitFactor: results.summary.profitFactor,
        maxDrawdown: results.summary.maxDrawdown,
        sharpeRatio: results.summary.sharpeRatio,
        averageWin: results.summary.averageWin,
        averageLoss: results.summary.averageLoss
      },
      patternBreakdown: results.patternPerformance
    });

  } catch (error) {
    console.error('Error in filtering test:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Compare all filtering modes
router.post('/compare-all-filters', async (req, res) => {
  try {
    const {
      startDate = new Date('2024-01-01'),
      endDate = new Date(),
      initialBalance = 10000,
      positionSizeGBP = 500
    } = req.body;

    const baseConfig = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      initialBalance,
      positionSizeGBP,
      maxConcurrentPositions: 10,
      enableAutoExecution: false,
      autoExecutionThreshold: 60,
      enableTrapFades: false,
      slippageModel: 'fixed' as const,
      slippageBps: 5,
      commissionPerTrade: 1
    };

    const filterModes = [
      { name: 'baseline', useProfitableFiltering: false },
      { name: 'conservative', useProfitableFiltering: true, filterMode: 'conservative' },
      { name: 'high_performance', useProfitableFiltering: true, filterMode: 'high_performance' },
      { name: 'aggressive', useProfitableFiltering: true, filterMode: 'aggressive' }
    ];

    const comparison: any[] = [];

    for (const mode of filterModes) {
      console.log(`🔄 Running ${mode.name} filter...`);
      
      const config = {
        ...baseConfig,
        useProfitableFiltering: mode.useProfitableFiltering,
        ...(mode.useProfitableFiltering && {
          profitableFilterConfig: {
            filterMode: mode.filterMode as any,
            enableDetailedLogging: false
          }
        })
      };

      const backtest = new DatabaseBacktestEngine(config);
      const results = await backtest.run();

      comparison.push({
        filterType: mode.name,
        totalTrades: results.summary.totalTrades,
        winRate: results.summary.winRate,
        totalPnL: results.summary.totalPnL,
        profitFactor: results.summary.profitFactor,
        maxDrawdown: results.summary.maxDrawdown,
        averageWin: results.summary.averageWin,
        averageLoss: results.summary.averageLoss,
        sharpeRatio: results.summary.sharpeRatio
      });
    }

    // Find best performer
    const profitable = comparison.filter(c => c.totalPnL > 0 && c.winRate > 50);
    const bestFilter = profitable.length > 0 
      ? profitable.reduce((best, current) => current.totalPnL > best.totalPnL ? current : best)
      : null;

    res.json({
      success: true,
      config: {
        dateRange: { startDate, endDate },
        positionSizeGBP,
        initialBalance
      },
      comparison,
      recommendation: bestFilter ? {
        bestFilter: bestFilter.filterType,
        improvement: {
          tradesReduced: Math.round((comparison[0].totalTrades - bestFilter.totalTrades) / comparison[0].totalTrades * 100),
          winRateIncrease: (bestFilter.winRate - comparison[0].winRate).toFixed(1),
          profitIncrease: (bestFilter.totalPnL - comparison[0].totalPnL).toFixed(2)
        }
      } : {
        message: 'No filters achieved profitability - consider adjusting parameters'
      }
    });

  } catch (error) {
    console.error('Error in filter comparison:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get filter configuration details
router.get('/filter-configs', (req, res) => {
  const configs = {
    conservative: {
      description: 'More trades with moderate filtering - targets 60-70% win rate',
      criteria: {
        minScore: 65,
        requireHighVolume: true,
        allowedTrends: ['down', 'up'],
        excludedPatterns: ['Tweezer Bottom', 'Reversal Doji', 'Reversal Shooting Star', 'Gap Up Breakout'],
        minVolumeRatio: 1.2
      },
      expectedPerformance: '60-70% win rate, moderate trade frequency'
    },
    high_performance: {
      description: 'Balanced approach - targets 70-80% win rate',
      criteria: {
        minScore: 70,
        maxScore: 90,
        requireHighVolume: true,
        allowedTrends: ['down', 'up'],
        allowedPatterns: [
          'Bearish Engulfing', 'Three Black Crows', 'Reversal Evening Star',
          'Reversal Hammer', 'Morning Star', 'Hanging Man', '🔄 VwapBounce Long'
        ],
        excludedPatterns: ['Tweezer Bottom', 'Reversal Doji', 'Reversal Shooting Star', 'Gap Up Breakout'],
        requireTrendAlignment: true,
        minVolumeRatio: 1.5
      },
      expectedPerformance: '70-80% win rate, balanced trade frequency'
    },
    aggressive: {
      description: 'Highest quality only - targets 80%+ win rate',
      criteria: {
        minScore: 80,
        maxScore: 90,
        requireHighVolume: true,
        allowedTrends: ['down'],
        allowedPatterns: ['Bearish Engulfing', 'Three Black Crows', 'Reversal Evening Star'],
        requireTrendAlignment: true,
        minVolumeRatio: 2.0
      },
      expectedPerformance: '80%+ win rate, low trade frequency'
    }
  };

  res.json({
    success: true,
    filterConfigurations: configs,
    basedOn: 'Analysis of 115 open trades showing 60.2% baseline win rate',
    dataSource: 'Unrealized P&L calculation from actual trading signals'
  });
});

export default router;