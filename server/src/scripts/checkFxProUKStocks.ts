import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

metaApiHandler.reinitialize();

const token = process.env.METAAPI_TOKEN || '';
const accountId = process.env.METAAPI_ACCOUNT_ID || '';

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('CHECKING FXPRO UK STOCK INSTRUMENTS');
  console.log('='.repeat(60) + '\n');

  console.log('Fetching available symbols from FxPro MT5...\n');
  const result = await metaApiHandler.getAvailableSymbols();

  if (!result.success) {
    console.log('Failed to get symbols:', result.error);
    return;
  }

  const symbols: string[] = result.symbols;
  console.log(`Total symbols available: ${symbols.length}\n`);

  const ukStocks = symbols.filter((s: string) => s.endsWith('.L'));

  console.log('='.repeat(40));
  console.log('UK STOCKS (.L suffix) FOUND:');
  console.log('='.repeat(40));

  if (ukStocks.length === 0) {
    console.log('\nNo UK stocks found with .L suffix');
    console.log('\nSearching for other potential UK patterns...');
    const potentialUK = symbols.filter((s: string) =>
      s.includes('LON') || s.includes('LSE') || s.includes('UK')
    );
    if (potentialUK.length > 0) {
      console.log('Potential UK-related symbols:');
      potentialUK.forEach((s: string) => console.log(`  - ${s}`));
    } else {
      console.log('No UK-related symbols found.');
    }
  } else {
    console.log(`\nFound ${ukStocks.length} UK stocks:\n`);
    ukStocks.sort().forEach((s: string) => console.log(`  - ${s}`));

    const testSymbol = ukStocks[0];
    console.log(`\nTesting quote for ${testSymbol}...`);
    const quote = await metaApiHandler.checkSymbolQuotes(testSymbol);
    if (quote.success) {
      console.log(`  Bid: ${quote.quotes.bid}`);
      console.log(`  Ask: ${quote.quotes.ask}`);
      console.log('\n✓ UK stock trading is AVAILABLE on FxPro');
    } else {
      console.log(`  Failed to get quote: ${quote.error}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(console.error);
