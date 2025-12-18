const trades = [
  { symbol: 'V.N', type: 'sell', profit: -0.14, signal: 'carry-over', trend: '' },
  { symbol: 'MA.N', type: 'sell', profit: -0.10, signal: 'carry-over', trend: '' },
  { symbol: 'TMO.N', type: 'sell', profit: -0.04, signal: 'Bearish Engulfing', trend: 'down' },
  { symbol: 'KO.N', type: 'sell', profit: -0.12, signal: 'Bearish Engulfing', trend: 'down' },
  { symbol: 'KO.N', type: 'sell', profit: -0.07, signal: 'Dark Cloud Cover', trend: 'down' },
  { symbol: 'WFC.N', type: 'buy', profit: -0.35, signal: 'Morning Star', trend: 'sideways' },
  { symbol: 'PEP.O', type: 'sell', profit: -0.01, signal: 'Three Inside Down', trend: 'down' },
  { symbol: 'NKE.N', type: 'sell', profit: 0.23, signal: 'Tweezer Top', trend: 'down' },
  { symbol: 'JNJ.N', type: 'sell', profit: 0.19, signal: 'Bearish Engulfing', trend: 'down' },
  { symbol: 'WFC.N', type: 'sell', profit: 0.26, signal: 'Evening Star', trend: 'down' },
  { symbol: 'XOM.N', type: 'buy', profit: -0.07, signal: 'Bullish Engulfing', trend: 'up' },
  { symbol: 'JPM.N', type: 'buy', profit: -0.29, signal: 'Morning Star', trend: 'up' },
  { symbol: 'JNJ.N', type: 'sell', profit: 0.11, signal: 'Three Black Crows', trend: 'down' },
  { symbol: 'MA.N', type: 'buy', profit: -0.04, signal: 'Three Inside Up', trend: 'up' },
  { symbol: 'WFC.N', type: 'sell', profit: 0.21, signal: 'Tweezer Top', trend: 'down' },
  { symbol: 'NVDA.O', type: 'buy', profit: -0.33, signal: 'Three Inside Up', trend: 'up' },
  { symbol: 'MA.N', type: 'sell', profit: -0.17, signal: 'Three Inside Down', trend: 'down' },
  { symbol: 'META.O', type: 'sell', profit: 0.12, signal: 'Tweezer Top', trend: 'up' },
  { symbol: 'TSLA.O', type: 'sell', profit: -0.02, signal: 'Tweezer Top', trend: 'up' },
  { symbol: 'CSCO.O', type: 'sell', profit: -0.01, signal: 'Evening Star', trend: 'sideways' },
  { symbol: 'JNJ.N', type: 'sell', profit: -0.13, signal: 'Three Black Crows', trend: 'down' },
  { symbol: 'ADBE.O', type: 'buy', profit: 0.21, signal: 'Bullish Engulfing', trend: 'down' },
  { symbol: 'JPM.N', type: 'sell', profit: -0.30, signal: 'Tweezer Top', trend: 'down' },
  { symbol: 'XOM.N', type: 'buy', profit: 0.06, signal: 'Morning Star', trend: 'sideways' },
  { symbol: 'NVDA.O', type: 'buy', profit: -0.08, signal: 'Bullish Marubozu', trend: 'up' },
  { symbol: 'TMO.N', type: 'buy', profit: -0.02, signal: 'Tweezer Bottom', trend: 'up' },
  { symbol: 'ADBE.O', type: 'buy', profit: 0.03, signal: 'Tweezer Bottom', trend: 'up' },
  { symbol: 'MRK.N', type: 'buy', profit: 0.06, signal: 'Tweezer Bottom', trend: 'up' },
  { symbol: 'NKE.N', type: 'sell', profit: -0.34, signal: 'Bearish Engulfing', trend: 'down' },
  { symbol: 'NVDA.O', type: 'sell', profit: -0.07, signal: 'Tweezer Top', trend: 'down' },
  { symbol: 'NFLX.O', type: 'sell', profit: -0.01, signal: 'Three Black Crows', trend: 'down' },
  { symbol: 'META.O', type: 'sell', profit: -0.07, signal: 'Tweezer Top', trend: 'down' },
  { symbol: 'NKE.N', type: 'buy', profit: 0.10, signal: 'Tweezer Bottom', trend: 'down' },
  { symbol: 'JPM.N', type: 'buy', profit: -0.16, signal: 'Morning Star', trend: 'down' },
  { symbol: 'TMO.N', type: 'buy', profit: -0.01, signal: 'Bullish Engulfing', trend: 'up' },
  { symbol: 'NFLX.O', type: 'buy', profit: -0.01, signal: 'Morning Star', trend: 'down' },
  { symbol: 'WFC.N', type: 'sell', profit: -0.13, signal: 'Dark Cloud Cover', trend: 'down' },
  { symbol: 'JPM.N', type: 'sell', profit: -0.02, signal: 'Dark Cloud Cover', trend: 'down' },
  { symbol: 'CRM.N', type: 'sell', profit: -0.19, signal: 'Dark Cloud Cover', trend: 'down' },
  { symbol: 'JPM.N', type: 'sell', profit: 0.01, signal: 'Tweezer Top', trend: 'down' },
  { symbol: 'UNH.N', type: 'sell', profit: -0.06, signal: 'Three Inside Down', trend: 'sideways' },
  { symbol: 'CMCSA.O', type: 'buy', profit: -0.07, signal: 'Bullish Engulfing', trend: 'up' },
  { symbol: 'JPM.N', type: 'buy', profit: -0.07, signal: 'Tweezer Bottom', trend: 'down' },
  { symbol: 'TMO.N', type: 'buy', profit: -0.05, signal: 'Morning Star', trend: 'up' },
];

let blockedPnl = 0, allowedPnl = 0;
let blockedWins = 0, blockedLosses = 0;
let allowedWins = 0, allowedLosses = 0;

console.log('=== BLOCKED (trend-aligned) ===');
for (const t of trades) {
  if (!t.trend) continue;
  const direction = t.type === 'buy' ? 'long' : 'short';
  const isAligned = (t.trend === 'up' && direction === 'long') || (t.trend === 'down' && direction === 'short');
  
  if (isAligned) {
    blockedPnl += t.profit;
    if (t.profit > 0.001) blockedWins++;
    else if (t.profit < -0.001) blockedLosses++;
    console.log('BLOCK:', t.symbol, '|', t.signal, '|', direction, 'in', t.trend, '| £' + t.profit.toFixed(2));
  }
}

console.log('');
console.log('=== ALLOWED (counter-trend + sideways) ===');
for (const t of trades) {
  if (!t.trend) continue;
  const direction = t.type === 'buy' ? 'long' : 'short';
  const isAligned = (t.trend === 'up' && direction === 'long') || (t.trend === 'down' && direction === 'short');
  
  if (!isAligned) {
    allowedPnl += t.profit;
    if (t.profit > 0.001) allowedWins++;
    else if (t.profit < -0.001) allowedLosses++;
    console.log('ALLOW:', t.symbol, '|', t.signal, '|', direction, 'in', t.trend, '| £' + t.profit.toFixed(2));
  }
}

console.log('');
console.log('========================================');
console.log('=== DEC 18 SIMULATION RESULTS ===');
console.log('========================================');
console.log('');
console.log('BLOCKED (trend-aligned):');
console.log('  Count:', blockedWins + blockedLosses);
console.log('  Wins:', blockedWins, '| Losses:', blockedLosses);
console.log('  P&L: £' + blockedPnl.toFixed(2));
console.log('');
console.log('ALLOWED (counter-trend + sideways):');
console.log('  Count:', allowedWins + allowedLosses);
console.log('  Wins:', allowedWins, '| Losses:', allowedLosses);
console.log('  P&L: £' + allowedPnl.toFixed(2));
if (allowedWins + allowedLosses > 0) {
  console.log('  Win rate:', ((allowedWins / (allowedWins + allowedLosses)) * 100).toFixed(1) + '%');
}
console.log('');
console.log('ACTUAL P&L (all trades): £-1.98');
console.log('WITH FILTER P&L would be: £' + allowedPnl.toFixed(2));
console.log('DIFFERENCE: £' + (allowedPnl - (-1.98)).toFixed(2) + ' better');
