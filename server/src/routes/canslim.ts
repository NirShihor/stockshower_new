import express, { Request, Response } from 'express';
import { createCanslimExecutor, CanslimExecutor, CanslimTradeConfig } from '../brokers/canslimExecutor.js';
import { createGoldExecutor, GoldExecutor, GoldTradeConfig } from '../brokers/goldExecutor.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { updateTrailingStops } from '../services/trailingStopService.js';
import { backendLogs, scanLogs, serverLogs, clearBackendLogs, clearScanLogs, clearServerLogs } from '../services/logCapture.js';

const router = express.Router();

// Singleton executor instances
let executor: CanslimExecutor | null = null;
let goldExecutor: GoldExecutor | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;
let lastResetDate: string = '';

const defaultGoldConfig: Partial<GoldTradeConfig> = {
  dryRun: false,
  targetMarginGBP: 25,
  maxOpenPositions: 2,
  stopLossPercent: 3,
  targetMultiple: 2,
};

function getGoldExecutor(config: Partial<GoldTradeConfig> = {}): GoldExecutor {
  if (!goldExecutor) {
    goldExecutor = createGoldExecutor({
      ...defaultGoldConfig,
      ...config
    });
  }
  return goldExecutor;
}

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
  const now = new Date();
  const etOptions: Intl.DateTimeFormatOptions = { 
    timeZone: "America/New_York", 
    hour: "2-digit", 
    minute: "2-digit",
    hour12: false 
  };
  const dayOptions: Intl.DateTimeFormatOptions = { 
    timeZone: "America/New_York", 
    weekday: "short" 
  };
  
  const timeStr = now.toLocaleString("en-US", etOptions);
  const [hourStr, minuteStr] = timeStr.split(":");
  const dayStr = now.toLocaleString("en-US", dayOptions);
  
  const dayMap: { [key: string]: number } = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  
  return {
    hour: parseInt(hourStr, 10),
    minute: parseInt(minuteStr, 10),
    dayOfWeek: dayMap[dayStr] ?? new Date().getDay()
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

function getUKTime(): { hour: number; minute: number; dayOfWeek: number } {
  const now = new Date();
  const ukOptions: Intl.DateTimeFormatOptions = {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  };
  const dayOptions: Intl.DateTimeFormatOptions = {
    timeZone: "Europe/London",
    weekday: "short"
  };

  const timeStr = now.toLocaleString("en-GB", ukOptions);
  const [hourStr, minuteStr] = timeStr.split(":");
  const dayStr = now.toLocaleString("en-GB", dayOptions);

  const dayMap: { [key: string]: number } = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    hour: parseInt(hourStr, 10),
    minute: parseInt(minuteStr, 10),
    dayOfWeek: dayMap[dayStr] ?? new Date().getDay()
  };
}

function isUKMarketOpen(): boolean {
  const { hour, minute, dayOfWeek } = getUKTime();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 8 * 60;        // 08:00
  const marketClose = 16 * 60 + 30; // 16:30
  return totalMinutes >= marketOpen && totalMinutes < marketClose;
}

function getCurrentMarket(): 'UK' | 'US' | 'BOTH' | 'CLOSED' {
  const ukOpen = isUKMarketOpen();
  const usOpen = isMarketOpen();

  if (ukOpen && usOpen) return 'BOTH';
  if (ukOpen) return 'UK';
  if (usOpen) return 'US';
  return 'CLOSED';
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
      noEarnings = false,
      market = 'auto'
    } = req.body;

    // Determine which market to scan
    const currentMarket = getCurrentMarket();
    let targetMarket: 'US' | 'UK' = 'US';

    if (market === 'auto') {
      if (currentMarket === 'UK') targetMarket = 'UK';
      else if (currentMarket === 'BOTH') targetMarket = 'US'; // During overlap, prioritize US
      else targetMarket = 'US';
    } else {
      targetMarket = market as 'US' | 'UK';
    }

    console.log(`[CANSLIM API] Scan triggered - market: ${targetMarket}, dryRun: ${dryRun}, force: ${force}`);

    // Check market hours first (unless force is true)
    const { hour: ukHour, minute: ukMinute } = getUKTime();
    const { hour: usHour, minute: usMinute } = getETTime();
    const ukOpen = isUKMarketOpen();
    const usOpen = isMarketOpen();

    const ukTimeStr = `${ukHour.toString().padStart(2, '0')}:${ukMinute.toString().padStart(2, '0')} GMT`;
    const usTimeStr = `${usHour.toString().padStart(2, '0')}:${usMinute.toString().padStart(2, '0')} ET`;

    const isTargetMarketOpen = targetMarket === 'UK' ? ukOpen : usOpen;

    if (!isTargetMarketOpen && !force) {
      console.log(`[CANSLIM API] ${targetMarket} market CLOSED - skipping scan`);
      res.json({
        success: true,
        mode: dryRun ? 'DRY RUN' : 'LIVE',
        market: targetMarket,
        marketStatus: { uk: ukOpen, us: usOpen, current: currentMarket },
        marketOpen: false,
        currentTimeUK: ukTimeStr,
        currentTimeET: usTimeStr,
        result: {
          scanned: 0,
          executed: 0,
          skipped: `${targetMarket} market closed`
        },
        dailyStats: { tradesPlaced: 0, activePositions: 0 },
        broker: { positions: 0, orders: 0, positionDetails: [], orderDetails: [] },
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!isTargetMarketOpen && force) {
      console.log(`[CANSLIM API] ${targetMarket} market CLOSED but FORCE enabled - running scan anyway`);
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

    // Update trailing stops on existing positions before scanning for new trades
    if (!dryRun) {
      try {
        const trailingResult = await updateTrailingStops();
        if (trailingResult.stopsAdjusted > 0) {
          console.log(`\n[TRAILING-STOP] Adjusted ${trailingResult.stopsAdjusted} stop(s):`);
          for (const adj of trailingResult.adjustments) {
            console.log(`  ${adj.symbol}: Stop $${adj.oldStop.toFixed(2)} -> $${adj.newStop.toFixed(2)} (profit: +${adj.profitPercent.toFixed(1)}%)`);
          }
        }
        if (trailingResult.errors.length > 0) {
          console.log(`[TRAILING-STOP] Errors: ${trailingResult.errors.join(', ')}`);
        }
      } catch (trailError) {
        console.error('[TRAILING-STOP] Error updating trailing stops:', trailError);
      }
    }

    const result = await exec.scanAndExecute(targetMarket);

    // Gold fallback: if CAN SLIM skipped due to neutral/risk-off market, check gold
    let goldResult = null;
    if (result.skipped && (result.skipped.includes('neutral') || result.skipped.includes('risk-off'))) {
      console.log('\n[GOLD] CAN SLIM paused - checking gold fallback...');
      try {
        const gold = getGoldExecutor({ dryRun });
        goldResult = await gold.runScan();
        console.log(`\nGold Summary:`);
        console.log(`  Recommendation: ${goldResult.analysis?.recommendation || 'N/A'}`);
        console.log(`  Traded: ${goldResult.traded ? 'YES' : 'NO'}`);
        console.log(`  Reason: ${goldResult.reason}`);
      } catch (goldError) {
        console.error('[GOLD] Error running gold fallback:', goldError);
      }
    }

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
      market: targetMarket,
      marketStatus: { uk: ukOpen, us: usOpen, current: currentMarket },
      marketOpen: isTargetMarketOpen,
      currentTimeUK: ukTimeStr,
      currentTimeET: usTimeStr,
      result: {
        scanned: result.scanned,
        executed: result.executed,
        skipped: result.skipped
      },
      goldFallback: goldResult ? {
        recommendation: goldResult.analysis?.recommendation || 'N/A',
        traded: goldResult.traded,
        reason: goldResult.reason
      } : null,
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
      schedulerStartTime: schedulerStartTime?.toISOString() || null,
      nextScanTime: nextScanTime?.toISOString() || null,
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

// Get market status for both UK and US
router.get('/market-status', (req: Request, res: Response) => {
  const { hour: ukHour, minute: ukMinute } = getUKTime();
  const { hour: usHour, minute: usMinute } = getETTime();
  const currentMarket = getCurrentMarket();

  res.json({
    success: true,
    currentMarket,
    uk: {
      open: isUKMarketOpen(),
      time: `${ukHour.toString().padStart(2, '0')}:${ukMinute.toString().padStart(2, '0')} GMT`,
      marketHours: '08:00-16:30 GMT'
    },
    us: {
      open: isMarketOpen(),
      time: `${usHour.toString().padStart(2, '0')}:${usMinute.toString().padStart(2, '0')} ET`,
      marketHours: '09:30-16:00 ET'
    },
    timestamp: new Date().toISOString()
  });
});

// Scheduler state
let schedulerStartTime: Date | null = null;
let nextScanTime: Date | null = null;

function getMinutesSinceMarketOpen(): number {
  const { hour, minute } = getETTime();
  const currentMinutes = hour * 60 + minute;
  const marketOpenMinutes = 9 * 60 + 30;
  return currentMinutes - marketOpenMinutes;
}

function shouldRunScan(delayMinutes: number): boolean {
  if (!isMarketOpen()) return false;
  const minutesSinceOpen = getMinutesSinceMarketOpen();
  return minutesSinceOpen >= delayMinutes;
}

// Start scheduler
router.post('/scheduler/start', async (req: Request, res: Response) => {
  try {
    if (schedulerInterval) {
      res.json({ 
        success: true, 
        message: 'Scheduler already running',
        schedulerRunning: true,
        nextScanTime: nextScanTime?.toISOString()
      });
      return;
    }

    const { 
      intervalMinutes = 30, 
      delayMinutes = 30,
      dryRun = false, 
      force = false 
    } = req.body;

    const exec = getExecutor({
      dryRun,
      ignoreMarketRegime: force
    });

    schedulerStartTime = new Date();
    console.log(`[CANSLIM API] Starting scheduler - interval: ${intervalMinutes}min, delay: ${delayMinutes}min, dryRun: ${dryRun}`);

    const runScanIfReady = async () => {
      const today = new Date().toISOString().split('T')[0];
      if (today !== lastResetDate) {
        exec.resetDailyStats();
        lastResetDate = today;
      }

      if (force || shouldRunScan(delayMinutes)) {
        console.log('[CANSLIM SCHEDULER] Running scheduled scan...');
        try {
          // Determine market based on current hours
          const scheduledMarket = getCurrentMarket();
          const market: 'US' | 'UK' = scheduledMarket === 'UK' ? 'UK' : 'US';
          await exec.scanAndExecute(market);
        } catch (e) {
          console.error('[CANSLIM SCHEDULER] Scan error:', e);
        }
        nextScanTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      } else if (!isMarketOpen()) {
        console.log('[CANSLIM SCHEDULER] Market closed, skipping scan');
        nextScanTime = null;
      } else {
        const minutesSinceOpen = getMinutesSinceMarketOpen();
        const waitMinutes = delayMinutes - minutesSinceOpen;
        console.log(`[CANSLIM SCHEDULER] Waiting ${waitMinutes} more minutes after market open`);
        nextScanTime = new Date(Date.now() + waitMinutes * 60 * 1000);
      }
    };

    // Run check immediately
    await runScanIfReady();

    // Schedule periodic runs
    schedulerInterval = setInterval(runScanIfReady, intervalMinutes * 60 * 1000);

    res.json({
      success: true,
      message: `Scheduler started - running every ${intervalMinutes} minutes, ${delayMinutes}min delay after market open`,
      mode: dryRun ? 'DRY RUN' : 'LIVE',
      schedulerRunning: true,
      nextScanTime: nextScanTime?.toISOString()
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
      schedulerStartTime = null;
      nextScanTime = null;
      console.log('[CANSLIM API] Scheduler stopped');
      res.json({ success: true, message: 'Scheduler stopped', schedulerRunning: false });
    } else {
      res.json({ success: true, message: 'Scheduler was not running', schedulerRunning: false });
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

// Get backend logs endpoint
router.get('/logs/backend', (req: Request, res: Response) => {
  const since = req.query.since as string;
  let logs = backendLogs;
  if (since) {
    logs = backendLogs.filter(l => l.timestamp > since);
  }
  res.json({ success: true, logs, count: logs.length });
});

// Get scan logs endpoint
router.get('/logs/scan', (req: Request, res: Response) => {
  const since = req.query.since as string;
  let logs = scanLogs;
  if (since) {
    logs = scanLogs.filter(l => l.timestamp > since);
  }
  res.json({ success: true, logs, count: logs.length });
});

// Get server logs endpoint
router.get('/logs/server', (req: Request, res: Response) => {
  const since = req.query.since as string;
  let logs = serverLogs;
  if (since) {
    logs = serverLogs.filter(l => l.timestamp > since);
  }
  res.json({ success: true, logs, count: logs.length });
});

// Clear backend logs
router.post('/logs/backend/clear', (req: Request, res: Response) => {
  clearBackendLogs();
  res.json({ success: true, message: 'Backend logs cleared' });
});

// Clear scan logs
router.post('/logs/scan/clear', (req: Request, res: Response) => {
  clearScanLogs();
  res.json({ success: true, message: 'Scan logs cleared' });
});

// Clear server logs
router.post('/logs/server/clear', (req: Request, res: Response) => {
  clearServerLogs();
  res.json({ success: true, message: 'Server logs cleared' });
});

export default router;
