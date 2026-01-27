const fs = require('fs');
const readline = require('readline');

async function analyze() {
  const fileStream = fs.createReadStream('v5_beta_golden_mean.log');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentMonth = 'Unknown';
  const monthlyStats = {};

  for await (const line of rl) {
    // Track time from Scanning or Processing lines
    // [COMPREHENSIVE] Scanning MSFT candle: 2025-01-28T11:35:00.000Z
    if (line.includes('[COMPREHENSIVE] Scanning')) {
      const match = line.match(/(\d{4}-\d{2})-\d{2}T/);
      if (match) {
        currentMonth = match[1];
      }
    }

    // Track Trades
    // [TRADE_CLOSE] META short | Entry: 601.50 | Exit: 611.97 | PnL: $-175.94 | Reason: stop_loss
    if (line.includes('[TRADE_CLOSE]')) {
      const pnlMatch = line.match(/PnL: \$(-?\d+\.\d+)/);
      if (pnlMatch) {
        const pnl = parseFloat(pnlMatch[1]);
        
        if (!monthlyStats[currentMonth]) {
          monthlyStats[currentMonth] = { pnl: 0, trades: 0, wins: 0 };
        }
        
        monthlyStats[currentMonth].pnl += pnl;
        monthlyStats[currentMonth].trades += 1;
        if (pnl > 0) monthlyStats[currentMonth].wins += 1;
      }
    }
  }

  console.log('Month | Trades | PnL | Win Rate');
  console.log('---|---|---|---');
  const sortedMonths = Object.keys(monthlyStats).sort();
  for (const m of sortedMonths) {
    const s = monthlyStats[m];
    const wr = ((s.wins / s.trades) * 100).toFixed(1);
    console.log(`${m} | ${s.trades} | $${s.pnl.toFixed(2)} | ${wr}%`);
  }
}

analyze();
