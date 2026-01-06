import { createGapAndGoExecutor } from '../brokers/gapAndGoExecutor.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('🚀 Gap & Go Auto Trader\n');

  const args = process.argv.slice(2);
  const isLive = args.includes('--live');
  const positionSize = parseInt(args.find(a => a.startsWith('--size='))?.split('=')[1] || '10000');
  const maxTrades = parseInt(args.find(a => a.startsWith('--max-trades='))?.split('=')[1] || '5');

  if (isLive) {
    console.log('⚠️  WARNING: LIVE TRADING MODE');
    console.log('    Real money will be used!\n');
    console.log('    Press Ctrl+C within 10 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
  } else {
    console.log('📝 PAPER TRADING MODE\n');
  }

  console.log('Configuration:');
  console.log(`  Position Size: $${positionSize}`);
  console.log(`  Max Daily Trades: ${maxTrades}`);
  console.log(`  Mode: ${isLive ? 'LIVE' : 'Paper'}\n`);

  try {
    const executor = await createGapAndGoExecutor(!isLive, {
      positionSize,
      maxDailyTrades: maxTrades,
      minScore: 50,
      riskPercent: 2
    });

    console.log('✅ Connected to Interactive Brokers\n');

    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      executor.stopAutoTrading();
      executor.closeAllPositions();
      const stats = executor.getDailyStats();
      console.log(`\nDaily Summary:`);
      console.log(`  Trades: ${stats.trades}`);
      console.log(`  P&L: $${stats.pnl.toFixed(2)}`);
      process.exit(0);
    });

    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    const premarketStart = 9 * 60;
    const marketOpen = 14 * 60 + 30;
    const tradingWindowEnd = 15 * 60;

    if (totalMinutes < premarketStart) {
      const waitMinutes = premarketStart - totalMinutes;
      console.log(`⏰ Waiting for premarket (${Math.floor(waitMinutes / 60)}h ${waitMinutes % 60}m)...`);
    } else if (totalMinutes >= tradingWindowEnd) {
      console.log('⏰ Trading window has ended for today.');
      console.log('   Checking for open positions to close...\n');
      await executor.closeStalePositions();
      console.log('\n   Gap & Go trades in first 30 minutes only (9:30-10:00 AM EST)');
      console.log('   Run this script again tomorrow before market open.');
      process.exit(0);
    } else if (totalMinutes >= marketOpen) {
      console.log('📈 Market is open! Starting auto trader...\n');
      executor.startAutoTrading(30000);
    } else {
      console.log('📡 Premarket session active. Scanning for gaps...\n');
      console.log(`   Market opens in ${marketOpen - totalMinutes} minutes`);
      console.log('   Auto trading will start at market open.\n');

      const waitMs = (marketOpen - totalMinutes) * 60 * 1000;
      setTimeout(() => {
        console.log('\n🔔 Market is now open! Starting auto trader...\n');
        executor.startAutoTrading(30000);
      }, waitMs);
    }

    setInterval(() => {
      const trades = executor.getActiveTrades();
      const stats = executor.getDailyStats();

      console.log('\n--- Status Update ---');
      console.log(`Active Trades: ${trades.size}`);
      console.log(`Daily Trades: ${stats.trades}`);
      console.log(`Daily P&L: $${stats.pnl.toFixed(2)}`);

      for (const [symbol, trade] of trades) {
        console.log(`  ${symbol}: ${trade.status} | Entry: $${trade.entryPrice?.toFixed(2) || 'pending'} | Stop: $${trade.stopLoss.toFixed(2)} | Target: $${trade.target.toFixed(2)}`);
      }
      console.log('-------------------\n');
    }, 60000);

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ Failed to start:', error);
    console.error('\nMake sure TWS or IB Gateway is running with API enabled.');
    process.exit(1);
  }
}

main();
