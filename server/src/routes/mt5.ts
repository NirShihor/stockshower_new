import express, { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

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

    // Create a temporary script to process this specific signal
    const signalJson = JSON.stringify(signal);
    
    // Execute Python script to place order
    const result = await executePythonScript('place_single_order.py', [
      '--signal', signalJson
    ]);

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

export default router;