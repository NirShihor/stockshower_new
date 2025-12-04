import { connectDatabase } from './src/db/connection.js';
import { Trade } from './src/db/models/Trade.js';

async function runPhase2Test() {
  try {
    await connectDatabase();
    console.log('🧪 === PHASE 2: PATTERN VALIDATION TEST ===\n');

    // Check Phase 1 was successful
    console.log('STEP 1: VERIFYING PHASE 1 SUCCESS...');
    
    const recentTrades = await Trade.find({
      signalTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    }).sort({ signalTime: -1 });

    if (recentTrades.length === 0) {
      console.log('❌ STOP: No recent trades found');
      console.log('   Run Phase 1 test first');
      process.exit(1);
    }

    // Analyze recent performance
    const closedTrades = recentTrades.filter(t => t.status === 'closed');
    const openTrades = recentTrades.filter(t => t.status === 'filled');

    console.log(`📊 Recent trades (7 days): ${recentTrades.length}`);
    console.log(`✅ Closed trades: ${closedTrades.length}`);
    console.log(`🔄 Open trades: ${openTrades.length}`);

    if (closedTrades.length === 0) {
      console.log('❌ STOP: No successfully closed trades');
      console.log('   Phase 1 not complete - fix position management first');
      process.exit(1);
    }

    // Check if Phase 1 test trade was successful
    const phase1Trade = recentTrades[0];
    if (phase1Trade.status !== 'closed') {
      console.log('⚠️  WARNING: Most recent trade not closed yet');
      console.log('   Wait for it to close or manually close before Phase 2');
    }

    console.log('✅ Phase 1 validation passed\n');

    // Phase 2 Setup
    console.log('STEP 2: PHASE 2 CONFIGURATION...');
    
    const phase2Config = {
      duration: '1-2 weeks',
      targetTrades: 10,
      maxRisk: '£50 total',
      positionSize: '£5 per trade',
      patterns: [
        'Bearish Engulfing',
        'Three Black Crows', 
        'Morning Star',
        'Reversal Evening Star'
      ],
      minScore: 75,
      successCriteria: {
        minWinRate: 45,
        maxLossPerTrade: 5,
        maxDrawdown: 15
      }
    };

    console.log('📋 PHASE 2 CONFIGURATION:');
    Object.entries(phase2Config).forEach(([key, value]) => {
      if (typeof value === 'object' && !Array.isArray(value)) {
        console.log(`   ${key}:`);
        Object.entries(value).forEach(([k, v]) => {
          console.log(`     ${k}: ${v}`);
        });
      } else if (Array.isArray(value)) {
        console.log(`   ${key}: ${value.join(', ')}`);
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });

    console.log('');

    // Instructions for Phase 2
    console.log('STEP 3: PHASE 2 EXECUTION PLAN...');
    console.log('');
    console.log('🎯 TRADING STRATEGY FOR PHASE 2:');
    console.log('');
    console.log('1. ENABLE PATTERN DETECTION:');
    console.log('   • Set minimum score to 75+ for signals');
    console.log('   • Enable only high-confidence patterns');
    console.log('   • Set position size to £5 margin per trade');
    console.log('   • Maximum 2-3 trades per day');
    console.log('');
    console.log('2. MONITORING SCHEDULE:');
    console.log('   • Check system 2-3 times per day');
    console.log('   • Monitor each trade manually');
    console.log('   • Keep detailed records');
    console.log('   • Weekly performance review');
    console.log('');
    console.log('3. RISK CONTROLS:');
    console.log('   • Stop if daily loss > £10');
    console.log('   • Stop if weekly loss > £25');
    console.log('   • No more than 3 concurrent positions');
    console.log('   • Stop if win rate falls below 35%');

    console.log('');

    // Create Phase 2 monitoring script
    console.log('STEP 4: CREATING PHASE 2 MONITORING TOOLS...');

    const phase2Monitor = `#!/bin/bash
# Phase 2 Pattern Validation Monitor
echo "📊 Phase 2 Trading Monitor - Pattern Validation"
echo "=== $(date) ==="
echo ""

echo "🔍 System Health Check:"
curl -s http://localhost:5002/api/position-management/monitor-status | jq '{
  openTrades: .stats.openTrades,
  systemHealth: .stats.systemHealth,
  avgStopDistance: .stats.avgStopDistance,
  recommendations: .recommendations
}'

echo ""
echo "📋 Recent Trading Activity:"
curl -s http://localhost:5002/api/position-management/stuck-trades | jq '{
  total: .total,
  recentTrades: .trades[:5] | map({
    symbol: .symbol,
    pattern: .pattern,
    daysFilled: .daysFilled,
    stopPercent: .stopPercent
  })
}'

echo ""
echo "💡 Run this script 2-3 times daily during Phase 2"
echo "💡 Keep detailed notes of what you observe"
echo "💡 Stop trading if anything looks wrong"`;

    require('fs').writeFileSync('./monitor_phase2.sh', phase2Monitor);
    console.log('✅ Created monitor_phase2.sh');

    // Create performance analysis script  
    const performanceAnalysis = `import { connectDatabase } from './src/db/connection.js';
import { Trade } from './src/db/models/Trade.js';

async function analyzePhase2Performance() {
  await connectDatabase();
  
  const phase2Start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 2 weeks ago
  const trades = await Trade.find({
    signalTime: { $gte: phase2Start },
    status: 'closed'
  }).sort({ signalTime: 1 });
  
  if (trades.length === 0) {
    console.log('No completed trades in Phase 2 period');
    process.exit(0);
  }
  
  const stats = {
    total: trades.length,
    wins: trades.filter(t => t.pnlAmount && t.pnlAmount > 0).length,
    losses: trades.filter(t => t.pnlAmount && t.pnlAmount < 0).length,
    totalPnL: trades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0),
    winRate: 0,
    avgWin: 0,
    avgLoss: 0
  };
  
  stats.winRate = (stats.wins / stats.total) * 100;
  
  const winners = trades.filter(t => t.pnlAmount && t.pnlAmount > 0);
  const losers = trades.filter(t => t.pnlAmount && t.pnlAmount < 0);
  
  if (winners.length > 0) {
    stats.avgWin = winners.reduce((sum, t) => sum + t.pnlAmount!, 0) / winners.length;
  }
  
  if (losers.length > 0) {
    stats.avgLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnlAmount!, 0) / losers.length);
  }
  
  console.log('🎯 PHASE 2 PERFORMANCE ANALYSIS');
  console.log(\`Total trades: \${stats.total}\`);
  console.log(\`Win rate: \${stats.winRate.toFixed(1)}%\`);
  console.log(\`Total P&L: £\${stats.totalPnL.toFixed(2)}\`);
  console.log(\`Average win: £\${stats.avgWin.toFixed(2)}\`);
  console.log(\`Average loss: £\${stats.avgLoss.toFixed(2)}\`);
  
  // Success/failure assessment
  if (stats.winRate >= 45 && stats.totalPnL > 0) {
    console.log('\\n✅ PHASE 2 SUCCESS - Ready for Phase 3');
  } else if (stats.winRate >= 35) {
    console.log('\\n⚠️ PHASE 2 MARGINAL - Needs improvement');
  } else {
    console.log('\\n❌ PHASE 2 FAILED - Stop trading');
  }
  
  process.exit(0);
}

analyzePhase2Performance();`;

    require('fs').writeFileSync('./analyze_phase2.ts', performanceAnalysis);
    console.log('✅ Created analyze_phase2.ts');

    console.log('');

    // Final instructions
    console.log('🚀 === PHASE 2 READY TO START ===');
    console.log('');
    console.log('WHAT TO DO NOW:');
    console.log('1. Configure your trading system:');
    console.log('   - Set position size to £5 margin');
    console.log('   - Set minimum signal score to 75+');
    console.log('   - Enable only high-confidence patterns');
    console.log('');
    console.log('2. Start monitoring:');
    console.log('   chmod +x monitor_phase2.sh && ./monitor_phase2.sh');
    console.log('');
    console.log('3. Let the system run for 1-2 weeks');
    console.log('');
    console.log('4. Analyze performance weekly:');
    console.log('   yarn tsx analyze_phase2.ts');
    console.log('');
    console.log('⚠️  TARGET: 10 trades over 1-2 weeks with 45%+ win rate');
    console.log('⚠️  STOP if win rate falls below 35% or daily loss > £10');

    process.exit(0);

  } catch (error) {
    console.error('❌ Phase 2 setup failed:', error);
    process.exit(1);
  }
}

runPhase2Test();