// @ts-nocheck
import express, { Request, Response } from 'express';
import {
  getServiceStatus,
  getLastResult,
  startAiTopTradesService,
  stopAiTopTradesService,
  triggerManualScan,
  runBacktest,
  runMultiMonthBacktest,
  runFullDayBacktest
} from '../services/aiTopTradesService.js';
import { analyzeSwingTrades, runSwingBacktest } from '../services/swingTradeService.js';
import { runAlgoSwingBacktest } from '../services/algoSwingTradeService.js';
import { 
  startSwingExecutor, 
  stopSwingExecutor, 
  getSwingExecutorStatus, 
  triggerSwingTradeNow 
} from '../services/swingTradeExecutor.js';

const router = express.Router();

router.get('/status', (req: Request, res: Response) => {
  try {
    const status = getServiceStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Error getting AI Top Trades status:', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

router.get('/last-result', (req: Request, res: Response) => {
  try {
    const result = getLastResult();
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error getting last result:', error);
    res.status(500).json({ success: false, error: 'Failed to get last result' });
  }
});

router.post('/start', (req: Request, res: Response) => {
  try {
    startAiTopTradesService();
    res.json({ success: true, message: 'AI Top Trades service started' });
  } catch (error) {
    console.error('Error starting service:', error);
    res.status(500).json({ success: false, error: 'Failed to start service' });
  }
});

router.post('/stop', (req: Request, res: Response) => {
  try {
    stopAiTopTradesService();
    res.json({ success: true, message: 'AI Top Trades service stopped' });
  } catch (error) {
    console.error('Error stopping service:', error);
    res.status(500).json({ success: false, error: 'Failed to stop service' });
  }
});

router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const result = await triggerManualScan();
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error triggering manual scan:', error);
    res.status(500).json({ success: false, error: 'Failed to trigger scan' });
  }
});

router.post('/backtest', async (req: Request, res: Response) => {
  try {
    const { date, scanTime = '15:30' } = req.body;
    
    if (!date) {
      res.status(400).json({ success: false, error: 'Date is required (format: YYYY-MM-DD)' });
      return;
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    console.log(`[API] Backtest requested for ${date} at ${scanTime}`);
    const result = await runBacktest(date, scanTime);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error running backtest:', error);
    res.status(500).json({ success: false, error: 'Failed to run backtest' });
  }
});

router.post('/backtest-multi', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, scanTime = '15:30' } = req.body;
    
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: 'startDate and endDate are required (format: YYYY-MM-DD)' });
      return;
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    console.log(`[API] Multi-month backtest requested from ${startDate} to ${endDate} at ${scanTime}`);
    const result = await runMultiMonthBacktest(startDate, endDate, scanTime);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error running multi-month backtest:', error);
    res.status(500).json({ success: false, error: 'Failed to run multi-month backtest' });
  }
});

router.post('/backtest-full-day', async (req: Request, res: Response) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      res.status(400).json({ success: false, error: 'Date is required (format: YYYY-MM-DD)' });
      return;
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    console.log(`[API] Full day backtest requested for ${date}`);
    const result = await runFullDayBacktest(date);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error running full day backtest:', error);
    res.status(500).json({ success: false, error: 'Failed to run full day backtest' });
  }
});

router.post('/swing-analyze', async (req: Request, res: Response) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      res.status(400).json({ success: false, error: 'Date is required (format: YYYY-MM-DD)' });
      return;
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    console.log(`[API] Swing trade analysis requested for ${date}`);
    const result = await analyzeSwingTrades(date);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error analyzing swing trades:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze swing trades' });
  }
});

router.post('/swing-backtest', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: 'startDate and endDate are required (format: YYYY-MM-DD)' });
      return;
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    console.log(`[API] Swing backtest requested from ${startDate} to ${endDate}`);
    const result = await runSwingBacktest(startDate, endDate);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error running swing backtest:', error);
    res.status(500).json({ success: false, error: 'Failed to run swing backtest' });
  }
});

router.post('/algo-swing-backtest', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: 'startDate and endDate are required (format: YYYY-MM-DD)' });
      return;
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    console.log(`[API] Algo swing backtest requested from ${startDate} to ${endDate}`);
    const result = await runAlgoSwingBacktest(startDate, endDate);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error running algo swing backtest:', error);
    res.status(500).json({ success: false, error: 'Failed to run algo swing backtest' });
  }
});

router.get('/swing-executor/status', (req: Request, res: Response) => {
  try {
    const status = getSwingExecutorStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Error getting swing executor status:', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

router.post('/swing-executor/start', (req: Request, res: Response) => {
  try {
    startSwingExecutor();
    res.json({ success: true, message: 'Swing trade executor started' });
  } catch (error) {
    console.error('Error starting swing executor:', error);
    res.status(500).json({ success: false, error: 'Failed to start swing executor' });
  }
});

router.post('/swing-executor/stop', (req: Request, res: Response) => {
  try {
    stopSwingExecutor();
    res.json({ success: true, message: 'Swing trade executor stopped' });
  } catch (error) {
    console.error('Error stopping swing executor:', error);
    res.status(500).json({ success: false, error: 'Failed to stop swing executor' });
  }
});

router.post('/swing-executor/trigger', async (req: Request, res: Response) => {
  try {
    console.log('[API] Manual swing trade trigger requested');
    const result = await triggerSwingTradeNow();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error triggering swing trades:', error);
    res.status(500).json({ success: false, error: 'Failed to trigger swing trades' });
  }
});

export default router;
