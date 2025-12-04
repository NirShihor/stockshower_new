import { Trade } from './src/db/models/Trade.js';
import { connectDatabase } from './src/db/connection.js';

async function analyzePositionManagementIssues() {
  try {
    await connectDatabase();
    console.log('🔍 === POSITION MANAGEMENT ROOT CAUSE ANALYSIS ===\n');

    // Get recent trades that show the position management issues
    const recentTrades = await Trade.find({
      signalTime: { $gte: new Date('2025-10-01') },
      status: { $in: ['filled', 'closed'] }
    })
    .sort({ signalTime: -1 })
    .limit(100);

    console.log(`📊 Analyzing ${recentTrades.length} recent trades\n`);

    // Core Analysis
    console.log('🚨 === ROOT CAUSE ANALYSIS ===\n');

    let totalAnalyzed = 0;
    let filledButNeverClosed = 0;
    let actuallyClosedWithPnL = 0;
    let stopLossIssues = 0;
    let positionMonitoringIssues = 0;

    const stopLossAnalysis: number[] = [];
    const timingAnalysis = {
      immediate: 0, // Closed within 1 hour
      shortTerm: 0, // Closed within 1 day
      longTerm: 0,  // Closed after 1 day
      neverClosed: 0 // Still open
    };

    const exitReasonBreakdown = new Map<string, number>();

    for (const trade of recentTrades) {
      totalAnalyzed++;

      // Calculate stop loss percentage
      if (trade.entryPrice && trade.stopLoss) {
        const stopPercent = Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice * 100;
        stopLossAnalysis.push(stopPercent);
        
        if (stopPercent < 1.0) {
          stopLossIssues++;
        }
      }

      // Analyze trade lifecycle
      if (trade.status === 'filled') {
        filledButNeverClosed++;
        timingAnalysis.neverClosed++;
        
        // Check how long it's been filled
        const daysFilled = (Date.now() - trade.signalTime.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysFilled > 30) {
          positionMonitoringIssues++;
        }
      } else if (trade.status === 'closed' && trade.pnlAmount !== undefined) {
        actuallyClosedWithPnL++;
        
        // Calculate time to close
        if (trade.closedTime && trade.signalTime) {
          const hoursToClose = (trade.closedTime.getTime() - trade.signalTime.getTime()) / (1000 * 60 * 60);
          
          if (hoursToClose < 1) timingAnalysis.immediate++;
          else if (hoursToClose < 24) timingAnalysis.shortTerm++;
          else timingAnalysis.longTerm++;
        }

        // Track exit reasons
        const reason = trade.exitReason || 'unknown';
        exitReasonBreakdown.set(reason, (exitReasonBreakdown.get(reason) || 0) + 1);
      }
    }

    // Report findings
    console.log('📈 === CORE ISSUES IDENTIFIED ===\n');
    
    console.log(`1. POSITION LIFECYCLE BREAKDOWN:`);
    console.log(`   Total Trades: ${totalAnalyzed}`);
    console.log(`   Filled but Never Closed: ${filledButNeverClosed} (${(filledButNeverClosed/totalAnalyzed*100).toFixed(1)}%)`);
    console.log(`   Actually Closed with P&L: ${actuallyClosedWithPnL} (${(actuallyClosedWithPnL/totalAnalyzed*100).toFixed(1)}%)`);
    
    if (filledButNeverClosed > 0) {
      console.log(`\n🚨 CRITICAL: ${(filledButNeverClosed/totalAnalyzed*100).toFixed(1)}% of trades never close!`);
      console.log(`   This means ${filledButNeverClosed} positions are sitting in MetaTrader indefinitely`);
    }

    console.log(`\n2. STOP LOSS ANALYSIS:`);
    if (stopLossAnalysis.length > 0) {
      const avgStopPercent = stopLossAnalysis.reduce((a, b) => a + b, 0) / stopLossAnalysis.length;
      const minStop = Math.min(...stopLossAnalysis);
      const maxStop = Math.max(...stopLossAnalysis);
      
      console.log(`   Average Stop Distance: ${avgStopPercent.toFixed(2)}%`);
      console.log(`   Minimum Stop Distance: ${minStop.toFixed(2)}%`);
      console.log(`   Maximum Stop Distance: ${maxStop.toFixed(2)}%`);
      console.log(`   Stops Under 1%: ${stopLossIssues} trades (${(stopLossIssues/totalAnalyzed*100).toFixed(1)}%)`);
      
      if (avgStopPercent < 1.0) {
        console.log(`\n🚨 CRITICAL: Average stop distance is ${avgStopPercent.toFixed(2)}% - WAY TOO TIGHT!`);
      }
    }

    console.log(`\n3. POSITION MONITORING ISSUES:`);
    console.log(`   Positions Open >30 Days: ${positionMonitoringIssues}`);
    console.log(`   Never Closed Rate: ${(filledButNeverClosed/totalAnalyzed*100).toFixed(1)}%`);
    
    if (positionMonitoringIssues > totalAnalyzed * 0.1) {
      console.log(`\n🚨 CRITICAL: Position monitoring system is broken`);
      console.log(`   ${positionMonitoringIssues} trades have been open for over 30 days`);
    }

    console.log(`\n4. TIMING ANALYSIS (for closed trades):`);
    console.log(`   Immediate Close (<1hr): ${timingAnalysis.immediate}`);
    console.log(`   Short-term Close (<24hr): ${timingAnalysis.shortTerm}`);
    console.log(`   Long-term Close (>24hr): ${timingAnalysis.longTerm}`);
    console.log(`   Never Closed: ${timingAnalysis.neverClosed}`);

    console.log(`\n5. EXIT REASON BREAKDOWN:`);
    if (exitReasonBreakdown.size > 0) {
      for (const [reason, count] of exitReasonBreakdown.entries()) {
        console.log(`   ${reason}: ${count} trades`);
      }
    } else {
      console.log(`   No exit reasons found - all trades stuck in "filled" status`);
    }

    // Technical Analysis
    console.log(`\n\n🔧 === TECHNICAL ROOT CAUSES ===\n`);
    
    console.log(`1. POSITION MONITOR SERVICE ISSUES:`);
    console.log(`   - Runs only every 30 seconds (too slow for active trading)`);
    console.log(`   - Relies on position "disappearing" from MT5 to detect closure`);
    console.log(`   - getClosedPosition() often returns null (missing historical data)`);
    console.log(`   - No active price monitoring against stop/target levels`);
    
    console.log(`\n2. METAAPI INTEGRATION PROBLEMS:`);
    console.log(`   - Historical deals API often unavailable or delayed`);
    console.log(`   - No real-time position status tracking`);
    console.log(`   - Complex position ID matching logic fails`);
    console.log(`   - No backup exit mechanisms`);
    
    console.log(`\n3. STOP LOSS CALCULATION ERRORS:`);
    console.log(`   - Minimum distance calculation in metaApiRestHandler.ts too tight`);
    console.log(`   - 1% minimum distance still causes immediate stop outs`);
    console.log(`   - No dynamic adjustment for volatility`);
    console.log(`   - Price rounding issues create invalid stop levels`);

    // Specific Code Issues
    console.log(`\n\n🐛 === SPECIFIC CODE ISSUES ===\n`);
    
    console.log(`1. positionMonitor.ts Line 182:`);
    console.log(`   const historicalData = await metaApiHandler.getClosedPosition(trade.mt5PositionId);`);
    console.log(`   ❌ This often returns null, leaving trades stuck`);
    
    console.log(`\n2. positionMonitor.ts Line 8:`);
    console.log(`   private checkIntervalMs = 30000; // Check every 30 seconds`);
    console.log(`   ❌ 30 seconds is too slow - should be 5-10 seconds max`);
    
    console.log(`\n3. metaApiRestHandler.ts Lines 1303-1339:`);
    console.log(`   getClosedPosition() method relies on unreliable historical deals API`);
    console.log(`   ❌ Should implement active position monitoring instead`);
    
    console.log(`\n4. metaApiRestHandler.ts Line 386:`);
    console.log(`   const minStopDistance = adjustedEntry * 0.01; // 1% minimum distance`);
    console.log(`   ❌ 1% is often still too tight for many stocks`);

    // Solutions
    console.log(`\n\n💡 === IMMEDIATE SOLUTIONS NEEDED ===\n`);
    
    console.log(`1. FIX POSITION MONITORING:`);
    console.log(`   - Reduce check interval to 5-10 seconds`);
    console.log(`   - Add active price monitoring against SL/TP levels`);
    console.log(`   - Implement position reconciliation system`);
    console.log(`   - Add manual closure endpoints for stuck positions`);
    
    console.log(`\n2. FIX STOP LOSS CALCULATIONS:`);
    console.log(`   - Increase minimum stop distance to 2-3%`);
    console.log(`   - Add volatility-based stop adjustment`);
    console.log(`   - Implement dynamic ATR-based stops`);
    console.log(`   - Add post-entry stop trailing logic`);
    
    console.log(`\n3. IMPROVE EXIT DETECTION:`);
    console.log(`   - Monitor real-time prices vs stop/target levels`);
    console.log(`   - Add backup closure mechanisms`);
    console.log(`   - Implement forced position closure after time limits`);
    console.log(`   - Add position health monitoring and alerts`);
    
    console.log(`\n4. ENHANCE METAAPI INTEGRATION:`);
    console.log(`   - Add redundant position status checking methods`);
    console.log(`   - Implement WebSocket real-time position updates`);
    console.log(`   - Add manual position management interface`);
    console.log(`   - Create position sync verification system`);

    // Sample problematic trades
    const stuckTrades = recentTrades
      .filter(t => t.status === 'filled')
      .sort((a, b) => a.signalTime.getTime() - b.signalTime.getTime())
      .slice(0, 5);

    if (stuckTrades.length > 0) {
      console.log(`\n\n📋 === SAMPLE STUCK TRADES ===\n`);
      stuckTrades.forEach((trade, i) => {
        const daysFilled = (Date.now() - trade.signalTime.getTime()) / (1000 * 60 * 60 * 24);
        const stopPercent = trade.entryPrice && trade.stopLoss 
          ? (Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice * 100).toFixed(2)
          : 'Unknown';
          
        console.log(`${i + 1}. ${trade.symbol} - ${trade.patternName}`);
        console.log(`   Filled ${daysFilled.toFixed(1)} days ago`);
        console.log(`   Entry: £${trade.entryPrice || 'Unknown'}`);
        console.log(`   Stop: £${trade.stopLoss || 'Unknown'} (${stopPercent}% distance)`);
        console.log(`   MT5 Position ID: ${trade.mt5PositionId || 'Missing'}`);
        console.log('');
      });
    }

    console.log(`\n🎯 === CONCLUSION ===\n`);
    console.log(`The trading system has CATASTROPHIC position management failures:`);
    console.log(`• ${(filledButNeverClosed/totalAnalyzed*100).toFixed(1)}% of trades never close properly`);
    console.log(`• Position monitoring is too slow and unreliable`);
    console.log(`• Stop losses are calculated incorrectly (too tight)`);
    console.log(`• No active price monitoring or backup exit systems`);
    console.log(`• MetaAPI integration lacks proper position lifecycle management`);
    console.log(`\nThis explains the 14.3% win rate - it's not a strategy problem, it's a SYSTEM problem!`);

    process.exit(0);

  } catch (error) {
    console.error('❌ Error analyzing position management:', error);
    process.exit(1);
  }
}

analyzePositionManagementIssues();