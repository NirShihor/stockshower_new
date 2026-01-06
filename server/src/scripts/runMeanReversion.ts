import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { createMeanReversionExecutor } from '../brokers/meanReversionExecutor.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

metaApiHandler.reinitialize();

async function main() {
  console.log('📉 Mean Reversion Auto Trader (FxPro)\n');

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const marginGBP = parseInt(args.find(a => a.startsWith('--margin='))?.split('=')[1] || '267');
  const maxTrades = parseInt(args.find(a => a.startsWith('--max-trades='))?.split('=')[1] || '5');
  const stopLoss = parseFloat(args.find(a => a.startsWith('--stop-loss='))?.split('=')[1] || '1');
  const minDrop = parseFloat(args.find(a => a.startsWith('--min-drop='))?.split('=')[1] || '2');

  console.log('Strategy Rules:');
  console.log('  1. Scan large caps for 2%+ intraday drops');
  console.log('  2. Enter when price is below VWAP');
  console.log('  3. Target: Reversion to VWAP');
  console.log('  4. Stop loss: 1% below entry');
  console.log('  5. Trading window: 10:30 AM - 3:00 PM EST');
  console.log('  6. Auto-close all positions at 3:55 PM EST\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No real trades will be placed\n');
  } else {
    console.log('⚠️  LIVE TRADING MODE');
    console.log('    Real money will be used!\n');
    console.log('    Press Ctrl+C within 10 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  console.log('Configuration:');
  console.log(`  Target Margin: £${marginGBP}`);
  console.log(`  Max Daily Trades: ${maxTrades}`);
  console.log(`  Stop Loss: ${stopLoss}%`);
  console.log(`  Min Drop: ${minDrop}%`);
  console.log(`  Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

  try {
    console.log('Connecting to MetaAPI...');
    const status = await metaApiHandler.checkStatus();
    
    if (!status.connected) {
      console.error('❌ Failed to connect to MetaAPI:', status.error);
      process.exit(1);
    }
    
    console.log('✅ Connected to MetaAPI');
    if (status.accountInfo) {
      console.log(`   Balance: ${status.accountInfo.currency} ${status.accountInfo.balance || 'N/A'}`);
      console.log(`   Free Margin: ${status.accountInfo.freeMargin || 'N/A'}`);
    }
    console.log('');

    const executor = createMeanReversionExecutor({
      targetMarginGBP: marginGBP,
      maxDailyTrades: maxTrades,
      stopLossPercent: stopLoss,
      minDropPercent: minDrop
    });

    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      executor.stopAutoTrading();
      
      console.log('Closing all positions...');
      await executor.closeAllPositions();
      
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

    const marketOpen = 14 * 60 + 30;
    const tradingWindowStart = 15 * 60;
    const tradingWindowEnd = 20 * 60;
    const marketClose = 21 * 60;

    if (totalMinutes < marketOpen) {
      const waitMinutes = marketOpen - totalMinutes;
      console.log(`⏰ Market not open yet. Waiting ${Math.floor(waitMinutes / 60)}h ${waitMinutes % 60}m...`);
      console.log('   Mean Reversion trading starts 30 mins after open (10:30 AM EST)\n');
    } else if (totalMinutes >= marketClose) {
      console.log('⏰ Market is closed for today.');
      console.log('   Checking for open positions to close...\n');
      await executor.closeAllPositions();
      console.log('   Run this script again tomorrow before market open.');
      process.exit(0);
    } else if (totalMinutes >= tradingWindowEnd) {
      console.log('⏰ Trading window has ended for today (after 3:00 PM EST).');
      console.log('   Checking for open positions to close...\n');
      await executor.closeAllPositions();
      process.exit(0);
    } else if (totalMinutes >= tradingWindowStart) {
      console.log('📈 Trading window is active! Starting auto trader...\n');
      if (!isDryRun) {
        executor.startAutoTrading(60000);
      } else {
        console.log('DRY RUN: Would start auto trading now');
        await executor.scanAndExecute();
      }
    } else {
      const waitMinutes = tradingWindowStart - totalMinutes;
      console.log(`⏰ Waiting for trading window (10:30 AM EST)...`);
      console.log(`   ${waitMinutes} minutes until trading starts\n`);
      
      if (!isDryRun) {
        setTimeout(() => {
          console.log('\n🔔 Trading window now open! Starting auto trader...\n');
          executor.startAutoTrading(60000);
        }, waitMinutes * 60 * 1000);
      }
    }

    setInterval(() => {
      const trades = executor.getActiveTrades();
      const stats = executor.getDailyStats();

      console.log('\n--- Status Update ---');
      console.log(`Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET`);
      console.log(`Active Trades: ${trades.size}`);
      console.log(`Daily Trades: ${stats.trades}`);
      console.log(`Daily P&L: $${stats.pnl.toFixed(2)}`);

      for (const [symbol, trade] of trades) {
        console.log(`  ${symbol}: ${trade.status} | Entry: $${trade.entryPrice.toFixed(2)} | Stop: $${trade.stopLoss.toFixed(2)} | Target: $${trade.takeProfit.toFixed(2)}`);
      }
      console.log('-------------------\n');
    }, 300000);

    await new Promise(() => {});

  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

main();
