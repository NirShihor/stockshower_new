import { createIBClient } from '../brokers/interactiveBrokers.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('🔌 Interactive Brokers Connection Test\n');
  console.log('Prerequisites:');
  console.log('  1. TWS or IB Gateway must be running');
  console.log('  2. API connections must be enabled in TWS/Gateway settings');
  console.log('  3. Socket port should be 7497 (paper) or 7496 (live)\n');

  const paperTrading = true;
  console.log(`Mode: ${paperTrading ? 'PAPER TRADING' : '⚠️  LIVE TRADING'}\n`);

  const ib = createIBClient(paperTrading);

  ib.on('error', ({ error, code }) => {
    if (code === 502) {
      console.error('\n❌ Cannot connect to TWS/IB Gateway');
      console.error('   Make sure TWS or IB Gateway is running and API is enabled');
      process.exit(1);
    }
  });

  try {
    await ib.connect();
    console.log('\n✅ Successfully connected to Interactive Brokers!\n');

    console.log('📊 Requesting account summary...');
    ib.requestAccountSummary();

    await new Promise(resolve => setTimeout(resolve, 2000));

    const summary = ib.getAccountSummary();
    console.log('\nAccount Summary:');
    console.log(`  Net Liquidation: $${summary.netLiquidation?.toFixed(2) || 'N/A'}`);
    console.log(`  Buying Power: $${summary.buyingPower?.toFixed(2) || 'N/A'}`);
    console.log(`  Available Funds: $${summary.availableFunds?.toFixed(2) || 'N/A'}`);
    console.log(`  Cash Balance: $${summary.cashBalance?.toFixed(2) || 'N/A'}`);

    console.log('\n📈 Requesting positions...');
    ib.requestPositions();

    await new Promise(resolve => setTimeout(resolve, 2000));

    const positions = ib.getPositions();
    if (positions.size === 0) {
      console.log('  No open positions');
    } else {
      console.log('  Open Positions:');
      for (const [symbol, pos] of positions) {
        console.log(`    ${symbol}: ${pos.quantity} shares @ $${pos.avgCost.toFixed(2)}`);
      }
    }

    console.log('\n✅ Connection test complete!');
    console.log('\nNext steps:');
    console.log('  1. Run the paper trading test: npx tsx src/scripts/testPaperTrade.ts');
    console.log('  2. Or start auto trading: npx tsx src/scripts/runGapAndGo.ts');

    ib.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Connection failed:', error);
    console.error('\nTroubleshooting:');
    console.error('  1. Is TWS or IB Gateway running?');
    console.error('  2. Go to TWS: Edit > Global Configuration > API > Settings');
    console.error('  3. Enable "Enable ActiveX and Socket Clients"');
    console.error('  4. Set Socket port to 7497 (paper) or 7496 (live)');
    console.error('  5. Add 127.0.0.1 to "Trusted IPs"');
    process.exit(1);
  }
}

main();
