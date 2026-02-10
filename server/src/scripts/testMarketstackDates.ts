import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const MARKETSTACK_API_KEY = process.env.MARKETSTACK_API_KEY || '';
const MARKETSTACK_BASE_URL = 'http://api.marketstack.com/v1';

async function testDateRange(symbol: string, dateFrom: string, dateTo: string): Promise<void> {
  try {
    const response = await axios.get(`${MARKETSTACK_BASE_URL}/eod`, {
      params: {
        access_key: MARKETSTACK_API_KEY,
        symbols: symbol,
        date_from: dateFrom,
        date_to: dateTo,
        limit: 10,
        sort: 'ASC'
      }
    });

    const count = response.data?.data?.length || 0;
    const total = response.data?.pagination?.total || 0;
    console.log(`${dateFrom} to ${dateTo}: ${count} results (total: ${total})`);

    if (count > 0) {
      const first = response.data.data[0];
      console.log(`  First: ${first.date} - Close: ${first.close}, Volume: ${first.volume}`);
    }
  } catch (error: any) {
    console.log(`${dateFrom} to ${dateTo}: ERROR - ${error.message}`);
  }
}

async function main() {
  const symbol = 'BP.XLON';

  console.log('='.repeat(60));
  console.log(`Testing Marketstack data availability for ${symbol}`);
  console.log(`API Key: ${MARKETSTACK_API_KEY.substring(0, 8)}...`);
  console.log('='.repeat(60));
  console.log('');

  // Test different date ranges to find cutoff
  const dateRanges = [
    // Recent dates (should work)
    ['2026-02-01', '2026-02-07'],
    ['2026-01-01', '2026-01-15'],

    // One year ago
    ['2025-12-01', '2025-12-15'],
    ['2025-10-01', '2025-10-15'],
    ['2025-06-01', '2025-06-15'],
    ['2025-01-01', '2025-01-15'],

    // Two years ago
    ['2024-12-01', '2024-12-15'],
    ['2024-10-01', '2024-10-15'],
    ['2024-06-01', '2024-06-15'],
    ['2024-01-01', '2024-01-15'],

    // Three years ago
    ['2023-12-01', '2023-12-15'],
    ['2023-06-01', '2023-06-15'],
    ['2023-01-01', '2023-01-15'],
  ];

  for (const [from, to] of dateRanges) {
    await testDateRange(symbol, from, to);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Test complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
