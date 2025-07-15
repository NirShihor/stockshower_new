import express, { Request, Response, Router } from 'express';
import { scanGapUps, testPolygon, getChartData, getAvailableStocks, getLivePrice, getRiskAssessment } from '../handlers/stockAnalysis.js';

const router: Router = express.Router();

router.post('/scan-gap-ups', (req: Request, res: Response) => {
  scanGapUps(req, res);
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

export default router;