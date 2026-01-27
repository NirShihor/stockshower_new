import { CanslimTrade, ICanslimTrade } from '../models/CanslimTrade.js';
import { CanslimSignal } from '../../services/canslimService.js';
import { MetaApiOrderResult } from '../../handlers/metaApiRestHandler.js';
import { EarningsCheckResult, SharesFloatData } from '../../services/earningsFilterService.js';

export class CanslimTradeService {
  static async createTrade(
    signal: CanslimSignal,
    mt5Symbol: string,
    volume: number,
    marketRegime: string,
    marketRegimeReason: string,
    forceOverride: boolean,
    dryRun: boolean,
    earningsData?: EarningsCheckResult,
    floatData?: SharesFloatData
  ): Promise<ICanslimTrade> {
    try {
      console.log(`[CanslimTradeService] Creating trade for ${signal.symbol} - Score: ${signal.score}/${signal.maxScore}`);
      
      const trade = new CanslimTrade({
        symbol: signal.symbol,
        mt5Symbol: mt5Symbol,
        
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.target,
        stopPercent: signal.stopPercent,
        
        direction: 'long',
        volume: volume,
        
        score: signal.score,
        maxScore: signal.maxScore,
        
        signalDate: signal.date,
        signalTime: new Date(),
        
        marketRegime: marketRegime,
        marketRegimeReason: marketRegimeReason,
        forceOverride: forceOverride,
        
        rsRating: signal.relativeStrength?.rsRating,
        rs12MonthReturn: signal.relativeStrength?.return12M,
        percentFromHigh: signal.newHigh?.percentFromHigh,
        basePatternType: signal.basePattern?.type,
        basePatternDepth: signal.basePattern?.depth,
        basePatternWeeks: signal.basePattern?.weeks,
        sectorRank: signal.sectorStrength?.rank,
        sectorMomentum: signal.sectorStrength?.momentum,
        volumeRatio: signal.volumeBreakout?.volumeRatio,
        
        earningsCheckPassed: earningsData?.pass,
        earningsCheckReason: earningsData?.reason,
        quarterlyEpsGrowth: earningsData?.currentEarnings?.quarterlyGrowth,
        annualEarningsTrend: earningsData?.currentEarnings?.annualGrowth,
        institutionalOwnership: earningsData?.institutionalOwnership,
        
        floatShares: floatData?.floatShares ?? undefined,
        outstandingShares: floatData?.outstandingShares ?? undefined,
        
        status: 'pending',
        dryRun: dryRun,
        
        signalData: signal
      });
      
      const savedTrade = await trade.save();
      console.log(`[CanslimTradeService] Trade saved with ID: ${savedTrade._id}`);
      return savedTrade;
    } catch (error) {
      console.error(`[CanslimTradeService] Error creating trade:`, error);
      throw error;
    }
  }

  static async updateWithOrderResult(
    tradeId: string,
    result: MetaApiOrderResult,
    orderType: string,
    actualEntryPrice?: number
  ): Promise<ICanslimTrade | null> {
    try {
      const updateData: any = {
        orderPlacedTime: new Date(),
        orderType: orderType
      };
      
      if (result.success) {
        updateData.status = 'placed';
        updateData.mt5OrderId = result.data?.orderId;
        updateData.mt5PositionId = result.data?.positionId;
        if (actualEntryPrice) {
          updateData.actualEntryPrice = actualEntryPrice;
        }
      } else {
        updateData.status = 'failed';
        updateData.mt5Error = result.error;
      }
      
      return await CanslimTrade.findByIdAndUpdate(tradeId, updateData, { new: true });
    } catch (error) {
      console.error('[CanslimTradeService] Error updating trade:', error);
      throw error;
    }
  }

  static async updateFilled(
    mt5OrderId: string,
    fillPrice: number,
    fillTime?: Date
  ): Promise<ICanslimTrade | null> {
    try {
      return await CanslimTrade.findOneAndUpdate(
        { mt5OrderId },
        {
          status: 'filled',
          actualEntryPrice: fillPrice,
          filledTime: fillTime || new Date()
        },
        { new: true }
      );
    } catch (error) {
      console.error('[CanslimTradeService] Error updating filled trade:', error);
      throw error;
    }
  }

  static async closeTrade(
    mt5PositionId: string,
    exitPrice: number,
    exitReason: ICanslimTrade['exitReason'],
    commission?: number
  ): Promise<ICanslimTrade | null> {
    try {
      const trade = await CanslimTrade.findOneAndUpdate(
        { mt5PositionId },
        {
          status: 'closed',
          closedTime: new Date(),
          exitPrice,
          exitReason,
          commission
        },
        { new: true }
      );
      
      if (trade) {
        await trade.save();
      }
      
      return trade;
    } catch (error) {
      console.error('[CanslimTradeService] Error closing trade:', error);
      throw error;
    }
  }

  static async closeTradeById(
    tradeId: string,
    exitPrice: number,
    exitReason: ICanslimTrade['exitReason'],
    commission?: number
  ): Promise<ICanslimTrade | null> {
    try {
      const trade = await CanslimTrade.findByIdAndUpdate(
        tradeId,
        {
          status: 'closed',
          closedTime: new Date(),
          exitPrice,
          exitReason,
          commission
        },
        { new: true }
      );
      
      if (trade) {
        await trade.save();
      }
      
      return trade;
    } catch (error) {
      console.error('[CanslimTradeService] Error closing trade by ID:', error);
      throw error;
    }
  }

  static async getOpenTrades(): Promise<ICanslimTrade[]> {
    return await CanslimTrade.find({
      status: { $in: ['pending', 'placed', 'filled'] }
    }).sort({ signalTime: -1 });
  }

  static async getOpenSymbols(): Promise<Set<string>> {
    const openTrades = await CanslimTrade.find({
      status: { $in: ['pending', 'placed', 'filled'] }
    }).select('symbol');
    return new Set(openTrades.map(t => t.symbol));
  }

  static async getRecentTrades(limit: number = 20): Promise<ICanslimTrade[]> {
    return await CanslimTrade.find()
      .sort({ signalTime: -1 })
      .limit(limit)
      .select('-signalData');
  }

  static async getTradesByDate(date: string): Promise<ICanslimTrade[]> {
    return await CanslimTrade.find({ signalDate: date }).sort({ signalTime: -1 });
  }

  static async getAnalytics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const trades = await CanslimTrade.find({
      signalTime: { $gte: startDate },
      dryRun: false
    });
    
    const closed = trades.filter(t => t.status === 'closed');
    const wins = closed.filter(t => t.pnlAmount && t.pnlAmount > 0);
    const losses = closed.filter(t => t.pnlAmount && t.pnlAmount < 0);
    
    const totalPnL = closed.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + (t.pnlAmount || 0), 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0 
      ? Math.abs(losses.reduce((sum, t) => sum + (t.pnlAmount || 0), 0)) / losses.length 
      : 0;
    
    const avgHoldingDays = closed.length > 0
      ? closed.reduce((sum, t) => sum + (t.holdingDays || 0), 0) / closed.length
      : 0;

    const byScore: Record<number, { count: number; wins: number; pnl: number }> = {};
    for (const trade of closed) {
      const score = trade.score;
      if (!byScore[score]) {
        byScore[score] = { count: 0, wins: 0, pnl: 0 };
      }
      byScore[score].count++;
      if (trade.pnlAmount && trade.pnlAmount > 0) byScore[score].wins++;
      byScore[score].pnl += trade.pnlAmount || 0;
    }

    const byExitReason: Record<string, { count: number; pnl: number }> = {};
    for (const trade of closed) {
      const reason = trade.exitReason || 'unknown';
      if (!byExitReason[reason]) {
        byExitReason[reason] = { count: 0, pnl: 0 };
      }
      byExitReason[reason].count++;
      byExitReason[reason].pnl += trade.pnlAmount || 0;
    }
    
    return {
      period: `Last ${days} days`,
      totalTrades: trades.length,
      closedTrades: closed.length,
      openTrades: trades.filter(t => t.status === 'filled').length,
      pendingOrders: trades.filter(t => t.status === 'pending' || t.status === 'placed').length,
      failedOrders: trades.filter(t => t.status === 'failed').length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) + '%' : 'N/A',
      totalPnL: totalPnL.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A',
      avgHoldingDays: avgHoldingDays.toFixed(1),
      byScore,
      byExitReason
    };
  }

  static async getDryRunAnalytics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const trades = await CanslimTrade.find({
      signalTime: { $gte: startDate },
      dryRun: true
    });
    
    return {
      period: `Last ${days} days`,
      totalDryRunTrades: trades.length,
      byDate: trades.reduce((acc: Record<string, number>, t) => {
        acc[t.signalDate] = (acc[t.signalDate] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

export default CanslimTradeService;
