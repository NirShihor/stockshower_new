import 'dotenv/config';
import { detectBasePattern, debugBasePatternDetails } from '../services/basePatternService.js';

// Parse command line args: yarn tsx src/scripts/debugBasePattern.ts AAF UK
const args = process.argv.slice(2);
const SYMBOL = args[0] || 'NVDA';
const MARKET = (args[1]?.toUpperCase() === 'UK' ? 'UK' : 'US') as 'US' | 'UK';

async function debug() {
  const today = new Date().toISOString().split('T')[0];

  console.log('='.repeat(70));
  console.log(`BASE PATTERN DEBUG - ${SYMBOL} (${MARKET}) - ${today}`);
  console.log('='.repeat(70));
  console.log('');
  console.log('Validity requirements:');
  console.log('  - Pattern type: not "none"');
  console.log('  - Prior uptrend: >= 30% advance before base');
  console.log('  - No recent breakdown (>15% drop before base)');
  console.log('  - Base depth: <= 35%');
  console.log('  - Base length: >= 5 weeks (25 trading days)');
  console.log('  - Price within 15% of pivot');
  console.log('  - Pattern quality checks (U-shape, right side completion)');
  console.log('');

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${SYMBOL} (${MARKET})`);
  console.log('='.repeat(50));

  // Get detailed debug info
  const details = await debugBasePatternDetails(SYMBOL, today, MARKET);
  if (details) {
    console.log('\n  --- Cup Detection Details ---');
    console.log(`  Left Side High: ${details.cupDetails.leftHigh.toFixed(2)}`);
    console.log(`  Right Side High: ${details.cupDetails.rightHigh.toFixed(2)}`);
    console.log(`  Middle Low: ${details.cupDetails.middleLow.toFixed(2)}`);
    console.log(`  Right Side Gap: ${details.cupDetails.rightSideGap.toFixed(1)}% ${details.cupDetails.rightSideGap > 10 ? '❌ (incomplete)' : '✅'}`);
    console.log(`  Days Near Low: ${details.cupDetails.daysNearLow}/${details.cupDetails.middleDays} ${details.cupDetails.isVShaped ? '❌ (V-shaped)' : '✅ (U-shaped)'}`);
    console.log(`  Handle Depth: ${details.cupDetails.handleDepth.toFixed(1)}% ${details.cupDetails.handleTooDeep ? '❌ (too deep >15%)' : '✅'}`);
    console.log('');
    console.log('  --- Price Position ---');
    console.log(`  Current Price: ${details.currentPrice.toFixed(2)}`);
    console.log(`  Distance from Pivot: ${details.distanceFromPivot.toFixed(1)}% ${details.distanceFromPivot > 10 ? '❌ (too far)' : '✅'}`);
    console.log(`  Price in Upper Half: ${details.priceInUpperHalf ? '✅' : '❌'}`);
    console.log('');
  }

  const pattern = await detectBasePattern(SYMBOL, today, MARKET);

  if (!pattern) {
    console.log('  No pattern data returned');
    return;
  }

  console.log('  --- Final Result ---');
  console.log(`  Type: ${pattern.type}`);
  console.log(`  Pivot Price: ${pattern.pivotPrice}`);
  console.log(`  Base Depth: ${pattern.baseDepthPercent}% ${pattern.baseDepthPercent <= 35 ? '✅' : '❌ (>35%)'}`);
  console.log(`  Base Length: ${pattern.baseLengthWeeks} weeks (${pattern.baseLengthDays} days) ${pattern.baseLengthDays >= 25 ? '✅' : '❌ (<5 weeks)'}`);
  console.log(`  Prior Uptrend: ${pattern.priorUptrendPercent}% ${pattern.priorUptrend ? '✅' : '❌ (<30%)'}`);
  console.log(`  Recent Breakdown: ${pattern.recentBreakdown ? `❌ YES (${pattern.breakdownPercent}% drop)` : '✅ NO'}`);
  console.log(`  Volume Contraction: ${pattern.volumeContractionRatio}x ${pattern.volumeContraction ? '✅' : '(no contraction)'}`);
  console.log('');
  console.log(`  >>> isValid: ${pattern.isValid ? '✅ VALID' : '❌ INVALID'}`);
  if (pattern.invalidReason) {
    console.log(`  >>> Reason: ${pattern.invalidReason}`);
  }
}

debug().catch(console.error);
