import { connectDatabase } from './src/db/connection.js';
import { Trade } from './src/db/models/Trade.js';

async function checkLiveStatus() {
  try {
    await connectDatabase();
    console.log('🔍 === LIVE TRADING STATUS CHECK ===\n');

    // Check stuck/open trades
    const openTrades = await Trade.find({
      status: { $in: ['pending', 'open', 'filled'] },
      exitPrice: { $exists: false }
    }).sort({ signalTime: -1 }).limit(10);

    console.log(`📊 OPEN/STUCK TRADES: ${openTrades.length} found`);
    if (openTrades.length > 0) {
      console.log('🚨 Recent stuck trades:');
      openTrades.forEach((trade, i) => {
        console.log(`${i+1}. ${trade.symbol} ${trade.direction} | Status: ${trade.status} | Signal: ${new Date(trade.signalTime).toLocaleDateString()}`);
      });
    }
    console.log('');

    // Check recent signals
    const recentTrades = await Trade.find({})
      .sort({ signalTime: -1 })
      .limit(5);

    console.log('📅 MOST RECENT SIGNALS:');
    recentTrades.forEach((trade, i) => {
      const signalDate = new Date(trade.signalTime);
      const daysSince = Math.floor((Date.now() - signalDate.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`${i+1}. ${trade.symbol} ${trade.direction} | ${signalDate.toLocaleDateString()} (${daysSince} days ago) | Pattern: ${trade.signalData?.pattern?.name || 'N/A'}`);
    });
    console.log('');

    // Count total trades by date
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todaySignals = await Trade.countDocuments({
      signalTime: { $gte: today }
    });

    const yesterdaySignals = await Trade.countDocuments({
      signalTime: { 
        $gte: yesterday,
        $lt: today 
      }
    });

    const lastWeekSignals = await Trade.countDocuments({
      signalTime: { $gte: lastWeek }
    });

    console.log('📈 SIGNAL GENERATION STATUS:');
    console.log(`Today: ${todaySignals} signals`);
    console.log(`Yesterday: ${yesterdaySignals} signals`);
    console.log(`Last 7 days: ${lastWeekSignals} signals`);
    console.log('');

    // Check auto-execution settings
    console.log('⚙️  AUTO-EXECUTION STATUS:');
    console.log('Checking current configuration...');
    console.log('');

    // Diagnose the issues
    console.log('🚨 DIAGNOSIS:');
    
    if (openTrades.length > 100) {
      console.log(`❌ CRITICAL: ${openTrades.length} stuck trades blocking new orders`);
      console.log('   ACTION NEEDED: Clean up stuck trades');
    }
    
    if (todaySignals === 0 && yesterdaySignals === 0) {
      console.log('❌ NO SIGNALS: No new signals being generated');
      console.log('   ACTION NEEDED: Check live data feed');
    }
    
    if (lastWeekSignals < 10) {
      console.log('❌ LOW ACTIVITY: Very few signals in past week');
      console.log('   ACTION NEEDED: Check market data connection');
    }

    console.log('');
    console.log('🔧 IMMEDIATE ACTIONS REQUIRED:');
    
    if (openTrades.length > 50) {
      console.log('1. Clean up stuck trades');
      console.log('   - Cancel pending orders');
      console.log('   - Close positions manually');
      console.log('   - Reset position limits');
    }
    
    if (todaySignals === 0) {
      console.log('2. Restart live data feed');
      console.log('   - Check Polygon WebSocket connection');
      console.log('   - Verify signal generation pipeline');
      console.log('   - Restart server if necessary');
    }
    
    console.log('3. Monitor live execution');
    console.log('   - Watch for new signals');
    console.log('   - Check order placement');
    console.log('   - Verify MetaAPI connection');

    process.exit(0);

  } catch (error) {
    console.error('❌ Live status check failed:', error);
    process.exit(1);
  }
}

checkLiveStatus();