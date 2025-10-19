import { Trade, ITrade } from '../models/Trade.js';
import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';
import { MetaApiOrderResult } from '../../handlers/metaApiRestHandler.js';

export class TradeService {
  /**
   * Create a new trade record when placing an order
   */
  static async createTradeFromSignal(
    signal: ComprehensiveSignal,
    mt5Symbol: string,
    orderType: string,
    volume: number,
    scannerType?: 'pattern' | 'gap' | 'premarket' | 'manual'
  ): Promise<ITrade> {
    try {
      // Determine market volatility based on ATR
      let volatility: 'low' | 'medium' | 'high' = 'medium';
      if (signal.context.atr) {
        const atrPercent = (signal.context.atr / signal.currentPrice!) * 100;
        if (atrPercent < 1) volatility = 'low';
        else if (atrPercent > 3) volatility = 'high';
      }

      const trade = new Trade({
        // Basic info
        symbol: signal.symbol,
        mt5Symbol: mt5Symbol,
        patternName: signal.pattern.name,
        patternScore: signal.score,
        patternClass: signal.pattern.class,
        
        // Price levels
        entryPrice: signal.plan.entry,
        stopLoss: signal.plan.stop,
        takeProfit: signal.plan.targets[0], // First target
        
        // Trade details
        direction: signal.plan.direction,
        orderType: orderType,
        volume: volume,
        
        // Timing
        signalTime: new Date(signal.time),
        
        // Market conditions
        marketConditions: {
          trend: signal.context.trend,
          volatility: volatility,
          volume: signal.context.volumeFactor || 1,
          atr: signal.context.atr,
          nearSupport: signal.context.atSupport,
          nearResistance: signal.context.atResistance
        },
        
        // Additional
        timeframe: signal.timeframe,
        scannerType: scannerType,
        signalData: signal, // Store full signal for analysis
        status: 'pending'
      });
      
      return await trade.save();
    } catch (error) {
      console.error('Error creating trade:', error);
      throw error;
    }
  }
  
  /**
   * Update trade after MT5 order placement
   */
  static async updateTradeWithOrderResult(
    tradeId: string,
    result: MetaApiOrderResult,
    actualEntryPrice?: number
  ): Promise<ITrade | null> {
    try {
      const updateData: any = {
        orderPlacedTime: new Date()
      };
      
      if (result.success) {
        updateData.status = 'placed';
        updateData.mt5OrderId = result.data?.orderId;
        updateData.mt5PositionId = result.data?.positionId;
        if (actualEntryPrice) {
          updateData.actualEntryPrice = actualEntryPrice;
        }
      } else {
        updateData.status = 'rejected';
        updateData.mt5Error = result.error;
      }
      
      return await Trade.findByIdAndUpdate(
        tradeId,
        updateData,
        { new: true }
      );
    } catch (error) {
      console.error('Error updating trade with order result:', error);
      throw error;
    }
  }
  
  /**
   * Update trade when position is filled
   */
  static async updateTradeFilled(
    mt5OrderId: string,
    fillPrice: number,
    fillTime?: Date
  ): Promise<ITrade | null> {
    try {
      return await Trade.findOneAndUpdate(
        { mt5OrderId },
        {
          status: 'filled',
          actualEntryPrice: fillPrice,
          filledTime: fillTime || new Date()
        },
        { new: true }
      );
    } catch (error) {
      console.error('Error updating filled trade:', error);
      throw error;
    }
  }
  
  /**
   * Close a trade with exit details
   */
  static async closeTrade(
    mt5PositionId: string,
    exitPrice: number,
    exitReason: 'stop_loss' | 'take_profit' | 'manual' | 'system' | 'timeout',
    commission?: number
  ): Promise<ITrade | null> {
    try {
      const trade = await Trade.findOneAndUpdate(
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
        // P&L is calculated automatically in the pre-save hook
        await trade.save();
      }
      
      return trade;
    } catch (error) {
      console.error('Error closing trade:', error);
      throw error;
    }
  }
  
  /**
   * Get trade analytics for a specific pattern
   */
  static async getPatternAnalytics(patternName: string) {
    try {
      const trades = await Trade.find({
        patternName,
        status: 'closed'
      });
      
      const totalTrades = trades.length;
      const winningTrades = trades.filter(t => t.pnlAmount && t.pnlAmount > 0).length;
      const losingTrades = trades.filter(t => t.pnlAmount && t.pnlAmount < 0).length;
      
      const avgWin = trades
        .filter(t => t.pnlAmount && t.pnlAmount > 0)
        .reduce((sum, t) => sum + t.pnlAmount!, 0) / (winningTrades || 1);
        
      const avgLoss = trades
        .filter(t => t.pnlAmount && t.pnlAmount < 0)
        .reduce((sum, t) => sum + Math.abs(t.pnlAmount!), 0) / (losingTrades || 1);
      
      return {
        pattern: patternName,
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        avgWin: avgWin.toFixed(2),
        avgLoss: avgLoss.toFixed(2),
        profitFactor: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A'
      };
    } catch (error) {
      console.error('Error getting pattern analytics:', error);
      throw error;
    }
  }
  
  /**
   * Get recent trades
   */
  static async getRecentTrades(limit: number = 10): Promise<ITrade[]> {
    try {
      return await Trade.find()
        .sort({ signalTime: -1 })
        .limit(limit)
        .select('-signalData'); // Exclude large signal data
    } catch (error) {
      console.error('Error getting recent trades:', error);
      throw error;
    }
  }
}

export default TradeService;