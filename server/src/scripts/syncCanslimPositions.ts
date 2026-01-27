import mongoose from 'mongoose';
import { CanslimTrade } from '../db/models/CanslimTrade.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import dotenv from 'dotenv';

dotenv.config();

async function syncPositions() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');

  const openTrades = await CanslimTrade.find({
    status: { $in: ['pending', 'placed', 'filled'] }
  });

  console.log(`Found ${openTrades.length} open trades in database`);

  if (openTrades.length === 0) {
    console.log('No open trades to sync');
    await mongoose.disconnect();
    return;
  }

  console.log('\nFetching actual positions from MetaAPI...');
  const [positions, orders] = await Promise.all([
    metaApiHandler.getPositions(),
    metaApiHandler.getOrders()
  ]);

  const brokerSymbols = new Set<string>();
  positions.forEach((p: any) => brokerSymbols.add(p.symbol));
  orders.forEach((o: any) => brokerSymbols.add(o.symbol));

  console.log(`Broker has ${positions.length} positions and ${orders.length} pending orders`);
  console.log(`Broker symbols: ${[...brokerSymbols].join(', ') || 'none'}`);

  let closedCount = 0;
  for (const trade of openTrades) {
    if (!brokerSymbols.has(trade.mt5Symbol)) {
      console.log(`\nClosing stale trade: ${trade.symbol} (${trade.mt5Symbol})`);
      console.log(`  Status was: ${trade.status}`);
      console.log(`  Signal date: ${trade.signalDate}`);

      trade.status = 'closed';
      trade.exitReason = 'stale_sync' as any;
      trade.closedTime = new Date();
      await trade.save();
      closedCount++;
    } else {
      console.log(`Trade ${trade.symbol} exists in broker - keeping open`);
    }
  }

  console.log(`\nSync complete: closed ${closedCount} stale trades`);
  await mongoose.disconnect();
}

syncPositions().catch(console.error);
