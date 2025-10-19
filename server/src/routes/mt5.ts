import express, { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { TradingCircuitBreaker } from '../helpers/circuitBreaker.js';
import { Trade } from '../db/models/Trade.js';

const router = express.Router();

// Initialize circuit breaker with default config
const circuitBreaker = new TradingCircuitBreaker();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to MT5 bridge
const MT5_BRIDGE_PATH = path.resolve(__dirname, '../../../mt5_bridge');

interface MT5Signal {
  id: string;
  symbol: string;
  pattern: {
    name: string;
    direction: 'bullish' | 'bearish';
  };
  plan: {
    direction: 'long' | 'short';
    entry: number;
    stop: number;
    targets: number[];
  };
  score: number;
  currentPrice?: number;
}

// Helper function to execute Python script
function executePythonScript(scriptName: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [
      path.join(MT5_BRIDGE_PATH, scriptName),
      ...args
    ], {
      cwd: MT5_BRIDGE_PATH
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          // If not JSON, return raw output
          resolve({ output: stdout, error: stderr });
        }
      }
    });

    pythonProcess.on('error', (error) => {
      reject(error);
    });
  });
}

// Place order endpoint
router.post('/place-order', async (req: Request, res: Response) => {
  try {
    const signal: MT5Signal = req.body;
    
    // Validate signal
    if (!signal || !signal.id || !signal.symbol || !signal.plan) {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid signal data' 
      });
      return;
    }

    console.log(`Processing MT5 order for ${signal.symbol} - ${signal.pattern.name}`);

    // Get account balance (you may need to fetch this from MT5 or config)
    // For now, using a default value - you should update this
    const accountBalance = 10000; // TODO: Get actual account balance from MT5

    // Create trade object for circuit breaker validation
    const tradeSignal = {
      symbol: signal.symbol,
      mt5Symbol: signal.symbol, // Adjust if MT5 symbol is different
      patternName: signal.pattern.name,
      patternScore: signal.score,
      entryPrice: signal.plan.entry,
      stopLoss: signal.plan.stop,
      takeProfit: signal.plan.targets[0], // Using first target
      direction: signal.plan.direction,
      orderType: 'market', // Adjust based on your needs
      volume: 0.01, // TODO: Calculate proper volume based on risk management
      signalTime: new Date()
    };

    // Run circuit breaker validation
    const validation = await circuitBreaker.validateTrade(tradeSignal, accountBalance);

    if (!validation.isValid) {
      console.log(`Circuit breaker blocked trade: ${validation.reason}`);
      res.status(403).json({
        success: false,
        error: 'Trade blocked by circuit breaker',
        reason: validation.reason,
        circuitBreakerStatus: validation.circuitBreakerStatus,
        riskMetrics: validation.riskMetrics
      });
      return;
    }

    // Circuit breaker approved - proceed with order
    const signalJson = JSON.stringify(signal);
    
    // Execute Python script to place order
    const result = await executePythonScript('place_single_order.py', [
      '--signal', signalJson
    ]);

    // If order was successful, create trade record for tracking
    if (result.success) {
      const trade = new Trade({
        ...tradeSignal,
        mt5OrderId: result.order_id,
        status: 'placed',
        orderPlacedTime: new Date()
      });
      await trade.save();

      // Update circuit breaker with the new position
      // This will be fully updated when the trade closes
    }

    res.json(result);
  } catch (error) {
    console.error('Error placing MT5 order:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to place order' 
    });
  }
});

// Check MT5 connection status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const result = await executePythonScript('check_status.py', []);
    res.json(result);
  } catch (error) {
    console.error('Error checking MT5 status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check MT5 status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Validate signal without placing order
router.post('/validate-signal', async (req: Request, res: Response) => {
  try {
    const signal: MT5Signal = req.body;
    
    if (!signal) {
      res.status(400).json({ 
        success: false, 
        error: 'No signal provided' 
      });
      return;
    }

    const signalJson = JSON.stringify(signal);
    const result = await executePythonScript('validate_signal.py', [
      '--signal', signalJson
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error validating signal:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to validate signal' 
    });
  }
});

// Get account info
router.get('/account-info', async (req: Request, res: Response) => {
  try {
    const result = await executePythonScript('get_account_info.py', []);
    res.json(result);
  } catch (error) {
    console.error('Error getting account info:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get account info' 
    });
  }
});

// Get circuit breaker status
router.get('/circuit-breaker/status', async (req: Request, res: Response) => {
  try {
    const status = await circuitBreaker.getCircuitBreakerStatus();
    const metrics = await circuitBreaker.getRiskMetrics();
    
    res.json({
      success: true,
      circuitBreaker: status,
      riskMetrics: metrics
    });
  } catch (error) {
    console.error('Error getting circuit breaker status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get circuit breaker status' 
    });
  }
});

// Emergency stop
router.post('/circuit-breaker/emergency-stop', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      res.status(400).json({ 
        success: false, 
        error: 'Reason is required for emergency stop' 
      });
      return;
    }
    
    await circuitBreaker.emergencyStop(reason);
    
    res.json({
      success: true,
      message: 'Emergency stop activated',
      reason
    });
  } catch (error) {
    console.error('Error activating emergency stop:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to activate emergency stop' 
    });
  }
});

// Reset circuit breaker
router.post('/circuit-breaker/reset', async (req: Request, res: Response) => {
  try {
    const { force = false } = req.body;
    
    const reset = await circuitBreaker.resetCircuitBreaker(force);
    
    if (reset) {
      res.json({
        success: true,
        message: 'Circuit breaker reset successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Cannot reset circuit breaker yet. Use force=true to override.'
      });
    }
  } catch (error) {
    console.error('Error resetting circuit breaker:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset circuit breaker' 
    });
  }
});

export default router;