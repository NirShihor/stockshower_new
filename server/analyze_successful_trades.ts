import { connectDatabase } from './src/db/connection.js';
import { Trade } from './src/db/models/Trade.js';

async function analyzeSuccessfulTrades() {
  try {
    await connectDatabase();
    console.log('🏆 === ANALYZING THE 14 SUCCESSFUL TRADES ===\n');

    // Get the 14 completed/profitable trades
    const successfulTrades = await Trade.find({
      exitPrice: { $exists: true },
      pnlAmount: { $exists: true, $gt: 0 }
    }).sort({ signalTime: 1 });

    console.log(`📊 Found ${successfulTrades.length} successful trades\n`);

    if (successfulTrades.length === 0) {
      console.log('❌ No successful trades found');
      return;
    }

    // Analyze patterns in successful trades
    console.log('🎯 === SUCCESS PATTERN ANALYSIS ===\n');
    
    successfulTrades.forEach((trade, i) => {
      const signal = trade.signalData;
      const executionDelay = trade.orderPlacedTime && trade.signalTime 
        ? (new Date(trade.orderPlacedTime) - new Date(trade.signalTime)) / (1000 * 60)
        : 'Unknown';
      
      console.log(`${(i+1).toString().padStart(2)}. ${trade.symbol} ${trade.direction.toUpperCase()}`);
      console.log(`    Pattern: ${signal?.pattern?.name || 'Unknown'}`);
      console.log(`    Score: ${signal?.score || 'N/A'}`);
      console.log(`    Signal Time: ${new Date(trade.signalTime).toLocaleString()}`);
      console.log(`    Execution Delay: ${typeof executionDelay === 'number' ? executionDelay.toFixed(1) + ' min' : executionDelay}`);
      console.log(`    Entry: $${trade.entryPrice?.toFixed(2)} → Exit: $${trade.exitPrice?.toFixed(2)}`);
      console.log(`    P&L: £${trade.pnlAmount?.toFixed(2)}`);
      if (signal?.plan) {
        console.log(`    Planned Entry: $${signal.plan.entry} (Actual: $${trade.entryPrice?.toFixed(2)})`);
        console.log(`    Risk: $${signal.plan.risk?.toFixed(2)} | Stop: $${signal.plan.stop?.toFixed(2)}`);
      }
      console.log('');
    });

    // Extract success criteria
    console.log('📈 === SUCCESS CRITERIA IDENTIFICATION ===\n');

    // Score distribution
    const scores = successfulTrades.map(t => t.signalData?.score).filter(s => s);
    const avgScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;
    const scoreRange = scores.length > 0 ? `${Math.min(...scores)} - ${Math.max(...scores)}` : 'N/A';
    
    console.log(`📊 SCORE ANALYSIS:`);
    console.log(`   Average Score: ${avgScore.toFixed(1)}`);
    console.log(`   Score Range: ${scoreRange}`);
    console.log(`   Scores: ${scores.join(', ')}`);

    // Pattern distribution
    const patterns = {};
    successfulTrades.forEach(t => {
      const pattern = t.signalData?.pattern?.name || 'Unknown';
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    });
    
    console.log(`\n🎨 PATTERN DISTRIBUTION:`);
    Object.entries(patterns)
      .sort(([,a], [,b]) => b - a)
      .forEach(([pattern, count]) => {
        console.log(`   ${pattern}: ${count} trades`);
      });

    // Direction analysis
    const directions = { long: 0, short: 0 };
    successfulTrades.forEach(t => directions[t.direction]++);
    
    console.log(`\n📊 DIRECTION SPLIT:`);
    console.log(`   Long: ${directions.long} trades (${(directions.long/successfulTrades.length*100).toFixed(1)}%)`);
    console.log(`   Short: ${directions.short} trades (${(directions.short/successfulTrades.length*100).toFixed(1)}%)`);

    // Time analysis
    const hours = successfulTrades.map(t => new Date(t.signalTime).getHours());
    const avgHour = hours.reduce((sum, h) => sum + h, 0) / hours.length;
    
    console.log(`\n⏰ TIME PATTERNS:`);
    console.log(`   Average Signal Hour: ${avgHour.toFixed(1)} (${Math.floor(avgHour)}:${Math.round((avgHour % 1) * 60).toString().padStart(2, '0')})`);
    console.log(`   Signal Hours: ${hours.join(', ')}`);

    // Execution speed analysis
    const delays = successfulTrades
      .filter(t => t.orderPlacedTime && t.signalTime)
      .map(t => (new Date(t.orderPlacedTime) - new Date(t.signalTime)) / (1000 * 60));
    
    if (delays.length > 0) {
      const avgDelay = delays.reduce((sum, d) => sum + d, 0) / delays.length;
      console.log(`\n⚡ EXECUTION TIMING:`);
      console.log(`   Average Delay: ${avgDelay.toFixed(1)} minutes`);
      console.log(`   Delay Range: ${Math.min(...delays).toFixed(1)} - ${Math.max(...delays).toFixed(1)} minutes`);
    }

    // Symbol analysis
    const symbols = {};
    successfulTrades.forEach(t => {
      symbols[t.symbol] = (symbols[t.symbol] || 0) + 1;
    });
    
    console.log(`\n🎯 SYMBOL PERFORMANCE:`);
    Object.entries(symbols)
      .sort(([,a], [,b]) => b - a)
      .forEach(([symbol, count]) => {
        console.log(`   ${symbol}: ${count} trades`);
      });

    console.log('\n🎯 === LIVE TRADING RECOMMENDATIONS ===\n');
    
    console.log('✅ OPTIMAL CRITERIA FOR LIVE TRADING:');
    if (avgScore > 0) {
      console.log(`   • Target Score Range: ${Math.floor(avgScore-10)} - ${Math.ceil(avgScore+10)}`);
    }
    
    const topPatterns = Object.entries(patterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([pattern]) => pattern);
    
    if (topPatterns.length > 0) {
      console.log(`   • Best Patterns: ${topPatterns.join(', ')}`);
    }
    
    if (directions.long > directions.short * 1.5) {
      console.log(`   • Favor Long trades (${(directions.long/successfulTrades.length*100).toFixed(0)}% success rate)`);
    } else if (directions.short > directions.long * 1.5) {
      console.log(`   • Favor Short trades (${(directions.short/successfulTrades.length*100).toFixed(0)}% success rate)`);
    }
    
    if (delays.length > 0) {
      const avgDelay = delays.reduce((sum, d) => sum + d, 0) / delays.length;
      if (avgDelay < 5) {
        console.log(`   • Execute within ${Math.ceil(avgDelay + 2)} minutes of signal`);
      }
    }
    
    console.log('\n🚀 LIVE TRADING SETUP:');
    console.log('   • Use minimum position sizes (£10-50 per trade)');
    console.log('   • Set up real-time signal monitoring');
    console.log('   • Implement the successful trade criteria above');
    console.log('   • Start with 1-3 trades per day maximum');
    console.log('   • Track actual vs planned entry/exit prices');

    process.exit(0);

  } catch (error) {
    console.error('❌ Successful trades analysis failed:', error);
    process.exit(1);
  }
}

analyzeSuccessfulTrades();