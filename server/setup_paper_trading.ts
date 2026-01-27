import { connectDatabase } from './src/db/connection.js';

async function setupPaperTrading() {
  console.log('📊 === PAPER TRADING SETUP ===\n');

  // Create test plan
  const testPlan = {
    phase1: {
      name: "System Validation",
      duration: "1-2 days",
      trades: 1,
      maxRisk: "£5",
      objective: "Verify trades open and close properly"
    },
    phase2: {
      name: "Pattern Validation", 
      duration: "1-2 weeks",
      trades: 10,
      maxRisk: "£50 total",
      objective: "Test actual pattern performance"
    },
    phase3: {
      name: "Risk Management",
      duration: "2-4 weeks", 
      trades: 25,
      maxRisk: "£125 total",
      objective: "Validate risk controls and consistency"
    }
  };

  console.log('🧪 TEST PLAN OVERVIEW:\n');
  
  Object.entries(testPlan).forEach(([phase, details]) => {
    console.log(`${phase.toUpperCase()}: ${details.name}`);
    console.log(`  Duration: ${details.duration}`);
    console.log(`  Trades: ${details.trades}`);
    console.log(`  Max Risk: ${details.maxRisk}`);
    console.log(`  Goal: ${details.objective}\n`);
  });

  console.log('📋 === TESTING CHECKLIST ===\n');
  
  console.log('□ PHASE 1 - SYSTEM TEST (DO THIS FIRST)');
  console.log('  □ Enable live signal generation');
  console.log('  □ Place 1 very small test trade (£5 risk)');
  console.log('  □ Monitor position opens correctly');
  console.log('  □ Verify position closes within reasonable time');
  console.log('  □ Check P&L calculation accuracy');
  console.log('  □ Test manual closure if needed');
  
  console.log('\n□ PHASE 2 - PATTERN VALIDATION');
  console.log('  □ Run pattern detection on live market data');
  console.log('  □ Place 5-10 trades over 1-2 weeks');
  console.log('  □ Track actual vs expected win rate');
  console.log('  □ Monitor stop loss effectiveness (2.5% stops)');
  console.log('  □ Validate entry/exit timing');
  console.log('  □ Check slippage and execution quality');

  console.log('\n□ PHASE 3 - FULL VALIDATION');
  console.log('  □ Increase to 20-25 trades');
  console.log('  □ Test under different market conditions');
  console.log('  □ Validate risk management rules');
  console.log('  □ Check system stability over time');
  console.log('  □ Monitor for edge cases or failures');

  console.log('\n🎯 === SUCCESS CRITERIA ===\n');
  
  console.log('PHASE 1 SUCCESS: (Required to continue)');
  console.log('  ✓ Trade opens and closes automatically');
  console.log('  ✓ P&L calculated correctly'); 
  console.log('  ✓ Position monitoring works');
  console.log('  ✓ No system errors or crashes');

  console.log('\nPHASE 2 SUCCESS: (Required for live trading)');
  console.log('  ✓ Win rate ≥ 45% (accounting for real-world conditions)');
  console.log('  ✓ Stop losses work properly (not too tight)');
  console.log('  ✓ Average win > average loss');
  console.log('  ✓ System stability proven');

  console.log('\nPHASE 3 SUCCESS: (Ready for scaling)');
  console.log('  ✓ Consistent performance over 3+ weeks');
  console.log('  ✓ Risk management effective');
  console.log('  ✓ No major system issues');
  console.log('  ✓ Profitable after commissions/slippage');

  console.log('\n🚨 === FAILURE CRITERIA (STOP TRADING) ===\n');
  console.log('❌ STOP IF:');
  console.log('  • Win rate < 35% after 10+ trades');
  console.log('  • Frequent system crashes or errors'); 
  console.log('  • Positions not closing properly');
  console.log('  • Stop losses still too tight (immediate stops)');
  console.log('  • Significant slippage/execution issues');
  console.log('  • MetaAPI connection unreliable');

  console.log('\n📞 === API ENDPOINTS FOR MONITORING ===\n');
  console.log('Monitor system health:');
  console.log('  GET http://localhost:5002/api/position-management/monitor-status');
  console.log('\nView current positions:');
  console.log('  GET http://localhost:5002/api/position-management/stuck-trades');
  console.log('\nClose position manually:');
  console.log('  POST http://localhost:5002/api/position-management/close-trade/:id');
  console.log('\nEmergency close all:');
  console.log('  POST http://localhost:5002/api/position-management/close-all-stuck');

  console.log('\n🎬 === HOW TO START PHASE 1 ===\n');
  console.log('1. Start live signal generation:');
  console.log('   • Enable pattern detection on real market data');
  console.log('   • Set very small position size (£5 margin)');
  console.log('   • Enable only 1-2 highest-confidence patterns');
  
  console.log('\n2. Place first test trade:');
  console.log('   • Wait for high-scoring signal (80+ score)');
  console.log('   • Monitor trade execution live');
  console.log('   • Check position appears in MT5');
  
  console.log('\n3. Monitor trade lifecycle:');
  console.log('   • Position should close automatically');
  console.log('   • Check P&L matches expectations');
  console.log('   • Verify database updated correctly');

  console.log('\n4. Only continue if EVERYTHING works perfectly');

  console.log('\n⚠️ === IMPORTANT REMINDERS ===\n');
  console.log('• Start with TINY positions (£5 max risk)');
  console.log('• Test during liquid market hours only'); 
  console.log('• Monitor every trade manually at first');
  console.log('• Keep detailed logs of what happens');
  console.log('• Stop immediately if anything goes wrong');
  console.log('• Only scale up after proving consistent success');

  console.log('\n✅ Your system infrastructure is ready for testing!');
  console.log('🚀 Next step: Enable live signals and place 1 test trade');
}

setupPaperTrading();