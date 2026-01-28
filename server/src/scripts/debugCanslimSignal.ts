import 'dotenv/config';
import { analyseCanslimSignal, formatCanslimSignalForDisplay } from '../services/canslimService.js';

const SYMBOLS_TO_CHECK = ['NVDA', 'GOOGL', 'AMD', 'AAPL', 'AMZN', 'PLTR', 'LLY'];

async function debugSignals() {
  const today = new Date().toISOString().split('T')[0];

  console.log('='.repeat(70));
  console.log(`CAN SLIM SIGNAL DEBUG - ${today}`);
  console.log('='.repeat(70));

  for (const symbol of SYMBOLS_TO_CHECK) {
    console.log(`\nAnalyzing ${symbol}...`);

    const signal = await analyseCanslimSignal(symbol, today);

    if (!signal) {
      console.log(`  ${symbol}: No signal generated (data fetch failed)`);
      continue;
    }

    console.log(formatCanslimSignalForDisplay(signal));

    // Summary line
    console.log('\n>>> VERDICT:');
    if (signal.extended) {
      console.log(`    BLOCKED: Extended ${signal.percentFromPivot.toFixed(1)}% above pivot (max 5%)`);
    } else if (!signal.pass) {
      const failures = [];
      if (!signal.marketDirection.pass) failures.push('Market Direction');
      if (!signal.relativeStrength?.pass) failures.push('RS Rating < 80');
      if (!signal.newHigh?.pass && !signal.basePattern?.pass) failures.push('Not near high & no base pattern');
      console.log(`    BLOCKED: Failed criteria: ${failures.join(', ')}`);
    } else if (signal.score < 4) {
      console.log(`    BLOCKED: Score ${signal.score} < 4 (minScore)`);
    } else {
      console.log(`    WOULD PASS CAN SLIM - Score ${signal.score}/${signal.maxScore}`);
      console.log(`    (Would then go to earnings filter)`);
    }
  }
}

debugSignals().catch(console.error);
