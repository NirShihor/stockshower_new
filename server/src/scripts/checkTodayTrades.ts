import mongoose from 'mongoose';
import { Trade } from '../db/models/Trade.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('No MONGODB_URI');
  await mongoose.connect(uri);
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const trades = await Trade.find({ createdAt: { $gte: today } }).sort({ createdAt: -1 }).lean() as any[];
  
  console.log(`Today's ${trades.length} trades:\n`);
  
  let counterTrendCount = 0;
  let trendAlignedCount = 0;
  let wins = 0, losses = 0;
  let longCount = 0, shortCount = 0, longWins = 0, shortWins = 0;
  let totalPnl = 0;
  
  const closedTrades = trades.filter(t => t.status === 'closed');
  
  for (const t of closedTrades) {
    const trend = t.marketConditions?.trend || t.signalData?.context?.trend || 'N/A';
    const patternDir = t.signalData?.pattern?.direction || 'N/A';
    const pnl = t.pnlPercentage || 0;
    totalPnl += pnl;
    
    const isCounterTrend = (patternDir === 'bullish' && trend === 'down') || (patternDir === 'bearish' && trend === 'up');
    if (isCounterTrend) counterTrendCount++;
    else trendAlignedCount++;
    
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
    
    if (t.direction === 'long') {
      longCount++;
      if (pnl > 0) longWins++;
    } else {
      shortCount++;
      if (pnl > 0) shortWins++;
    }
    
    const winLoss = pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BE';
    console.log(`${t.symbol.padEnd(6)} | ${t.patternName?.padEnd(20) || 'unknown'.padEnd(20)} | ${t.direction.padEnd(5)} | trend: ${trend.padEnd(8)} | ${isCounterTrend ? 'COUNTER' : 'ALIGNED'} | ${winLoss} ${pnl.toFixed(2)}%`);
  }
  
  console.log(`\n--- Summary (${closedTrades.length} closed trades) ---`);
  console.log(`Wins: ${wins} | Losses: ${losses} | Win Rate: ${((wins/(wins+losses))*100).toFixed(1)}%`);
  console.log(`Total P&L: ${totalPnl.toFixed(2)}%`);
  console.log(`LONG: ${longCount} trades, ${longWins} wins (${longCount > 0 ? ((longWins/longCount)*100).toFixed(1) : 0}%)`);
  console.log(`SHORT: ${shortCount} trades, ${shortWins} wins (${shortCount > 0 ? ((shortWins/shortCount)*100).toFixed(1) : 0}%)`);
  console.log(`Counter-trend: ${counterTrendCount} | Trend-aligned: ${trendAlignedCount}`);
  
  await mongoose.disconnect();
}
check();
