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
  maxOpenPositions: 1,
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

    const canslimActive = marketContext?.regime === 'risk-on' &&
      (marketContext?.distributionDayStatus === 'CONFIRMED_UPTREND' ||
       marketContext?.distributionDayStatus === 'UPTREND_UNDER_PRESSURE');

    if (canslimActive) {
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

    // Use the HIGHER (tighter) of consolidation low vs recent 3-day low
    const supportLevel = Math.max(analysis.consolidation.low, analysis.consolidation.recentLow);
    // Structure-based stop: just below support (0.2% buffer)
    const structureStop = supportLevel * 0.998;
    // Max cap stop: maximum allowed loss (3% for gold)
    const maxCapStop = entryPrice * (1 - this.config.stopLossPercent / 100);
    // Use the TIGHTER stop (higher value = closer to entry)
    const stopLoss = Math.max(structureStop, maxCapStop);

    const actualStopPercent = ((entryPrice - stopLoss) / entryPrice) * 100;
    const stopType = stopLoss === structureStop ? 'STRUCTURE' : 'MAX-CAP';

    const riskAmount = entryPrice - stopLoss;
    const takeProfit = entryPrice + (riskAmount * this.config.targetMultiple);

    console.log(`\n[GOLD] ${this.config.dryRun ? '[DRY RUN] ' : ''}Executing gold trade`);
    console.log(`   Entry (buy stop): $${entryPrice.toFixed(2)}`);
    console.log(`   Consolidation low: $${analysis.consolidation.low.toFixed(2)}, Recent 3-day low: $${analysis.consolidation.recentLow.toFixed(2)}`);
    console.log(`   Support used: $${supportLevel.toFixed(2)} (${supportLevel === analysis.consolidation.recentLow ? 'RECENT' : 'CONSOLIDATION'})`);
    console.log(`   Stop Loss: $${stopLoss.toFixed(2)} (-${actualStopPercent.toFixed(1)}%, ${stopType})`);
    console.log(`   Take Profit: $${takeProfit.toFixed(2)} (${this.config.targetMultiple}:1 R:R)`);
    console.log(`   Margin: £${this.config.targetMarginGBP}`);

    const dbTrade = await this.saveTradeToDb(analysis, entryPrice, stopLoss, takeProfit, actualStopPercent);

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
    takeProfit: number,
    actualStopPercent: number
  ): Promise<IGoldTrade | null> {
    try {
      const trade = new GoldTrade({
        symbol: 'GOLD',
        entryPrice,
        stopLoss,
        takeProfit,
        stopPercent: actualStopPercent,
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

  async syncPositionStatus(): Promise<{ checked: number; updated: number; errors: string[] }> {
    const result = { checked: 0, updated: 0, errors: [] as string[] };

    try {
      const [positions, orders] = await Promise.all([
        metaApiHandler.getPositions(),
        metaApiHandler.getOrders()
      ]);

      const goldPositions = positions.filter(
        (p: any) => p.symbol === 'GOLD' || p.symbol?.includes('GOLD')
      );
      const goldOrders = orders.filter(
        (o: any) => o.symbol === 'GOLD' || o.symbol?.includes('GOLD')
      );

      const placedTrades = await GoldTrade.find({ status: 'placed', dryRun: false });
      const filledTrades = await GoldTrade.find({ status: 'filled', dryRun: false });

      result.checked = placedTrades.length + filledTrades.length;

      for (const trade of placedTrades) {
        try {
          const orderExists = goldOrders.some((o: any) => o.id === trade.mt5OrderId);

          if (!orderExists) {
            const matchingPosition = goldPositions.find((p: any) =>
              p.openPrice && Math.abs(p.openPrice - trade.entryPrice) < 5
            );

            if (matchingPosition) {
              await GoldTrade.findByIdAndUpdate(trade._id, {
                status: 'filled',
                mt5PositionId: matchingPosition.id,
                actualEntryPrice: matchingPosition.openPrice,
                filledTime: new Date()
              });
              console.log(`[GOLD-SYNC] Trade ${trade._id} filled at $${matchingPosition.openPrice}`);
              result.updated++;
            } else {
              const hoursSincePlaced = trade.orderPlacedTime
                ? (Date.now() - new Date(trade.orderPlacedTime).getTime()) / (1000 * 60 * 60)
                : 0;

              if (hoursSincePlaced > 48) {
                await GoldTrade.findByIdAndUpdate(trade._id, {
                  status: 'cancelled',
                  exitReason: 'expired'
                });
                console.log(`[GOLD-SYNC] Trade ${trade._id} expired after 48 hours`);
                result.updated++;
              }
            }
          }
        } catch (err: any) {
          result.errors.push(`Trade ${trade._id}: ${err.message}`);
        }
      }

      for (const trade of filledTrades) {
        try {
          const positionExists = goldPositions.some(
            (p: any) => p.id === trade.mt5PositionId
          );

          if (!positionExists && trade.mt5PositionId) {
            const closedPosition = await metaApiHandler.getClosedPosition(trade.mt5PositionId);
            const exitPrice = closedPosition?.closePrice || trade.takeProfit;
            const entryPrice = trade.actualEntryPrice || trade.entryPrice;

            let exitReason: 'stop_loss' | 'target' | 'trailing_stop' | 'manual' = 'manual';
            if (closedPosition?.closePrice) {
              if (closedPosition.closePrice <= trade.stopLoss + 1) {
                exitReason = 'stop_loss';
              } else if (closedPosition.closePrice >= trade.takeProfit - 1) {
                exitReason = 'target';
              } else if (closedPosition.closePrice > entryPrice) {
                exitReason = 'trailing_stop';
              }
            }

            const pnlAmount = (exitPrice - entryPrice) * (trade.volume || 0.01) * 100;
            const pnlPercentage = ((exitPrice - entryPrice) / entryPrice) * 100;

            await GoldTrade.findByIdAndUpdate(trade._id, {
              status: 'closed',
              exitPrice,
              exitReason,
              closedTime: new Date(),
              pnlAmount,
              pnlPercentage,
              commission: closedPosition?.commission || 0
            });

            console.log(`[GOLD-SYNC] Trade ${trade._id} closed at $${exitPrice} (${exitReason}) P&L: ${pnlPercentage.toFixed(2)}%`);
            result.updated++;
          }
        } catch (err: any) {
          result.errors.push(`Trade ${trade._id}: ${err.message}`);
        }
      }

    } catch (error: any) {
      console.error('[GOLD-SYNC] Error syncing positions:', error.message);
      result.errors.push(`General error: ${error.message}`);
    }

    return result;
  }

  async closeOnRegimeChange(): Promise<{ closed: number; errors: string[] }> {
    const result = { closed: 0, errors: [] as string[] };

    try {
      const today = new Date().toISOString().split('T')[0];
      const marketContext = await getMarketContext(today, 'US');

      if (marketContext?.regime !== 'risk-on') {
        return result;
      }

      if (marketContext?.distributionDayStatus !== 'CONFIRMED_UPTREND') {
        console.log(`[GOLD-REGIME] US market is risk-on but O'Neil status is ${marketContext?.distributionDayStatus} - keeping gold positions`);
        return result;
      }

      console.log('[GOLD-REGIME] US market is risk-on AND confirmed uptrend - checking for gold positions to close');

      const positions = await metaApiHandler.getPositions();
      const goldPositions = positions.filter(
        (p: any) => p.symbol === 'GOLD' || p.symbol?.includes('GOLD')
      );

      if (goldPositions.length === 0) {
        console.log('[GOLD-REGIME] No open gold positions');
        return result;
      }

      for (const position of goldPositions) {
        try {
          const positionId = position.id;
          const currentPrice = position.currentPrice || position.openPrice;
          const entryPrice = position.openPrice;

          console.log(`[GOLD-REGIME] Closing gold position ${positionId} at $${currentPrice} (US market risk-on)`);

          const closeResult = await metaApiHandler.closePosition(positionId);

          if (closeResult.success) {
            const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;
            const pnlAmount = (currentPrice - entryPrice) * (position.volume || 0.01) * 100;

            await GoldTrade.findOneAndUpdate(
              { mt5PositionId: positionId, status: 'filled' },
              {
                status: 'closed',
                exitPrice: currentPrice,
                exitReason: 'regime_change',
                closedTime: new Date(),
                pnlAmount,
                pnlPercentage
              }
            );

            console.log(`[GOLD-REGIME] Position closed - P&L: ${pnlPercentage.toFixed(2)}%`);
            result.closed++;
          } else {
            result.errors.push(`Failed to close position ${positionId}: ${closeResult.error}`);
          }
        } catch (err: any) {
          result.errors.push(`Position ${position.id}: ${err.message}`);
        }
      }

    } catch (error: any) {
      console.error('[GOLD-REGIME] Error checking regime change:', error.message);
      result.errors.push(`General error: ${error.message}`);
    }

    return result;
  }
}

export function createGoldExecutor(config: Partial<GoldTradeConfig> = {}): GoldExecutor {
  return new GoldExecutor(config);
}
