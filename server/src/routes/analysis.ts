import express, { Request, Response, Router } from 'express';
import { analyzeStock, scanGapUps, testPolygon, getChartData } from '../handlers/stockAnalysis.js';

const router: Router = express.Router();

router.post('/stock', (req: Request, res: Response) => {
  analyzeStock(req, res);
});

router.post('/scan-gap-ups', (req: Request, res: Response) => {
  scanGapUps(req, res);
});

router.get('/test-polygon', (req: Request, res: Response) => {
  testPolygon(req, res);
});

router.get('/chart/:symbol', (req: Request, res: Response) => {
  getChartData(req, res);
});

export default router;