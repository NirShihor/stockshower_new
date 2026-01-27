#!/usr/bin/env tsx

/**
 * Test script for trade analysis functionality
 * This script tests the analysis utility and ensures everything is working
 */

import { runTradeAnalysis } from './tradeAnalysisUtility.js';
import { connectDatabase } from '../db/connection.js';
import { Trade } from '../db/models/Trade.js';

async function testAnalysis() {
  try {
    console.log('🧪 Testing Trade Analysis System...');
    
    // Connect to database
    await connectDatabase();
    
    // Check if we have any trades
    const totalTrades = await Trade.countDocuments();
    console.log(`📊 Found ${totalTrades} total trades in database`);
    
    if (totalTrades === 0) {
      console.log('⚠️ No trades found in database. Cannot run analysis.');
      console.log('💡 Place some trades first, then run this test again.');
      return;
    }
    
    // Get sample of recent trades
    const recentTrades = await Trade.find()
      .sort({ signalTime: -1 })
      .limit(5)
      .select('symbol patternName patternScore status pnlAmount signalTime');
    
    console.log('\n📋 Sample Recent Trades:');
    recentTrades.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.symbol} - ${trade.patternName} (Score: ${trade.patternScore}) - ${trade.status} - P&L: ${trade.pnlAmount || 'N/A'}`);
    });
    
    // Test basic analysis (last 7 days)
    console.log('\n🔍 Running analysis for last 7 days...');
    
    const config = {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
      minTrades: 1 // Lower threshold for testing
    };
    
    const results = await runTradeAnalysis(config);
    
    console.log('\n✅ Analysis Results Summary:');
    console.log(`  📊 Total Signals: ${results.summary.totalSignals}`);
    console.log(`  📈 Fill Rate: ${results.summary.fillRate.toFixed(1)}%`);
    console.log(`  🎯 Win Rate: ${results.summary.overallWinRate.toFixed(1)}%`);
    console.log(`  💰 Total P&L: $${results.summary.totalPnL}`);
    console.log(`  📈 Profit Factor: ${results.summary.profitFactor}`);
    console.log(`  📊 Patterns Analyzed: ${results.patternAnalysis.length}`);
    console.log(`  🌍 Market Conditions: ${results.marketConditions.length}`);
    console.log(`  🏢 Symbols Traded: ${results.symbolPerformance.length}`);
    
    // Show top pattern if any
    if (results.patternAnalysis.length > 0) {
      const topPattern = results.patternAnalysis[0];
      console.log(`\n🏆 Top Pattern: ${topPattern.patternName}`);
      console.log(`  - Trades: ${topPattern.totalTrades} (${topPattern.closedTrades} closed)`);
      console.log(`  - Win Rate: ${topPattern.winRate.toFixed(1)}%`);
      console.log(`  - Total P&L: $${topPattern.totalPnL}`);
      console.log(`  - Avg Score: ${topPattern.avgScore}`);
    }
    
    // Show insights
    if (results.insights.topPerformingPatterns.length > 0) {
      console.log(`\n💡 Key Insights:`);
      console.log(`  🚀 Top Performing: ${results.insights.topPerformingPatterns[0]}`);
    }
    
    if (results.insights.worstPerformingPatterns.length > 0) {
      console.log(`  ❌ Needs Work: ${results.insights.worstPerformingPatterns[0]}`);
    }
    
    if (results.insights.recommendedFilters.length > 0) {
      console.log(`\n🔧 Recommendations:`);
      results.insights.recommendedFilters.slice(0, 3).forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }
    
    console.log('\n✅ Trade Analysis Test Completed Successfully!');
    console.log('\n🎯 Next Steps:');
    console.log('  1. Start the server: npm run dev');
    console.log('  2. Test API endpoints:');
    console.log('     curl http://localhost:5002/api/trade-analysis/insights');
    console.log('  3. Run comprehensive analysis:');
    console.log('     npx tsx src/analysis/runAnalysis.ts --summary');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('  1. Make sure MongoDB is running');
    console.error('  2. Check your .env file has correct MONGODB_URI');
    console.error('  3. Ensure you have some trades in the database');
  } finally {
    process.exit(0);
  }
}

// Run the test
testAnalysis();