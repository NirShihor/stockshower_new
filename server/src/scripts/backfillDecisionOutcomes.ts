import mongoose from 'mongoose';
import { DecisionLog } from '../db/models/DecisionLog.js';
import dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

interface PolygonBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function fetchBarsAfterSignal(
  symbol: string, 
  signalTime: Date,
  hoursAfter: number = 4
): Promise<PolygonBar[]> {
  const ticker = symbol.replace('.O', '').replace('.N', '');
  const startTs = signalTime.getTime();
  const endTs = startTs + (hoursAfter * 60 * 60 * 1000);
  
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${startTs}/${endTs}?apiKey=${POLYGON_API_KEY}&limit=500`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      return data.results;
    }
    return [];
  } catch (error) {
    console.error(`Error fetching bars for ${symbol}:`, error);
    return [];
  }
}

function simulateTradeOutcome(
  bars: PolygonBar[],
  entry: number,
  stop: number,
  target: number,
  direction: 'long' | 'short'
): {
  wouldHitStop: boolean;
  wouldHitTarget: boolean;
  timeToExit?: number;
  hypotheticalPnlPercent: number;
  outcome: 'win' | 'loss' | 'pending';
  priceAfter1h?: number;
  priceAfter2h?: number;
  priceAfter4h?: number;
} {
  let wouldHitStop = false;
  let wouldHitTarget = false;
  let timeToExit: number | undefined;
  let exitPrice = entry;
  
  const firstBarTime = bars[0]?.t || 0;
  let priceAfter1h: number | undefined;
  let priceAfter2h: number | undefined;
  let priceAfter4h: number | undefined;
  
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const minutesFromStart = (bar.t - firstBarTime) / (1000 * 60);
    
    if (!priceAfter1h && minutesFromStart >= 60) {
      priceAfter1h = bar.c;
    }
    if (!priceAfter2h && minutesFromStart >= 120) {
      priceAfter2h = bar.c;
    }
    if (!priceAfter4h && minutesFromStart >= 240) {
      priceAfter4h = bar.c;
    }
    
    if (direction === 'long') {
      if (bar.l <= stop) {
        wouldHitStop = true;
        exitPrice = stop;
        timeToExit = minutesFromStart;
        break;
      }
      if (bar.h >= target) {
        wouldHitTarget = true;
        exitPrice = target;
        timeToExit = minutesFromStart;
        break;
      }
    } else {
      if (bar.h >= stop) {
        wouldHitStop = true;
        exitPrice = stop;
        timeToExit = minutesFromStart;
        break;
      }
      if (bar.l <= target) {
        wouldHitTarget = true;
        exitPrice = target;
        timeToExit = minutesFromStart;
        break;
      }
    }
  }
  
  if (!wouldHitStop && !wouldHitTarget && bars.length > 0) {
    exitPrice = bars[bars.length - 1].c;
  }
  
  let hypotheticalPnlPercent: number;
  if (direction === 'long') {
    hypotheticalPnlPercent = ((exitPrice - entry) / entry) * 100;
  } else {
    hypotheticalPnlPercent = ((entry - exitPrice) / entry) * 100;
  }
  
  let outcome: 'win' | 'loss' | 'pending' = 'pending';
  if (wouldHitTarget) outcome = 'win';
  else if (wouldHitStop) outcome = 'loss';
  else if (hypotheticalPnlPercent > 0) outcome = 'win';
  else if (hypotheticalPnlPercent < 0) outcome = 'loss';
  
  return {
    wouldHitStop,
    wouldHitTarget,
    timeToExit,
    hypotheticalPnlPercent,
    outcome,
    priceAfter1h,
    priceAfter2h,
    priceAfter4h
  };
}

async function backfillOutcomes(daysBack: number = 7): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');
  console.log('Connected to MongoDB\n');
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  const decisions = await DecisionLog.find({
    signalTime: { $gte: cutoffDate },
    'hypotheticalOutcome.checkedAt': { $exists: false }
  }).sort({ signalTime: -1 });
  
  console.log(`Found ${decisions.length} decisions to backfill\n`);
  
  let processed = 0;
  let wins = 0;
  let losses = 0;
  
  for (const decision of decisions) {
    const entry = decision.wasInverted ? decision.invertedEntry! : decision.originalEntry;
    const stop = decision.wasInverted ? decision.invertedStop! : decision.originalStop;
    const target = decision.wasInverted ? decision.invertedTarget! : decision.originalTarget;
    const direction = decision.wasInverted ? decision.invertedDirection! : decision.originalDirection;
    
    if (!entry || !stop || !target) {
      console.log(`Skipping ${decision.symbol} - missing price data`);
      continue;
    }
    
    console.log(`Processing ${decision.symbol} ${decision.patternName} (${decision.decision})...`);
    
    const bars = await fetchBarsAfterSignal(decision.symbol, decision.signalTime, 4);
    
    if (bars.length === 0) {
      console.log(`  No bars found for ${decision.symbol}`);
      continue;
    }
    
    const outcome = simulateTradeOutcome(bars, entry, stop, target, direction);
    
    decision.hypotheticalOutcome = {
      checkedAt: new Date(),
      priceAfter1h: outcome.priceAfter1h,
      priceAfter2h: outcome.priceAfter2h,
      priceAfter4h: outcome.priceAfter4h,
      wouldHitStop: outcome.wouldHitStop,
      wouldHitTarget: outcome.wouldHitTarget,
      timeToExit: outcome.timeToExit,
      hypotheticalPnlPercent: outcome.hypotheticalPnlPercent,
      outcome: outcome.outcome
    };
    
    await decision.save();
    
    processed++;
    if (outcome.outcome === 'win') wins++;
    else if (outcome.outcome === 'loss') losses++;
    
    const icon = outcome.outcome === 'win' ? '✅' : outcome.outcome === 'loss' ? '❌' : '⏳';
    console.log(`  ${icon} ${outcome.outcome.toUpperCase()} | P&L: ${outcome.hypotheticalPnlPercent.toFixed(2)}% | Exit: ${outcome.timeToExit ? outcome.timeToExit.toFixed(0) + 'min' : 'EOD'}`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`Processed: ${processed}`);
  console.log(`Wins: ${wins} (${((wins/processed)*100).toFixed(1)}%)`);
  console.log(`Losses: ${losses} (${((losses/processed)*100).toFixed(1)}%)`);
  
  await mongoose.disconnect();
}

const daysArg = process.argv[2] ? parseInt(process.argv[2]) : 7;
backfillOutcomes(daysArg).catch(console.error);
