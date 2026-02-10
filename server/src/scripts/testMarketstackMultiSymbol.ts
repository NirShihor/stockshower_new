import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const MARKETSTACK_API_KEY = process.env.MARKETSTACK_API_KEY || '';
const MARKETSTACK_BASE_URL = 'http://api.marketstack.com/v1';

async function testSymbol(symbol: string): Promise<void> {
  const dateRanges = [
    { from: '2026-02-01', to: '2026-02-07', label: 'Feb 2026' },
    { from: '2025-09-01', to: '2025-09-15', label: 'Sep 2025' },
    { from: '2024-06-01', to: '2024-06-15', label: 'Jun 2024' },
  ];

  console.log(`\n${symbol}:`);

  for (const range of dateRanges) {
    try {
      const response = await axios.get(`${MARKETSTACK_BASE_URL}/eod`, {
        params: {
          access_key: MARKETSTACK_API_KEY,
          symbols: symbol,
          date_from: range.from,
          date_to: range.to,
          limit: 5,
          sort: 'ASC'
        }
      });

      const count = response.data?.data?.length || 0;
      const status = count > 0 ? 'OK' : 'NO DATA';
      console.log(`  ${range.label}: ${status} (${count} records)`);
    } catch (error: any) {
      console.log(`  ${range.label}: ERROR - ${error.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Testing Marketstack UK Symbol Data Availability');
  console.log('='.repeat(60));

  const ukSymbols = [
    'BP.XLON',
    'SHEL.XLON',
    'HSBA.XLON',
    'AZN.XLON',
    'GSK.XLON',
    'LLOY.XLON',
    'VOD.XLON',
    'RIO.XLON',
  ];

  for (const symbol of ukSymbols) {
    await testSymbol(symbol);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
