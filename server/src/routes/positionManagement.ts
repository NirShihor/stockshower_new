import express, { Request, Response } from 'express';
import { Trade } from '../db/models/Trade.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { TradeService } from '../db/services/tradeService.js';

const router = express.Router();

// Get all stuck trades (filled but not closed)
router.get('/stuck-trades', async (req: Request, res: Response) => {
  try {
    const stuckTrades = await Trade.find({
      status: 'filled',
      signalTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    })
    .sort({ signalTime: -1 })
    .limit(50);

    const tradesWithAge = stuckTrades.map(trade => {
      const daysFilled = (Date.now() - trade.signalTime.getTime()) / (1000 * 60 * 60 * 24);
      const stopPercent = trade.entryPrice && trade.stopLoss 
        ? (Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice * 100).toFixed(2)
        : 'Unknown';

      return {
        id: trade._id,
        symbol: trade.symbol,
        pattern: trade.patternName,
        daysFilled: daysFilled.toFixed(1),
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        stopPercent,
        mt5PositionId: trade.mt5PositionId,
        direction: trade.direction,
        signalTime: trade.signalTime
      };
    });

    res.json({
      success: true,
      total: stuckTrades.length,
      trades: tradesWithAge
    });

  } catch (error) {
    console.error('Error getting stuck trades:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manually close a specific trade
router.post('/close-trade/:tradeId', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const { exitPrice, exitReason = 'manual' } = req.body;

    const trade = await Trade.findById(tradeId);
    if (!trade) {
      return res.status(404).json({
        success: false,
        error: 'Trade not found'
      });
    }

    if (trade.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'Trade is already closed'
      });
    }

    // Try to close via MetaAPI first if we have a position ID
    if (trade.mt5PositionId) {
      try {
        const closeResult = await metaApiHandler.closePosition(trade.mt5PositionId);
        console.log('MetaAPI close result:', closeResult);
      } catch (metaError) {
        console.log('MetaAPI close failed, proceeding with database closure:', metaError);
      }
    }

    // Close in database
    const entryPrice = trade.actualEntryPrice || trade.entryPrice;
    const finalExitPrice = exitPrice || entryPrice; // Use provided exit price or entry as fallback

    if (entryPrice) {
      const isLong = trade.direction === 'long';
      const pnlPercent = isLong 
        ? ((finalExitPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - finalExitPrice) / entryPrice) * 100;
      
      trade.pnlPercent = pnlPercent;
      trade.pnlAmount = (pnlPercent / 100) * (trade.positionSizeGBP || 5);
    }

    trade.status = 'closed';
    trade.exitReason = exitReason;
    trade.exitPrice = finalExitPrice;
    trade.closedTime = new Date();
    
    await trade.save();

    res.json({
      success: true,
      message: `Trade ${tradeId} manually closed`,
      trade: {
        id: trade._id,
        symbol: trade.symbol,
        exitPrice: finalExitPrice,
        pnlAmount: trade.pnlAmount,
        pnlPercent: trade.pnlPercent,
        exitReason: trade.exitReason
      }
    });

  } catch (error) {
    console.error('Error closing trade:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Bulk close all stuck trades
router.post('/close-all-stuck', async (req: Request, res: Response) => {
  try {
    const { exitReason = 'bulk_manual_close' } = req.body;

    const stuckTrades = await Trade.find({
      status: 'filled',
      signalTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    });

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const trade of stuckTrades) {
      try {
        // Try MetaAPI closure first
        if (trade.mt5PositionId) {
          try {
            await metaApiHandler.closePosition(trade.mt5PositionId);
          } catch (metaError) {
            console.log(`MetaAPI close failed for ${trade._id}, using database closure`);
          }
        }

        // Database closure
        const entryPrice = trade.actualEntryPrice || trade.entryPrice;
        
        trade.status = 'closed';
        trade.exitReason = exitReason;
        trade.exitPrice = entryPrice; // Use entry price as break-even exit
        trade.closedTime = new Date();
        
        // Mark as small loss since we're force closing
        trade.pnlAmount = -1;
        trade.pnlPercent = -0.2;
        
        await trade.save();
        
        successCount++;
        results.push({
          id: trade._id,
          symbol: trade.symbol,
          status: 'closed'
        });

      } catch (error) {
        errorCount++;
        results.push({
          id: trade._id,
          symbol: trade.symbol,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk closure completed: ${successCount} closed, ${errorCount} errors`,
      total: stuckTrades.length,
      successCount,
      errorCount,
      results
    });

  } catch (error) {
    console.error('Error in bulk close:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Force sync with MetaTrader positions
router.post('/sync-positions', async (req: Request, res: Response) => {
  try {
    // Get all open trades from database
    const openTrades = await Trade.find({
      status: { $in: ['filled', 'placed'] }
    });

    // Get current positions from MetaTrader
    const mt5Positions = await metaApiHandler.getPositions();
    const mt5Orders = await metaApiHandler.getOrders();

    const syncResults = {
      tradesChecked: openTrades.length,
      mt5Positions: mt5Positions.length,
      mt5Orders: mt5Orders.length,
      syncedTrades: 0,
      closedTrades: 0,
      errors: [] as string[]
    };

    for (const trade of openTrades) {
      try {
        if (trade.status === 'filled' && trade.mt5PositionId) {
          // Check if position still exists in MT5
          const mt5Position = mt5Positions.find(p => p.id === trade.mt5PositionId);
          
          if (!mt5Position) {
            // Position doesn't exist in MT5 - mark as closed
            trade.status = 'closed';
            trade.exitReason = 'sync_closure';
            trade.closedTime = new Date();
            trade.exitPrice = trade.actualEntryPrice || trade.entryPrice;
            trade.pnlAmount = 0; // Unknown P&L
            trade.pnlPercent = 0;
            
            await trade.save();
            syncResults.closedTrades++;
          } else {
            syncResults.syncedTrades++;
          }
        } else if (trade.status === 'placed' && trade.mt5OrderId) {
          // Check if order still exists
          const mt5Order = mt5Orders.find(o => o.id === trade.mt5OrderId);
          
          if (!mt5Order) {
            // Order doesn't exist - might have been filled or cancelled
            const mt5Position = mt5Positions.find(p => 
              p.comment?.includes(trade.patternName) && 
              p.symbol === trade.mt5Symbol
            );
            
            if (mt5Position) {
              // Order was filled
              trade.status = 'filled';
              trade.mt5PositionId = mt5Position.id;
              trade.actualEntryPrice = mt5Position.openPrice;
              await trade.save();
              syncResults.syncedTrades++;
            } else {
              // Order was cancelled
              trade.status = 'cancelled';
              trade.cancelReason = 'sync_cancel';
              trade.cancelTime = new Date();
              await trade.save();
              syncResults.closedTrades++;
            }
          } else {
            syncResults.syncedTrades++;
          }
        }
      } catch (error) {
        syncResults.errors.push(`Trade ${trade._id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      message: 'Position sync completed',
      results: syncResults
    });

  } catch (error) {
    console.error('Error syncing positions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get position monitoring status
router.get('/monitor-status', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const stats = {
      openTrades: await Trade.countDocuments({ status: 'filled' }),
      pendingOrders: await Trade.countDocuments({ status: 'placed' }),
      closedToday: await Trade.countDocuments({ 
        status: 'closed',
        closedTime: { $gte: last24h }
      }),
      stuckTrades: await Trade.countDocuments({
        status: 'filled',
        signalTime: { $lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } // Open >3 days
      }),
      avgStopDistance: 0,
      systemHealth: 'unknown'
    };

    // Calculate average stop distance
    const tradesWithStops = await Trade.find({
      status: 'filled',
      entryPrice: { $exists: true },
      stopLoss: { $exists: true }
    }).limit(50);

    if (tradesWithStops.length > 0) {
      const stopDistances = tradesWithStops
        .filter(t => t.entryPrice && t.stopLoss)
        .map(t => Math.abs(t.entryPrice! - t.stopLoss!) / t.entryPrice! * 100);
      
      stats.avgStopDistance = stopDistances.reduce((a, b) => a + b, 0) / stopDistances.length;
    }

    // Determine system health
    if (stats.stuckTrades > stats.openTrades * 0.5) {
      stats.systemHealth = 'critical';
    } else if (stats.stuckTrades > stats.openTrades * 0.2) {
      stats.systemHealth = 'warning';
    } else {
      stats.systemHealth = 'healthy';
    }

    res.json({
      success: true,
      timestamp: now,
      stats,
      recommendations: [
        stats.avgStopDistance < 1.0 ? 'Stop losses too tight - increase minimum distance' : null,
        stats.stuckTrades > 10 ? 'Many stuck trades detected - consider bulk closure' : null,
        stats.openTrades > 50 ? 'High number of open positions - monitor risk' : null
      ].filter(Boolean)
    });

  } catch (error) {
    console.error('Error getting monitor status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;