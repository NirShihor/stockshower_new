import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase } from '../db/connection.js';
import { createCanslimExecutor, CanslimTradeConfig } from '../brokers/canslimExecutor.js';

const args = process.argv.slice(2);
const isLive = args.includes('--live');
const forceOverride = args.includes('--force');
const scheduleMode = args.includes('--schedule');
const noEarnings = args.includes('--no-earnings');
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

const intervalMinutes = intervalArg ? parseInt(intervalArg.split('=')[1]) : 30;

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

function isTradingWindowOpen(): boolean {
  const { hour, minute, dayOfWeek } = getETTime();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30;
  const tradingStart = marketOpen + tradingDelayMinutes;
  const marketClose = 16 * 60;
  return totalMinutes >= tradingStart && totalMinutes < marketClose;
}

function getMinutesUntilTradingWindow(): number {
  const { hour, minute } = getETTime();
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30;
  const tradingStart = marketOpen + tradingDelayMinutes;
  return tradingStart - totalMinutes;
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
console.log('CAN SLIM TRADING SYSTEM');
console.log('='.repeat(60));
console.log(`Mode: ${config.dryRun ? 'DRY RUN (no real trades)' : 'LIVE TRADING'}`);
console.log(`Target Margin: £${config.targetMarginGBP}`);
console.log(`Max Daily Trades: ${config.maxDailyTrades}`);
console.log(`Min Score: ${config.minScore}/6`);
if (forceOverride) {
  console.log(`Force Override: YES (ignoring market regime)`);
}
console.log(`Earnings Filter: ${config.useEarningsFilter ? 'ON' : 'OFF'}`);
console.log(`Trading Delay: ${tradingDelayMinutes} minutes after market open (starts 10:${tradingDelayMinutes === 30 ? '00' : (tradingDelayMinutes - 30).toString().padStart(2, '0')} AM ET)`);
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
let lastResetDate: string = '';

async function runScan() {
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

  try {
    const result = await executor.scanAndExecute();
    
    console.log('\nSummary:');
    console.log(`  Stocks scanned: ${result.scanned}`);
    console.log(`  Trades executed: ${result.executed}`);
    if (result.skipped) {
      console.log(`  Skipped reason: ${result.skipped}`);
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
  console.log('[SCHEDULER] Starting CAN SLIM scheduler...');
  console.log(`[SCHEDULER] Will scan every ${intervalMinutes} minutes during market hours (9:30 AM - 4:00 PM ET)`);
  
  const runIfMarketOpen = async () => {
    const { hour, minute } = getETTime();
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ET`;
    
    if (!isMarketOpen()) {
      console.log(`\n[SCHEDULER] ${timeStr} - Market is CLOSED, skipping scan`);
      return;
    }
    
    if (!isTradingWindowOpen()) {
      const waitMinutes = getMinutesUntilTradingWindow();
      console.log(`\n[SCHEDULER] ${timeStr} - Market open but waiting ${waitMinutes} more minutes (${tradingDelayMinutes}min delay after open)`);
      return;
    }
    
    console.log(`\n[SCHEDULER] ${timeStr} - Trading window OPEN, running scan...`);
    await runScan();
  };

  await runIfMarketOpen();

  setInterval(async () => {
    await runIfMarketOpen();
  }, intervalMinutes * 60 * 1000);

  console.log(`\n[SCHEDULER] Running... Press Ctrl+C to stop\n`);
}

async function main() {
  await connectDatabase();
  
  executor = createCanslimExecutor(config);
  lastResetDate = new Date().toISOString().split('T')[0];
  
  if (scheduleMode) {
    await runScheduler();
  } else {
    await runScan();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
