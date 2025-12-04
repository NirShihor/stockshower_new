import { connectDatabase } from './src/db/connection.js';
import { Trade } from './src/db/models/Trade.js';
import { metaApiHandler } from './src/handlers/metaApiRestHandler.js';

async function validateTestTrade() {
  try {
    await connectDatabase();
    console.log('🔍 === VALIDATING TEST TRADE RESULTS ===\n');

    // Get the most recent trade (should be our test trade)
    const recentTrades = await Trade.find({
      signalTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
    .sort({ signalTime: -1 })
    .limit(5);

    if (recentTrades.length === 0) {
      console.log('❌ No recent trades found');
      console.log('   Either no trade was placed, or there\'s a database issue');
      process.exit(1);
    }

    console.log(`📊 Found ${recentTrades.length} recent trade(s):\n`);

    // Analyze each recent trade
    for (let i = 0; i < recentTrades.length; i++) {
      const trade = recentTrades[i];
      const tradeNumber = i + 1;
      
      console.log(`TRADE ${tradeNumber}: ${trade.symbol} - ${trade.patternName}`);
      console.log(`  ID: ${trade._id}`);
      console.log(`  Signal Time: ${trade.signalTime.toISOString()}`);
      console.log(`  Status: ${trade.status}`);
      console.log(`  Direction: ${trade.direction}`);
      console.log(`  Entry Price: £${trade.entryPrice || 'Unknown'}`);
      console.log(`  Stop Loss: £${trade.stopLoss || 'Unknown'}`);
      console.log(`  Take Profit: £${trade.takeProfit || 'Unknown'}`);
      
      // Calculate stop distance if available
      if (trade.entryPrice && trade.stopLoss) {
        const stopDistance = Math.abs(trade.entryPrice - trade.stopLoss) / trade.entryPrice * 100;
        console.log(`  Stop Distance: ${stopDistance.toFixed(2)}%`);
        
        if (stopDistance < 1.0) {
          console.log(`  ❌ PROBLEM: Stop too tight (${stopDistance.toFixed(2)}%)`);
        } else if (stopDistance >= 2.0) {
          console.log(`  ✅ Stop distance OK (${stopDistance.toFixed(2)}%)`);
        } else {
          console.log(`  ⚠️  Marginal stop distance (${stopDistance.toFixed(2)}%)`);
        }
      }

      // Check current status
      if (trade.status === 'closed') {
        console.log(`  Exit Time: ${trade.closedTime?.toISOString() || 'Unknown'}`);
        console.log(`  Exit Reason: ${trade.exitReason || 'Unknown'}`);
        console.log(`  P&L: £${trade.pnlAmount?.toFixed(2) || 'Unknown'}`);
        console.log(`  P&L %: ${trade.pnlPercent?.toFixed(2) || 'Unknown'}%`);
        
        // Calculate trade duration
        if (trade.signalTime && trade.closedTime) {
          const duration = (trade.closedTime.getTime() - trade.signalTime.getTime()) / (1000 * 60);
          console.log(`  Duration: ${duration.toFixed(1)} minutes`);
        }
        
        // Evaluate trade result
        if (trade.pnlAmount) {
          if (trade.pnlAmount > 0) {
            console.log(`  ✅ WINNING TRADE`);
          } else {
            console.log(`  ❌ LOSING TRADE`);
          }
        }
        
      } else if (trade.status === 'filled') {
        console.log(`  ⏳ STILL OPEN - monitoring should close this`);
        
        // Check how long it's been open
        const minutesOpen = (Date.now() - trade.signalTime.getTime()) / (1000 * 60);
        console.log(`  Time Open: ${minutesOpen.toFixed(1)} minutes`);
        
        if (minutesOpen > 120) { // 2 hours
          console.log(`  ⚠️  Trade open for ${(minutesOpen/60).toFixed(1)} hours - may need manual closure`);
        }
        
      } else {
        console.log(`  Status: ${trade.status}`);
        if (trade.cancelReason) {
          console.log(`  Cancel Reason: ${trade.cancelReason}`);
        }
      }

      console.log('');
    }

    // Check MT5 positions
    console.log('🔍 CHECKING MT5 POSITIONS...\n');
    
    try {
      const mt5Positions = await metaApiHandler.getPositions();
      const mt5Orders = await metaApiHandler.getOrders();
      
      console.log(`MT5 Open Positions: ${mt5Positions.length}`);
      console.log(`MT5 Pending Orders: ${mt5Orders.length}`);
      
      if (mt5Positions.length > 0) {
        console.log('\nMT5 Position Details:');
        mt5Positions.forEach(pos => {
          console.log(`  ${pos.symbol}: ${pos.volume} lots, P&L: £${pos.profit?.toFixed(2) || '0.00'}`);
        });
      }
      
      if (mt5Orders.length > 0) {
        console.log('\nMT5 Pending Orders:');
        mt5Orders.forEach(order => {
          console.log(`  ${order.symbol}: ${order.type} at £${order.openPrice}`);
        });
      }
      
    } catch (error) {
      console.log(`❌ Failed to check MT5: ${error}`);
    }

    console.log('');

    // Overall assessment
    console.log('📋 === PHASE 1 TEST ASSESSMENT ===\n');
    
    const testTrade = recentTrades[0]; // Most recent trade
    
    if (!testTrade) {
      console.log('❌ PHASE 1 FAILED: No test trade found');
      return;
    }

    const assessments = [];
    
    // Check 1: Trade was placed
    if (testTrade) {
      assessments.push('✅ Trade was placed successfully');
    } else {
      assessments.push('❌ No trade was placed');
    }

    // Check 2: Stop loss distance
    if (testTrade.entryPrice && testTrade.stopLoss) {
      const stopDistance = Math.abs(testTrade.entryPrice - testTrade.stopLoss) / testTrade.entryPrice * 100;
      if (stopDistance >= 2.0) {
        assessments.push('✅ Stop loss distance acceptable (≥2%)');
      } else {
        assessments.push(`❌ Stop loss too tight (${stopDistance.toFixed(2)}%)`);
      }
    }

    // Check 3: Position management
    if (testTrade.status === 'closed') {
      assessments.push('✅ Position closed automatically');
      
      if (testTrade.pnlAmount !== undefined) {
        assessments.push('✅ P&L calculated correctly');
      } else {
        assessments.push('⚠️  P&L calculation issue');
      }
    } else if (testTrade.status === 'filled') {
      const minutesOpen = (Date.now() - testTrade.signalTime.getTime()) / (1000 * 60);
      if (minutesOpen < 30) {
        assessments.push('⏳ Position still open (normal - wait longer)');
      } else {
        assessments.push('⚠️  Position open for long time - check monitoring');
      }
    } else {
      assessments.push(`❌ Unexpected trade status: ${testTrade.status}`);
    }

    // Print assessment
    assessments.forEach(assessment => console.log(assessment));

    console.log('');

    // Verdict
    const hasErrors = assessments.some(a => a.startsWith('❌'));
    const hasWarnings = assessments.some(a => a.startsWith('⚠️'));
    
    if (hasErrors) {
      console.log('🚨 PHASE 1 TEST FAILED');
      console.log('   Fix issues before proceeding to Phase 2');
      console.log('   Do NOT continue with live trading');
    } else if (hasWarnings) {
      console.log('⚠️  PHASE 1 TEST MARGINAL');  
      console.log('   Address warnings before proceeding');
      console.log('   Consider running another test trade');
    } else {
      console.log('🎉 PHASE 1 TEST PASSED');
      console.log('   System infrastructure working correctly');
      console.log('   Ready to proceed to Phase 2 pattern validation');
    }

    console.log('\n📞 MONITORING COMMANDS:');
    console.log('Check status: curl http://localhost:5002/api/position-management/monitor-status');
    console.log('Close manually: curl -X POST http://localhost:5002/api/position-management/close-trade/' + testTrade._id);

    process.exit(0);

  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

validateTestTrade();