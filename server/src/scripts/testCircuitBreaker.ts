import { TradingCircuitBreaker } from '../helpers/circuitBreaker.js';
import { Trade } from '../db/models/Trade.js';
import { RiskState } from '../db/models/RiskState.js';
import mongoose from 'mongoose';

// Test script for circuit breakers
async function testCircuitBreakers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');
    console.log('Connected to MongoDB');

    const circuitBreaker = new TradingCircuitBreaker();
    
    // Test 1: Check initial status
    console.log('\n1️⃣ Testing initial status...');
    const initialStatus = await circuitBreaker.getCircuitBreakerStatus();
    console.log('Initial status:', initialStatus);

    // Test 2: Simulate consecutive losses
    console.log('\n2️⃣ Testing consecutive losses...');
    const testTrades = [
      { symbol: 'AAPL', pnl: -50, status: 'closed' },
      { symbol: 'AAPL', pnl: -75, status: 'closed' },
      { symbol: 'AAPL', pnl: -100, status: 'closed' },
      { symbol: 'MSFT', pnl: -80, status: 'closed' },
      { symbol: 'GOOGL', pnl: -120, status: 'closed' }
    ];

    for (let i = 0; i < testTrades.length; i++) {
      const trade = new Trade({
        symbol: testTrades[i].symbol,
        mt5Symbol: testTrades[i].symbol,
        patternName: 'test-pattern',
        patternScore: 75,
        entryPrice: 100,
        actualEntryPrice: 100,
        exitPrice: 99,
        stopLoss: 98,
        takeProfit: 102,
        direction: 'long',
        orderType: 'market',
        volume: 0.01,
        pnlAmount: testTrades[i].pnl,
        pnlPercentage: testTrades[i].pnl / 100,
        status: testTrades[i].status,
        signalTime: new Date(),
        closedTime: new Date()
      });

      await circuitBreaker.updateTradeResult(trade);
      
      // Check if circuit breaker triggered
      const validation = await circuitBreaker.validateTrade(
        { symbol: 'TEST', volume: 0.01, entryPrice: 100 },
        10000
      );
      
      console.log(`After trade ${i + 1}: Valid=${validation.isValid}, Reason=${validation.reason || 'OK'}`);
      
      if (!validation.isValid) {
        console.log('Circuit breaker triggered! ✅');
        break;
      }
    }

    // Test 3: Check risk metrics
    console.log('\n3️⃣ Checking risk metrics...');
    const metrics = await circuitBreaker.getRiskMetrics();
    console.log('Risk metrics:', {
      dailyPnL: metrics.dailyPnL,
      dailyPnLPercent: metrics.dailyPnLPercent,
      consecutiveLosses: metrics.consecutiveLosses
    });

    // Test 4: Test emergency stop
    console.log('\n4️⃣ Testing emergency stop...');
    await circuitBreaker.emergencyStop('Test emergency stop');
    const emergencyStatus = await circuitBreaker.getCircuitBreakerStatus();
    console.log('Emergency stop active:', emergencyStatus.isActive);

    // Test 5: Test reset
    console.log('\n5️⃣ Testing reset...');
    const resetSuccess = await circuitBreaker.resetCircuitBreaker(true);
    console.log('Reset successful:', resetSuccess);

    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    const today = new Date().toISOString().split('T')[0];
    await RiskState.deleteOne({ date: today });
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the test
testCircuitBreakers();