import express, { Request, Response, Router } from 'express';
import { scanGapUps, scanGapDowns, testPolygon, getChartData, getAvailableStocks, getLivePrice, getRiskAssessment, getPreMarketAnalysis, getHappyTwists, getFundamentalAnalysis, getMarketOverview, getGoldAnalysis } from '../handlers/stockAnalysis.js';
import { scanUKGaps } from '../handlers/ukGapScanner.js';

const router: Router = express.Router();

// market: 'US' (default) uses the Polygon US scanner; 'UK' uses the opening-range FTSE scanner.
router.post('/scan-gap-ups', async (req: Request, res: Response) => {
  if ((req.body?.market || '').toUpperCase() === 'UK') {
    try {
      const result = await scanUKGaps('up', req.body?.volatilityLevel || 'low');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: `UK gap-up scan failed: ${err?.message || err}` });
    }
    return;
  }
  scanGapUps(req, res);
});

router.post('/scan-gap-downs', async (req: Request, res: Response) => {
  if ((req.body?.market || '').toUpperCase() === 'UK') {
    try {
      const result = await scanUKGaps('down', req.body?.volatilityLevel || 'low');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: `UK gap-down scan failed: ${err?.message || err}` });
    }
    return;
  }
  scanGapDowns(req, res);
});

router.get('/test-polygon', (req: Request, res: Response) => {
  testPolygon(req, res);
});

router.get('/chart/:symbol', (req: Request, res: Response) => {
  getChartData(req, res);
});

router.get('/available-stocks', (req: Request, res: Response) => {
  getAvailableStocks(req, res);
});

router.get('/chart/:symbol/live-price', (req: Request, res: Response) => {
  getLivePrice(req, res);
});

router.post('/risk-assessment', (req: Request, res: Response) => {
  getRiskAssessment(req, res);
});

router.post('/pre-market-analysis', (req: Request, res: Response) => {
  getPreMarketAnalysis(req, res);
});

router.post('/happy-twists', (req: Request, res: Response) => {
  getHappyTwists(req, res);
});

router.post('/fundamental', (req: Request, res: Response) => {
  getFundamentalAnalysis(req, res);
});

router.get('/market-overview', (req: Request, res: Response) => {
  getMarketOverview(req, res);
});

router.get('/gold-analysis', (req: Request, res: Response) => {
  getGoldAnalysis(req, res);
});

export default router;