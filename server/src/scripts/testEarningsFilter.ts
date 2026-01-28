import 'dotenv/config';
import { checkEarningsWithPerplexity } from '../services/earningsFilterService.js';

// Test a batch of stocks that are likely CAN SLIM candidates
const TEST_SYMBOLS = [
  // High-growth tech that often passes CAN SLIM
  'NVDA', 'AMD', 'META', 'MSFT', 'GOOGL', 'AMZN', 'AAPL',
  // Other growth stocks
  'CRWD', 'PLTR', 'SHOP', 'MELI', 'DDOG', 'SNOW',
  // Financial/Industrial leaders
  'GS', 'JPM', 'CAT', 'DE',
  // Healthcare growth
  'LLY', 'UNH', 'ISRG',
  // Consumer
  'COST', 'WMT', 'LULU'
];

async function testEarningsFilter() {
  console.log('='.repeat(70));
  console.log('EARNINGS FILTER TEST - Checking C and A criteria');
  console.log('Requirement: C >= 20% AND A >= 20%');
  console.log('='.repeat(70));
  console.log('');

  const results: Array<{
    symbol: string;
    pass: boolean;
    reason: string;
    quarterlyGrowth: string;
    annualGrowth: string;
  }> = [];

  for (const symbol of TEST_SYMBOLS) {
    console.log(`\nChecking ${symbol}...`);
    const result = await checkEarningsWithPerplexity(symbol);

    results.push({
      symbol,
      pass: result.pass,
      reason: result.reason,
      quarterlyGrowth: result.currentEarnings?.quarterlyGrowth || 'N/A',
      annualGrowth: result.currentEarnings?.annualGrowth || 'N/A'
    });

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log('');

  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);

  console.log(`PASSED (${passed.length}/${results.length}):`);
  console.log('-'.repeat(70));
  for (const r of passed) {
    console.log(`  ${r.symbol.padEnd(6)} | C: ${r.quarterlyGrowth.padEnd(10)} | A: ${r.annualGrowth.padEnd(10)} | ${r.reason}`);
  }

  console.log('');
  console.log(`FAILED (${failed.length}/${results.length}):`);
  console.log('-'.repeat(70));
  for (const r of failed) {
    console.log(`  ${r.symbol.padEnd(6)} | C: ${r.quarterlyGrowth.padEnd(10)} | A: ${r.annualGrowth.padEnd(10)} | ${r.reason}`);
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log(`Pass rate: ${((passed.length / results.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));
}

testEarningsFilter().catch(console.error);
