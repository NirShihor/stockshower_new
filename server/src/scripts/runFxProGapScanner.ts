import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { createFxProGapExecutor, FxProGapExecutor } from '../brokers/fxproGapExecutor.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

async function connectMongoDB(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ No MONGODB_URI set - trades will not be saved to database');
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB connected');
    return true;
  } catch (error) {
    console.warn('⚠️ MongoDB connection failed - trades will not be saved:', error);
    return false;
  }
}

async function main() {
  await connectMongoDB();
  metaApiHandler.reinitialize();
  
  console.log('🚀 FxPro Gap Scanner Auto Trader\n');
  console.log('   Strategy: Gap & Go (Optimized)');
  console.log('   Broker: FxPro via MetaAPI');
  console.log('   Entry: Break above premarket high');
  console.log('   Stop: Premarket low');
  console.log('   Target: 1.5:1 R:R + Trailing Stop\n');

  const args = process.argv.slice(2);
  const targetMargin = parseFloat(args.find(a => a.startsWith('--margin='))?.split('=')[1] || '1');
  const maxTrades = parseInt(args.find(a => a.startsWith('--max-trades='))?.split('=')[1] || '5');
  const minGap = parseFloat(args.find(a => a.startsWith('--min-gap='))?.split('=')[1] || '5');
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('📝 DRY RUN MODE - No real trades will be placed\n');
  } else {
    console.log('⚠️  LIVE TRADING MODE');
    console.log('    Real money will be used!\n');
    console.log('    Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log('Configuration:');
  console.log(`  Target Margin: £${targetMargin}`);
  console.log(`  Max Daily Trades: ${maxTrades}`);
  console.log(`  Min Gap %: ${minGap}%`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  try {
    console.log('🔌 Connecting to FxPro via MetaAPI...');
    const status = await metaApiHandler.checkStatus();
    
    if (!status.connected) {
      console.error('❌ Failed to connect to MetaAPI');
      console.error('   Make sure METAAPI_TOKEN and METAAPI_ACCOUNT_ID are set');
      process.exit(1);
    }

    console.log('✅ Connected to FxPro');
    if (status.accountInfo) {
      console.log(`   Balance: ${status.accountInfo.currency} ${status.accountInfo.balance}`);
      console.log(`   Equity: ${status.accountInfo.currency} ${status.accountInfo.equity}`);
      console.log(`   Leverage: 1:${status.accountInfo.leverage}\n`);
    }

    const executor = createFxProGapExecutor({
      targetMarginGBP: targetMargin,
      maxDailyTrades: maxTrades,
      minGapPercent: minGap,
      maxGapPercent: 100,
      riskRewardRatio: 1.5,
      useTrailingStop: true,
      trailingStopTrigger: 1.0
    });

    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      executor.stopAutoTrading();
      
      const stats = executor.getDailyStats();
      console.log(`\nDaily Summary:`);
      console.log(`  Trades: ${stats.trades}`);
      console.log(`  P&L: £${stats.pnl.toFixed(2)}`);
      
      console.log('\nClosing all positions...');
      await executor.closeAllPositions();
      
      if (mongoose.connection.readyState === 1) {
        console.log('Disconnecting from MongoDB...');
        await mongoose.disconnect();
      }
      
      process.exit(0);
    });

    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    const premarketStart = 9 * 60;
    const marketOpen = 14 * 60 + 30;
    const tradingWindowEnd = 15 * 60;
    const eodCloseTime = 20 * 60 + 58;

    if (totalMinutes < premarketStart) {
      const waitMinutes = premarketStart - totalMinutes;
      console.log(`⏰ Waiting for premarket (${Math.floor(waitMinutes / 60)}h ${waitMinutes % 60}m)...`);
      console.log('   Premarket: 9:00 AM - 2:30 PM UTC (4:00 AM - 9:30 AM EST)');
    } else if (totalMinutes >= eodCloseTime) {
      console.log('⏰ Market closed for today.');
      console.log('   Run this script again tomorrow before market open.');
      process.exit(0);
    } else if (totalMinutes >= marketOpen) {
      const remainingMinutes = tradingWindowEnd - totalMinutes;
      console.log('📈 Market is open! Starting auto trader...');
      console.log(`   ${remainingMinutes} minutes remaining in trading window\n`);
      
      if (!dryRun) {
        executor.startAutoTrading(30000);
      } else {
        console.log('📊 Scanning for candidates (dry run)...\n');
        const candidates = await executor.scanForGaps('up');
        console.log(`\nFound ${candidates.length} gap UP candidates:\n`);
        for (const c of candidates.slice(0, 10)) {
          console.log(`  ${c.symbol}: +${c.gapPercentage.toFixed(2)}% | PM High: $${c.premarketHigh.toFixed(2)} | PM Low: $${c.premarketLow.toFixed(2)} | Current: $${c.currentPrice.toFixed(2)}`);
        }
      }
    } else {
      const waitMinutes = marketOpen - totalMinutes;
      console.log('📡 Premarket session active. Scanning for gaps...');
      console.log(`   Market opens in ${waitMinutes} minutes`);
      console.log('   Auto trading will start at market open.\n');

      console.log('📊 Current gap candidates:\n');
      const candidates = await executor.scanForGaps('up');
      for (const c of candidates.slice(0, 10)) {
        console.log(`  ${c.symbol}: +${c.gapPercentage.toFixed(2)}% | PM High: $${c.premarketHigh.toFixed(2)} | PM Low: $${c.premarketLow.toFixed(2)}`);
      }

      if (!dryRun) {
        const waitMs = waitMinutes * 60 * 1000;
        setTimeout(() => {
          console.log('\n🔔 Market is now open! Starting auto trader...\n');
          executor.startAutoTrading(30000);
        }, waitMs);
      }
    }

    setInterval(() => {
      const trades = executor.getActiveTrades();
      const stats = executor.getDailyStats();

      console.log('\n--- Status Update ---');
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`Active Trades: ${trades.size}`);
      console.log(`Daily Trades: ${stats.trades}/${maxTrades}`);
      console.log(`Daily P&L: £${stats.pnl.toFixed(2)}`);

      for (const [symbol, trade] of trades) {
        console.log(`  ${symbol}: ${trade.status} | Entry: $${trade.entryPrice.toFixed(2)} | Stop: $${trade.stopLoss.toFixed(2)} | Target: $${trade.takeProfit.toFixed(2)}`);
      }
      console.log('-------------------\n');
    }, 60000);

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

main();
