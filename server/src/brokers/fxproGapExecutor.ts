import { metaApiHandler, MetaApiOrderResult } from '../handlers/metaApiRestHandler.js';
import { TradeService } from '../db/services/tradeService.js';
import axios from 'axios';

export interface FxProGapTradeConfig {
  targetMarginGBP: number;
  maxDailyTrades: number;
  minGapPercent: number;
  maxGapPercent: number;
  riskRewardRatio: number;
  useTrailingStop: boolean;
  trailingStopTrigger: number;
}

export interface GapCandidate {
  symbol: string;
  currentPrice: number;
  openPrice: number;
  previousClose: number;
  gapPercentage: number;
  premarketHigh: number;
  premarketLow: number;
  volume: number;
  companyName?: string;
  exchange?: string;
}

export interface ActiveGapTrade {
  symbol: string;
  mt5Symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  volume: number;
  status: 'pending' | 'filled' | 'closed';
  orderId?: string;
  positionId?: string;
  pnl?: number;
  tradeId?: string;
}

const DEFAULT_CONFIG: FxProGapTradeConfig = {
  targetMarginGBP: 1,
  maxDailyTrades: 5,
  minGapPercent: 5,
  maxGapPercent: 100,
  riskRewardRatio: 1.5,
  useTrailingStop: true,
  trailingStopTrigger: 1.0,
};

export class FxProGapExecutor {
  private config: FxProGapTradeConfig;
  private activeTrades: Map<string, ActiveGapTrade> = new Map();
  private failedSymbols: Set<string> = new Set();
  private dailyTradeCount: number = 0;
  private dailyPnL: number = 0;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private scannerBaseUrl: string;
  private hasClosedEOD: boolean = false;

  constructor(config: Partial<FxProGapTradeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scannerBaseUrl = process.env.SCANNER_BASE_URL || 'http://localhost:5002';
  }

  private convertToMT5Symbol(symbol: string): string {
    const nasdaqStocks = new Set([
      'AAPL', 'ABNB', 'ADBE', 'ADI', 'ADP', 'ADSK', 'AFRM', 'AKAM', 'ALGN', 'ALNY', 'AMAT', 'AMD', 'AMGN', 'AMZN',
      'ANSS', 'APP', 'ARGX', 'ARM', 'ASML', 'AVGO', 'AXON',
      'BIDU', 'BIIB', 'BILI', 'BKR', 'BMRN', 'BNTX',
      'CDNS', 'CDW', 'CEG', 'CHKP', 'CHRW', 'CHTR', 'CME', 'CMCSA', 'COIN', 'COST', 'CPRT', 'CRWD', 'CSCO', 'CSGP', 'CSX', 'CTAS', 'CTSH',
      'DASH', 'DDOG', 'DKNG', 'DLTR', 'DOCU', 'DXCM',
      'EA', 'EBAY', 'ENPH', 'EQIX', 'EXAS', 'EXC',
      'FANG', 'FAST', 'FISV', 'FTNT',
      'GEN', 'GFS', 'GILD', 'GOOG', 'GOOGL',
      'HBAN', 'HOLX', 'HON', 'HOOD',
      'IDXX', 'ILMN', 'INCY', 'INTC', 'INTU', 'ISRG',
      'JD',
      'KDP', 'KHC', 'KLAC',
      'LCID', 'LRCX', 'LULU', 'LYFT',
      'MAR', 'MARA', 'MCHP', 'MDLZ', 'MELI', 'META', 'MNST', 'MRNA', 'MRVL', 'MSFT', 'MSTR', 'MTCH', 'MU',
      'NFLX', 'NTES', 'NTAP', 'NTNX', 'NVAX', 'NVDA', 'NXPI',
      'ODFL', 'OKTA', 'ON', 'ORLY',
      'PANW', 'PAYX', 'PCAR', 'PDD', 'PEP', 'PLTR', 'PLUG', 'PYPL',
      'QCOM', 'QQQ',
      'REGN', 'RIOT', 'RIVN', 'RKLB', 'ROKU', 'ROP', 'ROST',
      'SBUX', 'SEDG', 'SHOP', 'SIRI', 'SMCI', 'SNPS', 'SOFI', 'SPLK', 'SSNC', 'STX', 'SWKS',
      'TEAM', 'TER', 'TMUS', 'TSLA', 'TTD', 'TTWO', 'TXN',
      'UAL', 'ULTA',
      'VRSK', 'VRSN', 'VRTX',
      'WBA', 'WDAY', 'WDC',
      'XEL',
      'ZM', 'ZS',
      'ACHR', 'AEHR', 'AIFF', 'AMBO', 'ATOM', 'AZTR',
      'BEEM', 'BIRD', 'BREA',
      'CCEL', 'CING', 'CNEY', 'CNFR',
      'DAPP',
      'ENSC', 'ESGL', 'ETHW',
      'FCUV', 'FEIM',
      'GRRR',
      'ICLK', 'IMNN', 'INMB',
      'JBDI', 'JG',
      'KOSS',
      'LAAC', 'LIXT', 'LPSN',
      'MCRB', 'MIRA', 'MYTE',
      'NITO', 'NXL', 'NUTX', 'NVDX',
      'OSS',
      'PHUN', 'PVL',
      'RETL',
      'SILV', 'SLGL', 'SNAL', 'SOAR', 'SSKN', 'SXTP', 'SYRS',
      'TATT', 'TENX', 'TIVC', 'TKLF', 'TOP', 'TOVX', 'TSLT',
      'VERO', 'VRAX', 'VTAK',
      'WOLF', 'WW',
      'XWEL',
      'ZAPP', 'ZONE'
    ]);

    if (nasdaqStocks.has(symbol)) {
      return `${symbol}.O`;
    }
    return `${symbol}.N`;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const status = await metaApiHandler.checkStatus();
      return status.connected;
    } catch (error) {
      console.error('❌ MetaAPI connection check failed:', error);
      return false;
    }
  }

  async scanForGaps(direction: 'up' | 'down' = 'up'): Promise<GapCandidate[]> {
    try {
      const endpoint = direction === 'up' ? '/api/analysis/scan-gap-ups' : '/api/analysis/scan-gap-downs';
      const response = await axios.post(`${this.scannerBaseUrl}${endpoint}`, {
        volatilityLevel: 'medium'
      });

      if (!response.data?.stocks) {
        return [];
      }

      const candidates: GapCandidate[] = response.data.stocks
        .filter((stock: any) => {
          const gapPct = Math.abs(parseFloat(stock.gapPercentage?.replace('%', '') || '0'));
          const hasPremarketData = stock.premarketHigh && stock.premarketLow;
          return gapPct >= this.config.minGapPercent && 
                 gapPct <= this.config.maxGapPercent &&
                 hasPremarketData;
        })
        .map((stock: any) => ({
          symbol: stock.stockSymbol,
          currentPrice: parseFloat(stock.currentPrice?.replace('$', '') || stock.livePrice?.replace('$', '') || '0'),
          openPrice: parseFloat(stock.openPrice?.replace('$', '') || '0'),
          previousClose: parseFloat(stock.previousClose?.replace('$', '') || '0'),
          gapPercentage: parseFloat(stock.gapPercentage?.replace('%', '') || '0'),
          premarketHigh: parseFloat(stock.premarketHigh?.replace('$', '') || '0'),
          premarketLow: parseFloat(stock.premarketLow?.replace('$', '') || '0'),
          volume: stock.volume || 0,
          companyName: stock.companyName,
          exchange: stock.exchange
        }));

      return candidates;
    } catch (error) {
      console.error('❌ Gap scan failed:', error);
      return [];
    }
  }

  async executeGapTrade(candidate: GapCandidate, direction: 'long' | 'short'): Promise<boolean> {
    if (this.dailyTradeCount >= this.config.maxDailyTrades) {
      console.log(`⏸️ Daily trade limit reached (${this.config.maxDailyTrades})`);
      return false;
    }

    if (this.activeTrades.has(candidate.symbol)) {
      console.log(`⏸️ Already have active trade for ${candidate.symbol}`);
      return false;
    }

    if (this.failedSymbols.has(candidate.symbol)) {
      console.log(`⏸️ Skipping ${candidate.symbol} - previously failed`);
      return false;
    }

    if (candidate.premarketHigh <= 0 || candidate.premarketLow <= 0) {
      console.log(`⏸️ Missing premarket data for ${candidate.symbol}`);
      return false;
    }

    const mt5Symbol = this.convertToMT5Symbol(candidate.symbol);
    
    let entryPrice: number;
    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'long') {
      entryPrice = candidate.premarketHigh;
      stopLoss = candidate.premarketLow;
      const risk = entryPrice - stopLoss;
      takeProfit = entryPrice + (risk * this.config.riskRewardRatio);
    } else {
      entryPrice = candidate.premarketLow;
      stopLoss = candidate.premarketHigh;
      const risk = stopLoss - entryPrice;
      takeProfit = entryPrice - (risk * this.config.riskRewardRatio);
    }

    console.log(`\n🚀 Executing Gap ${direction.toUpperCase()} trade for ${candidate.symbol}`);
    console.log(`   MT5 Symbol: ${mt5Symbol}`);
    console.log(`   Gap: ${candidate.gapPercentage > 0 ? '+' : ''}${candidate.gapPercentage.toFixed(2)}%`);
    console.log(`   Premarket High: $${candidate.premarketHigh.toFixed(2)}`);
    console.log(`   Premarket Low: $${candidate.premarketLow.toFixed(2)}`);
    console.log(`   Entry: $${entryPrice.toFixed(2)}`);
    console.log(`   Stop: $${stopLoss.toFixed(2)}`);
    console.log(`   Target: $${takeProfit.toFixed(2)} (${this.config.riskRewardRatio}:1 R:R)`);

    const signal = {
      id: `gap-${Date.now()}`,
      symbol: candidate.symbol,
      timeframe: '1m',
      time: new Date().toISOString(),
      pattern: {
        name: direction === 'long' ? 'Gap Up Breakout' : 'Gap Down Breakdown',
        class: 'single' as const,
        direction: direction === 'long' ? 'bullish' as const : 'bearish' as const,
        barsInvolved: 1,
        patternHigh: candidate.premarketHigh,
        patternLow: candidate.premarketLow
      },
      context: {
        trend: direction === 'long' ? 'up' as const : 'down' as const,
        atSupport: direction === 'long',
        atResistance: direction === 'short',
        atr: Math.abs(candidate.premarketHigh - candidate.premarketLow),
        volumeFactor: 1,
        isHighVolume: candidate.volume > 500000,
        isWideRange: true
      },
      confirmation: {
        triggerSide: direction === 'long' ? 'above_high' as const : 'below_low' as const,
        triggerPrice: entryPrice,
        invalidationPrice: stopLoss,
        validForBars: 15
      },
      plan: {
        direction: direction,
        entry: entryPrice,
        stop: stopLoss,
        targets: [takeProfit],
        positionQty: 1,
        riskRewardRatio: `1:${this.config.riskRewardRatio}`
      },
      score: 75,
      notes: [`Gap ${direction} trade`, `Gap: ${candidate.gapPercentage.toFixed(2)}%`],
      currentPrice: candidate.currentPrice,
      gapData: {
        gapPercentage: candidate.gapPercentage,
        premarketHigh: candidate.premarketHigh,
        premarketLow: candidate.premarketLow,
        previousClose: candidate.previousClose,
        openPrice: candidate.openPrice,
        volume: candidate.volume,
        companyName: candidate.companyName,
        exchange: candidate.exchange,
        riskRewardRatio: this.config.riskRewardRatio,
        useTrailingStop: this.config.useTrailingStop,
        trailingStopTrigger: this.config.trailingStopTrigger
      }
    };

    try {
      const result = await metaApiHandler.placeOrder(signal as any);

      if (result.success) {
        const trade: ActiveGapTrade = {
          symbol: candidate.symbol,
          mt5Symbol,
          direction,
          entryPrice,
          stopLoss,
          takeProfit,
          volume: 0.01,
          status: 'pending',
          orderId: result.data?.orderId,
          positionId: result.data?.positionId
        };

        this.activeTrades.set(candidate.symbol, trade);
        this.dailyTradeCount++;

        console.log(`✅ Order placed successfully`);
        console.log(`   Order ID: ${result.data?.orderId}`);
        return true;
      } else {
        console.log(`❌ Order failed: ${result.error}`);
        this.failedSymbols.add(candidate.symbol);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error placing order:`, error);
      return false;
    }
  }

  async scanAndExecute(): Promise<void> {
    console.log('\n📡 Scanning for Gap & Go setups (FxPro)...');

    try {
      const gapUpCandidates = await this.scanForGaps('up');
      console.log(`Found ${gapUpCandidates.length} gap UP candidates`);

      const sortedCandidates = gapUpCandidates
        .filter(c => c.premarketHigh > 0 && c.premarketLow > 0)
        .sort((a, b) => Math.abs(b.gapPercentage) - Math.abs(a.gapPercentage));

      for (const candidate of sortedCandidates) {
        if (this.dailyTradeCount >= this.config.maxDailyTrades) {
          console.log(`⏸️ Daily trade limit reached`);
          break;
        }
        if (this.activeTrades.has(candidate.symbol)) continue;

        console.log(`\n📊 Candidate: ${candidate.symbol}`);
        console.log(`   Gap: +${candidate.gapPercentage.toFixed(2)}%`);
        console.log(`   Premarket High: $${candidate.premarketHigh.toFixed(2)}`);
        console.log(`   Premarket Low: $${candidate.premarketLow.toFixed(2)}`);
        console.log(`   Current: $${candidate.currentPrice.toFixed(2)}`);

        if (candidate.currentPrice < candidate.premarketHigh) {
          console.log(`   ⏳ Waiting for breakout above premarket high`);
          await this.executeGapTrade(candidate, 'long');
        } else {
          console.log(`   🚀 Already above premarket high - placing market order`);
          await this.executeGapTrade(candidate, 'long');
        }
      }

    } catch (error) {
      console.error('Scan error:', error);
    }
  }

  startAutoTrading(intervalMs: number = 30000): void {
    if (this.isRunning) {
      console.log('Auto trading already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 FxPro Gap Auto Trading started');
    console.log(`   Scanning every ${intervalMs / 1000} seconds`);

    this.scanAndExecute();

    this.scanInterval = setInterval(() => {
      const now = new Date();
      const hours = now.getUTCHours();
      const minutes = now.getUTCMinutes();
      const totalMinutes = hours * 60 + minutes;

      const marketOpen = 14 * 60 + 30;
      const tradingWindow = 15 * 60;
      const marketClose = 21 * 60;
      const eodCloseTime = 20 * 60 + 58;

      if (totalMinutes >= eodCloseTime && totalMinutes < marketClose) {
        if (!this.hasClosedEOD) {
          console.log('🔔 End of day - closing all positions');
          this.closeAllPositions();
          this.hasClosedEOD = true;
        }
      } else if (totalMinutes >= marketOpen && totalMinutes < tradingWindow) {
        this.scanAndExecute();
        this.monitorTradesForTrailingStop();
      } else if (totalMinutes >= tradingWindow && totalMinutes < eodCloseTime) {
        this.monitorTradesForTrailingStop();
      }
    }, intervalMs);
  }

  stopAutoTrading(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 FxPro Gap Auto Trading stopped');
  }

  async closeAllPositions(): Promise<void> {
    console.log('Closing all positions...');
    try {
      await metaApiHandler.closeAllPositions();
    } catch (error) {
      console.error('Error closing positions:', error);
    }
  }

  getActiveTrades(): Map<string, ActiveGapTrade> {
    return this.activeTrades;
  }

  getDailyStats(): { trades: number; pnl: number } {
    return {
      trades: this.dailyTradeCount,
      pnl: this.dailyPnL
    };
  }

  resetDailyStats(): void {
    this.dailyTradeCount = 0;
    this.dailyPnL = 0;
    this.activeTrades.clear();
    this.failedSymbols.clear();
    this.hasClosedEOD = false;
  }

  async monitorTradesForTrailingStop(): Promise<void> {
    if (!this.config.useTrailingStop) return;
    
    for (const [symbol, trade] of this.activeTrades) {
      if (trade.status !== 'filled') continue;
      
      try {
        const positions = await metaApiHandler.getPositions();
        const position = positions.find((p: any) => p.symbol === trade.mt5Symbol);
        
        if (position && position.currentPrice) {
          const currentPrice = position.currentPrice;
          const risk = trade.entryPrice - trade.stopLoss;
          const trailingTriggerPrice = trade.entryPrice + (risk * this.config.trailingStopTrigger);
          
          if (currentPrice >= trailingTriggerPrice) {
            const newStop = currentPrice - (risk * 0.5);
            if (newStop > trade.stopLoss) {
              console.log(`📈 Trailing stop update for ${symbol}: $${trade.stopLoss.toFixed(2)} -> $${newStop.toFixed(2)}`);
              await metaApiHandler.modifyPosition(position.id, newStop, trade.takeProfit);
              trade.stopLoss = newStop;
            }
          }
        }
      } catch (error) {
        console.warn(`Error monitoring ${symbol}:`, error);
      }
    }
  }
}

export function createFxProGapExecutor(config: Partial<FxProGapTradeConfig> = {}): FxProGapExecutor {
  return new FxProGapExecutor(config);
}
