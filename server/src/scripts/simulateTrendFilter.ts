import fs from 'fs';

async function simulate() {
  const data = JSON.parse(fs.readFileSync('../trade_reports/tradereport20251218.js', 'utf8'));
  const trades = data.filter((t: any) => t.status === 'filled' || t.status === 'closed');
  
  console.log('Analyzing Dec 18 trade report');
  console.log('Total in report:', data.length);
  console.log('Filled/Closed:', trades.length);
  
  console.log('Today trades:', trades.length);
  console.log('');
  
  let blockPnl = 0, allowPnl = 0;
  let blockWins = 0, blockLosses = 0, blockNeutral = 0;
  let allowWins = 0, allowLosses = 0, allowNeutral = 0;
  
  console.log('=== BLOCKED (trend-aligned) ===');
  for (const t of trades) {
    const trade = t as any;
    const trend = trade.marketConditions?.trend || trade.signalData?.context?.trend || 'unknown';
    const direction = trade.direction || trade.signalData?.plan?.direction || 'unknown';
    const isTrendAligned = (trend === 'up' && direction === 'long') || 
                           (trend === 'down' && direction === 'short');
    const pnl = trade.pnlGbp || 0;
    const pattern = trade.patternName || trade.pattern?.name || 'unknown';
    
    if (isTrendAligned) {
      blockPnl += pnl;
      if (pnl > 0.001) blockWins++;
      else if (pnl < -0.001) blockLosses++;
      else blockNeutral++;
      console.log('BLOCK:', trade.symbol, '|', pattern, '|', direction, 'in', trend, '| £' + pnl.toFixed(2));
    }
  }
  
  console.log('');
  console.log('=== ALLOWED (counter-trend) ===');
  for (const t of trades) {
    const trade = t as any;
    const trend = trade.marketConditions?.trend || trade.signalData?.context?.trend || 'unknown';
    const direction = trade.direction || trade.signalData?.plan?.direction || 'unknown';
    const isTrendAligned = (trend === 'up' && direction === 'long') || 
                           (trend === 'down' && direction === 'short');
    const pnl = trade.pnlGbp || 0;
    const pattern = trade.patternName || trade.pattern?.name || 'unknown';
    
    const isCounterTrend = !isTrendAligned;
    if (isCounterTrend) {
      allowPnl += pnl;
      if (pnl > 0.001) allowWins++;
      else if (pnl < -0.001) allowLosses++;
      else allowNeutral++;
      console.log('ALLOW:', trade.symbol, '|', pattern, '|', direction, 'in', trend, '| £' + pnl.toFixed(2));
    }
  }
  
  console.log('');
  console.log('========================================');
  console.log('=== SIMULATION RESULTS (TODAY) ===');
  console.log('========================================');
  console.log('');
  console.log('BLOCKED trades (would NOT have taken):');
  console.log('  Count:', blockWins + blockLosses + blockNeutral);
  console.log('  Wins:', blockWins, '| Losses:', blockLosses, '| Neutral:', blockNeutral);
  console.log('  P&L: £' + blockPnl.toFixed(2));
  console.log('');
  console.log('ALLOWED trades (would have taken):');
  console.log('  Count:', allowWins + allowLosses + allowNeutral);
  console.log('  Wins:', allowWins, '| Losses:', allowLosses, '| Neutral:', allowNeutral);
  console.log('  P&L: £' + allowPnl.toFixed(2));
  if (allowWins + allowLosses > 0) {
    console.log('  Win rate:', ((allowWins / (allowWins + allowLosses)) * 100).toFixed(1) + '%');
  }
  console.log('');
  console.log('ACTUAL total P&L today: £' + (blockPnl + allowPnl).toFixed(2));
  console.log('WITH FILTER P&L would be: £' + allowPnl.toFixed(2));
  console.log('DIFFERENCE: £' + (allowPnl - (blockPnl + allowPnl)).toFixed(2));
}

simulate();
