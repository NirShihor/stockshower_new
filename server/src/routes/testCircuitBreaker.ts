import express, { Request, Response } from 'express';
import { TradingCircuitBreaker } from '../helpers/circuitBreaker.js';

const router = express.Router();
const circuitBreaker = new TradingCircuitBreaker();

// Test trade validation (without Python)
router.post('/validate-trade', async (req: Request, res: Response) => {
  try {
    const { symbol, entry, stop, targets, score } = req.body;
    
    if (!symbol || !entry || !stop || !targets) {
      res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: symbol, entry, stop, targets' 
      });
      return;
    }

    // Mock account balance for testing
    const accountBalance = 10000;

    // Create test trade signal
    const tradeSignal = {
      symbol,
      mt5Symbol: symbol,
      patternName: 'Test Pattern',
      patternScore: score || 75,
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: targets[0],
      direction: 'long' as const,
      orderType: 'market' as const,
      volume: 0.01,
      signalTime: new Date()
    };

    // Test circuit breaker validation
    const validation = await circuitBreaker.validateTrade(tradeSignal, accountBalance);

    res.json({
      success: true,
      tradeAllowed: validation.isValid,
      reason: validation.reason || 'Trade approved by circuit breaker',
      riskMetrics: validation.riskMetrics,
      circuitBreakerStatus: validation.circuitBreakerStatus
    });

  } catch (error) {
    console.error('Test validation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Test validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Simulate a losing trade to trigger circuit breakers
router.post('/simulate-loss', async (req: Request, res: Response) => {
  try {
    const { symbol = 'TEST', lossAmount = -100 } = req.body;

    // Create a fake losing trade
    const lossTrade = {
      symbol,
      mt5Symbol: symbol,
      patternName: 'Test Loss Pattern',
      patternScore: 75,
      entryPrice: 100,
      actualEntryPrice: 100,
      exitPrice: 99,
      stopLoss: 98,
      takeProfit: 102,
      direction: 'long' as const,
      orderType: 'market' as const,
      volume: 0.01,
      pnlAmount: lossAmount,
      pnlPercentage: lossAmount / 100,
      status: 'closed' as const,
      timeframe: '1m',
      signalTime: new Date(),
      closedTime: new Date()
    };

    // Update circuit breaker with the loss
    await circuitBreaker.updateTradeResult(lossTrade);
    
    // Check new status
    const status = await circuitBreaker.getCircuitBreakerStatus();
    const metrics = await circuitBreaker.getRiskMetrics();

    res.json({
      success: true,
      message: `Simulated loss of $${Math.abs(lossAmount)} for ${symbol}`,
      circuitBreakerActive: status.isActive,
      reason: status.reason,
      riskMetrics: metrics
    });

  } catch (error) {
    console.error('Simulate loss error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to simulate loss',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;