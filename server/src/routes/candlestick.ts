import express, { Request, Response } from 'express';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { subscribeSymbols, unsubscribeSymbols, connectPolygon } from '../handlers/polygonWebSocket.js';
import { startMockDataFeed, stopMockDataFeed } from '../handlers/mockDataGenerator.js';

const router = express.Router();

// Get historical candles
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { symbol, from, to, timespan = 'minute', multiplier = '1', limit = '5000' } = req.query;
    
    if (!symbol || !from || !to) {
      return res.status(400).json({ error: 'symbol, from, and to parameters are required' });
    }
    
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Polygon API key not configured' });
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
      return res.status(400).json({ error: 'symbols array is required' });
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
      return res.status(400).json({ error: 'symbols array is required' });
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
      return res.status(500).json({ error: 'Candle handler not available' });
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
      polygonConnected: process.env.POLYGON_API_KEY ? 'API key present' : 'No API key',
      debugLog: logContent
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;