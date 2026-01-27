import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { TradeService } from '../db/services/tradeService.js';
import { Trade } from '../db/models/Trade.js';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  const days = parseInt(process.argv[2] || '30');
  
  console.log(`📊 Gap Trading Analytics (Last ${days} days)\n`);
  console.log('='.repeat(50));

  const analytics = await TradeService.getGapTradingAnalytics(days);
  
  console.log(`\nTotal Signals: ${analytics.totalSignals}`);
  console.log(`Closed Trades: ${analytics.closedTrades}`);
  console.log(`Failed Orders: ${analytics.failedOrders}`);
  console.log(`Pending Orders: ${analytics.pendingOrders}`);
  console.log(`\nWins: ${analytics.wins}`);
  console.log(`Losses: ${analytics.losses}`);
  console.log(`Win Rate: ${analytics.winRate}`);
  console.log(`\nTotal P&L: $${analytics.totalPnL}`);
  console.log(`Avg Win: $${analytics.avgWin}`);
  console.log(`Avg Loss: $${analytics.avgLoss}`);
  console.log(`Profit Factor: ${analytics.profitFactor}`);

  if (Object.keys(analytics.failureReasons).length > 0) {
    console.log('\n--- Failure Reasons ---');
    for (const [reason, count] of Object.entries(analytics.failureReasons)) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  // Recent trades
  console.log('\n--- Recent Gap Trades ---');
  const recentTrades = await Trade.find({ scannerType: 'gap' })
    .sort({ signalTime: -1 })
    .limit(10)
    .select('symbol status entryPrice exitPrice pnlAmount signalTime mt5Error');
  
  for (const trade of recentTrades) {
    const pnl = trade.pnlAmount ? `$${trade.pnlAmount.toFixed(2)}` : '-';
    const time = trade.signalTime?.toISOString().split('T')[0] || '-';
    const error = trade.mt5Error ? ` (${trade.mt5Error.slice(0, 30)}...)` : '';
    console.log(`  ${time} ${trade.symbol}: ${trade.status} | Entry: $${trade.entryPrice?.toFixed(2)} | P&L: ${pnl}${error}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
