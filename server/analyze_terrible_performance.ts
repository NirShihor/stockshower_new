import { Trade } from './src/db/models/Trade.js';
import { connectDatabase } from './src/db/connection.js';

async function analyzeTerriblePerformance() {
  try {
    await connectDatabase();
    console.log('=== ANALYZING WHY PERFORMANCE IS SO BAD ===\n');
    
    // Get the most recent trades that show terrible performance
    const recentTrades = await Trade.find({
      signalTime: { $gte: new Date('2025-10-01') },
      status: { $in: ['filled', 'closed'] }
    })
    .sort({ signalTime: -1 })
    .limit(50);
    
    console.log(`Found ${recentTrades.length} recent trades to analyze\n`);
    
    if (recentTrades.length === 0) {
      console.log('❌ No recent trades found');
      process.exit(1);
    }
    
    // Analyze what's going wrong
    console.log('📊 === RECENT TRADE ANALYSIS ===\n');
    
    let totalAnalyzed = 0;
    let immediateStopOuts = 0;
    let neverFilled = 0;
    let stillOpen = 0;
    let actuallyWon = 0;
    
    const patterns = new Map<string, {count: number, wins: number, stopouts: number}>();
    const entryIssues = {
      entryTooHigh: 0,
      entryTooLow: 0,
      immediateReversal: 0,
      gapAgainst: 0,
      poorTiming: 0
    };
    
    for (const trade of recentTrades) {
      totalAnalyzed++;
      
      const pattern = trade.patternName;
      if (!patterns.has(pattern)) {
        patterns.set(pattern, {count: 0, wins: 0, stopouts: 0});
      }
      const patternStats = patterns.get(pattern)!;
      patternStats.count++;
      
      // Analyze the trade outcome
      if (trade.status === 'closed' && trade.pnlAmount !== undefined) {
        if (trade.pnlAmount > 0) {
          actuallyWon++;
          patternStats.wins++;
        } else if (trade.exitReason === 'stop_loss') {
          immediateStopOuts++;
          patternStats.stopouts++;
        }
      } else if (trade.status === 'filled') {
        stillOpen++;
      } else {
        neverFilled++;
      }
      
      // Analyze entry timing issues
      const entryPrice = trade.actualEntryPrice || trade.entryPrice;
      const stopPrice = trade.stopLoss;
      
      if (entryPrice && stopPrice) {
        const stopDistance = Math.abs(entryPrice - stopPrice);
        const stopPercent = (stopDistance / entryPrice) * 100;
        
        if (stopPercent < 0.5) {
          entryIssues.poorTiming++;
        }
        
        // Check if entry was at unfavorable price
        if (trade.direction === 'long') {
          // For long trades, check if we bought at the high
          if (trade.signalData?.candle) {
            const signalHigh = trade.signalData.candle.high;
            const signalLow = trade.signalData.candle.low;
            
            if (entryPrice > signalHigh * 0.95) {
              entryIssues.entryTooHigh++;
            }
          }
        } else {
          // For short trades, check if we sold at the low
          if (trade.signalData?.candle) {
            const signalHigh = trade.signalData.candle.high;
            const signalLow = trade.signalData.candle.low;
            
            if (entryPrice < signalLow * 1.05) {
              entryIssues.entryTooLow++;
            }
          }
        }
      }
      
      // Show individual trade analysis
      if (totalAnalyzed <= 10) {
        const entry = trade.actualEntryPrice || trade.entryPrice || 'Unknown';
        const stop = trade.stopLoss || 'Unknown';
        const pnl = trade.pnlAmount ? `£${trade.pnlAmount.toFixed(2)}` : 'No P&L';
        const stopDistance = trade.entryPrice && trade.stopLoss ? 
          `${((Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice) * 100).toFixed(2)}%` : 'Unknown';
        
        console.log(`${totalAnalyzed}. ${trade.symbol} ${pattern} (Score: ${trade.patternScore})`);
        console.log(`   Entry: £${entry} | Stop: £${stop} | Stop Distance: ${stopDistance}`);
        console.log(`   Status: ${trade.status} | P&L: ${pnl} | Exit: ${trade.exitReason || 'None'}`);
        console.log(`   Signal Time: ${trade.signalTime.toISOString()}`);
        
        // Check market context if available
        if (trade.signalData?.context) {
          const ctx = trade.signalData.context;
          console.log(`   Market: ${ctx.trend || 'Unknown'} trend, ${ctx.isHighVolume ? 'High' : 'Normal'} volume`);
          console.log(`   At Support: ${ctx.atSupport}, At Resistance: ${ctx.atResistance}`);
        }
        console.log('');
      }
    }
    
    // Summary statistics
    console.log('📈 === PERFORMANCE BREAKDOWN ===\n');
    console.log(`Total Trades Analyzed: ${totalAnalyzed}`);
    console.log(`Actually Won: ${actuallyWon} (${(actuallyWon/totalAnalyzed*100).toFixed(1)}%)`);
    console.log(`Immediate Stop Outs: ${immediateStopOuts} (${(immediateStopOuts/totalAnalyzed*100).toFixed(1)}%)`);
    console.log(`Still Open: ${stillOpen} (${(stillOpen/totalAnalyzed*100).toFixed(1)}%)`);
    console.log(`Never Filled: ${neverFilled} (${(neverFilled/totalAnalyzed*100).toFixed(1)}%)`);
    
    console.log('\n🎯 === PATTERN FAILURE ANALYSIS ===\n');
    const sortedPatterns = Array.from(patterns.entries())
      .sort((a, b) => b[1].count - a[1].count);
    
    sortedPatterns.forEach(([pattern, stats]) => {
      const winRate = stats.count > 0 ? (stats.wins / stats.count * 100).toFixed(1) : '0.0';
      const stopoutRate = stats.count > 0 ? (stats.stopouts / stats.count * 100).toFixed(1) : '0.0';
      console.log(`${pattern}: ${stats.count} trades, ${winRate}% win rate, ${stopoutRate}% immediate stops`);
    });
    
    console.log('\n⚠️ === ENTRY TIMING ISSUES ===\n');
    console.log(`Poor Timing (stops too tight): ${entryIssues.poorTiming} trades`);
    console.log(`Entry Too High (long trades): ${entryIssues.entryTooHigh} trades`);
    console.log(`Entry Too Low (short trades): ${entryIssues.entryTooLow} trades`);
    
    // Analyze signal quality vs outcome
    console.log('\n📊 === SIGNAL QUALITY vs OUTCOME ===\n');
    
    const scoreRanges = [
      {min: 90, max: 100, label: '90-100'},
      {min: 80, max: 89, label: '80-89'}, 
      {min: 70, max: 79, label: '70-79'},
      {min: 60, max: 69, label: '60-69'},
      {min: 50, max: 59, label: '50-59'}
    ];
    
    scoreRanges.forEach(range => {
      const rangeeTrades = recentTrades.filter(t => 
        t.patternScore >= range.min && t.patternScore <= range.max
      );
      
      if (rangeeTrades.length > 0) {
        const winners = rangeeTrades.filter(t => t.pnlAmount && t.pnlAmount > 0).length;
        const winRate = (winners / rangeeTrades.length * 100).toFixed(1);
        const stopouts = rangeeTrades.filter(t => t.exitReason === 'stop_loss').length;
        const stopoutRate = (stopouts / rangeeTrades.length * 100).toFixed(1);
        
        console.log(`Score ${range.label}: ${rangeeTrades.length} trades, ${winRate}% wins, ${stopoutRate}% stops`);
      }
    });
    
    // Look for systematic issues
    console.log('\n🔍 === ROOT CAUSE ANALYSIS ===\n');
    
    if (immediateStopOuts > actuallyWon * 3) {
      console.log('🚨 CRITICAL ISSUE: Immediate stop outs are 3x more common than wins');
      console.log('   → Problem: Stop losses are too tight OR entries are too late');
    }
    
    if (entryIssues.poorTiming > totalAnalyzed * 0.5) {
      console.log('🚨 CRITICAL ISSUE: Over 50% of trades have stops < 0.5%');
      console.log('   → Problem: Risk management is fundamentally broken');
    }
    
    if (entryIssues.entryTooHigh + entryIssues.entryTooLow > totalAnalyzed * 0.4) {
      console.log('🚨 CRITICAL ISSUE: Over 40% of entries are at unfavorable prices');
      console.log('   → Problem: Entry timing is terrible - entering after the move is over');
    }
    
    if (stillOpen > totalAnalyzed * 0.8) {
      console.log('🚨 CRITICAL ISSUE: Over 80% of trades never close');
      console.log('   → Problem: Position management system is broken');
    }
    
    // Check for look-ahead bias
    const futureSignals = recentTrades.filter(t => 
      t.signalTime > new Date('2025-11-26')
    );
    
    if (futureSignals.length > 0) {
      console.log('🚨 CRITICAL ISSUE: Found signals from the future!');
      console.log(`   → ${futureSignals.length} trades have signal times after today`);
      console.log('   → This indicates data integrity issues or look-ahead bias');
    }
    
    console.log('\n💡 === RECOMMENDATIONS ===\n');
    
    console.log('1. IMMEDIATE FIXES:');
    console.log('   → Increase minimum stop distance to 1.5-2%');
    console.log('   → Fix position management - trades should close automatically');
    console.log('   → Add slippage protection - don\'t enter at extreme prices');
    
    console.log('\n2. FUNDAMENTAL ISSUES:');
    console.log('   → Entry timing is terrible - entering after patterns complete');
    console.log('   → Pattern recognition may be fundamentally flawed');
    console.log('   → Consider switching to breakout/momentum strategies instead');
    
    console.log('\n3. DATA INTEGRITY:');
    console.log('   → Check for future signals (look-ahead bias)');
    console.log('   → Validate all entry prices vs market data');
    console.log('   → Fix the position management system');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error analyzing performance:', error);
    process.exit(1);
  }
}

analyzeTerriblePerformance();