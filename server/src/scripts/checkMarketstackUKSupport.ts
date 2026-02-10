import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const MARKETSTACK_API_KEY = process.env.MARKETSTACK_API_KEY || '';
const MARKETSTACK_BASE_URL = 'http://api.marketstack.com/v1';

async function main() {
  console.log('='.repeat(60));
  console.log('Checking Marketstack UK/LSE Support');
  console.log('='.repeat(60));
  console.log('');

  // Check available exchanges
  console.log('1. Checking available exchanges...');
  try {
    const exchangeResp = await axios.get(`${MARKETSTACK_BASE_URL}/exchanges`, {
      params: {
        access_key: MARKETSTACK_API_KEY,
        limit: 100
      }
    });

    const ukExchanges = exchangeResp.data.data.filter((ex: any) =>
      ex.country === 'United Kingdom' || ex.country_code === 'GB' || ex.mic === 'XLON'
    );

    console.log(`Found ${ukExchanges.length} UK exchanges:`);
    for (const ex of ukExchanges) {
      console.log(`  - ${ex.name} (MIC: ${ex.mic}, Acronym: ${ex.acronym})`);
    }
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
  }

  console.log('');

  // Check tickers for XLON exchange
  console.log('2. Checking tickers on XLON exchange...');
  try {
    const tickerResp = await axios.get(`${MARKETSTACK_BASE_URL}/tickers`, {
      params: {
        access_key: MARKETSTACK_API_KEY,
        exchange: 'XLON',
        limit: 100
      }
    });

    const total = tickerResp.data.pagination.total;
    const tickers = tickerResp.data.data;

    console.log(`Total tickers on XLON: ${total}`);
    console.log(`First 20 tickers with EOD support:`);

    const withEOD = tickers.filter((t: any) => t.has_eod);
    for (const t of withEOD.slice(0, 20)) {
      console.log(`  - ${t.symbol}: ${t.name}`);
    }
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
  }

  console.log('');

  // Try searching for specific symbols
  console.log('3. Searching for specific UK symbols...');
  const searchSymbols = ['HSBA', 'LLOY', 'RIO', 'BARC'];

  for (const sym of searchSymbols) {
    try {
      const searchResp = await axios.get(`${MARKETSTACK_BASE_URL}/tickers`, {
        params: {
          access_key: MARKETSTACK_API_KEY,
          search: sym,
          limit: 5
        }
      });

      const matches = searchResp.data.data;
      if (matches.length > 0) {
        console.log(`  ${sym}: Found ${matches.length} matches`);
        for (const m of matches) {
          console.log(`    - ${m.symbol} on ${m.stock_exchange?.mic || 'unknown'}: ${m.name}`);
        }
      } else {
        console.log(`  ${sym}: No matches found`);
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (error: any) {
      console.log(`  ${sym}: ERROR - ${error.message}`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Done');
  console.log('='.repeat(60));
}

main().catch(console.error);
