import express, { Request, Response } from 'express';
import { createCanslimExecutor, CanslimExecutor, CanslimTradeConfig } from '../brokers/canslimExecutor.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

const router = express.Router();

// Singleton executor instance
let executor: CanslimExecutor | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;
let lastResetDate: string = '';

function getExecutor(config: Partial<CanslimTradeConfig> = {}): CanslimExecutor {
  if (!executor) {
    executor = createCanslimExecutor({
      dryRun: false, // Live by default from API
      targetMarginGBP: 25,
      maxDailyTrades: 10,
      minScore: 4,
      ignoreMarketRegime: false,
      useEarningsFilter: true,
      ...config
    });
    lastResetDate = new Date().toISOString().split('T')[0];
  }
  return executor;
}

function getETTime(): { hour: number; minute: number; dayOfWeek: number } {
  const etString = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
  });
  const date = new Date(etString);
  return {
    hour: date.getHours(),
    minute: date.getMinutes(),
    dayOfWeek: date.getDay()
  };
}

function isMarketOpen(): boolean {
  const { hour, minute, dayOfWeek } = getETTime();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;
  return totalMinutes >= marketOpen && totalMinutes < marketClose;
}

// Run a single CAN SLIM scan
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const {
      dryRun = false,
      force = false,
      margin = 25,
      maxTrades = 10,
      minScore = 4,
      noEarnings = false
    } = req.body;

    console.log(`[CANSLIM API] Scan triggered - dryRun: ${dryRun}, force: ${force}`);

    // Check market hours first (unless force is true)
    const { hour, minute } = getETTime();
    const marketOpen = isMarketOpen();
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ET`;

    if (!marketOpen && !force) {
      console.log(`[CANSLIM API] Market CLOSED at ${timeStr} - skipping scan`);
      res.json({
        success: true,
        mode: dryRun ? 'DRY RUN' : 'LIVE',
        marketOpen: false,
        currentTimeET: timeStr,
        result: {
          scanned: 0,
          executed: 0,
          skipped: 'Market closed'
        },
        dailyStats: { tradesPlaced: 0, activePositions: 0 },
        broker: { positions: 0, orders: 0, positionDetails: [], orderDetails: [] },
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!marketOpen && force) {
      console.log(`[CANSLIM API] Market CLOSED but FORCE enabled - running scan anyway`);
    }

    const exec = getExecutor({
      dryRun,
      targetMarginGBP: margin,
      maxDailyTrades: maxTrades,
      minScore,
      ignoreMarketRegime: force,
      useEarningsFilter: !noEarnings
    });

    // Reset daily stats if new day
    const today = new Date().toISOString().split('T')[0];
    if (today !== lastResetDate) {
      exec.resetDailyStats();
      lastResetDate = today;
    }

    const result = await exec.scanAndExecute();

    // Get broker status
    let brokerStatus = { positions: 0, orders: 0, positionDetails: [] as any[], orderDetails: [] as any[] };
    try {
      const [positions, orders] = await Promise.all([
        metaApiHandler.getPositions(),
        metaApiHandler.getOrders()
      ]);
      brokerStatus = {
        positions: positions.length,
        orders: orders.length,
        positionDetails: positions.map((p: any) => ({
          symbol: p.symbol,
          type: p.type,
          volume: p.volume,
          openPrice: p.openPrice,
          profit: p.profit,
          comment: p.comment
        })),
        orderDetails: orders.map((o: any) => ({
          symbol: o.symbol,
          type: o.type,
          volume: o.volume,
          openPrice: o.openPrice,
          comment: o.comment
        }))
      };
    } catch (e) {
      console.error('[CANSLIM API] Failed to get broker status:', e);
    }

    const stats = exec.getDailyStats();

    res.json({
      success: true,
      mode: dryRun ? 'DRY RUN' : 'LIVE',
      marketOpen: isMarketOpen(),
      currentTimeET: timeStr,
      result: {
        scanned: result.scanned,
        executed: result.executed,
        skipped: result.skipped
      },
      dailyStats: {
        tradesPlaced: stats.trades,
        activePositions: stats.active
      },
      broker: brokerStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CANSLIM API] Scan error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Scan failed'
    });
  }
});

// Get current status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const exec = getExecutor();
    const stats = exec.getDailyStats();
    const config = exec.getConfig();

    // Get broker status
    let brokerStatus = { positions: 0, orders: 0, positionDetails: [] as any[], orderDetails: [] as any[] };
    try {
      const [positions, orders] = await Promise.all([
        metaApiHandler.getPositions(),
        metaApiHandler.getOrders()
      ]);
      brokerStatus = {
        positions: positions.length,
        orders: orders.length,
        positionDetails: positions.map((p: any) => ({
          symbol: p.symbol,
          type: p.type,
          volume: p.volume,
          openPrice: p.openPrice,
          currentPrice: p.currentPrice,
          profit: p.profit,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          comment: p.comment
        })),
        orderDetails: orders.map((o: any) => ({
          symbol: o.symbol,
          type: o.type,
          volume: o.volume,
          openPrice: o.openPrice,
          stopLoss: o.stopLoss,
          takeProfit: o.takeProfit,
          comment: o.comment
        }))
      };
    } catch (e) {
      console.error('[CANSLIM API] Failed to get broker status:', e);
    }

    const { hour, minute } = getETTime();

    res.json({
      success: true,
      marketOpen: isMarketOpen(),
      currentTimeET: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      schedulerRunning: schedulerInterval !== null,
      config: {
        dryRun: config.dryRun,
        targetMarginGBP: config.targetMarginGBP,
        maxDailyTrades: config.maxDailyTrades,
        minScore: config.minScore,
        ignoreMarketRegime: config.ignoreMarketRegime,
        useEarningsFilter: config.useEarningsFilter
      },
      dailyStats: {
        tradesPlaced: stats.trades,
        activePositions: stats.active
      },
      broker: brokerStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CANSLIM API] Status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status'
    });
  }
});

// Start scheduler
router.post('/scheduler/start', async (req: Request, res: Response) => {
  try {
    if (schedulerInterval) {
      res.json({ success: true, message: 'Scheduler already running' });
      return;
    }

    const { intervalMinutes = 30, dryRun = false, force = false } = req.body;

    const exec = getExecutor({
      dryRun,
      ignoreMarketRegime: force
    });

    console.log(`[CANSLIM API] Starting scheduler - interval: ${intervalMinutes}min, dryRun: ${dryRun}`);

    // Run immediately
    if (isMarketOpen()) {
      exec.scanAndExecute().catch(console.error);
    }

    // Schedule periodic runs
    schedulerInterval = setInterval(async () => {
      const today = new Date().toISOString().split('T')[0];
      if (today !== lastResetDate) {
        exec.resetDailyStats();
        lastResetDate = today;
      }

      if (isMarketOpen()) {
        console.log('[CANSLIM SCHEDULER] Running scheduled scan...');
        await exec.scanAndExecute();
      } else {
        console.log('[CANSLIM SCHEDULER] Market closed, skipping scan');
      }
    }, intervalMinutes * 60 * 1000);

    res.json({
      success: true,
      message: `Scheduler started - running every ${intervalMinutes} minutes during market hours`,
      mode: dryRun ? 'DRY RUN' : 'LIVE'
    });
  } catch (error) {
    console.error('[CANSLIM API] Scheduler start error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start scheduler'
    });
  }
});

// Stop scheduler
router.post('/scheduler/stop', async (req: Request, res: Response) => {
  try {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
      console.log('[CANSLIM API] Scheduler stopped');
      res.json({ success: true, message: 'Scheduler stopped' });
    } else {
      res.json({ success: true, message: 'Scheduler was not running' });
    }
  } catch (error) {
    console.error('[CANSLIM API] Scheduler stop error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop scheduler'
    });
  }
});

// Reset daily stats
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const exec = getExecutor();
    exec.resetDailyStats();
    lastResetDate = new Date().toISOString().split('T')[0];

    res.json({ success: true, message: 'Daily stats reset' });
  } catch (error) {
    console.error('[CANSLIM API] Reset error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset'
    });
  }
});

export default router;
