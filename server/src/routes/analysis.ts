import express, { Request, Response, Router } from 'express';
import { scanGapUps, scanGapDowns, testPolygon, getChartData, getAvailableStocks, getLivePrice, getRiskAssessment, getPreMarketAnalysis, getHappyTwists, getFundamentalAnalysis, getMarketOverview } from '../handlers/stockAnalysis.js';

const router: Router = express.Router();

router.post('/scan-gap-ups', (req: Request, res: Response) => {
  scanGapUps(req, res);
});

router.post('/scan-gap-downs', (req: Request, res: Response) => {
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

export default router;