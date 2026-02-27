/**
 * Diagnostic script to understand why few candidates pass CAN SLIM scan
 *
 * Run with: yarn tsx src/scripts/diagnoseScan.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase } from '../db/connection.js';
import { getMarketContext } from '../services/marketContextService.js';
import { getRSRankings, RS_UNIVERSE } from '../services/relativeStrengthService.js';
import { getFiftyTwoWeekHighData } from '../services/fiftyTwoWeekHighService.js';
import { detectBasePattern } from '../services/basePatternService.js';

async function diagnose() {
  await connectDatabase();

  const today = new Date().toISOString().split('T')[0];
  const market = 'US';

  console.log('\n' + '='.repeat(70));
  console.log('CAN SLIM DIAGNOSTIC SCAN');
  console.log('='.repeat(70));
  console.log(`Date: ${today}`);
  console.log(`Universe: ${RS_UNIVERSE.length} US stocks`);

  // Step 1: Market Context
  console.log('\n--- STEP 1: MARKET CONTEXT ---');
  const marketContext = await getMarketContext(today, market);
  console.log(`Regime: ${marketContext?.regime}`);
  console.log(`Reason: ${marketContext?.regimeReason}`);
  console.log(`Distribution Days: ${marketContext?.distributionDayCount}`);
  console.log(`Distribution Status: ${marketContext?.distributionDayStatus}`);
  const marketPass = marketContext?.regime === 'risk-on';
  console.log(`Market Pass: ${marketPass ? 'YES' : 'NO'}`);

  // Step 2: RS Rankings
  console.log('\n--- STEP 2: RS RANKINGS ---');
  const rsRankings = await getRSRankings(today, RS_UNIVERSE, market);
  const rs70Plus = rsRankings.filter(r => r.rsRating >= 70);
  const rs80Plus = rsRankings.filter(r => r.rsRating >= 80);
  console.log(`Total stocks with RS data: ${rsRankings.length}`);
  console.log(`RS >= 70: ${rs70Plus.length} stocks (${(rs70Plus.length/rsRankings.length*100).toFixed(1)}%)`);
  console.log(`RS >= 80: ${rs80Plus.length} stocks (${(rs80Plus.length/rsRankings.length*100).toFixed(1)}%)`);

  // Step 3: Check 52-week high for RS >= 70 stocks
  console.log('\n--- STEP 3: 52-WEEK HIGH CHECK (for RS >= 70 stocks) ---');
  let nearHighCount = 0;
  const nearHighStocks: string[] = [];

  for (const stock of rs70Plus.slice(0, 50)) { // Check top 50 by RS
    const highData = await getFiftyTwoWeekHighData(stock.symbol, today, market);
    if (highData && highData.percentFromHigh >= -15) {
      nearHighCount++;
      nearHighStocks.push(`${stock.symbol}(${highData.percentFromHigh.toFixed(1)}%)`);
    }
  }
  console.log(`Checked ${Math.min(50, rs70Plus.length)} stocks with RS >= 70`);
  console.log(`Within 15% of 52wk high: ${nearHighCount} stocks`);
  console.log(`Stocks near high: ${nearHighStocks.slice(0, 15).join(', ')}${nearHighStocks.length > 15 ? '...' : ''}`);

  // Step 4: Check base patterns for stocks that passed RS + High
  console.log('\n--- STEP 4: BASE PATTERN CHECK ---');
  let validBaseCount = 0;
  const candidateDetails: Array<{
    symbol: string;
    rsRating: number;
    percentFromHigh: number;
    baseType: string | null;
    baseValid: boolean;
    invalidReason: string | null;
    pivotPrice: number;
    currentPrice: number;
    extended: boolean;
  }> = [];

  for (const stock of rs70Plus) {
    const highData = await getFiftyTwoWeekHighData(stock.symbol, today, market);
    if (!highData || highData.percentFromHigh < -15) continue;

    const basePattern = await detectBasePattern(stock.symbol, today, market);
    const pivotPrice = basePattern?.pivotPrice || highData.fiftyTwoWeekHigh || 0;
    const currentPrice = highData.currentPrice || 0;
    const buyZoneMax = pivotPrice * 1.05;
    const extended = currentPrice > buyZoneMax;

    candidateDetails.push({
      symbol: stock.symbol,
      rsRating: stock.rsRating,
      percentFromHigh: highData.percentFromHigh,
      baseType: basePattern?.type || null,
      baseValid: basePattern?.isValid || false,
      invalidReason: basePattern?.invalidReason || null,
      pivotPrice,
      currentPrice,
      extended
    });

    if (basePattern?.isValid) {
      validBaseCount++;
    }
  }

  console.log(`Stocks passing RS + Near High: ${candidateDetails.length}`);
  console.log(`With valid base pattern: ${validBaseCount}`);

  // Show details
  console.log('\n--- CANDIDATE DETAILS ---');
  candidateDetails.forEach(c => {
    const status = c.baseValid && !c.extended ? 'PASS' :
                   c.extended ? 'EXTENDED' :
                   'NO BASE';
    console.log(`${c.symbol}: ${status}`);
    console.log(`  RS: ${c.rsRating}, From High: ${c.percentFromHigh.toFixed(1)}%`);
    console.log(`  Base: ${c.baseType || 'none'} (valid: ${c.baseValid})`);
    if (c.invalidReason) {
      console.log(`  Issue: ${c.invalidReason}`);
    }
    if (c.extended) {
      const extendedPct = ((c.currentPrice - c.pivotPrice) / c.pivotPrice * 100).toFixed(1);
      console.log(`  Extended: ${extendedPct}% above pivot $${c.pivotPrice.toFixed(2)}`);
    }
    console.log('');
  });

  // Summary
  console.log('\n--- SUMMARY ---');
  console.log(`Universe: ${RS_UNIVERSE.length} stocks`);
  console.log(`Pass RS >= 70: ${rs70Plus.length}`);
  console.log(`Pass RS + Near High: ${candidateDetails.length}`);
  console.log(`Pass RS + Near High + Valid Base: ${validBaseCount}`);
  const finalPass = candidateDetails.filter(c => c.baseValid && !c.extended);
  console.log(`Pass ALL (not extended): ${finalPass.length}`);

  if (finalPass.length > 0) {
    console.log('\nFINAL CANDIDATES:');
    finalPass.forEach(c => {
      console.log(`  ${c.symbol} - RS:${c.rsRating}, Base:${c.baseType}, Pivot:$${c.pivotPrice.toFixed(2)}`);
    });
  }

  // Show where stocks are failing
  console.log('\n--- FAILURE BREAKDOWN ---');
  const failedRS = RS_UNIVERSE.length - rs70Plus.length;
  const failedHigh = rs70Plus.length - candidateDetails.length;
  const failedBase = candidateDetails.filter(c => !c.baseValid).length;
  const failedExtended = candidateDetails.filter(c => c.baseValid && c.extended).length;

  console.log(`Failed RS < 70: ${failedRS} (${(failedRS/RS_UNIVERSE.length*100).toFixed(1)}%)`);
  console.log(`Failed > 15% from high: ~${failedHigh}`);
  console.log(`Failed no valid base: ${failedBase}`);
  console.log(`Failed extended > 5%: ${failedExtended}`);

  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
