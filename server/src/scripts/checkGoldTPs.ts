import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase } from '../db/connection.js';
import { GoldTrade } from '../db/models/GoldTrade.js';

async function checkGoldTPs() {
  await connectDatabase();

  console.log('\n=== Recent Gold Trades (Last 10) ===\n');

  const openTrades = await GoldTrade.find({}).sort({ signalTime: -1 }).limit(10);

  if (openTrades.length === 0) {
    console.log('No open gold trades found in database.');
    process.exit(0);
  }

  for (const trade of openTrades) {
    console.log(`Trade ID: ${trade._id}`);
    console.log(`  MT5 Order ID: ${trade.mt5OrderId || 'N/A'}`);
    console.log(`  MT5 Position ID: ${trade.mt5PositionId || 'N/A'}`);
    console.log(`  Status: ${trade.status}`);
    console.log(`  Entry Price: $${trade.entryPrice.toFixed(2)}`);
    console.log(`  Actual Entry: $${trade.actualEntryPrice?.toFixed(2) || 'N/A'}`);
    console.log(`  Stop Loss: $${trade.stopLoss.toFixed(2)}`);
    console.log(`  Take Profit: $${trade.takeProfit.toFixed(2)}`);
    console.log(`  Signal Date: ${trade.signalDate}`);
    console.log('');
  }

  process.exit(0);
}

checkGoldTPs().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
