import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase } from '../db/connection.js';
import { createCanslimExecutor, CanslimTradeConfig } from '../brokers/canslimExecutor.js';
import { createGoldExecutor, GoldTradeConfig } from '../brokers/goldExecutor.js';
import { updateTrailingStops } from '../services/trailingStopService.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

// Reinitialize MetaAPI handler with env vars (static imports load before dotenv.config runs)
metaApiHandler.reinitialize();

const args = process.argv.slice(2);
const isLive = args.includes('--live');
const forceOverride = args.includes('--force');
const scheduleMode = args.includes('--schedule');
const noEarnings = args.includes('--no-earnings');
const noGold = args.includes('--no-gold');
const noTrailing = args.includes('--no-trailing');
const marginArg = args.find(a => a.startsWith('--margin='));
const maxTradesArg = args.find(a => a.startsWith('--max-trades='));
const minScoreArg = args.find(a => a.startsWith('--min-score='));
const intervalArg = args.find(a => a.startsWith('--interval='));
const delayArg = args.find(a => a.startsWith('--delay='));
const tradingDelayMinutes = delayArg ? parseInt(delayArg.split('=')[1]) : 30;

const config: Partial<CanslimTradeConfig> = {
  dryRun: !isLive,
  targetMarginGBP: marginArg ? parseFloat(marginArg.split('=')[1]) : 25,
  maxDailyTrades: maxTradesArg ? parseInt(maxTradesArg.split('=')[1]) : 10,
  minScore: minScoreArg ? parseInt(minScoreArg.split('=')[1]) : 4,
  ignoreMarketRegime: forceOverride,
  useEarningsFilter: !noEarnings,
};

const goldConfig: Partial<GoldTradeConfig> = {
  dryRun: !isLive,
  targetMarginGBP: marginArg ? parseFloat(marginArg.split('=')[1]) : 25,
  maxOpenPositions: 1,
  stopLossPercent: 3,
  targetMultiple: 2,
};

const intervalMinutes = intervalArg ? parseInt(intervalArg.split('=')[1]) : 30;

// US Eastern Time
function getETTime(): { hour: number; minute: number; dayOfWeek: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  // Get day of week (0 = Sunday, 6 = Saturday)
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, minute, dayOfWeek: dayMap[dayStr] ?? 0 };
}

// UK/London Time (GMT/BST)
function getUKTime(): { hour: number; minute: number; dayOfWeek: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  // Get day of week (0 = Sunday, 6 = Saturday)
  const dayFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, minute, dayOfWeek: dayMap[dayStr] ?? 0 };
}

// US market: 9:30 AM - 4:00 PM ET
function isUSMarketOpen(): boolean {
  const { hour, minute, dayOfWeek } = getETTime();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;
  return totalMinutes >= marketOpen && totalMinutes < marketClose;
}

// UK market: 8:00 AM - 4:30 PM London time
function isUKMarketOpen(): boolean {
  const { hour, minute, dayOfWeek } = getUKTime();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 8 * 60;        // 08:00
  const marketClose = 16 * 60 + 30; // 16:30
  return totalMinutes >= marketOpen && totalMinutes < marketClose;
}

// Determine which market to trade based on current time
function getCurrentMarket(): 'UK' | 'US' | 'BOTH' | 'CLOSED' {
  const ukOpen = isUKMarketOpen();
  const usOpen = isUSMarketOpen();

  if (ukOpen && usOpen) return 'BOTH';
  if (ukOpen) return 'UK';
  if (usOpen) return 'US';
  return 'CLOSED';
}

// Check if any market is open
function isAnyMarketOpen(): boolean {
  return isUKMarketOpen() || isUSMarketOpen();
}

// Gold market: Nearly 24/5 - Sunday 11pm UK to Friday 10pm UK
// Daily maintenance break around 10pm-11pm UK time
function isGoldMarketOpen(): boolean {
  const { hour, minute, dayOfWeek } = getUKTime();
  const totalMinutes = hour * 60 + minute;

  // Closed all weekend (Saturday)
  if (dayOfWeek === 6) return false;

  // Sunday: only open after 11pm UK
  if (dayOfWeek === 0) {
    return totalMinutes >= 23 * 60;
  }

  // Friday: closes at 10pm UK
  if (dayOfWeek === 5) {
    return totalMinutes < 22 * 60;
  }

  // Mon-Thu: Brief maintenance break 22:00-23:00 UK
  const maintenanceStart = 22 * 60;
  const maintenanceEnd = 23 * 60;
  if (totalMinutes >= maintenanceStart && totalMinutes < maintenanceEnd) {
    return false;
  }

  return true;
}

function isUSTradingWindowOpen(): boolean {
  const { hour, minute, dayOfWeek } = getETTime();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30;
  const tradingStart = marketOpen + tradingDelayMinutes;
  const marketClose = 16 * 60;
  return totalMinutes >= tradingStart && totalMinutes < marketClose;
}

function isUKTradingWindowOpen(): boolean {
  const { hour, minute, dayOfWeek } = getUKTime();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 8 * 60;
  const tradingStart = marketOpen + tradingDelayMinutes;
  const marketClose = 16 * 60 + 30;
  return totalMinutes >= tradingStart && totalMinutes < marketClose;
}

function getMinutesUntilTradingWindow(): { market: 'UK' | 'US'; minutes: number } | null {
  const ukTime = getUKTime();
  const etTime = getETTime();

  // Check UK first (opens earlier)
  if (ukTime.dayOfWeek !== 0 && ukTime.dayOfWeek !== 6) {
    const ukTotalMinutes = ukTime.hour * 60 + ukTime.minute;
    const ukTradingStart = 8 * 60 + tradingDelayMinutes;
    if (ukTotalMinutes < ukTradingStart && ukTotalMinutes >= 8 * 60) {
      return { market: 'UK', minutes: ukTradingStart - ukTotalMinutes };
    }
  }

  // Check US
  if (etTime.dayOfWeek !== 0 && etTime.dayOfWeek !== 6) {
    const usTotalMinutes = etTime.hour * 60 + etTime.minute;
    const usTradingStart = 9 * 60 + 30 + tradingDelayMinutes;
    if (usTotalMinutes < usTradingStart && usTotalMinutes >= 9 * 60 + 30) {
      return { market: 'US', minutes: usTradingStart - usTotalMinutes };
    }
  }

  return null;
}

function getNextMarketOpen(): Date {
  const now = new Date();
  const { dayOfWeek } = getETTime();

  let daysToAdd = 0;
  if (dayOfWeek === 6) daysToAdd = 2;
  else if (dayOfWeek === 0) daysToAdd = 1;

  const next = new Date(now);
  next.setDate(next.getDate() + daysToAdd);

  const etOpen = new Date(next.toLocaleString("en-US", { timeZone: "America/New_York" }));
  etOpen.setHours(9, 30, 0, 0);

  return etOpen;
}

console.log('\n' + '='.repeat(60));
console.log('CAN SLIM TRADING SYSTEM (UK + US)');
console.log('='.repeat(60));
console.log(`Mode: ${config.dryRun ? 'DRY RUN (no real trades)' : 'LIVE TRADING'}`);
console.log(`Markets: UK (08:00-16:30 GMT) + US (09:30-16:00 ET)`);
console.log(`Target Margin: £${config.targetMarginGBP}`);
console.log(`Max Daily Trades: ${config.maxDailyTrades}`);
console.log(`Min Score: ${config.minScore}/6`);
if (forceOverride) {
  console.log(`Force Override: YES (ignoring market regime)`);
}
console.log(`Earnings Filter: ${config.useEarningsFilter ? 'ON' : 'OFF'}`);
console.log(`Gold Fallback: ${noGold ? 'OFF' : 'ON (when market not risk-on)'}`);
console.log(`Trailing Stops: ${noTrailing ? 'OFF' : 'ON (stocks 8%, gold 3%)'}`);
console.log(`Trading Delay: ${tradingDelayMinutes} minutes after market open`);
if (scheduleMode) {
  console.log(`Scheduler: ON (every ${intervalMinutes} minutes during market hours)`);
}
console.log('='.repeat(60) + '\n');

if (isLive) {
  console.log('*** LIVE TRADING MODE ***');
  console.log('Real orders will be placed with FXPro via MetaAPI');
  console.log('');
  
  if (!process.env.METAAPI_TOKEN || !process.env.METAAPI_ACCOUNT_ID) {
    console.error('ERROR: METAAPI_TOKEN and METAAPI_ACCOUNT_ID must be set for live trading');
    process.exit(1);
  }
}

let executor: ReturnType<typeof createCanslimExecutor>;
let goldExecutor: ReturnType<typeof createGoldExecutor> | null = null;
let lastResetDate: string = '';

async function runScan(market: 'US' | 'UK' = 'US') {
  const today = new Date().toISOString().split('T')[0];

  if (today !== lastResetDate) {
    console.log(`\n[SCHEDULER] New day detected (${today}) - resetting daily stats`);
    executor.resetDailyStats();
    lastResetDate = today;
  }

  const stats = executor.getDailyStats();
  if (stats.trades >= (config.maxDailyTrades || 3)) {
    console.log(`\n[SCHEDULER] Daily trade limit already reached (${stats.trades}/${config.maxDailyTrades})`);
    return;
  }

  // Update trailing stops on existing positions before scanning for new trades
  if (isLive && !noTrailing) {
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

  // Check if gold positions should be closed due to US market regime change
  if (market === 'US' && goldExecutor && isLive) {
    try {
      const regimeResult = await goldExecutor.closeOnRegimeChange();
      if (regimeResult.closed > 0) {
        console.log(`[GOLD-REGIME] Closed ${regimeResult.closed} gold position(s) - US market risk-on`);
      }
      if (regimeResult.errors.length > 0) {
        console.log(`[GOLD-REGIME] Errors: ${regimeResult.errors.join(', ')}`);
      }
    } catch (regimeError) {
      console.error('[GOLD-REGIME] Error checking regime:', regimeError);
    }
  }

  try {
    console.log(`\n[SCAN] Running ${market} market scan...`);
    const result = await executor.scanAndExecute(market);
    
    const completedTime = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    console.log('\nSummary:');
    console.log(`  Completed: ${completedTime} GMT`);
    console.log(`  Stocks scanned: ${result.scanned}`);
    console.log(`  Trades executed: ${result.executed}`);
    if (result.skipped) {
      console.log(`  Skipped reason: ${result.skipped}`);
    }

    // Gold fallback only for US market when CAN SLIM is paused due to market regime
    // Triggers on: risk-off, neutral, MARKET_IN_CORRECTION, UPTREND_UNDER_PRESSURE, RALLY_ATTEMPT
    const shouldCheckGold = market === 'US' && goldExecutor && result.skipped && (
      result.skipped.includes('neutral') ||
      result.skipped.includes('risk-off') ||
      result.skipped.includes('CORRECTION') ||
      result.skipped.includes('PRESSURE') ||
      result.skipped.includes('RALLY')
    );

    if (shouldCheckGold && goldExecutor) {
      console.log('\n[GOLD] US CAN SLIM paused - checking gold fallback...');
      const goldResult = await goldExecutor.runScan();
      console.log(`\nGold Summary:`);
      console.log(`  Recommendation: ${goldResult.analysis?.recommendation || 'N/A'}`);
      console.log(`  Traded: ${goldResult.traded ? 'YES' : 'NO'}`);
      console.log(`  Reason: ${goldResult.reason}`);
    }

    const newStats = executor.getDailyStats();
    console.log(`\nDaily Stats:`);
    console.log(`  Total trades today: ${newStats.trades}`);
    console.log(`  Active positions (this session): ${newStats.active}`);

    if (newStats.active > 0) {
      console.log(`\nActive Trades:`);
      for (const [symbol, trade] of executor.getActiveTrades()) {
        console.log(`  ${symbol}: Entry $${trade.entryPrice.toFixed(2)}, Stop $${trade.stopLoss.toFixed(2)}, Target $${trade.takeProfit.toFixed(2)}`);
      }
    }

    if (isLive) {
      const { metaApiHandler } = await import('../handlers/metaApiRestHandler.js');
      const [positions, orders] = await Promise.all([
        metaApiHandler.getPositions(),
        metaApiHandler.getOrders()
      ]);

      console.log(`\nBroker Status:`);
      console.log(`  Open positions: ${positions.length}`);
      console.log(`  Pending orders: ${orders.length}`);

      if (positions.length > 0) {
        console.log(`\nOpen Positions:`);
        for (const pos of positions) {
          console.log(`  ${pos.symbol}: ${pos.type} ${pos.volume} @ ${pos.openPrice}, P&L: ${pos.profit}`);
        }
      }
      if (orders.length > 0) {
        console.log(`\nPending Orders:`);
        for (const ord of orders) {
          console.log(`  ${ord.symbol}: ${ord.type} ${ord.volume} @ ${ord.openPrice}`);
        }
      }
    }

  } catch (error) {
    console.error('Error running CAN SLIM scanner:', error);
  }
}

async function runScheduler() {
  console.log('[SCHEDULER] Starting CAN SLIM scheduler (UK + US markets)...');
  console.log(`[SCHEDULER] UK: 08:00-16:30 GMT | US: 09:30-16:00 ET`);
  console.log(`[SCHEDULER] Will scan every ${intervalMinutes} minutes during market hours`);

  const runIfMarketOpen = async () => {
    const ukTime = getUKTime();
    const etTime = getETTime();
    const ukTimeStr = `${ukTime.hour.toString().padStart(2, '0')}:${ukTime.minute.toString().padStart(2, '0')} GMT`;
    const etTimeStr = `${etTime.hour.toString().padStart(2, '0')}:${etTime.minute.toString().padStart(2, '0')} ET`;

    const currentMarket = getCurrentMarket();

    if (currentMarket === 'CLOSED') {
      // Check if gold market is still open for position management
      if (isGoldMarketOpen() && isLive && !noTrailing) {
        console.log(`\n[SCHEDULER] ${ukTimeStr} / ${etTimeStr} - Equity markets CLOSED, gold market OPEN`);
        console.log(`[SCHEDULER] Running gold position management...`);

        try {
          const trailingResult = await updateTrailingStops();
          if (trailingResult.positionsChecked > 0) {
            console.log(`[GOLD-MONITOR] Checked ${trailingResult.positionsChecked} position(s)`);
          }
          if (trailingResult.stopsAdjusted > 0) {
            console.log(`[GOLD-MONITOR] Adjusted ${trailingResult.stopsAdjusted} trailing stop(s):`);
            for (const adj of trailingResult.adjustments) {
              console.log(`  ${adj.symbol}: Stop $${adj.oldStop.toFixed(2)} -> $${adj.newStop.toFixed(2)} (profit: +${adj.profitPercent.toFixed(1)}%)`);
            }
          }
          if (trailingResult.errors.length > 0) {
            console.log(`[GOLD-MONITOR] Errors: ${trailingResult.errors.join(', ')}`);
          }
        } catch (trailError) {
          console.error('[GOLD-MONITOR] Error updating trailing stops:', trailError);
        }

        if (goldExecutor) {
          try {
            const syncResult = await goldExecutor.syncPositionStatus();
            if (syncResult.checked > 0) {
              console.log(`[GOLD-SYNC] Checked ${syncResult.checked} trade record(s), updated ${syncResult.updated}`);
            }
            if (syncResult.errors.length > 0) {
              console.log(`[GOLD-SYNC] Errors: ${syncResult.errors.join(', ')}`);
            }
          } catch (syncError) {
            console.error('[GOLD-SYNC] Error syncing position status:', syncError);
          }
        }
      } else {
        console.log(`\n[SCHEDULER] ${ukTimeStr} / ${etTimeStr} - All markets CLOSED, skipping scan`);
      }
      return;
    }

    // Determine which market to trade
    let targetMarket: 'US' | 'UK';
    let tradingWindowOpen: boolean;

    if (currentMarket === 'BOTH') {
      // During overlap, prioritize US but check if trading window is open
      if (isUSTradingWindowOpen()) {
        targetMarket = 'US';
        tradingWindowOpen = true;
      } else if (isUKTradingWindowOpen()) {
        targetMarket = 'UK';
        tradingWindowOpen = true;
      } else {
        // Both open but neither trading window is ready
        const waitInfo = getMinutesUntilTradingWindow();
        if (waitInfo) {
          console.log(`\n[SCHEDULER] ${ukTimeStr} / ${etTimeStr} - Markets open but waiting ${waitInfo.minutes} more minutes for ${waitInfo.market} trading window`);
        }
        return;
      }
    } else if (currentMarket === 'UK') {
      targetMarket = 'UK';
      tradingWindowOpen = isUKTradingWindowOpen();
      if (!tradingWindowOpen) {
        const waitInfo = getMinutesUntilTradingWindow();
        if (waitInfo) {
          console.log(`\n[SCHEDULER] ${ukTimeStr} - UK market open but waiting ${waitInfo.minutes} more minutes (${tradingDelayMinutes}min delay)`);
        }
        return;
      }
    } else {
      targetMarket = 'US';
      tradingWindowOpen = isUSTradingWindowOpen();
      if (!tradingWindowOpen) {
        const waitInfo = getMinutesUntilTradingWindow();
        if (waitInfo) {
          console.log(`\n[SCHEDULER] ${etTimeStr} - US market open but waiting ${waitInfo.minutes} more minutes (${tradingDelayMinutes}min delay)`);
        }
        return;
      }
    }

    // Check if trading is allowed before running scan (saves API calls during RALLY_ATTEMPT/CORRECTION)
    const { isTradingAllowed, getMarketStatus } = await import('../services/distributionDayService.js');
    if (!isTradingAllowed()) {
      const status = getMarketStatus();
      console.log(`\n[SCHEDULER] ${ukTimeStr} / ${etTimeStr} - Market is ${status}, skipping scan`);

      // Still run gold fallback check when CAN SLIM is paused
      if (goldExecutor && !noGold) {
        console.log(`[GOLD] CAN SLIM paused due to ${status} - checking gold fallback...`);
        try {
          const goldResult = await goldExecutor.runScan();
          console.log(`\nGold Summary:`);
          console.log(`  Recommendation: ${goldResult.analysis?.recommendation || 'N/A'}`);
          console.log(`  Traded: ${goldResult.traded ? 'YES' : 'NO'}`);
          console.log(`  Reason: ${goldResult.reason}`);
        } catch (goldError) {
          console.error('[GOLD] Error running gold scan:', goldError);
        }
      }
      return;
    }

    console.log(`\n[SCHEDULER] ${ukTimeStr} / ${etTimeStr} - ${targetMarket} trading window OPEN`);
    await runScan(targetMarket);
  };

  await runIfMarketOpen();

  setInterval(async () => {
    await runIfMarketOpen();
  }, intervalMinutes * 60 * 1000);

  console.log(`\n[SCHEDULER] Running... Press Ctrl+C to stop\n`);
}

async function main() {
  await connectDatabase();

  // Initialize distribution day service for O'Neil's market protection
  try {
    const { initializeDistributionDayService, updateDistributionDayCount } = await import('../services/distributionDayService.js');
    await initializeDistributionDayService();
    console.log('[DIST-DAY] Distribution day service initialized');

    // Update distribution day count with today's data
    const today = new Date().toISOString().split('T')[0];
    const state = await updateDistributionDayCount(today);
    console.log(`[DIST-DAY] Market status: ${state.marketStatus} (${state.distributionCount} distribution days)`);
    console.log(`[DIST-DAY] Position sizing: ${state.positionSizingMultiplier * 100}%`);
  } catch (distError) {
    console.error('[DIST-DAY] Failed to initialize distribution day service:', distError);
    // Continue without distribution day tracking - will use fallback regime check
  }

  executor = createCanslimExecutor(config);
  if (!noGold) {
    goldExecutor = createGoldExecutor(goldConfig);
  }
  lastResetDate = new Date().toISOString().split('T')[0];
  
  if (scheduleMode) {
    await runScheduler();
  } else {
    // For single run, detect which market to scan
    const currentMarket = getCurrentMarket();
    let targetMarket: 'US' | 'UK' = 'US';

    if (currentMarket === 'UK') {
      targetMarket = 'UK';
    } else if (currentMarket === 'BOTH') {
      // During overlap, default to US
      targetMarket = 'US';
    } else if (currentMarket === 'CLOSED') {
      console.log('[INFO] All markets are closed. Running US scan anyway...');
    }

    console.log(`[INFO] Current market: ${currentMarket}, scanning: ${targetMarket}`);
    await runScan(targetMarket);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
