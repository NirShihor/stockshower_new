import { createIBClient } from '../brokers/interactiveBrokers.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('📝 Paper Trading Test\n');
  console.log('This will place a small test order on paper trading account.\n');

  const ib = createIBClient(true);

  try {
    await ib.connect();
    console.log('✅ Connected\n');

    ib.requestAccountSummary();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const summary = ib.getAccountSummary();
    console.log(`Account Buying Power: $${summary.buyingPower?.toFixed(2) || 'N/A'}\n`);

    const testSymbol = 'AAPL';
    const testQuantity = 1;

    console.log(`Placing test order: BUY ${testQuantity} ${testSymbol} at market...\n`);

    const orderId = await ib.placeMarketOrder(testSymbol, 'BUY', testQuantity);
    console.log(`Order placed with ID: ${orderId}\n`);

    console.log('Waiting for fill...');
    const result = await ib.waitForFill(orderId, 30000);

    console.log(`\n✅ Order filled!`);
    console.log(`   Symbol: ${result.symbol}`);
    console.log(`   Quantity: ${result.filled}`);
    console.log(`   Avg Price: $${result.avgFillPrice.toFixed(2)}`);

    console.log(`\nSelling to close position...\n`);
    const sellOrderId = await ib.placeMarketOrder(testSymbol, 'SELL', testQuantity);
    const sellResult = await ib.waitForFill(sellOrderId, 30000);

    console.log(`✅ Position closed!`);
    console.log(`   Sell Price: $${sellResult.avgFillPrice.toFixed(2)}`);

    const pnl = (sellResult.avgFillPrice - result.avgFillPrice) * testQuantity;
    console.log(`   Round-trip P&L: $${pnl.toFixed(2)}\n`);

    console.log('🎉 Paper trading test complete!');
    console.log('\nYour IB API integration is working correctly.');
    console.log('You can now run the Gap & Go auto trader.');

    ib.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    ib.disconnect();
    process.exit(1);
  }
}

main();
