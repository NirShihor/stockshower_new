import 'dotenv/config';
import { detectBasePattern } from '../services/basePatternService.js';

const SYMBOLS = ['NVDA', 'GOOGL', 'AMD', 'AAPL', 'AMZN', 'PLTR', 'LLY'];

async function debug() {
  const today = new Date().toISOString().split('T')[0];

  console.log('='.repeat(70));
  console.log(`BASE PATTERN DEBUG - ${today}`);
  console.log('='.repeat(70));
  console.log('');
  console.log('Validity requirements:');
  console.log('  - Pattern type: not "none"');
  console.log('  - Prior uptrend: >= 30% advance before base');
  console.log('  - Base depth: <= 35%');
  console.log('  - Base length: >= 5 weeks (25 trading days)');
  console.log('');

  for (const symbol of SYMBOLS) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`${symbol}`);
    console.log('='.repeat(50));

    const pattern = await detectBasePattern(symbol, today);

    if (!pattern) {
      console.log('  No pattern data returned');
      continue;
    }

    console.log(`  Type: ${pattern.type}`);
    console.log(`  Pivot Price: $${pattern.pivotPrice}`);
    console.log(`  Base Depth: ${pattern.baseDepthPercent}% ${pattern.baseDepthPercent <= 35 ? '✅' : '❌ (>35%)'}`);
    console.log(`  Base Length: ${pattern.baseLengthWeeks} weeks (${pattern.baseLengthDays} days) ${pattern.baseLengthDays >= 25 ? '✅' : '❌ (<5 weeks)'}`);
    console.log(`  Prior Uptrend: ${pattern.priorUptrendPercent}% ${pattern.priorUptrend ? '✅' : '❌ (<30%)'}`);
    console.log(`  Volume Contraction: ${pattern.volumeContractionRatio}x ${pattern.volumeContraction ? '✅' : '(no contraction)'}`);
    console.log('');
    console.log(`  >>> isValid: ${pattern.isValid ? '✅ VALID' : '❌ INVALID'}`);
    if (pattern.invalidReason) {
      console.log(`  >>> Reason: ${pattern.invalidReason}`);
    }
  }
}

debug().catch(console.error);
