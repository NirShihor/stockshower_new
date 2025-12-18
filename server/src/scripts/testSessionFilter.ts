import mongoose from 'mongoose';
import { Trade } from '../db/models/Trade.js';
import dotenv from 'dotenv';

dotenv.config();

interface SessionPrice {
  openPrice: number;
  date: string;
}

const sessionPrices: Map<string, SessionPrice> = new Map();

function getSessionTrend(symbol: string, currentPrice: number, signalTime: Date): { isStrong: boolean; direction: 'up' | 'down' | null; movePercent: number } {
  const dateStr = signalTime.toISOString().split('T')[0];
  const key = `${symbol}-${dateStr}`;
  
  if (!sessionPrices.has(key)) {
    sessionPrices.set(key, { openPrice: currentPrice, date: dateStr });
    return { isStrong: false, direction: null, movePercent: 0 };
  }
  
  const { openPrice } = sessionPrices.get(key)!;
  const movePercent = ((currentPrice - openPrice) / openPrice) * 100;
  const threshold = 0.5;
  
  if (movePercent > threshold) {
    return { isStrong: true, direction: 'up', movePercent };
  } else if (movePercent < -threshold) {
    return { isStrong: true, direction: 'down', movePercent };
  }
  
  return { isStrong: false, direction: null, movePercent };
}

async function testSessionFilter(dateStr: string): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');
  console.log('Connected to MongoDB\n');
  
  const startDate = new Date(dateStr);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(dateStr);
  endDate.setUTCHours(23, 59, 59, 999);
  
  const closedTrades = await Trade.find({
    status: 'closed',
    exitPrice: { $exists: true, $ne: null },
    actualEntryPrice: { $exists: true, $ne: null },
    closedTime: { $gte: startDate, $lte: endDate }
  }).sort({ signalTime: 1 });
  
  console.log(`Found ${closedTrades.length} closed trades on ${dateStr}\n`);
  console.log('='.repeat(120));
  
  let actualTotalPnl = 0;
  let pnlAvoided = 0;
  let tradesAvoided = 0;
  let remainingPnl = 0;
  let remainingTrades = 0;
  
  for (const trade of closedTrades) {
    const entry = trade.actualEntryPrice!;
    const exit = trade.exitPrice!;
    const dir = trade.direction as 'long' | 'short';
    const pnl = dir === 'long' 
      ? ((exit - entry) / entry) * 100 
      : ((entry - exit) / entry) * 100;
    
    actualTotalPnl += pnl;
    
    const currentPrice = trade.signalData?.currentPrice || entry;
    const trend = trade.signalData?.context?.trend || 'unknown';
    
    const sessionTrend = getSessionTrend(trade.symbol, currentPrice, trade.signalTime);
    
    const isCounterTrend = (trend === 'down' && dir === 'long') || (trend === 'up' && dir === 'short');
    
    const wouldBeSkipped = sessionTrend.isStrong && 
      ((sessionTrend.direction === 'down' && dir === 'long') || 
       (sessionTrend.direction === 'up' && dir === 'short'));
    
    const icon = pnl >= 0 ? '✅' : '❌';
    const skipIcon = wouldBeSkipped ? '🚫' : '  ';
    
    console.log(`${skipIcon} ${icon} ${trade.symbol.padEnd(6)} ${dir.padEnd(5)} | trend=${trend.padEnd(8)} | session=${sessionTrend.direction || 'none'.padEnd(5)} (${sessionTrend.movePercent.toFixed(2)}%) | P&L=${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`);
    
    if (wouldBeSkipped) {
      pnlAvoided += pnl;
      tradesAvoided++;
    } else {
      remainingPnl += pnl;
      remainingTrades++;
    }
  }
  
  console.log('\n' + '='.repeat(120));
  console.log('💰 BOTTOM LINE');
  console.log('='.repeat(120));
  console.log(`ACTUAL P&L (what happened):        ${actualTotalPnl >= 0 ? '+' : ''}${actualTotalPnl.toFixed(2)}%`);
  console.log('');
  console.log(`Trades that would be SKIPPED:      ${tradesAvoided}`);
  console.log(`P&L from skipped trades:           ${pnlAvoided >= 0 ? '+' : ''}${pnlAvoided.toFixed(2)}%`);
  console.log('');
  console.log(`Remaining trades:                  ${remainingTrades}`);
  console.log(`P&L from remaining trades:         ${remainingPnl >= 0 ? '+' : ''}${remainingPnl.toFixed(2)}%`);
  console.log('');
  console.log('📊 COMPARISON:');
  console.log(`   WITHOUT session filter: ${actualTotalPnl >= 0 ? '+' : ''}${actualTotalPnl.toFixed(2)}%`);
  console.log(`   WITH session filter:    ${remainingPnl >= 0 ? '+' : ''}${remainingPnl.toFixed(2)}%`);
  console.log(`   IMPROVEMENT:            ${(-pnlAvoided) >= 0 ? '+' : ''}${(-pnlAvoided).toFixed(2)}%`);
  
  await mongoose.disconnect();
}

const dateArg = process.argv[2] || new Date().toISOString().split('T')[0];
testSessionFilter(dateArg).catch(console.error);
