import { metaApiHandler, MetaApiOrderResult } from '../handlers/metaApiRestHandler.js';
import { 
  scanForCanslimCandidates, 
  CanslimSignal,
  CanslimConfig,
  CANSLIM_DEFAULT_CONFIG,
  clearCanslimCache
} from '../services/canslimService.js';
import { getMarketContext } from '../services/marketContextService.js';
import { RS_UNIVERSE } from '../services/relativeStrengthService.js';
import { CanslimTradeService } from '../db/services/canslimTradeService.js';

export interface CanslimTradeConfig extends CanslimConfig {
  targetMarginGBP: number;
  maxDailyTrades: number;
  minScore: number;
  dryRun: boolean;
  ignoreMarketRegime: boolean;
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
  targetMarginGBP: 1,
  maxDailyTrades: 3,
  minScore: 4,
  dryRun: true,
  ignoreMarketRegime: false,
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

  private convertToMT5Symbol(symbol: string): string {
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

  async checkMarketRegime(): Promise<{ canTrade: boolean; regime: string; reason: string }> {
    const today = new Date().toISOString().split('T')[0];
    const context = await getMarketContext(today);
    
    if (!context) {
      return { canTrade: false, regime: 'unknown', reason: 'Failed to get market context' };
    }

    return {
      canTrade: context.regime === 'risk-on',
      regime: context.regime,
      reason: context.regimeReason
    };
  }

  async scanForSignals(): Promise<CanslimSignal[]> {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[CANSLIM] Scanning for signals on ${today}...`);
    
    const candidates = await scanForCanslimCandidates(today, RS_UNIVERSE, this.config, this.config.ignoreMarketRegime);
    
    const filtered = candidates.filter(c => 
      c.score >= this.config.minScore && 
      !this.activeTrades.has(c.symbol)
    );

    console.log(`[CANSLIM] Found ${filtered.length} candidates with score >= ${this.config.minScore}`);
    return filtered;
  }

  async executeTrade(signal: CanslimSignal, marketRegime: string, marketRegimeReason: string): Promise<boolean> {
    if (this.dailyTradeCount >= this.config.maxDailyTrades) {
      console.log(`[CANSLIM] Daily trade limit reached (${this.config.maxDailyTrades})`);
      return false;
    }

    if (this.activeTrades.has(signal.symbol)) {
      console.log(`[CANSLIM] Already have active trade for ${signal.symbol}`);
      return false;
    }

    const mt5Symbol = this.convertToMT5Symbol(signal.symbol);
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
        this.config.dryRun
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
      symbol: signal.symbol,
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
      tradeType: 'swing'
    };

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

  async scanAndExecute(): Promise<{ scanned: number; executed: number; skipped: string }> {
    console.log('\n' + '='.repeat(60));
    console.log(`CAN SLIM LIVE SCANNER ${this.config.dryRun ? '[DRY RUN]' : '[LIVE]'}`);
    console.log('='.repeat(60));

    const marketCheck = await this.checkMarketRegime();
    console.log(`\nMarket Regime: ${marketCheck.regime.toUpperCase()}`);
    console.log(`Reason: ${marketCheck.reason}`);

    if (!marketCheck.canTrade && !this.config.ignoreMarketRegime) {
      console.log(`\n[CANSLIM] Market is ${marketCheck.regime} - not trading`);
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

    const signals = await this.scanForSignals();
    
    if (signals.length === 0) {
      console.log('[CANSLIM] No valid signals found');
      return { scanned: RS_UNIVERSE.length, executed: 0, skipped: 'No signals' };
    }

    let executed = 0;
    for (const signal of signals) {
      if (this.dailyTradeCount >= this.config.maxDailyTrades) {
        console.log(`[CANSLIM] Daily limit reached`);
        break;
      }

      console.log(`\n--- ${signal.symbol} ---`);
      console.log(`Score: ${signal.score}/${signal.maxScore}`);
      console.log(`RS Rating: ${signal.relativeStrength?.rsRating || 'N/A'}`);
      console.log(`Near 52wk High: ${signal.newHigh?.percentFromHigh?.toFixed(1)}%`);
      console.log(`Base Pattern: ${signal.basePattern?.type || 'none'}`);

      const success = await this.executeTrade(signal, marketCheck.regime, marketCheck.reason);
      if (success) executed++;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`SCAN COMPLETE: ${executed} trades executed`);
    console.log('='.repeat(60) + '\n');

    return { scanned: RS_UNIVERSE.length, executed, skipped: '' };
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
