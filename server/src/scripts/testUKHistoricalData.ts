import dotenv from 'dotenv';
dotenv.config();

import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { fetchUKHistoricalBars } from '../handlers/ukDataAPI.js';

async function testUKHistoricalData() {
  console.log('Testing UK Historical Data from MetaAPI...\n');

  // Reinitialize MetaAPI connection
  metaApiHandler.reinitialize();

  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test a few UK stocks
  const testSymbols = ['BP', 'SHEL', 'HSBA', 'AZN', 'GSK', 'BARC', 'LLOY', 'VOD'];

  const today = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  console.log(`Date range: ${oneYearAgo.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}\n`);
  console.log('Symbol'.padEnd(10) + 'Candles'.padEnd(12) + 'Oldest Date'.padEnd(15) + 'Latest Date'.padEnd(15) + 'Status');
  console.log('-'.repeat(65));

  for (const symbol of testSymbols) {
    try {
      const candles = await fetchUKHistoricalBars(
        symbol,
        oneYearAgo.toISOString().split('T')[0],
        today.toISOString().split('T')[0],
        'day',
        300  // Request 300 days
      );

      if (candles.length > 0) {
        const oldestDate = candles[0].start?.split('T')[0] || 'N/A';
        const latestDate = candles[candles.length - 1].start?.split('T')[0] || 'N/A';
        const status = candles.length >= 200 ? '✓ OK' : '✗ Insufficient';

        console.log(
          symbol.padEnd(10) +
          candles.length.toString().padEnd(12) +
          oldestDate.padEnd(15) +
          latestDate.padEnd(15) +
          status
        );
      } else {
        console.log(symbol.padEnd(10) + '0'.padEnd(12) + 'N/A'.padEnd(15) + 'N/A'.padEnd(15) + '✗ No data');
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(symbol.padEnd(10) + 'ERROR'.padEnd(12) + String(error).slice(0, 40));
    }
  }

  console.log('\n' + '-'.repeat(65));
  console.log('\nRequirements:');
  console.log('  - 52-week high: ~250 trading days');
  console.log('  - RS calculation: ~250 trading days');
  console.log('  - Base pattern: ~150 trading days');
  console.log('  - Volume breakout: ~60 trading days');

  // Test market context proxy stocks
  console.log('\n\nTesting UK Market Context Proxies...');
  const proxySymbols = ['SHEL', 'AZN', 'BARC'];  // INDEX, TECH, VIX proxies
  for (const sym of proxySymbols) {
    try {
      const candles = await fetchUKHistoricalBars(sym, oneYearAgo.toISOString().split('T')[0], today.toISOString().split('T')[0], 'day', 60);
      console.log(`${sym}: ${candles.length} candles - ${candles.length >= 50 ? '✓ OK' : '✗ Insufficient'}`);
    } catch (error) {
      console.log(`${sym}: ERROR`);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\nTest complete.');
  process.exit(0);
}

testUKHistoricalData().catch(console.error);
