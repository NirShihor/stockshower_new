import express, { Request, Response } from 'express';
import {
  getServiceStatus,
  getLastResult,
  startAiTopTradesService,
  stopAiTopTradesService,
  triggerManualScan,
  runBacktest,
  runMultiMonthBacktest
} from '../services/aiTopTradesService.js';

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

export default router;
