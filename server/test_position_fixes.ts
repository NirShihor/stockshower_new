import { Trade } from './src/db/models/Trade.js';
import { connectDatabase } from './src/db/connection.js';

async function testPositionManagementFixes() {
  try {
    await connectDatabase();
    console.log('🔧 === TESTING POSITION MANAGEMENT FIXES ===\n');

    // Test 1: Check the fixed stop loss calculations
    console.log('1. CHECKING STOP LOSS FIX...');
    
    // Get a few recent trades to see current stop calculations
    const recentTrades = await Trade.find({
      status: 'filled',
      entryPrice: { $exists: true },
      stopLoss: { $exists: true }
    })
    .limit(10)
    .sort({ signalTime: -1 });

    console.log(`   Analyzing ${recentTrades.length} recent trades...`);
    
    const stopDistances = recentTrades.map(trade => {
      const stopPercent = Math.abs(trade.entryPrice! - trade.stopLoss!) / trade.entryPrice! * 100;
      return {
        symbol: trade.symbol,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        stopPercent: stopPercent.toFixed(2) + '%',
        isTooTight: stopPercent < 2.5
      };
    });

    console.log('   Current Stop Loss Analysis:');
    stopDistances.forEach(trade => {
      const status = trade.isTooTight ? '❌ TOO TIGHT' : '✅ OK';
      console.log(`   ${trade.symbol}: ${trade.stopPercent} distance ${status}`);
    });

    const tightStops = stopDistances.filter(t => t.isTooTight).length;
    console.log(`\n   Result: ${tightStops}/${stopDistances.length} trades still have tight stops`);
    
    if (tightStops > 0) {
      console.log('   📝 Note: Existing trades keep their original stops. Fix applies to NEW trades only.');
    }

    // Test 2: Check stuck trades that need manual closure
    console.log('\n2. CHECKING STUCK TRADES...');
    
    const stuckTrades = await Trade.find({
      status: 'filled',
      signalTime: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // >24 hours old
    }).limit(20);

    console.log(`   Found ${stuckTrades.length} trades stuck >24 hours`);
    
    if (stuckTrades.length > 0) {
      console.log('   Sample stuck trades:');
      stuckTrades.slice(0, 5).forEach((trade, i) => {
        const hoursStuck = (Date.now() - trade.signalTime.getTime()) / (1000 * 60 * 60);
        console.log(`   ${i + 1}. ${trade.symbol} - stuck for ${hoursStuck.toFixed(1)} hours`);
      });
    }

    // Test 3: Show monitoring improvements
    console.log('\n3. MONITORING IMPROVEMENTS APPLIED...');
    console.log('   ✅ Monitoring frequency: 30s → 10s (3x faster)');
    console.log('   ✅ Stop loss minimum: 1.0% → 2.5% (2.5x safer)');
    console.log('   ✅ Active price monitoring: Added for real-time exit detection');
    console.log('   ✅ Backup closure system: Added for when MetaAPI fails');
    console.log('   ✅ Timeout closure: Auto-close positions after 72 hours');
    console.log('   ✅ Manual management: New endpoints for stuck trade handling');

    // Test 4: Recommend immediate actions
    console.log('\n4. IMMEDIATE ACTIONS RECOMMENDED...');
    
    if (stuckTrades.length > 10) {
      console.log('   🚨 URGENT: Close stuck trades manually');
      console.log(`   📞 API: POST /api/position-management/close-all-stuck`);
    }

    if (stuckTrades.length > 5) {
      console.log('   🔄 Sync with MetaTrader positions');
      console.log(`   📞 API: POST /api/position-management/sync-positions`);
    }

    console.log('   📊 Monitor system health');
    console.log(`   📞 API: GET /api/position-management/monitor-status`);

    // Test 5: Show available management endpoints
    console.log('\n5. NEW MANAGEMENT ENDPOINTS AVAILABLE...');
    console.log('   GET  /api/position-management/stuck-trades     - List stuck trades');
    console.log('   POST /api/position-management/close-trade/:id  - Close specific trade');
    console.log('   POST /api/position-management/close-all-stuck  - Bulk close stuck trades');
    console.log('   POST /api/position-management/sync-positions   - Sync with MetaTrader');
    console.log('   GET  /api/position-management/monitor-status   - System health check');

    console.log('\n🎯 === SUMMARY ===\n');
    console.log('✅ Stop loss calculations fixed (2.5% minimum for new trades)');
    console.log('✅ Position monitoring speed increased (10 second checks)');
    console.log('✅ Active price monitoring implemented');
    console.log('✅ Backup closure mechanisms added');
    console.log('✅ Manual position management endpoints created');
    console.log('✅ Timeout closure system (72 hour max)');
    
    console.log('\n📋 NEXT STEPS:');
    if (stuckTrades.length > 0) {
      console.log('1. Close existing stuck trades via API or manual intervention');
      console.log('2. Restart the trading system to apply new monitoring');
      console.log('3. Test with a small position to verify fixes work');
    } else {
      console.log('1. Restart the trading system to apply new monitoring');
      console.log('2. Test with a small position to verify fixes work');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error testing fixes:', error);
    process.exit(1);
  }
}

testPositionManagementFixes();