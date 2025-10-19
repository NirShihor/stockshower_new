import express, { Request, Response, Router } from 'express';
import { TradeService } from '../db/services/tradeService.js';
import { Trade } from '../db/models/Trade.js';

const router: Router = express.Router();

// Get recent trades
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const trades = await TradeService.getRecentTrades(limit);
    res.json(trades);
  } catch (error) {
    console.error('Error fetching recent trades:', error);
    res.status(500).json({ error: 'Failed to fetch recent trades' });
  }
});

// Get trade by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const trade = await Trade.findById(req.params.id);
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    res.json(trade);
  } catch (error) {
    console.error('Error fetching trade:', error);
    res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

// Update trade as filled
router.post('/:mt5OrderId/fill', async (req: Request, res: Response) => {
  try {
    const { fillPrice, fillTime } = req.body;
    const trade = await TradeService.updateTradeFilled(
      req.params.mt5OrderId,
      fillPrice,
      fillTime ? new Date(fillTime) : undefined
    );
    
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    res.json(trade);
  } catch (error) {
    console.error('Error updating filled trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// Close a trade
router.post('/:mt5PositionId/close', async (req: Request, res: Response) => {
  try {
    const { exitPrice, exitReason, commission } = req.body;
    const trade = await TradeService.closeTrade(
      req.params.mt5PositionId,
      exitPrice,
      exitReason,
      commission
    );
    
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    res.json(trade);
  } catch (error) {
    console.error('Error closing trade:', error);
    res.status(500).json({ error: 'Failed to close trade' });
  }
});

// Get pattern analytics
router.get('/analytics/pattern/:patternName', async (req: Request, res: Response) => {
  try {
    const analytics = await TradeService.getPatternAnalytics(req.params.patternName);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching pattern analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get overall trading statistics
router.get('/analytics/overall', async (req: Request, res: Response) => {
  try {
    // Get all closed trades
    const closedTrades = await Trade.find({ status: 'closed' });
    
    // Calculate statistics
    const totalTrades = closedTrades.length;
    const winningTrades = closedTrades.filter(t => t.pnlAmount && t.pnlAmount > 0).length;
    const losingTrades = closedTrades.filter(t => t.pnlAmount && t.pnlAmount < 0).length;
    
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    
    const avgWin = closedTrades
      .filter(t => t.pnlAmount && t.pnlAmount > 0)
      .reduce((sum, t) => sum + t.pnlAmount!, 0) / (winningTrades || 1);
      
    const avgLoss = closedTrades
      .filter(t => t.pnlAmount && t.pnlAmount < 0)
      .reduce((sum, t) => sum + Math.abs(t.pnlAmount!), 0) / (losingTrades || 1);
    
    // Get pattern performance
    const patternStats = await Trade.aggregate([
      { $match: { status: 'closed' } },
      { $group: {
        _id: '$patternName',
        count: { $sum: 1 },
        wins: { $sum: { $cond: [{ $gt: ['$pnlAmount', 0] }, 1, 0] } },
        totalPnL: { $sum: '$pnlAmount' }
      }},
      { $sort: { totalPnL: -1 } }
    ]);
    
    res.json({
      overall: {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        totalPnL: totalPnL.toFixed(2),
        avgPnL: avgPnL.toFixed(2),
        avgWin: avgWin.toFixed(2),
        avgLoss: avgLoss.toFixed(2),
        profitFactor: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A'
      },
      patterns: patternStats
    });
  } catch (error) {
    console.error('Error fetching overall analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get today's trades
router.get('/analytics/today', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const trades = await Trade.find({
      signalTime: { $gte: today }
    }).sort({ signalTime: -1 });
    
    res.json(trades);
  } catch (error) {
    console.error('Error fetching today\'s trades:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s trades' });
  }
});

// Algorithm analysis export - detailed data for Claude
router.get('/analytics/algorithm-review', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days as string));
    
    // Get all closed trades from the specified period
    const trades = await Trade.find({
      status: 'closed',
      signalTime: { $gte: cutoff }
    }).select({
      // Core trade data
      symbol: 1,
      patternName: 1,
      patternScore: 1,
      patternClass: 1,
      direction: 1,
      scannerType: 1,
      
      // Price analysis
      entryPrice: 1,
      actualEntryPrice: 1,
      stopLoss: 1,
      takeProfit: 1,
      exitPrice: 1,
      exitReason: 1,
      
      // Performance
      pnlAmount: 1,
      pnlPercentage: 1,
      
      // Timing
      signalTime: 1,
      filledTime: 1,
      closedTime: 1,
      
      // Market context
      marketConditions: 1,
      
      // Risk metrics
      'signalData.score': 1,
      'signalData.context.atr': 1,
      'signalData.context.volumeFactor': 1,
      'signalData.plan.riskRewardRatio': 1
    }).sort({ signalTime: -1 });
    
    // Calculate summary statistics
    const summary = {
      totalTrades: trades.length,
      winningTrades: trades.filter(t => t.pnlAmount > 0).length,
      losingTrades: trades.filter(t => t.pnlAmount < 0).length,
      avgWin: trades.filter(t => t.pnlAmount > 0).reduce((sum, t) => sum + t.pnlAmount, 0) / trades.filter(t => t.pnlAmount > 0).length || 0,
      avgLoss: trades.filter(t => t.pnlAmount < 0).reduce((sum, t) => sum + Math.abs(t.pnlAmount), 0) / trades.filter(t => t.pnlAmount < 0).length || 0,
      totalPnL: trades.reduce((sum, t) => sum + t.pnlAmount, 0),
      
      // Pattern breakdown
      patternPerformance: trades.reduce((acc, trade) => {
        if (!acc[trade.patternName]) {
          acc[trade.patternName] = { wins: 0, losses: 0, totalPnL: 0 };
        }
        if (trade.pnlAmount > 0) {
          acc[trade.patternName].wins++;
        } else {
          acc[trade.patternName].losses++;
        }
        acc[trade.patternName].totalPnL += trade.pnlAmount;
        return acc;
      }, {} as any),
      
      // Exit reason analysis
      exitReasons: trades.reduce((acc, trade) => {
        if (trade.exitReason) {
          acc[trade.exitReason] = (acc[trade.exitReason] || 0) + 1;
        }
        return acc;
      }, {} as any)
    };
    
    // Get unfilled orders analysis
    const allTrades = await Trade.find({
      signalTime: { $gte: cutoff }
    });
    
    const unfilledAnalysis = {
      totalOrders: allTrades.length,
      filled: allTrades.filter(t => ['filled', 'closed'].includes(t.status)).length,
      cancelled: allTrades.filter(t => t.status === 'cancelled').length,
      stillPending: allTrades.filter(t => ['pending', 'placed'].includes(t.status)).length,
      
      cancelReasons: allTrades
        .filter(t => t.status === 'cancelled')
        .reduce((acc, trade) => {
          const reason = trade.cancelReason || 'unknown';
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {} as any),
        
      fillRate: allTrades.length > 0 ? 
        (allTrades.filter(t => ['filled', 'closed'].includes(t.status)).length / allTrades.length * 100).toFixed(1) + '%' : 
        '0%'
    };
    
    res.json({
      period: `Last ${days} days`,
      summary,
      unfilledAnalysis,
      trades
    });
  } catch (error) {
    console.error('Error generating algorithm review:', error);
    res.status(500).json({ error: 'Failed to generate algorithm review' });
  }
});

export default router;