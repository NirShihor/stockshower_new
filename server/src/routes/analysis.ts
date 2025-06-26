import express, { Request, Response, Router } from 'express';
import { analyzeStock, scanGapUps } from '../handlers/stockAnalysis.js';

const router: Router = express.Router();

router.post('/stock', (req: Request, res: Response) => {
  analyzeStock(req, res);
});

router.post('/scan-gap-ups', (req: Request, res: Response) => {
  scanGapUps(req, res);
});

export default router;