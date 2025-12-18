import fs from 'fs';

const data = JSON.parse(fs.readFileSync('../trade_reports/tradereport20251218.js', 'utf8'));

const closed = data.filter((t: any) => t.status === 'closed' && t.exitPrice && t.actualEntryPrice);
console.log('Closed trades with exit data:', closed.length);
console.log('');

let blockPnl = 0, allowPnl = 0;
let blockWins = 0, blockLosses = 0;
let allowWins = 0, allowLosses = 0;

console.log('=== BLOCKED (trend-aligned) ===');
for (const t of closed) {
  const trade = t as any;
  const trend = trade.marketConditions?.trend || trade.signalData?.context?.trend;
  const direction = trade.direction;
  const isAligned = (trend === 'up' && direction === 'long') || (trend === 'down' && direction === 'short');
  
  const entry = trade.actualEntryPrice;
  const exit = trade.exitPrice;
  const volume = trade.volume || 0.1;
  let pnl: number;
  if (direction === 'long') {
    pnl = (exit - entry) * volume;
  } else {
    pnl = (entry - exit) * volume;
  }
  
  if (isAligned) {
    blockPnl += pnl;
    if (pnl > 0.001) blockWins++;
    else if (pnl < -0.001) blockLosses++;
    console.log('BLOCK:', trade.symbol, '|', trade.patternName, '|', direction, 'in', trend, '| £' + pnl.toFixed(2));
  }
}

console.log('');
console.log('=== ALLOWED (counter-trend) ===');
for (const t of closed) {
  const trade = t as any;
  const trend = trade.marketConditions?.trend || trade.signalData?.context?.trend;
  const direction = trade.direction;
  const isAligned = (trend === 'up' && direction === 'long') || (trend === 'down' && direction === 'short');
  
  const entry = trade.actualEntryPrice;
  const exit = trade.exitPrice;
  const volume = trade.volume || 0.1;
  let pnl: number;
  if (direction === 'long') {
    pnl = (exit - entry) * volume;
  } else {
    pnl = (entry - exit) * volume;
  }
  
  const isCounterTrend = !isAligned;
  if (isCounterTrend) {
    allowPnl += pnl;
    if (pnl > 0.001) allowWins++;
    else if (pnl < -0.001) allowLosses++;
    console.log('ALLOW:', trade.symbol, '|', trade.patternName, '|', direction, 'in', trend, '| £' + pnl.toFixed(2));
  }
}

console.log('');
console.log('========================================');
console.log('=== DEC 18 SIMULATION RESULTS ===');
console.log('========================================');
console.log('');
console.log('BLOCKED (trend-aligned):');
console.log('  Wins:', blockWins, '| Losses:', blockLosses);
console.log('  P&L: £' + blockPnl.toFixed(2));
console.log('');
console.log('ALLOWED (counter-trend):');
console.log('  Wins:', allowWins, '| Losses:', allowLosses);
console.log('  P&L: £' + allowPnl.toFixed(2));
if (allowWins + allowLosses > 0) {
  console.log('  Win rate:', ((allowWins / (allowWins + allowLosses)) * 100).toFixed(1) + '%');
}
console.log('');
console.log('ACTUAL P&L: £' + (blockPnl + allowPnl).toFixed(2));
console.log('WITH FILTER: £' + allowPnl.toFixed(2));
console.log('SAVED: £' + (-blockPnl).toFixed(2));
