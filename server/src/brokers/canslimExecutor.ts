import { metaApiHandler, MetaApiOrderResult } from '../handlers/metaApiRestHandler.js';
import { 
  scanForCanslimCandidates, 
  CanslimSignal,
  CanslimConfig,
  CANSLIM_DEFAULT_CONFIG,
  clearCanslimCache
} from '../services/canslimService.js';
import { getMarketContext } from '../services/marketContextService.js';
import { RS_UNIVERSE, UK_UNIVERSE } from '../services/relativeStrengthService.js';
import { CanslimTradeService } from '../db/services/canslimTradeService.js';
import { checkEarningsWithPerplexity, EarningsCheckResult, getSharesFloat, SharesFloatData } from '../services/earningsFilterService.js';

export interface CanslimTradeConfig extends CanslimConfig {
  targetMarginGBP: number;
  maxDailyTrades: number;
  minScore: number;
  dryRun: boolean;
  ignoreMarketRegime: boolean;
  useEarningsFilter: boolean;
}

export interface ActiveCanslimTrade {
  symbol: string;
  mt5Symbol: string;
  direction: 'long';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  volume: number;
  status: 'pending' | 'filled' | 'closed';
  orderId?: string;
  positionId?: string;
  score: number;
  entryDate: string;
  dbTradeId?: string;
}

const DEFAULT_CONFIG: CanslimTradeConfig = {
  ...CANSLIM_DEFAULT_CONFIG,
  targetMarginGBP: 25,
  maxDailyTrades: 10,
  minScore: 4,
  dryRun: true,
  ignoreMarketRegime: false,
  useEarningsFilter: true,
  targetMultiple: 3,
};

export class CanslimExecutor {
  private config: CanslimTradeConfig;
  private activeTrades: Map<string, ActiveCanslimTrade> = new Map();
  private dailyTradeCount: number = 0;
  private isRunning: boolean = false;

  constructor(config: Partial<CanslimTradeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private convertToMT5Symbol(symbol: string, market: 'US' | 'UK' = 'US'): string {
    if (market === 'UK') {
      return symbol.endsWith('.L') ? symbol : `${symbol}.L`;
    }

    const nasdaqStocks = new Set([
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'COST',
      'CSCO', 'ADBE', 'AMD', 'NFLX', 'INTC', 'QCOM', 'INTU', 'AMAT', 'MU',
      'ADI', 'LRCX', 'SNPS', 'PANW', 'NOW', 'PYPL'
    ]);

    if (nasdaqStocks.has(symbol)) {
      return `${symbol}.O`;
    }
    return `${symbol}.N`;
  }

  async checkConnection(): Promise<boolean> {
    if (this.config.dryRun) {
      console.log('[CANSLIM] Dry run mode - skipping connection check');
      return true;
    }
    
    try {
      const status = await metaApiHandler.checkStatus();
      return status.connected;
    } catch (error) {
      console.error('[CANSLIM] MetaAPI connection check failed:', error);
      return false;
    }
  }

  async checkMarketRegime(): Promise<{
    canTrade: boolean;
    regime: string;
    reason: string;
    distributionDayStatus?: string;
    distributionDayCount?: number;
    positionSizingMultiplier?: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const context = await getMarketContext(today);

    if (!context) {
      return { canTrade: false, regime: 'unknown', reason: 'Failed to get market context' };
    }

    // O'Neil Distribution Day status takes precedence
    const distStatus = context.distributionDayStatus || 'CONFIRMED_UPTREND';
    const distCount = context.distributionDayCount || 0;
    const positionSizing = context.positionSizingMultiplier ?? 1.0;

    // Determine if trading is allowed based on distribution day status
    let canTrade = false;
    let reason = context.regimeReason;

    if (distStatus === 'MARKET_IN_CORRECTION') {
      canTrade = false;
      reason = `Market in CORRECTION (${distCount} distribution days in last 25 trading days)`;
    } else if (distStatus === 'RALLY_ATTEMPT') {
      canTrade = false;
      reason = `Rally attempt day ${context.rallyAttemptDay} - waiting for follow-through (day 4-7)`;
    } else if (distStatus === 'UPTREND_UNDER_PRESSURE') {
      canTrade = true;  // Can trade but with reduced sizing
      reason = `Uptrend UNDER PRESSURE (${distCount} distribution days) - reduced position sizing`;
    } else if (distStatus === 'CONFIRMED_UPTREND') {
      canTrade = context.regime === 'risk-on';
      reason = context.regimeReason;
    }

    return {
      canTrade,
      regime: distStatus !== 'CONFIRMED_UPTREND' ? distStatus : context.regime,
      reason,
      distributionDayStatus: distStatus,
      distributionDayCount: distCount,
      positionSizingMultiplier: positionSizing
    };
  }

  async scanForSignals(market: 'US' | 'UK' = 'US'): Promise<CanslimSignal[]> {
    const today = new Date().toISOString().split('T')[0];
    const universe = market === 'UK' ? UK_UNIVERSE : RS_UNIVERSE;
    console.log(`[CANSLIM] Scanning ${universe.length} ${market} symbols for signals on ${today}...`);

    const candidates = await scanForCanslimCandidates(today, universe, this.config, this.config.ignoreMarketRegime, market);

    const filtered = candidates.filter(c =>
      c.score >= this.config.minScore &&
      !this.activeTrades.has(c.symbol)
    );

    console.log(`[CANSLIM] Found ${filtered.length} ${market} candidates with score >= ${this.config.minScore}`);
    return filtered;
  }

  async executeTrade(signal: CanslimSignal, marketRegime: string, marketRegimeReason: string, earningsData?: EarningsCheckResult, floatData?: SharesFloatData, market: 'US' | 'UK' = 'US', positionSizingMultiplier: number = 1.0): Promise<boolean> {
    if (this.dailyTradeCount >= this.config.maxDailyTrades) {
      console.log(`[CANSLIM] Daily trade limit reached (${this.config.maxDailyTrades})`);
      return false;
    }

    if (this.activeTrades.has(signal.symbol)) {
      console.log(`[CANSLIM] Already have active trade for ${signal.symbol}`);
      return false;
    }

    const mt5Symbol = this.convertToMT5Symbol(signal.symbol, market);
    const entryPrice = signal.entryPrice;
    const stopLoss = signal.stopLoss;
    const takeProfit = signal.target;

    console.log(`\n[CANSLIM] ${this.config.dryRun ? '[DRY RUN] ' : ''}Executing trade for ${signal.symbol}`);
    console.log(`   MT5 Symbol: ${mt5Symbol}`);
    console.log(`   Score: ${signal.score}/${signal.maxScore}`);
    console.log(`   Entry: $${entryPrice.toFixed(2)}`);
    console.log(`   Stop: $${stopLoss.toFixed(2)} (-${signal.stopPercent}%)`);
    console.log(`   Target: $${takeProfit.toFixed(2)} (${signal.riskRewardRatio}:1 R:R)`);

    let dbTradeId: string | undefined;
    try {
      const dbTrade = await CanslimTradeService.createTrade(
        signal,
        mt5Symbol,
        0.01,
        marketRegime,
        marketRegimeReason,
        this.config.ignoreMarketRegime,
        this.config.dryRun,
        earningsData,
        floatData,
        market
      );
      dbTradeId = dbTrade._id?.toString();
      console.log(`   [DB] Trade saved with ID: ${dbTradeId}`);
    } catch (dbError) {
      console.error(`   [DB] Failed to save trade:`, dbError);
    }

    if (this.config.dryRun) {
      console.log(`   [DRY RUN] Would place BUY order`);
      
      const trade: ActiveCanslimTrade = {
        symbol: signal.symbol,
        mt5Symbol,
        direction: 'long',
        entryPrice,
        stopLoss,
        takeProfit,
        volume: 0.01,
        status: 'pending',
        orderId: `dry-run-${Date.now()}`,
        score: signal.score,
        entryDate: signal.date,
        dbTradeId
      };

      this.activeTrades.set(signal.symbol, trade);
      this.dailyTradeCount++;
      return true;
    }

    const orderSignal = {
      id: `canslim-${Date.now()}`,
      symbol: mt5Symbol, // Use pre-converted MT5 symbol to preserve market suffix (.L for UK, .O/.N for US)
      timeframe: 'day',
      time: new Date().toISOString(),
      pattern: {
        name: 'CAN SLIM Breakout',
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
        atr: (entryPrice - stopLoss) / 2,
        volumeFactor: 1,
        isHighVolume: true,
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
      score: signal.score * 15,
      notes: [
        `CAN SLIM Score: ${signal.score}/${signal.maxScore}`,
        `RS Rating: ${signal.relativeStrength?.rsRating || 'N/A'}`,
        `Market: ${signal.marketDirection.regime}`
      ],
      currentPrice: entryPrice,
      tradeType: 'swing',
      targetMarginGBP: Math.round(this.config.targetMarginGBP * positionSizingMultiplier)
    };

    // Log if position sizing is reduced
    if (positionSizingMultiplier < 1.0) {
      console.log(`[CANSLIM] Position sizing reduced: ${this.config.targetMarginGBP}GBP * ${(positionSizingMultiplier * 100).toFixed(0)}% = ${orderSignal.targetMarginGBP}GBP`);
    }

    try {
      const result = await metaApiHandler.placeOrder(orderSignal as any);

      if (dbTradeId) {
        await CanslimTradeService.updateWithOrderResult(dbTradeId, result, 'BUY_STOP', entryPrice);
      }

      if (result.success) {
        const trade: ActiveCanslimTrade = {
          symbol: signal.symbol,
          mt5Symbol,
          direction: 'long',
          entryPrice,
          stopLoss,
          takeProfit,
          volume: 0.01,
          status: 'pending',
          orderId: result.data?.orderId,
          positionId: result.data?.positionId,
          score: signal.score,
          entryDate: signal.date,
          dbTradeId
        };

        this.activeTrades.set(signal.symbol, trade);
        this.dailyTradeCount++;

        console.log(`[CANSLIM] Order placed successfully - ID: ${result.data?.orderId}`);
        return true;
      } else {
        console.log(`[CANSLIM] Order failed: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error(`[CANSLIM] Error placing order:`, error);
      return false;
    }
  }

  async scanAndExecute(market: 'US' | 'UK' = 'US'): Promise<{ scanned: number; executed: number; skipped: string }> {
    const universe = market === 'UK' ? UK_UNIVERSE : RS_UNIVERSE;

    const scanStartTime = new Date();
    console.log('\n' + '='.repeat(60));
    console.log(`CAN SLIM ${market} SCANNER ${this.config.dryRun ? '[DRY RUN]' : '[LIVE]'}`);
    console.log('='.repeat(60));
    console.log(`  Start time: ${scanStartTime.toLocaleString('en-GB', { timeZone: 'Europe/London' })} GMT`);
    console.log(`  Universe: ${universe.length} ${market} stocks`);
    console.log(`  Min score: ${this.config.minScore}/6`);
    console.log('='.repeat(60));

    const marketCheck = await this.checkMarketRegime();
    console.log(`\nMarket Regime: ${marketCheck.regime.toUpperCase()}`);
    console.log(`Reason: ${marketCheck.reason}`);

    // O'Neil Distribution Day status
    if (marketCheck.distributionDayCount !== undefined) {
      console.log(`Distribution Days: ${marketCheck.distributionDayCount} (last 25 trading days)`);
    }
    if (marketCheck.positionSizingMultiplier !== undefined && marketCheck.positionSizingMultiplier < 1.0) {
      console.log(`Position Sizing: ${(marketCheck.positionSizingMultiplier * 100).toFixed(0)}% (reduced due to market pressure)`);
    }

    if (!marketCheck.canTrade && !this.config.ignoreMarketRegime) {
      console.log(`\n[CANSLIM] Market is ${marketCheck.regime} - not trading`);

      // Market protection actions
      if (!this.config.dryRun) {
        // Cancel any pending CAN SLIM orders
        console.log(`[CANSLIM] Checking for pending orders to cancel...`);
        const cancelResult = await metaApiHandler.cancelAllCanslimOrders();
        if (cancelResult.cancelledCount > 0) {
          console.log(`[CANSLIM] Cancelled ${cancelResult.cancelledCount} pending orders`);
        }

        // If market is in CORRECTION (5+ distribution days), close ALL positions
        if (marketCheck.distributionDayStatus === 'MARKET_IN_CORRECTION') {
          console.log(`\n${'!'.repeat(60)}`);
          console.log(`[CANSLIM] MARKET CORRECTION DETECTED - CLOSING ALL POSITIONS`);
          console.log(`[CANSLIM] Distribution days: ${marketCheck.distributionDayCount}`);
          console.log(`${'!'.repeat(60)}\n`);

          const closeResult = await metaApiHandler.closeAllCanslimPositions();
          if (closeResult.closedCount > 0) {
            console.log(`[CANSLIM] CLOSED ${closeResult.closedCount} positions due to market correction`);
          }
          if (closeResult.errors.length > 0) {
            console.error(`[CANSLIM] Errors closing positions:`, closeResult.errors);
          }
        }
      }

      return { scanned: 0, executed: 0, skipped: `Market ${marketCheck.regime}` };
    }

    if (!marketCheck.canTrade && this.config.ignoreMarketRegime) {
      console.log(`\n[CANSLIM] Market is ${marketCheck.regime} - BUT FORCE OVERRIDE ENABLED`);
    }

    if (!this.config.dryRun) {
      const connected = await this.checkConnection();
      if (!connected) {
        console.log('[CANSLIM] Not connected to broker');
        return { scanned: 0, executed: 0, skipped: 'Broker not connected' };
      }
    }

    // ALWAYS check LIVE broker for existing positions/orders - database may be stale
    // This is the ONLY source of truth for what's actually open
    // Track symbols with their market to avoid blocking same ticker on different exchanges
    // e.g., JD.L (JD Sports UK) and JD.O (JD.com US) are different companies
    let existingOpenSymbols = new Set<string>();

    const getMarketFromMT5Symbol = (mt5Symbol: string): 'US' | 'UK' => {
      if (mt5Symbol.endsWith('.L')) return 'UK';
      return 'US'; // .O and .N are both US
    };

    try {
      const [positions, orders] = await Promise.all([
        metaApiHandler.getPositions(),
        metaApiHandler.getOrders()
      ]);

      console.log(`[CANSLIM] Broker check: ${positions.length} positions, ${orders.length} orders`);

      // Get ALL symbols that have CAN SLIM positions or pending orders at broker
      // Store as "symbol:market" to distinguish same ticker on different exchanges
      positions.forEach((p: any) => {
        if (p.comment && p.comment.includes('CAN SLIM')) {
          const baseSymbol = p.symbol.replace(/\.(O|N|L)$/, '');
          const symbolMarket = getMarketFromMT5Symbol(p.symbol);
          const symbolKey = `${baseSymbol}:${symbolMarket}`;
          existingOpenSymbols.add(symbolKey);
          console.log(`[CANSLIM] Found existing POSITION: ${p.symbol} -> ${symbolKey} (comment: ${p.comment})`);
        }
      });
      orders.forEach((o: any) => {
        if (o.comment && o.comment.includes('CAN SLIM')) {
          const baseSymbol = o.symbol.replace(/\.(O|N|L)$/, '');
          const symbolMarket = getMarketFromMT5Symbol(o.symbol);
          const symbolKey = `${baseSymbol}:${symbolMarket}`;
          existingOpenSymbols.add(symbolKey);
          console.log(`[CANSLIM] Found existing ORDER: ${o.symbol} -> ${symbolKey} (type: ${o.type}, comment: ${o.comment})`);
        }
      });

      if (existingOpenSymbols.size > 0) {
        console.log(`[CANSLIM] Blocking ${existingOpenSymbols.size} symbols with existing positions/orders: ${[...existingOpenSymbols].join(', ')}`);
      } else {
        console.log(`[CANSLIM] No existing CAN SLIM positions or orders at broker`);
      }
    } catch (brokerError) {
      console.error(`[CANSLIM] Failed to check broker for existing positions:`, brokerError);
      // Continue without blocking any symbols - better to risk duplicate than block everything
    }

    const signals = await this.scanForSignals(market);

    if (signals.length === 0) {
      console.log(`[CANSLIM] No valid ${market} signals found`);
      return { scanned: universe.length, executed: 0, skipped: 'No signals' };
    }

    let executed = 0;
    let skippedEarnings = 0;
    let skippedDuplicate = 0;
    
    for (const signal of signals) {
      if (this.dailyTradeCount >= this.config.maxDailyTrades) {
        console.log(`[CANSLIM] Daily limit reached`);
        break;
      }

      const symbolKey = `${signal.symbol}:${market}`;
      if (existingOpenSymbols.has(symbolKey)) {
        console.log(`[CANSLIM] SKIPPED ${signal.symbol} - already has open ${market} position/order`);
        skippedDuplicate++;
        continue;
      }

      console.log(`\n--- ${signal.symbol} ---`);
      console.log(`Score: ${signal.score}/${signal.maxScore}`);
      console.log(`RS Rating: ${signal.relativeStrength?.rsRating || 'N/A'}`);
      console.log(`Near 52wk High: ${signal.newHigh?.percentFromHigh?.toFixed(1)}%`);
      console.log(`Base Pattern: ${signal.basePattern?.type || 'none'}`);

      let earningsCheck: EarningsCheckResult | undefined;
      if (this.config.useEarningsFilter) {
        console.log(`[CANSLIM] Checking earnings for ${signal.symbol}...`);
        earningsCheck = await checkEarningsWithPerplexity(signal.symbol);
        
        if (!earningsCheck.pass) {
          console.log(`[CANSLIM] SKIPPED ${signal.symbol} - ${earningsCheck.reason}`);
          skippedEarnings++;
          continue;
        }
        console.log(`[CANSLIM] ${signal.symbol} passed earnings check: ${earningsCheck.reason}`);
      }

      const floatData = await getSharesFloat(signal.symbol);
      if (floatData.floatShares) {
        console.log(`[CANSLIM] ${signal.symbol} Float: ${(floatData.floatShares / 1e9).toFixed(2)}B shares`);
      }

      const sizingMultiplier = marketCheck.positionSizingMultiplier ?? 1.0;
      const success = await this.executeTrade(signal, marketCheck.regime, marketCheck.reason, earningsCheck, floatData, market, sizingMultiplier);
      if (success) executed++;
    }
    
    if (skippedEarnings > 0) {
      console.log(`\n[CANSLIM] Skipped ${skippedEarnings} stocks due to earnings filter`);
    }
    if (skippedDuplicate > 0) {
      console.log(`[CANSLIM] Skipped ${skippedDuplicate} stocks due to existing open positions`);
    }

    const scanEndTime = new Date();
    const scanDurationSec = ((scanEndTime.getTime() - scanStartTime.getTime()) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log(`${market} SCAN COMPLETE`);
    console.log('='.repeat(60));
    console.log(`  Market: ${market}`);
    console.log(`  Time: ${scanEndTime.toLocaleString('en-GB', { timeZone: 'Europe/London' })} GMT`);
    console.log(`  Duration: ${scanDurationSec}s`);
    console.log(`  Stocks scanned: ${universe.length}`);
    console.log(`  Candidates found: ${signals.length}`);
    console.log(`  Trades executed: ${executed}`);
    if (skippedEarnings > 0) console.log(`  Skipped (earnings): ${skippedEarnings}`);
    if (skippedDuplicate > 0) console.log(`  Skipped (duplicate): ${skippedDuplicate}`);
    console.log(`  Market regime: ${marketCheck.regime.toUpperCase()}`);
    console.log('='.repeat(60) + '\n');

    return { scanned: universe.length, executed, skipped: '' };
  }

  getActiveTrades(): Map<string, ActiveCanslimTrade> {
    return this.activeTrades;
  }

  getDailyStats(): { trades: number; active: number } {
    return {
      trades: this.dailyTradeCount,
      active: this.activeTrades.size
    };
  }

  resetDailyStats(): void {
    this.dailyTradeCount = 0;
    this.activeTrades.clear();
    clearCanslimCache();
  }

  getConfig(): CanslimTradeConfig {
    return { ...this.config };
  }

  setDryRun(dryRun: boolean): void {
    this.config.dryRun = dryRun;
  }
}

export function createCanslimExecutor(config: Partial<CanslimTradeConfig> = {}): CanslimExecutor {
  return new CanslimExecutor(config);
}
