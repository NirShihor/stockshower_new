import { createGapAndGoExecutor } from '../brokers/gapAndGoExecutor.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('🔄 IBKR Position Closer\n');

  try {
    const executor = await createGapAndGoExecutor(false, {
      positionSize: 10000,
      maxDailyTrades: 5,
      minScore: 50,
      riskPercent: 2
    });

    console.log('✅ Connected to Interactive Brokers\n');
    console.log('Checking for open positions...\n');

    await executor.closeStalePositions();

    console.log('\n✅ Done. Exiting...');
    process.exit(0);

  } catch (error) {
    console.error('❌ Failed:', error);
    console.error('\nMake sure TWS or IB Gateway is running with API enabled.');
    process.exit(1);
  }
}

main();
