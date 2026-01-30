import 'dotenv/config';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { checkEarningsWithPerplexity } from '../services/earningsFilterService.js';

// Stocks that failed the 30% prior uptrend but might pass at 15%
const CANDIDATES = [
  { symbol: 'NVDA', priorUptrend: 14.54, rsRating: 85, nearHigh: -10.01, baseValid: false },
  { symbol: 'GOOGL', priorUptrend: 34.32, rsRating: 90, nearHigh: -2.17, baseValid: false, reason: 'Base too short (2 weeks)' },
  { symbol: 'AMD', priorUptrend: 49.53, rsRating: 94, nearHigh: -5.56, baseValid: true },
  { symbol: 'AAPL', priorUptrend: 19.9, rsRating: 53, nearHigh: -11.52, baseValid: false },
  { symbol: 'AMZN', priorUptrend: 13.72, rsRating: 48, nearHigh: -6.1, baseValid: false },
  { symbol: 'PLTR', priorUptrend: 22.86, rsRating: 93, nearHigh: -22.56, baseValid: false },
  { symbol: 'LLY', priorUptrend: 50.8, rsRating: 74, nearHigh: -10.77, baseValid: true },
];

async function simulate() {
  console.log('='.repeat(70));
  console.log('SIMULATION: What if prior uptrend threshold was 15% instead of 30%?');
  console.log('='.repeat(70));
  console.log('');

  console.log('Current thresholds:');
  console.log('  - Prior uptrend: 30% (proposed: 15%)');
  console.log('  - RS Rating: >= 80');
  console.log('  - Near 52-week high: within 15%');
  console.log('  - Base length: >= 5 weeks');
  console.log('  - Score: >= 4');
  console.log('  - Earnings: C >= 20% AND A >= 20%');
  console.log('');

  const results: any[] = [];

  for (const stock of CANDIDATES) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`${stock.symbol}`);
    console.log('='.repeat(50));

    // Check if base would be valid with 15% threshold
    const baseValidAt15 = stock.priorUptrend >= 15 && !stock.reason?.includes('too short');

    console.log(`  Prior Uptrend: ${stock.priorUptrend}%`);
    console.log(`    At 30%: ${stock.priorUptrend >= 30 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`    At 15%: ${stock.priorUptrend >= 15 ? '✅ PASS' : '❌ FAIL'}`);

    if (stock.reason) {
      console.log(`    Other issue: ${stock.reason}`);
    }

    console.log(`  RS Rating: ${stock.rsRating} ${stock.rsRating >= 80 ? '✅' : '❌ (need 80)'}`);
    console.log(`  Near High: ${stock.nearHigh}% ${stock.nearHigh >= -15 ? '✅' : '❌ (need within 15%)'}`);

    // Calculate if would pass CAN SLIM with 15% threshold
    const passesRS = stock.rsRating >= 80;
    const passesNearHigh = stock.nearHigh >= -15;
    const passesBase = baseValidAt15;

    // Score calculation (simplified)
    let score = 1; // Market direction (assume pass)
    if (passesRS) score++;
    if (passesNearHigh) score++;
    if (passesBase) score++;
    // Sector and volume would need actual calculation, assume 0-2 more points possible

    console.log(`  Base Valid (at 15%): ${passesBase ? '✅' : '❌'}`);
    console.log(`  Estimated Score: ${score}/6 (+ potential sector/volume)`);

    const wouldPassCanslim = passesRS && (passesNearHigh || passesBase) && score >= 3;

    if (wouldPassCanslim) {
      console.log(`\n  >>> Would pass CAN SLIM at 15% threshold - checking earnings...`);

      const earnings = await checkEarningsWithPerplexity(stock.symbol);
      console.log(`  Earnings: ${earnings.pass ? '✅ PASS' : '❌ FAIL'} - ${earnings.reason}`);

      if (earnings.pass) {
        console.log(`\n  🎯 ${stock.symbol} WOULD CREATE AN ORDER!`);
        results.push({ symbol: stock.symbol, earnings: earnings.reason });
      } else {
        console.log(`\n  ❌ ${stock.symbol} blocked by earnings filter`);
      }
    } else {
      const blockers = [];
      if (!passesRS) blockers.push(`RS ${stock.rsRating} < 80`);
      if (!passesNearHigh && !passesBase) blockers.push('Not near high AND no valid base');
      console.log(`\n  ❌ Would NOT pass CAN SLIM: ${blockers.join(', ')}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n');
  console.log('='.repeat(70));
  console.log('SUMMARY: Stocks that would trade with 15% prior uptrend threshold');
  console.log('='.repeat(70));

  if (results.length === 0) {
    console.log('\nNo additional stocks would qualify.');
  } else {
    for (const r of results) {
      console.log(`\n✅ ${r.symbol}`);
      console.log(`   ${r.earnings}`);
    }
  }

  console.log('\n');
  console.log('Currently trading (at 30%): AMD');
  console.log(`Would trade (at 15%): ${results.length > 0 ? results.map(r => r.symbol).join(', ') : 'No additional'}`);
}

simulate().catch(console.error);
