const fs = require('fs');
const data = JSON.parse(fs.readFileSync('../trade_reports/tradereport20251223.js', 'utf8'));

console.log('Total trades:', data.length);

let filled = 0, closed = 0, pending = 0, cancelled = 0;
let wins = 0, losses = 0;
let totalPnl = 0;
let longs = 0, shorts = 0;
let longWins = 0, shortWins = 0;
let longPnl = 0, shortPnl = 0;

data.forEach(t => {
  if (t.status === 'filled') filled++;
  else if (t.status === 'closed') closed++;
  else if (t.status === 'pending') pending++;
  else if (t.status === 'cancelled') cancelled++;
  
  if (t.status === 'closed' && t.pnlPercentage != null) {
    const pnl = t.pnlPercentage;
    totalPnl += pnl;
    
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
    
    if (t.direction === 'long') {
      longs++;
      longPnl += pnl;
      if (pnl > 0) longWins++;
    } else if (t.direction === 'short') {
      shorts++;
      shortPnl += pnl;
      if (pnl > 0) shortWins++;
    }
  }
});

console.log('\n--- Status Breakdown ---');
console.log('Filled (open):', filled);
console.log('Closed:', closed);
console.log('Pending:', pending);
console.log('Cancelled:', cancelled);

console.log('\n--- Closed Trade Performance ---');
console.log('Wins:', wins);
console.log('Losses:', losses);
console.log('Win Rate:', (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) + '%' : 'N/A');
console.log('Total P&L %:', totalPnl.toFixed(2) + '%');

console.log('\n--- By Direction (closed only) ---');
console.log('LONG:', longs, 'trades, wins:', longWins, '(' + (longs > 0 ? ((longWins/longs)*100).toFixed(1) : 0) + '%), P&L:', longPnl.toFixed(2) + '%');
console.log('SHORT:', shorts, 'trades, wins:', shortWins, '(' + (shorts > 0 ? ((shortWins/shorts)*100).toFixed(1) : 0) + '%), P&L:', shortPnl.toFixed(2) + '%');

// Check time distribution
const closedTrades = data.filter(t => t.status === 'closed' && t.pnlPercentage != null);
const byHour = {};
closedTrades.forEach(t => {
  if (t.signalTime && t.signalTime.$date) {
    const hour = new Date(t.signalTime.$date).getUTCHours();
    if (!byHour[hour]) byHour[hour] = { count: 0, wins: 0 };
    byHour[hour].count++;
    if (t.pnlPercentage > 0) byHour[hour].wins++;
  }
});

console.log('\n--- By Hour (UTC) ---');
Object.keys(byHour).sort((a,b) => a-b).forEach(h => {
  const d = byHour[h];
  console.log(`Hour ${h}: ${d.count} trades, ${d.wins} wins (${((d.wins/d.count)*100).toFixed(0)}%)`);
});

// Pattern analysis
const byPattern = {};
closedTrades.forEach(t => {
  const p = t.patternName || 'unknown';
  if (!byPattern[p]) byPattern[p] = { count: 0, wins: 0, pnl: 0 };
  byPattern[p].count++;
  if (t.pnlPercentage > 0) byPattern[p].wins++;
  byPattern[p].pnl += t.pnlPercentage;
});

console.log('\n--- By Pattern ---');
Object.entries(byPattern).sort((a,b) => b[1].count - a[1].count).forEach(([p, d]) => {
  console.log(`${p}: ${d.count} trades, ${d.wins} wins (${((d.wins/d.count)*100).toFixed(0)}%), P&L: ${d.pnl.toFixed(2)}%`);
});
