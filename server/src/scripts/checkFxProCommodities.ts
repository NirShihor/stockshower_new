import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

metaApiHandler.reinitialize();

const token = process.env.METAAPI_TOKEN || '';
const accountId = process.env.METAAPI_ACCOUNT_ID || '';

async function getHistoricalCandles(symbol: string, timeframe: string, limit: number = 100) {
  try {
    const url = `https://mt-market-data-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${accountId}/historical-market-data/symbols/${symbol}/timeframes/${timeframe}/candles?limit=${limit}`;
    const response = await axios.get(url, {
      headers: { 'auth-token': token }
    });
    return { success: true, candles: response.data };
  } catch (error: any) {
    return { success: false, error: error.response?.data || error.message };
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('CHECKING FXPRO COMMODITY INSTRUMENTS');
  console.log('='.repeat(60) + '\n');

  console.log('Fetching available symbols from FxPro MT5...\n');
  const result = await metaApiHandler.getAvailableSymbols();

  if (!result.success) {
    console.log('Failed to get symbols:', result.error);
    return;
  }

  const symbols: string[] = result.symbols;
  console.log(`Total symbols available: ${symbols.length}\n`);

  const commodityKeywords = ['XAU', 'GOLD', 'XAG', 'SILVER', 'WTI', 'BRENT', 'OIL', 'CRUDE', 'COPPER', 'PLAT', 'PALL'];
  const commodities = symbols.filter((s: string) =>
    commodityKeywords.some(keyword => s.toUpperCase().includes(keyword))
  );

  console.log('='.repeat(40));
  console.log('COMMODITY SYMBOLS FOUND:');
  console.log('='.repeat(40));

  if (commodities.length === 0) {
    console.log('No commodity symbols found');
  } else {
    commodities.forEach((s: string) => console.log(`  - ${s}`));
  }

  const goldSymbol = commodities.find((s: string) => s === 'GOLD') ||
                     commodities.find((s: string) => s.toUpperCase() === 'XAUUSD') ||
                     commodities.find((s: string) => s.toUpperCase().includes('GOLD'));
  if (goldSymbol) {
    console.log(`\nTesting quote for ${goldSymbol}...`);
    const quote = await metaApiHandler.checkSymbolQuotes(goldSymbol);
    if (quote.success) {
      console.log(`  Bid: ${quote.quotes.bid}`);
      console.log(`  Ask: ${quote.quotes.ask}`);
      console.log('\n✓ Gold trading is AVAILABLE on FxPro');
    } else {
      console.log(`  Failed to get quote: ${quote.error}`);
    }

    console.log('\n' + '='.repeat(40));
    console.log('TESTING HISTORICAL CANDLES:');
    console.log('='.repeat(40));
    console.log(`\nFetching daily candles for ${goldSymbol}...`);

    const history = await getHistoricalCandles(goldSymbol, '1d', 30);
    if (history.success && history.candles?.length > 0) {
      console.log(`\n✓ Retrieved ${history.candles.length} daily candles\n`);
      console.log('Last 5 candles:');
      const lastFive = history.candles.slice(0, 5);
      lastFive.forEach((c: any) => {
        const date = new Date(c.time).toISOString().split('T')[0];
        console.log(`  ${date}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)}`);
      });

      const closes = history.candles.map((c: any) => c.close);
      const ema20 = closes.slice(0, 20).reduce((a: number, b: number) => a + b, 0) / 20;
      const currentPrice = closes[0];
      console.log(`\n  Current: $${currentPrice.toFixed(2)}`);
      console.log(`  20-day EMA: $${ema20.toFixed(2)}`);
      console.log(`  Trend: ${currentPrice > ema20 ? 'ABOVE EMA (bullish)' : 'BELOW EMA (bearish)'}`);

      console.log('\n✓ Historical data is AVAILABLE - gold breakout system is FEASIBLE');
    } else {
      console.log(`  Failed to get candles: ${history.error}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(console.error);
