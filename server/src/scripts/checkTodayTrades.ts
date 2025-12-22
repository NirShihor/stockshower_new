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
  
  for (const t of trades) {
    const trend = t.marketConditions?.trend || t.signalData?.context?.trend || 'N/A';
    const patternDir = t.signalData?.pattern?.direction || 'N/A';
    const score = t.patternScore || t.signalData?.score || 'N/A';
    const notes = t.signalData?.notes || [];
    
    const isCounterTrend = (patternDir === 'bullish' && trend === 'down') || (patternDir === 'bearish' && trend === 'up');
    const hasCounterTrendNote = notes.some((n: string) => n.includes('Counter-trend'));
    const hasTrendAlignedNote = notes.some((n: string) => n.includes('Trend-aligned'));
    
    if (isCounterTrend || hasCounterTrendNote) counterTrendCount++;
    if (hasTrendAlignedNote) trendAlignedCount++;
    
    console.log(`${t.symbol.padEnd(6)} | ${t.direction.padEnd(5)} | trend: ${trend.padEnd(8)} | pattern: ${patternDir.padEnd(8)} | score: ${score} | counter: ${isCounterTrend ? 'YES' : 'no'}`);
  }
  
  console.log(`\n--- Summary ---`);
  console.log(`Counter-trend trades: ${counterTrendCount}`);
  console.log(`Trend-aligned trades: ${trendAlignedCount}`);
  
  await mongoose.disconnect();
}
check();
