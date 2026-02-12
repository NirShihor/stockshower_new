/**
 * Test script for Distribution Day Detection
 *
 * Backtests the distribution day counting algorithm against historical data
 * to verify it would have detected known market tops.
 *
 * Run with: yarn tsx src/scripts/testDistributionDays.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { fetchHistoricalBars } from '../handlers/polygonAPI.js';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

interface DayAnalysis {
  date: string;
  close: number;
  volume: number;
  changePercent: number;
  volumeChange: number;
  avgVolume20: number;
  isDistributionDay: boolean;
  isStallingDay: boolean;
  isResetDay: boolean;
  distributionCount: number;
  marketStatus: string;
}

// O'Neil's thresholds
const DISTRIBUTION_THRESHOLD = -0.2;
const STALLING_THRESHOLD = 0.2;
const STALLING_VOLUME_MULTIPLIER = 1.1;
const RESET_DAY_MIN_GAIN = 2.0;
const ROLLING_WINDOW = 25;

function calculateAvgVolume20(volumes: number[], index: number): number {
  const start = Math.max(0, index - 20);
  const slice = volumes.slice(start, index);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function analyzeHistoricalData(candles: any[]): DayAnalysis[] {
  const results: DayAnalysis[] = [];
  const distributionDates: string[] = [];

  for (let i = 1; i < candles.length; i++) {
    const today = candles[i];
    const yesterday = candles[i - 1];

    const date = today.start.split('T')[0];
    const close = today.close;
    const volume = today.volume || 0;
    const prevVolume = yesterday.volume || 0;
    const changePercent = ((today.close - yesterday.close) / yesterday.close) * 100;
    const volumeChange = prevVolume > 0 ? ((volume - prevVolume) / prevVolume) * 100 : 0;

    // Calculate 20-day average volume
    const volumes = candles.slice(0, i).map(c => c.volume || 0);
    const avgVolume20 = calculateAvgVolume20(volumes, i);

    // Check for distribution day: down > 0.2% on higher volume
    const isDistributionDay = changePercent <= DISTRIBUTION_THRESHOLD && volume > prevVolume;

    // Check for stalling day: up < 0.2% on volume 10%+ above average
    const isStallingDay = changePercent >= 0 &&
                          changePercent < STALLING_THRESHOLD &&
                          volume > avgVolume20 * STALLING_VOLUME_MULTIPLIER;

    // Check for reset day: strong up day (2%+) removes one distribution day
    const isResetDay = changePercent >= RESET_DAY_MIN_GAIN;

    // Track distribution days
    if (isDistributionDay || isStallingDay) {
      distributionDates.push(date);
    }

    if (isResetDay && distributionDates.length > 0) {
      distributionDates.shift(); // Remove oldest
    }

    // Remove expired distribution days (older than 25 trading days)
    const windowStart = new Date(date);
    windowStart.setDate(windowStart.getDate() - 35); // ~25 trading days
    const windowStartStr = windowStart.toISOString().split('T')[0];
    while (distributionDates.length > 0 && distributionDates[0] < windowStartStr) {
      distributionDates.shift();
    }

    const distributionCount = distributionDates.length;

    let marketStatus = 'CONFIRMED_UPTREND';
    if (distributionCount >= 5) marketStatus = 'MARKET_IN_CORRECTION';
    else if (distributionCount === 4) marketStatus = 'UPTREND_UNDER_PRESSURE';

    results.push({
      date,
      close,
      volume,
      changePercent,
      volumeChange,
      avgVolume20,
      isDistributionDay,
      isStallingDay,
      isResetDay,
      distributionCount,
      marketStatus
    });
  }

  return results;
}

function printSummary(results: DayAnalysis[], periodName: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`BACKTEST: ${periodName}`);
  console.log('='.repeat(80));

  // Find first correction signal
  const correctionStart = results.find(r => r.marketStatus === 'MARKET_IN_CORRECTION');
  const pressureStart = results.find(r => r.marketStatus === 'UPTREND_UNDER_PRESSURE');

  // Count distribution days
  const totalDistDays = results.filter(r => r.isDistributionDay).length;
  const totalStallingDays = results.filter(r => r.isStallingDay).length;
  const totalResetDays = results.filter(r => r.isResetDay).length;

  console.log(`\nPeriod: ${results[0]?.date} to ${results[results.length - 1]?.date}`);
  console.log(`Total trading days: ${results.length}`);
  console.log(`Distribution days: ${totalDistDays}`);
  console.log(`Stalling days: ${totalStallingDays}`);
  console.log(`Reset days (2%+ up): ${totalResetDays}`);

  if (pressureStart) {
    console.log(`\n⚠️  First PRESSURE signal (4 dist days): ${pressureStart.date}`);
    console.log(`   SPY close: $${pressureStart.close.toFixed(2)}`);
  }

  if (correctionStart) {
    console.log(`\n🚨 First CORRECTION signal (5+ dist days): ${correctionStart.date}`);
    console.log(`   SPY close: $${correctionStart.close.toFixed(2)}`);

    // Find the market top (highest close before correction)
    const beforeCorrection = results.slice(0, results.indexOf(correctionStart));
    const marketTop = beforeCorrection.reduce((max, r) => r.close > max.close ? r : max, beforeCorrection[0]);

    console.log(`\n📈 Market top: ${marketTop.date} at $${marketTop.close.toFixed(2)}`);

    const daysBetween = results.indexOf(correctionStart) - results.indexOf(marketTop);
    const dropPercent = ((correctionStart.close - marketTop.close) / marketTop.close) * 100;

    console.log(`   Days from top to signal: ${daysBetween}`);
    console.log(`   Drop from top at signal: ${dropPercent.toFixed(2)}%`);
  } else {
    console.log(`\n✅ No correction signal during this period`);
  }

  // Show distribution days
  const distDays = results.filter(r => r.isDistributionDay || r.isStallingDay);
  if (distDays.length > 0) {
    console.log(`\nDistribution/Stalling days:`);
    distDays.slice(-10).forEach(d => {
      const type = d.isDistributionDay ? 'DIST' : 'STALL';
      console.log(`  ${d.date}: ${type} - SPY ${d.changePercent >= 0 ? '+' : ''}${d.changePercent.toFixed(2)}%, Vol ${d.volumeChange >= 0 ? '+' : ''}${d.volumeChange.toFixed(0)}%`);
    });
  }
}

async function backtestPeriod(name: string, from: string, to: string) {
  console.log(`\nFetching data for ${name}...`);

  try {
    const candles = await fetchHistoricalBars(
      POLYGON_API_KEY,
      'SPY',
      from,
      to,
      'day',
      1
    );

    if (candles.length < 30) {
      console.log(`Insufficient data for ${name}: only ${candles.length} days`);
      return;
    }

    const results = analyzeHistoricalData(candles);
    printSummary(results, name);
  } catch (error: any) {
    console.error(`Error fetching ${name}:`, error.message);
  }
}

async function testCurrentMarket() {
  console.log('\n' + '='.repeat(80));
  console.log('CURRENT MARKET STATUS');
  console.log('='.repeat(80));

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 60);

  const fromStr = from.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  try {
    const candles = await fetchHistoricalBars(
      POLYGON_API_KEY,
      'SPY',
      fromStr,
      toStr,
      'day',
      1
    );

    const results = analyzeHistoricalData(candles);
    const latest = results[results.length - 1];

    console.log(`\nAs of: ${latest.date}`);
    console.log(`SPY: $${latest.close.toFixed(2)}`);
    console.log(`Distribution days (last 25): ${latest.distributionCount}`);
    console.log(`Market Status: ${latest.marketStatus}`);

    if (latest.marketStatus === 'MARKET_IN_CORRECTION') {
      console.log('\n🚨 SYSTEM WOULD CLOSE ALL POSITIONS');
    } else if (latest.marketStatus === 'UPTREND_UNDER_PRESSURE') {
      console.log('\n⚠️  SYSTEM WOULD REDUCE POSITION SIZING TO 50%');
    } else {
      console.log('\n✅ SYSTEM WOULD ALLOW NORMAL TRADING');
    }

    // Show recent distribution days
    const recentDist = results.filter(r => r.isDistributionDay || r.isStallingDay).slice(-5);
    if (recentDist.length > 0) {
      console.log('\nRecent distribution/stalling days:');
      recentDist.forEach(d => {
        const type = d.isDistributionDay ? 'DIST' : 'STALL';
        console.log(`  ${d.date}: ${type} - ${d.changePercent >= 0 ? '+' : ''}${d.changePercent.toFixed(2)}%`);
      });
    }

  } catch (error: any) {
    console.error('Error fetching current data:', error.message);
  }
}

async function main() {
  console.log('Distribution Day Detection - Backtest\n');
  console.log('Testing O\'Neil\'s distribution day methodology against historical data.\n');

  if (!POLYGON_API_KEY) {
    console.error('ERROR: POLYGON_API_KEY not set in environment');
    process.exit(1);
  }

  // Test current market first
  await testCurrentMarket();

  // Backtest known market tops
  // Note: Polygon free tier may have limited historical data

  // COVID crash - Feb/March 2020
  await backtestPeriod(
    'COVID Crash (Feb-Mar 2020)',
    '2020-01-01',
    '2020-04-30'
  );

  // 2022 Bear Market
  await backtestPeriod(
    '2022 Bear Market (Jan-Jun 2022)',
    '2021-11-01',
    '2022-06-30'
  );

  // Recent period
  await backtestPeriod(
    'Recent (Last 6 months)',
    new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    new Date().toISOString().split('T')[0]
  );

  console.log('\n' + '='.repeat(80));
  console.log('BACKTEST COMPLETE');
  console.log('='.repeat(80));
}

main().catch(console.error);
