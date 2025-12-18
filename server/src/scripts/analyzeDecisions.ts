import mongoose from 'mongoose';
import { DecisionLog } from '../db/models/DecisionLog.js';
import dotenv from 'dotenv';

dotenv.config();

async function analyzeDecisions(dateStr?: string): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');
  console.log('Connected to MongoDB\n');
  
  let dateFilter: any = {};
  if (dateStr) {
    const startDate = new Date(dateStr);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(dateStr);
    endDate.setUTCHours(23, 59, 59, 999);
    dateFilter = { signalTime: { $gte: startDate, $lte: endDate } };
  }
  
  const decisions = await DecisionLog.find(dateFilter).sort({ signalTime: -1 });
  
  console.log(`Found ${decisions.length} logged decisions\n`);
  console.log('='.repeat(100));
  
  const stats = {
    total: 0,
    byDecision: {
      invert: { count: 0, wins: 0, losses: 0, totalPnl: 0 },
      skip: { count: 0, wins: 0, losses: 0, totalPnl: 0 },
      pass: { count: 0, wins: 0, losses: 0, totalPnl: 0 }
    },
    byTimeOfDay: new Map<string, { count: number; wins: number; losses: number; totalPnl: number }>(),
    byPattern: new Map<string, { count: number; wins: number; losses: number; totalPnl: number }>()
  };
  
  for (const d of decisions) {
    stats.total++;
    
    const decisionType = d.decision as 'invert' | 'skip' | 'pass';
    stats.byDecision[decisionType].count++;
    
    if (!stats.byTimeOfDay.has(d.timeOfDay)) {
      stats.byTimeOfDay.set(d.timeOfDay, { count: 0, wins: 0, losses: 0, totalPnl: 0 });
    }
    stats.byTimeOfDay.get(d.timeOfDay)!.count++;
    
    if (!stats.byPattern.has(d.patternName)) {
      stats.byPattern.set(d.patternName, { count: 0, wins: 0, losses: 0, totalPnl: 0 });
    }
    stats.byPattern.get(d.patternName)!.count++;
    
    if (d.hypotheticalOutcome) {
      const outcome = d.hypotheticalOutcome.outcome;
      const pnl = d.hypotheticalOutcome.hypotheticalPnlPercent || 0;
      
      if (outcome === 'win') {
        stats.byDecision[decisionType].wins++;
        stats.byTimeOfDay.get(d.timeOfDay)!.wins++;
        stats.byPattern.get(d.patternName)!.wins++;
      } else if (outcome === 'loss') {
        stats.byDecision[decisionType].losses++;
        stats.byTimeOfDay.get(d.timeOfDay)!.losses++;
        stats.byPattern.get(d.patternName)!.losses++;
      }
      
      stats.byDecision[decisionType].totalPnl += pnl;
      stats.byTimeOfDay.get(d.timeOfDay)!.totalPnl += pnl;
      stats.byPattern.get(d.patternName)!.totalPnl += pnl;
    }
    
    const icon = d.decision === 'invert' ? '🔄' : d.decision === 'skip' ? '❌' : '✅';
    const outcomeIcon = d.hypotheticalOutcome?.outcome === 'win' ? '💰' : 
                        d.hypotheticalOutcome?.outcome === 'loss' ? '💸' : '⏳';
    const pnlStr = d.hypotheticalOutcome?.hypotheticalPnlPercent 
      ? `${d.hypotheticalOutcome.hypotheticalPnlPercent > 0 ? '+' : ''}${d.hypotheticalOutcome.hypotheticalPnlPercent.toFixed(2)}%`
      : 'N/A';
    
    console.log(`${icon} ${d.symbol.padEnd(6)} | ${d.patternName.padEnd(25)} | ${d.decision.padEnd(6)} | ${d.timeOfDay.padEnd(12)} | ${outcomeIcon} ${pnlStr.padEnd(8)} | ${d.decisionReason.substring(0, 50)}...`);
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY BY DECISION TYPE');
  console.log('='.repeat(100));
  
  for (const [type, data] of Object.entries(stats.byDecision)) {
    if (data.count === 0) continue;
    const winRate = data.wins + data.losses > 0 
      ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) 
      : 'N/A';
    const avgPnl = data.wins + data.losses > 0 
      ? (data.totalPnl / (data.wins + data.losses)).toFixed(2) 
      : 'N/A';
    console.log(`${type.toUpperCase().padEnd(8)} | Count: ${data.count.toString().padEnd(4)} | Wins: ${data.wins.toString().padEnd(3)} | Losses: ${data.losses.toString().padEnd(3)} | Win Rate: ${winRate}% | Avg P&L: ${avgPnl}%`);
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY BY TIME OF DAY');
  console.log('='.repeat(100));
  
  for (const [period, data] of stats.byTimeOfDay) {
    if (data.count === 0) continue;
    const winRate = data.wins + data.losses > 0 
      ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) 
      : 'N/A';
    const avgPnl = data.wins + data.losses > 0 
      ? (data.totalPnl / (data.wins + data.losses)).toFixed(2) 
      : 'N/A';
    console.log(`${period.padEnd(12)} | Count: ${data.count.toString().padEnd(4)} | Wins: ${data.wins.toString().padEnd(3)} | Losses: ${data.losses.toString().padEnd(3)} | Win Rate: ${winRate}% | Avg P&L: ${avgPnl}%`);
  }
  
  if (stats.byPattern.size > 0) {
    console.log('\n' + '='.repeat(100));
    console.log('TOP PATTERNS BY COUNT');
    console.log('='.repeat(100));
    
    const sortedPatterns = Array.from(stats.byPattern.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
    
    for (const [pattern, data] of sortedPatterns) {
      const winRate = data.wins + data.losses > 0 
        ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) 
        : 'N/A';
      const avgPnl = data.wins + data.losses > 0 
        ? (data.totalPnl / (data.wins + data.losses)).toFixed(2) 
        : 'N/A';
      console.log(`${pattern.padEnd(30)} | Count: ${data.count.toString().padEnd(4)} | Wins: ${data.wins.toString().padEnd(3)} | Losses: ${data.losses.toString().padEnd(3)} | Win Rate: ${winRate}% | Avg P&L: ${avgPnl}%`);
    }
  }
  
  await mongoose.disconnect();
  console.log('\nDone.');
}

const dateArg = process.argv[2];
analyzeDecisions(dateArg).catch(console.error);
