import { metaApiHandler, MetaApiOrderResult } from '../handlers/metaApiRestHandler.js';
import { analyzeGold, GoldAnalysis } from '../services/goldBreakoutService.js';
import { getMarketContext } from '../services/marketContextService.js';
import { GoldTrade, IGoldTrade } from '../db/models/GoldTrade.js';

export interface GoldTradeConfig {
  targetMarginGBP: number;
  maxOpenPositions: number;
  stopLossPercent: number;
  targetMultiple: number;
  dryRun: boolean;
}

const DEFAULT_CONFIG: GoldTradeConfig = {
  targetMarginGBP: 25,
  maxOpenPositions: 2,
  stopLossPercent: 3,
  targetMultiple: 2,
  dryRun: true
};

export class GoldExecutor {
  private config: GoldTradeConfig;

  constructor(config: Partial<GoldTradeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async getOpenGoldPositions(): Promise<number> {
    try {
      const positions = await metaApiHandler.getPositions();
      const goldPositions = positions.filter(
        (p: any) => p.symbol === 'GOLD' || p.symbol?.includes('GOLD')
      );
      return goldPositions.length;
    } catch (error) {
      console.error('[GOLD] Error checking positions:', error);
      return 0;
    }
  }

  async getPendingGoldOrders(): Promise<number> {
    try {
      const orders = await metaApiHandler.getOrders();
      const goldOrders = orders.filter(
        (o: any) => o.symbol === 'GOLD' || o.symbol?.includes('GOLD')
      );
      return goldOrders.length;
    } catch (error) {
      console.error('[GOLD] Error checking orders:', error);
      return 0;
    }
  }

  async canPlaceNewOrder(): Promise<{ allowed: boolean; reason: string }> {
    const openPositions = await this.getOpenGoldPositions();
    const pendingOrders = await this.getPendingGoldOrders();
    const total = openPositions + pendingOrders;

    if (total >= this.config.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Max gold positions reached (${total}/${this.config.maxOpenPositions})`
      };
    }

    return { allowed: true, reason: 'OK' };
  }

  async runScan(): Promise<{ analysis: GoldAnalysis | null; traded: boolean; reason: string }> {
    console.log('\n[GOLD] Running gold breakout scan...');

    const today = new Date().toISOString().split('T')[0];
    const marketContext = await getMarketContext(today);

    if (marketContext?.regime === 'risk-on') {
      return {
        analysis: null,
        traded: false,
        reason: 'Equity market is risk-on - CAN SLIM active, gold fallback not needed'
      };
    }

    const analysis = await analyzeGold(marketContext || undefined);

    if (!analysis) {
      return { analysis: null, traded: false, reason: 'Failed to analyze gold' };
    }

    console.log(`[GOLD] Current: $${analysis.currentPrice.toFixed(2)}`);
    console.log(`[GOLD] 20 EMA: $${analysis.ema20.toFixed(2)}`);
    console.log(`[GOLD] Trend: ${analysis.trend.toUpperCase()}`);
    console.log(`[GOLD] Score: ${analysis.score}/${analysis.maxScore}`);
    analysis.reasons.forEach(r => console.log(`[GOLD]   - ${r}`));

    if (analysis.recommendation !== 'buy_stop') {
      return {
        analysis,
        traded: false,
        reason: `Recommendation: ${analysis.recommendation}`
      };
    }

    const canPlace = await this.canPlaceNewOrder();
    if (!canPlace.allowed) {
      return { analysis, traded: false, reason: canPlace.reason };
    }

    const result = await this.executeTrade(analysis);
    return {
      analysis,
      traded: result.success,
      reason: result.success ? 'Trade executed' : result.error || 'Trade failed'
    };
  }

  async executeTrade(analysis: GoldAnalysis): Promise<{ success: boolean; error?: string }> {
    if (!analysis.breakoutLevel || !analysis.consolidation) {
      return { success: false, error: 'No breakout level or consolidation' };
    }

    const entryPrice = analysis.breakoutLevel;
    const stopLoss = entryPrice * (1 - this.config.stopLossPercent / 100);
    const riskAmount = entryPrice - stopLoss;
    const takeProfit = entryPrice + (riskAmount * this.config.targetMultiple);

    console.log(`\n[GOLD] ${this.config.dryRun ? '[DRY RUN] ' : ''}Executing gold trade`);
    console.log(`   Entry (buy stop): $${entryPrice.toFixed(2)}`);
    console.log(`   Stop Loss: $${stopLoss.toFixed(2)} (-${this.config.stopLossPercent}%)`);
    console.log(`   Take Profit: $${takeProfit.toFixed(2)} (${this.config.targetMultiple}:1 R:R)`);
    console.log(`   Margin: £${this.config.targetMarginGBP}`);

    const dbTrade = await this.saveTradeToDb(analysis, entryPrice, stopLoss, takeProfit);

    if (this.config.dryRun) {
      console.log(`   [DRY RUN] Would place BUY STOP order`);
      if (dbTrade) {
        await this.updateTradeStatus(dbTrade._id.toString(), 'placed', `dry-run-${Date.now()}`);
      }
      return { success: true };
    }

    const orderSignal = {
      id: `gold-${Date.now()}`,
      symbol: 'GOLD',
      timeframe: 'day',
      time: new Date().toISOString(),
      pattern: {
        name: 'Gold Breakout',
        class: 'single' as const,
        direction: 'bullish' as const,
        barsInvolved: 1,
        patternHigh: entryPrice,
        patternLow: stopLoss
      },
      context: {
        trend: 'up' as const,
        atSupport: false,
        atResistance: false,
        atr: riskAmount,
        volumeFactor: 1,
        isHighVolume: false,
        isWideRange: false
      },
      confirmation: {
        triggerSide: 'above_high' as const,
        triggerPrice: entryPrice,
        invalidationPrice: stopLoss,
        validForBars: 1
      },
      plan: {
        direction: 'long' as const,
        entry: entryPrice,
        stop: stopLoss,
        targets: [takeProfit],
        positionQty: 1,
        riskRewardRatio: `1:${this.config.targetMultiple}`
      },
      score: analysis.score * 30,
      notes: [
        `Gold Breakout Score: ${analysis.score}/${analysis.maxScore}`,
        `Consolidation: ${analysis.consolidation.days} days`,
        `Equity Market: ${analysis.equityMarketRegime}`
      ],
      currentPrice: analysis.currentPrice,
      tradeType: 'swing',
      targetMarginGBP: this.config.targetMarginGBP
    };

    try {
      const result = await metaApiHandler.placeOrder(orderSignal as any);

      if (dbTrade) {
        if (result.success) {
          await this.updateTradeStatus(dbTrade._id.toString(), 'placed', result.data?.orderId);
        } else {
          await this.updateTradeStatus(dbTrade._id.toString(), 'failed', undefined, result.error);
        }
      }

      if (result.success) {
        console.log(`   ✓ Order placed: ${result.data?.orderId}`);
        return { success: true };
      } else {
        console.log(`   ✗ Order failed: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      console.error('[GOLD] Error placing order:', error.message);
      return { success: false, error: error.message };
    }
  }

  private async saveTradeToDb(
    analysis: GoldAnalysis,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number
  ): Promise<IGoldTrade | null> {
    try {
      const trade = new GoldTrade({
        symbol: 'GOLD',
        entryPrice,
        stopLoss,
        takeProfit,
        stopPercent: this.config.stopLossPercent,
        direction: 'long',
        orderType: 'BUY_STOP',
        volume: 0.01,
        score: analysis.score,
        maxScore: analysis.maxScore,
        signalDate: new Date().toISOString().split('T')[0],
        signalTime: new Date(),
        equityMarketRegime: analysis.equityMarketRegime,
        equityMarketReason: analysis.equityMarketReason,
        goldEma20: analysis.ema20,
        goldTrend: analysis.trend,
        consolidationHigh: analysis.consolidation?.high || 0,
        consolidationLow: analysis.consolidation?.low || 0,
        consolidationDays: analysis.consolidation?.days || 0,
        breakoutLevel: analysis.breakoutLevel || 0,
        vixLevel: analysis.vixLevel,
        vixElevated: analysis.vixElevated,
        status: 'pending',
        dryRun: this.config.dryRun
      });

      const saved = await trade.save();
      console.log(`   [DB] Gold trade saved: ${saved._id}`);
      return saved;
    } catch (error) {
      console.error('[GOLD] Error saving trade to DB:', error);
      return null;
    }
  }

  private async updateTradeStatus(
    tradeId: string,
    status: string,
    orderId?: string,
    error?: string
  ): Promise<void> {
    try {
      const update: any = { status, orderPlacedTime: new Date() };
      if (orderId) update.mt5OrderId = orderId;
      if (error) update.mt5Error = error;

      await GoldTrade.findByIdAndUpdate(tradeId, update);
    } catch (err) {
      console.error('[GOLD] Error updating trade status:', err);
    }
  }
}

export function createGoldExecutor(config: Partial<GoldTradeConfig> = {}): GoldExecutor {
  return new GoldExecutor(config);
}
