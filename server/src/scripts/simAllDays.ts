import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tradeReportsDir = path.join(__dirname, '../../../trade_reports');

interface Trade {
  symbol: string;
  direction: string;
  patternName: string;
  marketConditions?: { trend: string };
  signalData?: { context?: { trend: string } };
  actualEntryPrice?: number;
  exitPrice?: number;
  volume?: number;
  status: string;
}

function calculatePnl(trade: Trade): number {
  if (!trade.actualEntryPrice || !trade.exitPrice) return 0;
  const volume = trade.volume || 0.1;
  if (trade.direction === 'long') {
    return (trade.exitPrice - trade.actualEntryPrice) * volume;
  } else {
    return (trade.actualEntryPrice - trade.exitPrice) * volume;
  }
}

function simulateDay(filename: string): { date: string; blocked: { count: number; wins: number; losses: number; pnl: number }; allowed: { count: number; wins: number; losses: number; pnl: number } } | null {
  const filePath = path.join(tradeReportsDir, filename);
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return null;
  const data = JSON.parse(content) as Trade[];
  
  const date = filename.replace('tradereport', '').replace('.js', '');
  
  const closedTrades = data.filter(t => 
    (t.status === 'filled' || t.status === 'closed') && 
    t.actualEntryPrice && 
    t.exitPrice
  );
  
  let blockedPnl = 0, allowedPnl = 0;
  let blockedWins = 0, blockedLosses = 0;
  let allowedWins = 0, allowedLosses = 0;
  
  for (const trade of closedTrades) {
    const trend = trade.marketConditions?.trend || trade.signalData?.context?.trend || '';
    const direction = trade.direction;
    const isAligned = (trend === 'up' && direction === 'long') || (trend === 'down' && direction === 'short');
    const pnl = calculatePnl(trade);
    
    if (isAligned) {
      blockedPnl += pnl;
      if (pnl > 0.001) blockedWins++;
      else if (pnl < -0.001) blockedLosses++;
    } else {
      allowedPnl += pnl;
      if (pnl > 0.001) allowedWins++;
      else if (pnl < -0.001) allowedLosses++;
    }
  }
  
  return {
    date,
    blocked: { count: blockedWins + blockedLosses, wins: blockedWins, losses: blockedLosses, pnl: blockedPnl },
    allowed: { count: allowedWins + allowedLosses, wins: allowedWins, losses: allowedLosses, pnl: allowedPnl }
  };
}

// Run simulation on all days
const files = fs.readdirSync(tradeReportsDir).filter(f => f.startsWith('tradereport') && f.endsWith('.js'));

let totalBlockedPnl = 0, totalAllowedPnl = 0;
let totalBlockedWins = 0, totalBlockedLosses = 0;
let totalAllowedWins = 0, totalAllowedLosses = 0;

console.log('=== SIMULATION RESULTS BY DAY ===\n');
console.log('Date       | Blocked P&L | Allowed P&L | Actual P&L | With Filter | Saved');
console.log('-'.repeat(80));

for (const file of files.sort()) {
  const result = simulateDay(file);
  if (!result) continue;
  const actualPnl = result.blocked.pnl + result.allowed.pnl;
  const saved = result.allowed.pnl - actualPnl;
  
  totalBlockedPnl += result.blocked.pnl;
  totalAllowedPnl += result.allowed.pnl;
  totalBlockedWins += result.blocked.wins;
  totalBlockedLosses += result.blocked.losses;
  totalAllowedWins += result.allowed.wins;
  totalAllowedLosses += result.allowed.losses;
  
  console.log(
    `${result.date} | £${result.blocked.pnl.toFixed(2).padStart(10)} | £${result.allowed.pnl.toFixed(2).padStart(10)} | £${actualPnl.toFixed(2).padStart(9)} | £${result.allowed.pnl.toFixed(2).padStart(10)} | £${saved.toFixed(2).padStart(6)}`
  );
}

console.log('-'.repeat(80));

const totalActual = totalBlockedPnl + totalAllowedPnl;
const totalSaved = totalAllowedPnl - totalActual;

console.log(
  `TOTAL      | £${totalBlockedPnl.toFixed(2).padStart(10)} | £${totalAllowedPnl.toFixed(2).padStart(10)} | £${totalActual.toFixed(2).padStart(9)} | £${totalAllowedPnl.toFixed(2).padStart(10)} | £${totalSaved.toFixed(2).padStart(6)}`
);

console.log('\n========================================');
console.log('=== OVERALL SUMMARY ===');
console.log('========================================\n');

console.log('BLOCKED (trend-aligned):');
console.log(`  Total trades: ${totalBlockedWins + totalBlockedLosses}`);
console.log(`  Wins: ${totalBlockedWins} | Losses: ${totalBlockedLosses}`);
if (totalBlockedWins + totalBlockedLosses > 0) {
  console.log(`  Win rate: ${((totalBlockedWins / (totalBlockedWins + totalBlockedLosses)) * 100).toFixed(1)}%`);
}
console.log(`  P&L: £${totalBlockedPnl.toFixed(2)}`);

console.log('\nALLOWED (counter-trend + sideways):');
console.log(`  Total trades: ${totalAllowedWins + totalAllowedLosses}`);
console.log(`  Wins: ${totalAllowedWins} | Losses: ${totalAllowedLosses}`);
if (totalAllowedWins + totalAllowedLosses > 0) {
  console.log(`  Win rate: ${((totalAllowedWins / (totalAllowedWins + totalAllowedLosses)) * 100).toFixed(1)}%`);
}
console.log(`  P&L: £${totalAllowedPnl.toFixed(2)}`);

console.log('\n--- BOTTOM LINE ---');
console.log(`ACTUAL TOTAL P&L: £${totalActual.toFixed(2)}`);
console.log(`WITH FILTER P&L:  £${totalAllowedPnl.toFixed(2)}`);
console.log(`IMPROVEMENT:      £${(-totalBlockedPnl).toFixed(2)} saved`);
