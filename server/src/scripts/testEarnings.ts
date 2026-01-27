import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { checkEarningsWithPerplexity } from '../services/earningsFilterService.js';

async function main() {
  const symbols = ['NVDA', 'AAPL', 'MSFT', 'AMD'];
  
  for (const symbol of symbols) {
    console.log(`\n--- Testing ${symbol} ---`);
    const result = await checkEarningsWithPerplexity(symbol);
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(console.error);
