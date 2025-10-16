import express, { Request, Response, NextFunction } from 'express';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { subscribeSymbols, unsubscribeSymbols, connectPolygon, disconnectPolygon, isPolygonConnected } from '../handlers/polygonWebSocket.js';
import { startMockDataFeed, stopMockDataFeed } from '../handlers/mockDataGenerator.js';
import { startMockSignalFeed, stopMockSignalFeed } from '../handlers/mockSignalGenerator.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

const router = express.Router();

// Get historical candles
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { symbol, from, to, timespan = 'minute', multiplier = '1', limit = '5000' } = req.query;
    
    if (!symbol || !from || !to) {
      res.status(400).json({ error: 'symbol, from, and to parameters are required' });
      return;
    }
    
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Polygon API key not configured' });
      return;
    }
    
    const candles = await fetchHistoricalBars(
      apiKey,
      symbol as string,
      from as string,
      to as string,
      timespan as 'minute' | 'hour' | 'day',
      parseInt(multiplier as string),
      parseInt(limit as string)
    );
    
    res.json({
      symbol: (symbol as string).toUpperCase(),
      candles,
      count: candles.length
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Subscribe to real-time updates
router.post('/subscribe', (req: Request, res: Response) => {
  try {
    const { symbols, granularity = 'AM' } = req.body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({ error: 'symbols array is required' });
      return;
    }
    
    // Check if we need to connect to Polygon first
    const apiKey = process.env.POLYGON_API_KEY;
    if (apiKey) {
      // Get the candle handler from app locals
      const { onCandle } = req.app.locals;
      if (onCandle) {
        connectPolygon(apiKey, onCandle);
      }
    }
    
    subscribeSymbols(symbols, granularity);
    
    res.json({
      success: true,
      symbols: symbols.map((s: string) => s.toUpperCase()),
      granularity
    });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from real-time updates
router.post('/unsubscribe', (req: Request, res: Response) => {
  try {
    const { symbols, granularity = 'AM' } = req.body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({ error: 'symbols array is required' });
      return;
    }
    
    unsubscribeSymbols(symbols, granularity);
    
    res.json({
      success: true,
      symbols: symbols.map((s: string) => s.toUpperCase()),
      granularity
    });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Testing endpoints
router.post('/test/mock/start', (req: Request, res: Response) => {
  try {
    const { onCandle } = req.app.locals;
    if (!onCandle) {
      res.status(500).json({ error: 'Candle handler not available' });
      return;
    }
    
    startMockDataFeed(onCandle);
    res.json({ success: true, message: 'Mock data feed started' });
  } catch (error) {
    console.error('Error starting mock feed:', error);
    res.status(500).json({ error: 'Failed to start mock feed' });
  }
});

router.post('/test/mock/stop', (req: Request, res: Response) => {
  try {
    stopMockDataFeed();
    res.json({ success: true, message: 'Mock data feed stopped' });
  } catch (error) {
    console.error('Error stopping mock feed:', error);
    res.status(500).json({ error: 'Failed to stop mock feed' });
  }
});

// Mock signals endpoints
router.post('/test/mock-signals/start', (req: Request, res: Response) => {
  try {
    const { onSignal } = req.app.locals;
    if (!onSignal) {
      res.status(500).json({ error: 'Signal handler not available' });
      return;
    }
    
    startMockSignalFeed(onSignal);
    res.json({ success: true, message: 'Mock signal feed started' });
  } catch (error) {
    console.error('Error starting mock signal feed:', error);
    res.status(500).json({ error: 'Failed to start mock signal feed' });
  }
});

router.post('/test/mock-signals/stop', (req: Request, res: Response) => {
  try {
    stopMockSignalFeed();
    res.json({ success: true, message: 'Mock signal feed stopped' });
  } catch (error) {
    console.error('Error stopping mock signal feed:', error);
    res.status(500).json({ error: 'Failed to stop mock signal feed' });
  }
});

// Debug endpoint to check data flow
router.get('/status', (req: Request, res: Response) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(process.cwd(), 'candle-debug.log');
    
    let logContent = 'No debug log found';
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      const lastLines = fs.readFileSync(logFile, 'utf-8').split('\n').slice(-20).join('\n');
      logContent = `Log file size: ${stats.size} bytes\nLast modified: ${stats.mtime}\n\nLast 20 lines:\n${lastLines}`;
    }
    
    res.json({
      status: 'Server running',
      polygonConnected: isPolygonConnected(),
      polygonApiKey: process.env.POLYGON_API_KEY ? 'API key present' : 'No API key',
      debugLog: logContent
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Connect to Polygon WebSocket
router.post('/connect', (req: Request, res: Response) => {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Polygon API key not configured' });
      return;
    }
    
    const { onCandle } = req.app.locals;
    if (!onCandle) {
      res.status(500).json({ error: 'Candle handler not available' });
      return;
    }
    
    connectPolygon(apiKey, onCandle);
    
    res.json({ 
      success: true, 
      message: 'Connected to Polygon WebSocket' 
    });
  } catch (error) {
    console.error('Error connecting to Polygon:', error);
    res.status(500).json({ error: 'Failed to connect to Polygon' });
  }
});

// Disconnect from Polygon WebSocket
router.post('/disconnect', (req: Request, res: Response) => {
  try {
    disconnectPolygon();
    res.json({ 
      success: true, 
      message: 'Disconnected from Polygon WebSocket' 
    });
  } catch (error) {
    console.error('Error disconnecting from Polygon:', error);
    res.status(500).json({ error: 'Failed to disconnect from Polygon' });
  }
});

// Get pending signals for MT5 integration
router.get('/signals/pending', (req: Request, res: Response) => {
  try {
    const { minScore = 70, limit = 10 } = req.query;
    const { getSignals } = req.app.locals;
    
    if (!getSignals) {
      res.status(500).json({ error: 'Signal retrieval not available' });
      return;
    }
    
    // Get recent high-quality signals
    const allSignals = getSignals();
    const pendingSignals = allSignals
      .filter((signal: any) => signal.score >= Number(minScore))
      .slice(-Number(limit))
      .reverse(); // Most recent first
    
    res.json({
      success: true,
      signals: pendingSignals,
      count: pendingSignals.length,
      minScore: Number(minScore)
    });
  } catch (error) {
    console.error('Error fetching pending signals:', error);
    res.status(500).json({ error: 'Failed to fetch pending signals' });
  }
});

// MT5 Bridge endpoints

// Check MT5 connection status
router.get('/mt5/status', async (req: Request, res: Response) => {
  try {
    const status = await metaApiHandler.checkStatus();
    res.json(status);
  } catch (error) {
    console.error('Error checking MT5 status:', error);
    res.status(500).json({ 
      connected: false, 
      error: 'Failed to check MT5 status' 
    });
  }
});

// Place order via MT5
router.post('/mt5/place-order', async (req: Request, res: Response) => {
  try {
    const signal = req.body;
    
    // Basic validation
    if (!signal || !signal.id || !signal.symbol || !signal.plan) {
      res.status(400).json({
        success: false,
        error: 'Invalid signal data'
      });
      return;
    }
    
    console.log(`[MT5] Processing order for ${signal.symbol} - ${signal.pattern?.name || 'Unknown'}`);
    console.log(`[MT5] Full signal received:`, JSON.stringify(signal, null, 2));
    
    const result = await metaApiHandler.placeOrder(signal);
    res.json(result);
  } catch (error) {
    console.error('Error placing MT5 order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to place order'
    });
  }
});

// Preview order with price adjustments
router.post('/mt5/preview-order', async (req: Request, res: Response) => {
  try {
    const signal = req.body;
    
    if (!signal || !signal.symbol || !signal.plan) {
      res.status(400).json({
        success: false,
        error: 'Invalid signal data'
      });
      return;
    }
    
    const result = await metaApiHandler.previewOrder(signal);
    res.json(result);
  } catch (error) {
    console.error('Error previewing order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to preview order'
    });
  }
});

// Validate signal
router.post('/mt5/validate-signal', async (req: Request, res: Response) => {
  try {
    const signal = req.body;
    
    if (!signal) {
      res.status(400).json({
        success: false,
        error: 'No signal provided'
      });
      return;
    }
    
    const result = await metaApiHandler.validateSignal(signal);
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
router.get('/mt5/account-info', async (req: Request, res: Response) => {
  try {
    const result = await metaApiHandler.getAccountInfo();
    res.json(result);
  } catch (error) {
    console.error('Error getting MT5 account info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get account info'
    });
  }
});

// Get available symbols
router.get('/mt5/symbols', async (req: Request, res: Response) => {
  try {
    const result = await metaApiHandler.getAvailableSymbols();
    res.json(result);
  } catch (error) {
    console.error('Error getting MT5 symbols:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get symbols'
    });
  }
});

// Manual end-of-day cleanup
router.post('/mt5/cleanup', async (req: Request, res: Response) => {
  try {
    console.log('[MT5] Manual cleanup requested');
    const result = await metaApiHandler.endOfDayCleanup();
    res.json(result);
  } catch (error) {
    console.error('Error during MT5 cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform cleanup'
    });
  }
});

// Cancel old orders (older than 1 hour)
router.post('/mt5/cancel-old-orders', async (req: Request, res: Response) => {
  try {
    console.log('[MT5] Manual old order cancellation requested');
    const result = await metaApiHandler.cancelOldOrders();
    res.json(result);
  } catch (error) {
    console.error('Error canceling old orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel old orders'
    });
  }
});

export default router;