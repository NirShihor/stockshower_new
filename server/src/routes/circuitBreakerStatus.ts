import express, { Request, Response } from 'express';
import { RiskState } from '../db/models/RiskState.js';
import { Trade } from '../db/models/Trade.js';

const router = express.Router();

// Dashboard endpoint for monitoring circuit breakers
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const riskState = await RiskState.findOne({ date: today });
    
    // Get today's trades
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todaysTrades = await Trade.find({
      signalTime: { $gte: startOfDay }
    }).sort({ signalTime: -1 });
    
    // Calculate stats
    const stats = {
      totalTrades: todaysTrades.length,
      openPositions: todaysTrades.filter(t => ['placed', 'filled'].includes(t.status)).length,
      closedTrades: todaysTrades.filter(t => t.status === 'closed').length,
      winningTrades: todaysTrades.filter(t => t.pnlAmount && t.pnlAmount > 0).length,
      losingTrades: todaysTrades.filter(t => t.pnlAmount && t.pnlAmount < 0).length,
      totalPnL: todaysTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0)
    };
    
    res.json({
      date: today,
      circuitBreakerActive: riskState?.circuitBreakerActive || false,
      circuitBreakerReason: riskState?.circuitBreakerReason,
      riskMetrics: riskState ? {
        dailyPnL: riskState.dailyPnL,
        dailyPnLPercent: riskState.dailyPnLPercent,
        consecutiveLosses: riskState.consecutiveLosses,
        accountBalance: riskState.accountBalance
      } : null,
      triggers: riskState?.triggers || [],
      todaysStats: stats,
      recentTrades: todaysTrades.slice(0, 10).map(t => ({
        time: t.signalTime,
        symbol: t.symbol,
        pattern: t.patternName,
        status: t.status,
        pnl: t.pnlAmount,
        exitReason: t.exitReason
      }))
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

export default router;