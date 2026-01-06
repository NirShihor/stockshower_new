import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

export interface MeanReversionConfig {
  targetMarginGBP: number;
  maxDailyTrades: number;
  minDropPercent: number;
  maxDropPercent: number;
  stopLossPercent: number;
  minPrice: number;
  maxPrice: number;
}

export interface MeanReversionCandidate {
  symbol: string;
  currentPrice: number;
  openPrice: number;
  dropPercent: number;
  vwap: number;
  distanceFromVwap: number;
  volume: number;
  score: number;
}

export interface ActiveMeanReversionTrade {
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
  pnl?: number;
  entryTime: Date;
}

const LARGE_CAP_SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'UNH', 'JNJ',
  'JPM', 'V', 'PG', 'XOM', 'HD', 'CVX', 'MA', 'ABBV', 'MRK', 'LLY',
  'PEP', 'KO', 'PFE', 'COST', 'TMO', 'AVGO', 'MCD', 'WMT', 'CSCO', 'ACN',
  'ABT', 'DHR', 'BAC', 'CRM', 'ADBE', 'CMCSA', 'NKE', 'DIS', 'VZ', 'INTC',
  'NFLX', 'PM', 'TXN', 'WFC', 'AMD', 'NEE', 'RTX', 'UPS', 'HON', 'QCOM',
  'IBM', 'LOW', 'SPGI', 'CAT', 'GE', 'INTU', 'BA', 'AMAT', 'DE', 'SBUX',
  'GS', 'MS', 'BLK', 'AXP', 'ISRG', 'MDLZ', 'GILD', 'ADI', 'BKNG',
  'SYK', 'MMC', 'VRTX', 'TJX', 'ADP', 'REGN', 'ZTS', 'LRCX', 'CVS', 'CI'
];

const DEFAULT_CONFIG: MeanReversionConfig = {
  targetMarginGBP: 250,
  maxDailyTrades: 3,
  minDropPercent: 2,
  maxDropPercent: 8,
  stopLossPercent: 1,
  minPrice: 20,
  maxPrice: 500
};

export class MeanReversionExecutor {
  private config: MeanReversionConfig;
  private activeTrades: Map<string, ActiveMeanReversionTrade> = new Map();
  private dailyTradeCount: number = 0;
  private dailyPnL: number = 0;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private eodCheckInterval: NodeJS.Timeout | null = null;
  private tradedSymbolsToday: Set<string> = new Set();

  constructor(config: Partial<MeanReversionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private convertToMT5Symbol(symbol: string): string {
    const nasdaqStocks = [
      'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'NFLX', 'ADBE', 'PYPL',
      'CSCO', 'PEP', 'INTC', 'CMCSA', 'COST', 'AVGO', 'TXN', 'QCOM', 'INTU', 'AMD',
      'ISRG', 'MDLZ', 'GILD', 'ADI', 'BKNG', 'VRTX', 'ADP', 'REGN', 'LRCX', 'MU'
    ];

    if (nasdaqStocks.includes(symbol)) {
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

  private async makePolygonRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${POLYGON_BASE_URL}${endpoint}`);
    url.searchParams.append('apiKey', POLYGON_API_KEY);
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
    
    const response = await axios.get(url.toString());
    return response.data;
  }

  private async getIntradayBars(symbol: string): Promise<any[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await this.makePolygonRequest(
        `/v2/aggs/ticker/${symbol}/range/5/minute/${today}/${today}`,
        { adjusted: 'true', sort: 'asc', limit: '5000' }
      );
      return data.results || [];
    } catch (error) {
      return [];
    }
  }

  private isMarketHours(): boolean {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    return totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
  }

  private isTradingWindow(): boolean {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    const windowStart = 15 * 60;
    const windowEnd = 20 * 60;
    
    return totalMinutes >= windowStart && totalMinutes < windowEnd;
  }

  private calculateVWAP(bars: any[]): number {
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
    
    for (const bar of bars) {
      const typicalPrice = (bar.h + bar.l + bar.c) / 3;
      cumulativeTPV += typicalPrice * bar.v;
      cumulativeVolume += bar.v;
    }
    
    return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
  }

  private async checkSpyCondition(): Promise<{ safe: boolean; spyChange: number }> {
    try {
      const bars = await this.getIntradayBars('SPY');
      if (!bars || bars.length < 2) {
        return { safe: true, spyChange: 0 };
      }
      
      const openPrice = bars[0].o;
      const currentPrice = bars[bars.length - 1].c;
      const spyChange = ((currentPrice - openPrice) / openPrice) * 100;
      
      return { safe: spyChange > -1.5, spyChange };
    } catch (error) {
      return { safe: true, spyChange: 0 };
    }
  }

  async scanForCandidates(): Promise<MeanReversionCandidate[]> {
    console.log('\n📡 Scanning for Mean Reversion candidates...');
    const candidates: MeanReversionCandidate[] = [];
    
    for (const symbol of LARGE_CAP_SYMBOLS) {
      if (this.tradedSymbolsToday.has(symbol)) continue;
      if (this.activeTrades.has(symbol)) continue;
      
      try {
        const bars = await this.getIntradayBars(symbol);
        if (!bars || bars.length < 10) continue;
        
        const marketBars = bars.filter((b: any) => {
          const date = new Date(b.t);
          const hours = date.getUTCHours();
          const minutes = date.getUTCMinutes();
          const totalMinutes = hours * 60 + minutes;
          return totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
        });
        
        if (marketBars.length < 5) continue;
        
        const openPrice = marketBars[0].o;
        const currentPrice = marketBars[marketBars.length - 1].c;
        const lowPrice = Math.min(...marketBars.map((b: any) => b.l));
        
        if (openPrice < this.config.minPrice || openPrice > this.config.maxPrice) continue;
        
        const dropFromOpen = ((openPrice - currentPrice) / openPrice) * 100;
        const maxDrop = ((openPrice - lowPrice) / openPrice) * 100;
        
        if (dropFromOpen >= this.config.minDropPercent && dropFromOpen <= this.config.maxDropPercent) {
          const vwap = this.calculateVWAP(marketBars);
          const distanceFromVwap = ((vwap - currentPrice) / vwap) * 100;
          
          if (distanceFromVwap > 0.5) {
            const volume = marketBars.reduce((sum: number, b: any) => sum + b.v, 0);
            
            let score = 0;
            if (dropFromOpen >= 3) score += 30;
            else if (dropFromOpen >= 2.5) score += 25;
            else score += 20;
            
            if (distanceFromVwap >= 2) score += 25;
            else if (distanceFromVwap >= 1) score += 15;
            
            score += 20;
            
            candidates.push({
              symbol,
              currentPrice,
              openPrice,
              dropPercent: dropFromOpen,
              vwap,
              distanceFromVwap,
              volume,
              score
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        continue;
      }
    }
    
    return candidates.sort((a, b) => b.score - a.score);
  }

  async executeTrade(candidate: MeanReversionCandidate): Promise<boolean> {
    if (this.dailyTradeCount >= this.config.maxDailyTrades) {
      console.log(`⏸️ Daily trade limit reached (${this.config.maxDailyTrades})`);
      return false;
    }

    if (this.activeTrades.has(candidate.symbol)) {
      console.log(`⏸️ Already have active trade for ${candidate.symbol}`);
      return false;
    }

    const mt5Symbol = this.convertToMT5Symbol(candidate.symbol);
    
    const entryPrice = candidate.currentPrice;
    const stopLoss = entryPrice * (1 - this.config.stopLossPercent / 100);
    const takeProfit = candidate.vwap;

    console.log(`\n🚀 Executing Mean Reversion LONG trade for ${candidate.symbol}`);
    console.log(`   MT5 Symbol: ${mt5Symbol}`);
    console.log(`   Drop: -${candidate.dropPercent.toFixed(2)}%`);
    console.log(`   Current: $${candidate.currentPrice.toFixed(2)}`);
    console.log(`   VWAP: $${candidate.vwap.toFixed(2)}`);
    console.log(`   Entry: $${entryPrice.toFixed(2)}`);
    console.log(`   Stop: $${stopLoss.toFixed(2)} (-${this.config.stopLossPercent}%)`);
    console.log(`   Target: $${takeProfit.toFixed(2)} (VWAP)`);

    const signal = {
      id: `mr-${Date.now()}`,
      symbol: candidate.symbol,
      timeframe: '5m',
      time: new Date().toISOString(),
      pattern: {
        name: 'Mean Reversion',
        class: 'single' as const,
        direction: 'bullish' as const,
        barsInvolved: 1,
        patternHigh: candidate.vwap,
        patternLow: candidate.currentPrice
      },
      context: {
        trend: 'down' as const,
        atSupport: true,
        atResistance: false,
        atr: Math.abs(candidate.openPrice - candidate.currentPrice) / 3,
        volumeFactor: 1,
        isHighVolume: candidate.volume > 1000000,
        isWideRange: true
      },
      confirmation: {
        triggerSide: 'above_high' as const,
        triggerPrice: entryPrice,
        invalidationPrice: stopLoss,
        validForBars: 60
      },
      plan: {
        direction: 'long' as const,
        entry: entryPrice,
        stop: stopLoss,
        targets: [takeProfit],
        positionQty: 1,
        riskRewardRatio: `1:${((takeProfit - entryPrice) / (entryPrice - stopLoss)).toFixed(1)}`
      },
      score: 85,
      notes: [`Mean Reversion trade`, `Drop: -${candidate.dropPercent.toFixed(2)}%`, `VWAP distance: ${candidate.distanceFromVwap.toFixed(2)}%`],
      currentPrice: candidate.currentPrice
    };

    try {
      const result = await metaApiHandler.placeOrder(signal);

      if (result.success) {
        const trade: ActiveMeanReversionTrade = {
          symbol: candidate.symbol,
          mt5Symbol,
          direction: 'long',
          entryPrice,
          stopLoss,
          takeProfit,
          volume: 0.01,
          status: 'pending',
          orderId: result.data?.orderId,
          positionId: result.data?.positionId,
          entryTime: new Date()
        };

        this.activeTrades.set(candidate.symbol, trade);
        this.tradedSymbolsToday.add(candidate.symbol);
        this.dailyTradeCount++;

        console.log(`✅ Order placed successfully`);
        console.log(`   Order ID: ${result.data?.orderId}`);
        return true;
      } else {
        console.log(`❌ Order failed: ${result.error}`);
        this.tradedSymbolsToday.add(candidate.symbol);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error placing order:`, error);
      this.tradedSymbolsToday.add(candidate.symbol);
      return false;
    }
  }

  async scanAndExecute(): Promise<void> {
    if (!this.isTradingWindow()) {
      console.log('⏰ Outside trading window (10:30 AM - 3:00 PM EST)');
      return;
    }

    try {
      const candidates = await this.scanForCandidates();
      console.log(`Found ${candidates.length} candidates`);

      const qualifiedCandidates = candidates.filter(c => c.score >= 40);
      console.log(`${qualifiedCandidates.length} qualified (score >= 40)`);

      for (const candidate of qualifiedCandidates) {
        if (this.dailyTradeCount >= this.config.maxDailyTrades) {
          console.log(`⏸️ Daily trade limit reached`);
          break;
        }

        console.log(`\n📊 Candidate: ${candidate.symbol}`);
        console.log(`   Drop: -${candidate.dropPercent.toFixed(2)}%`);
        console.log(`   VWAP Distance: ${candidate.distanceFromVwap.toFixed(2)}%`);
        console.log(`   Score: ${candidate.score}`);

        await this.executeTrade(candidate);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error('Scan error:', error);
    }
  }

  private checkEndOfDay(): void {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    const eodTime = 20 * 60 + 55;
    
    if (totalMinutes >= eodTime && totalMinutes < eodTime + 5) {
      console.log('🔔 End of day approaching - closing all positions');
      this.closeAllPositions();
    }
  }

  startAutoTrading(intervalMs: number = 60000): void {
    if (this.isRunning) {
      console.log('Auto trading already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 Mean Reversion Auto Trading started');
    console.log(`   Scanning every ${intervalMs / 1000} seconds`);
    console.log(`   Target margin: £${this.config.targetMarginGBP}`);
    console.log(`   Max daily trades: ${this.config.maxDailyTrades}`);
    console.log(`   Min drop: ${this.config.minDropPercent}%`);
    console.log(`   Stop loss: ${this.config.stopLossPercent}%`);

    this.scanAndExecute();

    this.scanInterval = setInterval(() => {
      if (this.isTradingWindow()) {
        this.scanAndExecute();
      }
    }, intervalMs);

    this.eodCheckInterval = setInterval(() => {
      this.checkEndOfDay();
    }, 60000);
  }

  stopAutoTrading(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.eodCheckInterval) {
      clearInterval(this.eodCheckInterval);
      this.eodCheckInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Mean Reversion Auto Trading stopped');
  }

  async closeAllPositions(): Promise<void> {
    console.log('Closing all positions...');
    try {
      await metaApiHandler.closeAllPositions();
      this.activeTrades.clear();
    } catch (error) {
      console.error('Error closing positions:', error);
    }
  }

  getActiveTrades(): Map<string, ActiveMeanReversionTrade> {
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
    this.tradedSymbolsToday.clear();
  }
}

export function createMeanReversionExecutor(config: Partial<MeanReversionConfig> = {}): MeanReversionExecutor {
  return new MeanReversionExecutor(config);
}
