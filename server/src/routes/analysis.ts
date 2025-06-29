import express, { Request, Response, Router } from 'express';
import { analyzeStock, scanGapUps, testAlphaVantage } from '../handlers/stockAnalysis.js';

const router: Router = express.Router();

router.post('/stock', (req: Request, res: Response) => {
  analyzeStock(req, res);
});

router.post('/scan-gap-ups', (req: Request, res: Response) => {
  scanGapUps(req, res);
});

router.get('/test-alphavantage', (req: Request, res: Response) => {
  testAlphaVantage(req, res);
});

export default router;