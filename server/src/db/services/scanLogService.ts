import { ScanLog, IScanLog } from '../models/ScanLog.js';

export interface ScanLogData {
  scanType: 'canslim';
  market: 'US' | 'UK';
  scanDate: string;
  durationSeconds: number;
  universeSize: number;

  // Market conditions
  marketRegime: string;
  distributionDayStatus?: string;
  distributionDayCount?: number;
  positionSizingMultiplier?: number;
  canTrade: boolean;
  marketRegimeReason?: string;

  // Results
  candidatesFound: number;
  tradesExecuted: number;

  // Skipped breakdown
  skippedEarnings: number;
  skippedDuplicate: number;
  skippedMarketRegime: boolean;
  skippedReason?: string;

  // Top candidates
  topCandidates?: Array<{
    symbol: string;
    score: number;
    rsRating?: number;
    percentFromHigh?: number;
    basePatternType?: string;
    executed: boolean;
    skipReason?: string;
  }>;

  // Configuration
  config?: {
    minScore: number;
    maxDailyTrades: number;
    targetMarginGBP: number;
    dryRun: boolean;
    ignoreMarketRegime: boolean;
    useEarningsFilter: boolean;
  };

  // Errors
  errors?: string[];

  dryRun: boolean;
}

export class ScanLogService {
  static async logScan(data: ScanLogData): Promise<IScanLog> {
    try {
      const scanLog = new ScanLog({
        ...data,
        scanTime: new Date()
      });

      const saved = await scanLog.save();
      console.log(`[ScanLogService] Scan logged: ${data.market} ${data.scanDate} - ${data.candidatesFound} candidates, ${data.tradesExecuted} executed`);
      return saved;
    } catch (error) {
      console.error('[ScanLogService] Error logging scan:', error);
      throw error;
    }
  }

  static async getRecentScans(limit: number = 50): Promise<IScanLog[]> {
    return await ScanLog.find()
      .sort({ scanTime: -1 })
      .limit(limit);
  }

  static async getScansByDate(date: string): Promise<IScanLog[]> {
    return await ScanLog.find({ scanDate: date })
      .sort({ scanTime: -1 });
  }

  static async getScansByMarket(market: 'US' | 'UK', limit: number = 20): Promise<IScanLog[]> {
    return await ScanLog.find({ market })
      .sort({ scanTime: -1 })
      .limit(limit);
  }

  static async getTodaysScans(): Promise<IScanLog[]> {
    const today = new Date().toISOString().split('T')[0];
    return await ScanLog.find({ scanDate: today })
      .sort({ scanTime: -1 });
  }

  static async getScanStats(days: number = 7): Promise<{
    totalScans: number;
    byMarket: { US: number; UK: number };
    totalCandidates: number;
    totalExecuted: number;
    avgCandidatesPerScan: number;
    avgExecutedPerScan: number;
    marketRegimeBreakdown: Record<string, number>;
    skippedBreakdown: {
      earnings: number;
      duplicate: number;
      marketRegime: number;
    };
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const scans = await ScanLog.find({
      scanDate: { $gte: startDateStr }
    });

    const byMarket = { US: 0, UK: 0 };
    let totalCandidates = 0;
    let totalExecuted = 0;
    const marketRegimeBreakdown: Record<string, number> = {};
    let skippedEarnings = 0;
    let skippedDuplicate = 0;
    let skippedMarketRegime = 0;

    for (const scan of scans) {
      byMarket[scan.market]++;
      totalCandidates += scan.candidatesFound || 0;
      totalExecuted += scan.tradesExecuted || 0;

      const regime = scan.distributionDayStatus || scan.marketRegime || 'unknown';
      marketRegimeBreakdown[regime] = (marketRegimeBreakdown[regime] || 0) + 1;

      skippedEarnings += scan.skippedEarnings || 0;
      skippedDuplicate += scan.skippedDuplicate || 0;
      if (scan.skippedMarketRegime) skippedMarketRegime++;
    }

    return {
      totalScans: scans.length,
      byMarket,
      totalCandidates,
      totalExecuted,
      avgCandidatesPerScan: scans.length > 0 ? totalCandidates / scans.length : 0,
      avgExecutedPerScan: scans.length > 0 ? totalExecuted / scans.length : 0,
      marketRegimeBreakdown,
      skippedBreakdown: {
        earnings: skippedEarnings,
        duplicate: skippedDuplicate,
        marketRegime: skippedMarketRegime
      }
    };
  }

  static async getLatestScan(market?: 'US' | 'UK'): Promise<IScanLog | null> {
    const query = market ? { market } : {};
    return await ScanLog.findOne(query)
      .sort({ scanTime: -1 });
  }
}

export default ScanLogService;
