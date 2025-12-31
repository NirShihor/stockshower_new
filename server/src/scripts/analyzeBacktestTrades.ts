import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Trade {
  symbol: string;
  entryTime: string;
  exitTime: string;
  direction: string;
  pnl: number;
  exitReason: string;
  signal: {
    score: number;
    pattern: { name: string };
    context: {
      trend: string;
      atSupport: boolean;
      atResistance: boolean;
      atr: number;
      volumeFactor: number;
      isHighVolume: boolean;
      maSlope: number;
      h1Trend: string;
    };
  };
}

function analyzeBacktest() {
  const resultsPath = path.resolve(__dirname, '../../backtest_results_full.json');
  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const trades: Trade[] = data.trades;

  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl <= 0);

  console.log('\n=== DEEP TRADE ANALYSIS ===\n');
  console.log(`Total: ${trades.length} | Winners: ${winners.length} | Losers: ${losers.length}`);
  console.log(`Win Rate: ${(winners.length / trades.length * 100).toFixed(1)}%\n`);

  // 1. Time of day analysis
  console.log('📊 TIME OF DAY ANALYSIS:');
  const hourBuckets: { [key: number]: { wins: number; losses: number } } = {};
  trades.forEach(t => {
    const hour = new Date(t.entryTime).getUTCHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { wins: 0, losses: 0 };
    if (t.pnl > 0) hourBuckets[hour].wins++;
    else hourBuckets[hour].losses++;
  });
  Object.entries(hourBuckets)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .forEach(([hour, stats]) => {
      const total = stats.wins + stats.losses;
      const wr = (stats.wins / total * 100).toFixed(1);
      console.log(`  ${hour.padStart(2, '0')}:00 UTC | ${total.toString().padStart(3)} trades | WR: ${wr}%`);
    });

  // 2. Score analysis
  console.log('\n📊 SCORE ANALYSIS:');
  const scoreBuckets: { [key: string]: { wins: number; losses: number; pnl: number } } = {
    '70-79': { wins: 0, losses: 0, pnl: 0 },
    '80-89': { wins: 0, losses: 0, pnl: 0 },
    '90-99': { wins: 0, losses: 0, pnl: 0 },
    '100': { wins: 0, losses: 0, pnl: 0 },
  };
  trades.forEach(t => {
    const score = t.signal.score;
    let bucket = '70-79';
    if (score >= 100) bucket = '100';
    else if (score >= 90) bucket = '90-99';
    else if (score >= 80) bucket = '80-89';
    
    if (t.pnl > 0) scoreBuckets[bucket].wins++;
    else scoreBuckets[bucket].losses++;
    scoreBuckets[bucket].pnl += t.pnl;
  });
  Object.entries(scoreBuckets).forEach(([bucket, stats]) => {
    const total = stats.wins + stats.losses;
    if (total === 0) return;
    const wr = (stats.wins / total * 100).toFixed(1);
    console.log(`  Score ${bucket} | ${total.toString().padStart(3)} trades | WR: ${wr}% | PnL: $${stats.pnl.toFixed(2)}`);
  });

  // 3. ATR analysis (volatility)
  console.log('\n📊 VOLATILITY (ATR) ANALYSIS:');
  const atrValues = trades.map(t => t.signal.context.atr);
  const atrMedian = atrValues.sort((a, b) => a - b)[Math.floor(atrValues.length / 2)];
  const lowATR = trades.filter(t => t.signal.context.atr < atrMedian);
  const highATR = trades.filter(t => t.signal.context.atr >= atrMedian);
  const lowATRWins = lowATR.filter(t => t.pnl > 0).length;
  const highATRWins = highATR.filter(t => t.pnl > 0).length;
  console.log(`  Low ATR (<${atrMedian.toFixed(3)}): ${lowATR.length} trades | WR: ${(lowATRWins/lowATR.length*100).toFixed(1)}% | PnL: $${lowATR.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);
  console.log(`  High ATR (>=${atrMedian.toFixed(3)}): ${highATR.length} trades | WR: ${(highATRWins/highATR.length*100).toFixed(1)}% | PnL: $${highATR.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);

  // 4. Volume analysis
  console.log('\n📊 VOLUME ANALYSIS:');
  const highVol = trades.filter(t => t.signal.context.isHighVolume);
  const lowVol = trades.filter(t => !t.signal.context.isHighVolume);
  const highVolWins = highVol.filter(t => t.pnl > 0).length;
  const lowVolWins = lowVol.filter(t => t.pnl > 0).length;
  console.log(`  High Volume: ${highVol.length} trades | WR: ${highVol.length > 0 ? (highVolWins/highVol.length*100).toFixed(1) : 'N/A'}% | PnL: $${highVol.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);
  console.log(`  Normal Volume: ${lowVol.length} trades | WR: ${lowVol.length > 0 ? (lowVolWins/lowVol.length*100).toFixed(1) : 'N/A'}% | PnL: $${lowVol.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);

  // 5. Trend alignment analysis
  console.log('\n📊 TREND ALIGNMENT ANALYSIS:');
  const trendAligned = trades.filter(t => {
    const { trend } = t.signal.context;
    const { direction } = t;
    return (direction === 'long' && trend === 'up') || (direction === 'short' && trend === 'down');
  });
  const counterTrend = trades.filter(t => {
    const { trend } = t.signal.context;
    const { direction } = t;
    return (direction === 'long' && trend === 'down') || (direction === 'short' && trend === 'up');
  });
  const sideways = trades.filter(t => t.signal.context.trend === 'sideways');
  
  const trendWins = trendAligned.filter(t => t.pnl > 0).length;
  const counterWins = counterTrend.filter(t => t.pnl > 0).length;
  const sidewaysWins = sideways.filter(t => t.pnl > 0).length;
  
  console.log(`  Trend-aligned: ${trendAligned.length} trades | WR: ${trendAligned.length > 0 ? (trendWins/trendAligned.length*100).toFixed(1) : 'N/A'}% | PnL: $${trendAligned.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);
  console.log(`  Counter-trend: ${counterTrend.length} trades | WR: ${counterTrend.length > 0 ? (counterWins/counterTrend.length*100).toFixed(1) : 'N/A'}% | PnL: $${counterTrend.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);
  console.log(`  Sideways: ${sideways.length} trades | WR: ${sideways.length > 0 ? (sidewaysWins/sideways.length*100).toFixed(1) : 'N/A'}% | PnL: $${sideways.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);

  // 6. H1 vs 5m trend alignment
  console.log('\n📊 MULTI-TIMEFRAME TREND ALIGNMENT:');
  const bothAligned = trades.filter(t => t.signal.context.trend === t.signal.context.h1Trend);
  const divergent = trades.filter(t => t.signal.context.trend !== t.signal.context.h1Trend);
  const bothWins = bothAligned.filter(t => t.pnl > 0).length;
  const divWins = divergent.filter(t => t.pnl > 0).length;
  console.log(`  5m & H1 aligned: ${bothAligned.length} trades | WR: ${bothAligned.length > 0 ? (bothWins/bothAligned.length*100).toFixed(1) : 'N/A'}% | PnL: $${bothAligned.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);
  console.log(`  5m & H1 divergent: ${divergent.length} trades | WR: ${divergent.length > 0 ? (divWins/divergent.length*100).toFixed(1) : 'N/A'}% | PnL: $${divergent.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);

  // 7. Support/Resistance analysis
  console.log('\n📊 S/R LEVEL ANALYSIS:');
  const atLevel = trades.filter(t => 
    (t.direction === 'long' && t.signal.context.atSupport) ||
    (t.direction === 'short' && t.signal.context.atResistance)
  );
  const notAtLevel = trades.filter(t => 
    !((t.direction === 'long' && t.signal.context.atSupport) ||
    (t.direction === 'short' && t.signal.context.atResistance))
  );
  const atLevelWins = atLevel.filter(t => t.pnl > 0).length;
  const notAtLevelWins = notAtLevel.filter(t => t.pnl > 0).length;
  console.log(`  At key S/R: ${atLevel.length} trades | WR: ${atLevel.length > 0 ? (atLevelWins/atLevel.length*100).toFixed(1) : 'N/A'}% | PnL: $${atLevel.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);
  console.log(`  Not at S/R: ${notAtLevel.length} trades | WR: ${notAtLevel.length > 0 ? (notAtLevelWins/notAtLevel.length*100).toFixed(1) : 'N/A'}% | PnL: $${notAtLevel.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);

  // 8. Symbol analysis
  console.log('\n📊 SYMBOL PERFORMANCE:');
  const symbolStats: { [key: string]: { wins: number; losses: number; pnl: number } } = {};
  trades.forEach(t => {
    if (!symbolStats[t.symbol]) symbolStats[t.symbol] = { wins: 0, losses: 0, pnl: 0 };
    if (t.pnl > 0) symbolStats[t.symbol].wins++;
    else symbolStats[t.symbol].losses++;
    symbolStats[t.symbol].pnl += t.pnl;
  });
  Object.entries(symbolStats)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .forEach(([symbol, stats]) => {
      const total = stats.wins + stats.losses;
      const wr = (stats.wins / total * 100).toFixed(1);
      console.log(`  ${symbol.padEnd(5)} | ${total.toString().padStart(3)} trades | WR: ${wr}% | PnL: $${stats.pnl.toFixed(2)}`);
    });

  // 9. MA Slope analysis
  console.log('\n📊 MA SLOPE (TREND STRENGTH) ANALYSIS:');
  const strongTrend = trades.filter(t => Math.abs(t.signal.context.maSlope) > 5);
  const weakTrend = trades.filter(t => Math.abs(t.signal.context.maSlope) <= 5);
  const strongWins = strongTrend.filter(t => t.pnl > 0).length;
  const weakWins = weakTrend.filter(t => t.pnl > 0).length;
  console.log(`  Strong slope (|slope|>5): ${strongTrend.length} trades | WR: ${strongTrend.length > 0 ? (strongWins/strongTrend.length*100).toFixed(1) : 'N/A'}% | PnL: $${strongTrend.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);
  console.log(`  Weak slope (|slope|<=5): ${weakTrend.length} trades | WR: ${weakTrend.length > 0 ? (weakWins/weakTrend.length*100).toFixed(1) : 'N/A'}% | PnL: $${weakTrend.reduce((s,t)=>s+t.pnl,0).toFixed(2)}`);

  // 10. Exit reason analysis
  console.log('\n📊 EXIT REASON ANALYSIS:');
  const exitReasons: { [key: string]: { count: number; pnl: number } } = {};
  trades.forEach(t => {
    if (!exitReasons[t.exitReason]) exitReasons[t.exitReason] = { count: 0, pnl: 0 };
    exitReasons[t.exitReason].count++;
    exitReasons[t.exitReason].pnl += t.pnl;
  });
  Object.entries(exitReasons).forEach(([reason, stats]) => {
    console.log(`  ${reason.padEnd(15)} | ${stats.count.toString().padStart(3)} trades | PnL: $${stats.pnl.toFixed(2)}`);
  });

  // 11. Winning trade characteristics
  console.log('\n📊 WINNING TRADE CHARACTERISTICS:');
  const winnerScoreAvg = winners.reduce((s, t) => s + t.signal.score, 0) / winners.length;
  const loserScoreAvg = losers.reduce((s, t) => s + t.signal.score, 0) / losers.length;
  const winnerATRAvg = winners.reduce((s, t) => s + t.signal.context.atr, 0) / winners.length;
  const loserATRAvg = losers.reduce((s, t) => s + t.signal.context.atr, 0) / losers.length;
  const winnerVolAvg = winners.reduce((s, t) => s + t.signal.context.volumeFactor, 0) / winners.length;
  const loserVolAvg = losers.reduce((s, t) => s + t.signal.context.volumeFactor, 0) / losers.length;
  
  console.log(`  Avg Score:  Winners=${winnerScoreAvg.toFixed(1)} | Losers=${loserScoreAvg.toFixed(1)}`);
  console.log(`  Avg ATR:    Winners=${winnerATRAvg.toFixed(4)} | Losers=${loserATRAvg.toFixed(4)}`);
  console.log(`  Avg Volume: Winners=${winnerVolAvg.toFixed(2)}x | Losers=${loserVolAvg.toFixed(2)}x`);

  // 12. Day of week analysis
  console.log('\n📊 DAY OF WEEK ANALYSIS:');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayBuckets: { [key: number]: { wins: number; losses: number; pnl: number } } = {};
  trades.forEach(t => {
    const day = new Date(t.entryTime).getUTCDay();
    if (!dayBuckets[day]) dayBuckets[day] = { wins: 0, losses: 0, pnl: 0 };
    if (t.pnl > 0) dayBuckets[day].wins++;
    else dayBuckets[day].losses++;
    dayBuckets[day].pnl += t.pnl;
  });
  Object.entries(dayBuckets)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .forEach(([day, stats]) => {
      const total = stats.wins + stats.losses;
      const wr = (stats.wins / total * 100).toFixed(1);
      console.log(`  ${dayNames[parseInt(day)]} | ${total.toString().padStart(3)} trades | WR: ${wr}% | PnL: $${stats.pnl.toFixed(2)}`);
    });

  console.log('\n=== END ANALYSIS ===\n');
}

analyzeBacktest();
