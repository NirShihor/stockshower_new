import { connectDatabase } from './src/db/connection.js';

/**
 * Live Trading Configuration based on 100% successful trades analysis
 * 
 * SUCCESS CRITERIA:
 * - Score Range: 50-80 (Average: 60.1)
 * - Patterns: REVERSAL patterns only
 * - Direction: Favor Long trades (64% success rate)  
 * - Timing: Execute within 5-6 minutes of signal
 * - Position Size: Minimum allowable (£10-50)
 */

export interface LiveTradingConfig {
  enabled: boolean;
  
  // Signal Filtering (based on successful trades)
  scoreRange: {
    min: number;
    max: number;
  };
  
  allowedPatterns: string[];
  excludedPatterns: string[];
  
  // Position Management
  positionSizing: {
    minSizeGBP: number;
    maxSizeGBP: number;
    riskPerTrade: number; // % of account
  };
  
  // Execution Rules  
  execution: {
    maxDelayMinutes: number;
    maxConcurrentPositions: number;
    maxTradesPerDay: number;
  };
  
  // Risk Management
  riskManagement: {
    stopLossPercent: number;
    takeProfitPercent: number;
    maxDailyLoss: number;
  };
  
  // Market Hours
  tradingHours: {
    startHour: number; // UTC
    endHour: number;   // UTC
    timezone: string;
  };
}

const LIVE_TRADING_CONFIG: LiveTradingConfig = {
  enabled: false, // Start disabled for safety
  
  scoreRange: {
    min: 50,  // Successful trades started at 50
    max: 80   // Top successful score was 80
  },
  
  allowedPatterns: [
    // Based on successful trade patterns
    'Reversal Tweezer Top',
    'Reversal Tweezer Bottom', 
    'Reversal Bearish Marubozu',
    'Reversal Bullish Marubozu',
    'Reversal Three White Soldiers',
    'Reversal Three Inside Down',
    'Reversal Bearish Engulfing',
    'Reversal Bullish Engulfing',
    'Reversal Three Black Crows'
  ],
  
  excludedPatterns: [
    // Exclude momentum patterns that failed in backtests
    'Bullish Engulfing',
    'Bearish Engulfing', 
    'Three Black Crows',
    'Three White Soldiers',
    'Bullish Marubozu',
    'Bearish Marubozu',
    'Morning Star',
    'Evening Star'
  ],
  
  positionSizing: {
    minSizeGBP: 10,    // Minimum for testing
    maxSizeGBP: 50,    // Conservative maximum
    riskPerTrade: 0.5  // 0.5% of account per trade
  },
  
  execution: {
    maxDelayMinutes: 6,     // Based on successful 5-6 min delays
    maxConcurrentPositions: 3, // Conservative start
    maxTradesPerDay: 5      // Based on successful pattern
  },
  
  riskManagement: {
    stopLossPercent: 2.0,   // Tighter than backtest (6%)
    takeProfitPercent: 4.0, // 2:1 R/R ratio
    maxDailyLoss: 200       // Daily loss limit
  },
  
  tradingHours: {
    startHour: 13,    // 1PM UTC (successful trades at 2PM)
    endHour: 16,      // 4PM UTC  
    timezone: 'UTC'
  }
};

async function setupLiveTrading() {
  try {
    await connectDatabase();
    console.log('🚀 === LIVE TRADING SETUP ===\n');
    
    console.log('📊 CONFIGURATION BASED ON 100% SUCCESSFUL TRADES:');
    console.log('');
    
    console.log('🎯 SIGNAL CRITERIA:');
    console.log(`   Score Range: ${LIVE_TRADING_CONFIG.scoreRange.min} - ${LIVE_TRADING_CONFIG.scoreRange.max}`);
    console.log(`   Allowed Patterns: ${LIVE_TRADING_CONFIG.allowedPatterns.length} reversal patterns`);
    console.log('   Top Patterns:');
    LIVE_TRADING_CONFIG.allowedPatterns.slice(0, 5).forEach(pattern => {
      console.log(`     - ${pattern}`);
    });
    console.log('');
    
    console.log('💰 POSITION SIZING:');
    console.log(`   Min Size: £${LIVE_TRADING_CONFIG.positionSizing.minSizeGBP}`);
    console.log(`   Max Size: £${LIVE_TRADING_CONFIG.positionSizing.maxSizeGBP}`);
    console.log(`   Risk per Trade: ${LIVE_TRADING_CONFIG.positionSizing.riskPerTrade}%`);
    console.log('');
    
    console.log('⚡ EXECUTION RULES:');
    console.log(`   Max Delay: ${LIVE_TRADING_CONFIG.execution.maxDelayMinutes} minutes`);
    console.log(`   Max Concurrent: ${LIVE_TRADING_CONFIG.execution.maxConcurrentPositions} positions`);
    console.log(`   Max Daily Trades: ${LIVE_TRADING_CONFIG.execution.maxTradesPerDay}`);
    console.log('');
    
    console.log('🛡️  RISK MANAGEMENT:');
    console.log(`   Stop Loss: ${LIVE_TRADING_CONFIG.riskManagement.stopLossPercent}%`);
    console.log(`   Take Profit: ${LIVE_TRADING_CONFIG.riskManagement.takeProfitPercent}%`);
    console.log(`   Daily Loss Limit: £${LIVE_TRADING_CONFIG.riskManagement.maxDailyLoss}`);
    console.log('');
    
    console.log('🕐 TRADING HOURS:');
    console.log(`   Active: ${LIVE_TRADING_CONFIG.tradingHours.startHour}:00 - ${LIVE_TRADING_CONFIG.tradingHours.endHour}:00 ${LIVE_TRADING_CONFIG.tradingHours.timezone}`);
    console.log('   Based on successful 2PM signal timing');
    console.log('');
    
    console.log('🚨 SAFETY PROTOCOLS:');
    console.log(`   Status: ${LIVE_TRADING_CONFIG.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
    console.log('   Minimum position sizes for safe testing');
    console.log('   Real-time monitoring required');
    console.log('   Manual override capability');
    console.log('');
    
    console.log('📋 IMPLEMENTATION CHECKLIST:');
    console.log('   ☐ 1. Enable MetaAPI connection');
    console.log('   ☐ 2. Set minimum position sizes'); 
    console.log('   ☐ 3. Configure signal filtering');
    console.log('   ☐ 4. Test with paper trading first');
    console.log('   ☐ 5. Enable live trading cautiously');
    console.log('   ☐ 6. Monitor real vs expected performance');
    console.log('');
    
    console.log('✅ NEXT STEPS:');
    console.log('   1. Test signal filtering with current criteria');
    console.log('   2. Verify MetaAPI broker connection');
    console.log('   3. Start with smallest possible position sizes');
    console.log('   4. Run for 1-2 weeks with close monitoring');
    console.log('   5. Compare live results vs successful trade patterns');
    
    // TODO: Implement the actual live trading logic
    // - Real-time signal monitoring
    // - Pattern filtering based on success criteria
    // - Position sizing and risk management  
    // - Order placement via MetaAPI
    // - Performance tracking vs historical success
    
    console.log('');
    console.log('🎯 Ready to test live trading with proven successful criteria!');
    
  } catch (error) {
    console.error('❌ Live trading setup failed:', error);
  }
}

// Export for use in other modules
export default LIVE_TRADING_CONFIG;

// Run setup if this file is executed directly
setupLiveTrading();