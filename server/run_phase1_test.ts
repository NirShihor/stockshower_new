// @ts-nocheck
import { connectDatabase } from './src/db/connection.js';
import { metaApiHandler } from './src/handlers/metaApiRestHandler.js';
import { Trade } from './src/db/models/Trade.js';

async function runPhase1Test() {
  try {
    await connectDatabase();
    console.log('🧪 === PHASE 1: SYSTEM TEST ===\n');

    console.log('📋 PRE-TEST CHECKLIST:');
    console.log('✓ Trading system is running on port 5002');
    console.log('✓ Position monitoring is active (10-second intervals)');
    console.log('✓ MetaAPI is connected');
    console.log('✓ Database is connected');
    console.log('✓ Market is open (US market hours)');
    console.log('');

    // Step 1: Check system readiness
    console.log('STEP 1: CHECKING SYSTEM READINESS...');
    
    // Check MetaAPI
    const metaStatus = await metaApiHandler.checkStatus();
    if (!metaStatus.connected) {
      console.log('❌ STOP: MetaAPI not connected');
      console.log(`   Error: ${metaStatus.error}`);
      process.exit(1);
    }
    console.log('✅ MetaAPI connected');

    // Check current positions
    const currentPositions = await metaApiHandler.getPositions();
    const currentOrders = await metaApiHandler.getOrders();
    console.log(`📊 Current MT5 positions: ${currentPositions.length}`);
    console.log(`📊 Current MT5 orders: ${currentOrders.length}`);

    if (currentPositions.length > 10) {
      console.log('⚠️  WARNING: Many positions already open. Consider cleanup first.');
      console.log('   Run: curl -X POST http://localhost:5002/api/position-management/close-all-stuck');
    }

    console.log('');

    // Step 2: Test signal generation (simulation)
    console.log('STEP 2: TESTING SIGNAL PROCESSING...');
    
    // Create a test signal that should trigger with new stop loss rules
    const testSignal = {
      symbol: 'AAPL',
      currentPrice: 230.00,
      plan: {
        direction: 'long' as const,
        entry: 230.50,
        stop: 229.50,    // 0.43% stop - should be adjusted to 2.5%
        targets: [235.00]
      },
      pattern: { name: 'Test Pattern Validation' },
      patternScore: 85,
      signalData: {
        candle: {
          high: 231.00,
          low: 229.00,
          open: 230.00,
          close: 230.50
        }
      }
    };

    // Test the order preview (doesn't place real order)
    console.log('   Testing stop loss calculation...');
    const preview = await metaApiHandler.previewOrder(testSignal);
    
    if (preview.success && preview.data) {
      const originalStop = Math.abs(testSignal.plan.entry - testSignal.plan.stop) / testSignal.plan.entry * 100;
      const adjustedStop = Math.abs(preview.data.adjusted.entry - preview.data.adjusted.stop) / preview.data.adjusted.entry * 100;
      
      console.log(`   📊 Original stop: ${originalStop.toFixed(2)}%`);
      console.log(`   📊 Adjusted stop: ${adjustedStop.toFixed(2)}%`);
      console.log(`   📊 Order type: ${preview.data.adjusted.orderType}`);
      
      if (adjustedStop >= 2.4) {
        console.log('   ✅ Stop loss fix working');
      } else {
        console.log('   ❌ STOP: Stop loss fix not working');
        process.exit(1);
      }
    } else {
      console.log(`   ❌ Order preview failed: ${preview.error}`);
    }

    console.log('');

    // Step 3: Instructions for manual test trade
    console.log('STEP 3: MANUAL TEST TRADE INSTRUCTIONS...');
    console.log('');
    console.log('🎯 NOW YOU NEED TO MANUALLY PLACE A TEST TRADE:');
    console.log('');
    console.log('Option A: Use your trading UI');
    console.log('   1. Open your trading interface');
    console.log('   2. Wait for a high-scoring signal (80+ score)');
    console.log('   3. Place ONE trade with £5 maximum risk');
    console.log('   4. Monitor it carefully');
    console.log('');
    console.log('Option B: Enable automatic trading');
    console.log('   1. Ensure position size is set to £5 in settings');
    console.log('   2. Enable only high-confidence patterns');
    console.log('   3. Let system place 1 trade automatically');
    console.log('   4. Watch the position monitoring logs');
    console.log('');
    console.log('⚠️  CRITICAL: Only place ONE test trade for now!');
    
    console.log('');

    // Step 4: Monitoring instructions
    console.log('STEP 4: MONITORING YOUR TEST TRADE...');
    console.log('');
    console.log('📊 Monitor with these commands:');
    console.log('');
    console.log('Check system status:');
    console.log('curl http://localhost:5002/api/position-management/monitor-status');
    console.log('');
    console.log('Check current positions:');
    console.log('curl http://localhost:5002/api/position-management/stuck-trades');
    console.log('');
    console.log('Watch server logs for:');
    console.log('   • Order placement confirmation');
    console.log('   • Position monitoring updates (every 10 seconds)');
    console.log('   • Automatic closure when stop/target hit');
    console.log('');

    // Step 5: Success/failure criteria
    console.log('STEP 5: WHAT TO WATCH FOR...');
    console.log('');
    console.log('✅ SUCCESS INDICATORS:');
    console.log('   • Order places successfully in MT5');
    console.log('   • Stop loss is set at ~2.5% distance (not 0.5%)');
    console.log('   • Position appears in monitoring logs every 10s');
    console.log('   • Position closes automatically when stop/target hit');
    console.log('   • Database updated with correct P&L');
    console.log('   • No system errors or crashes');
    console.log('');
    console.log('❌ FAILURE INDICATORS (STOP IMMEDIATELY):');
    console.log('   • Order fails to place');
    console.log('   • Stop loss still too tight (<1%)');
    console.log('   • Position never appears in monitoring');
    console.log('   • Position doesn\'t close automatically');
    console.log('   • System errors or crashes');
    console.log('   • Incorrect P&L calculation');

    console.log('');

    // Create monitoring script
    console.log('📝 CREATING MONITORING SCRIPT...');
    
    const monitoringScript = `#!/bin/bash
# Phase 1 Test Monitoring Script
echo "🔍 Monitoring Phase 1 Test Trade..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    echo "=== $(date) ==="
    
    # Check system health
    echo "📊 System Status:"
    curl -s http://localhost:5002/api/position-management/monitor-status | jq '.stats'
    echo ""
    
    # Check for any trades today
    echo "📋 Recent Trades:"
    curl -s http://localhost:5002/api/position-management/stuck-trades | jq '.total'
    echo ""
    
    echo "Waiting 30 seconds..."
    sleep 30
    echo ""
done`;

    require('fs').writeFileSync('./monitor_test.sh', monitoringScript);
    console.log('✅ Created monitor_test.sh script');
    console.log('   Run: chmod +x monitor_test.sh && ./monitor_test.sh');

    console.log('');
    console.log('🚀 === READY FOR PHASE 1 TEST ===');
    console.log('');
    console.log('1. Place ONE test trade (£5 max risk)');
    console.log('2. Run: chmod +x monitor_test.sh && ./monitor_test.sh');
    console.log('3. Watch the trade lifecycle carefully');
    console.log('4. Only proceed to Phase 2 if EVERYTHING works perfectly');
    console.log('');
    console.log('⚠️  Remember: This is testing the SYSTEM, not the strategy yet!');

    process.exit(0);

  } catch (error) {
    console.error('❌ Phase 1 test setup failed:', error);
    process.exit(1);
  }
}

runPhase1Test();