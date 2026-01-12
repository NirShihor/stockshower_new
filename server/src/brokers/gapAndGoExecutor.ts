import { InteractiveBrokersClient, createIBClient, IBOrderResult } from './interactiveBrokers.js';
import { GapAndGoCandidate, analyzeGapAndGoSetup } from '../momentum/gapAndGoStrategy.js';
import { scanMomentumGaps } from '../handlers/momentumGapScanner.js';

export interface GapAndGoTradeConfig {
  positionSize: number;
  maxDailyTrades: number;
  minScore: number;
  riskPercent: number;
  targetRatio: number;
  useTrailingStop: boolean;
  trailingStopTrigger: number;
  usePartialExit: boolean;
  partialExitTimeUTC: number;
}

export interface ActiveTrade {
  symbol: string;
  entryOrderId: number;
  stopOrderId?: number;
  targetOrderId?: number;
  entryPrice?: number;
  initialStopLoss: number;
  currentStopLoss: number;
  target: number;
  quantity: number;
  remainingQuantity: number;
  risk: number;
  highSinceEntry: number;
  trailingStopActive: boolean;
  partialExitDone: boolean;
  status: 'pending_entry' | 'filled' | 'closed';
  pnl?: number;
}

const DEFAULT_CONFIG: GapAndGoTradeConfig = {
  positionSize: 100,
  maxDailyTrades: 1,
  minScore: 50,
  riskPercent: 2,
  targetRatio: 1.5,
  useTrailingStop: true,
  trailingStopTrigger: 1.0,
  usePartialExit: false,
  partialExitTimeUTC: 16 * 60 + 30,
};

export class GapAndGoExecutor {
  private ib: InteractiveBrokersClient;
  private config: GapAndGoTradeConfig;
  private activeTrades: Map<string, ActiveTrade> = new Map();
  private dailyTradeCount: number = 0;
  private dailyPnL: number = 0;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private hasClosedStalePositions: boolean = false;
  private hasClosedEOD: boolean = false;

  constructor(ib: InteractiveBrokersClient, config: Partial<GapAndGoTradeConfig> = {}) {
    this.ib = ib;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventHandlers();
  }

  async closeStalePositions(): Promise<void> {
    if (this.hasClosedStalePositions) return;
    
    console.log('🧹 Checking for stale positions from previous days...');
    
    try {
      this.ib.requestPositions();
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const positionsMap = this.ib.getPositions();
      const positions = Array.from(positionsMap.values());
      
      if (positions.length === 0) {
        console.log('✅ No stale positions found');
        this.hasClosedStalePositions = true;
        return;
      }
      
      console.log(`⚠️ Found ${positions.length} open position(s) - closing all`);
      
      for (const position of positions) {
        const symbol = position.symbol;
        const quantity = Math.abs(position.quantity);
        const side = position.quantity > 0 ? 'SELL' : 'BUY';
        
        console.log(`🔄 Closing stale position: ${symbol} qty=${position.quantity}`);
        
        try {
          await this.ib.placeMarketOrder(symbol, side, quantity);
          console.log(`✅ Closed ${symbol}`);
        } catch (error) {
          console.error(`❌ Failed to close ${symbol}:`, error);
        }
      }
      
      this.hasClosedStalePositions = true;
      console.log('✅ Stale positions cleanup complete');
    } catch (error) {
      console.error('Error checking stale positions:', error);
    }
  }

  private setupEventHandlers(): void {
    this.ib.on('orderUpdate', (order: IBOrderResult) => {
      this.handleOrderUpdate(order);
    });

    this.ib.on('position', (position) => {
      console.log(`Position update: ${position.symbol} qty=${position.quantity} avgCost=${position.avgCost}`);
    });
  }

  private handleOrderUpdate(order: IBOrderResult): void {
    for (const [symbol, trade] of this.activeTrades) {
      if (trade.entryOrderId === order.orderId) {
        if (order.status === 'Filled' && trade.status !== 'filled') {
          // Only process fill once (prevent duplicate exit orders)
          console.log(`✅ Entry filled for ${symbol} @ $${order.avgFillPrice}`);
          trade.entryPrice = order.avgFillPrice;
          trade.status = 'filled';
          this.placeExitOrders(symbol, trade, order.avgFillPrice);
        } else if (order.status === 'Cancelled') {
          console.log(`❌ Entry cancelled for ${symbol}`);
          this.activeTrades.delete(symbol);
        }
      }

      if (trade.stopOrderId === order.orderId && order.status === 'Filled') {
        console.log(`🛑 Stop loss hit for ${symbol} @ $${order.avgFillPrice}`);
        this.closeTrade(symbol, order.avgFillPrice, 'stop_loss');
      }

      if (trade.targetOrderId === order.orderId && order.status === 'Filled') {
        console.log(`🎯 Target hit for ${symbol} @ $${order.avgFillPrice}`);
        this.closeTrade(symbol, order.avgFillPrice, 'target');
      }
    }
  }

  private roundToTick(price: number): number {
    // Stocks >= $1 use $0.01 tick, stocks < $1 use $0.0001 tick
    if (price >= 1) {
      return Math.round(price * 100) / 100;
    }
    return Math.round(price * 10000) / 10000;
  }

  private async placeExitOrders(symbol: string, trade: ActiveTrade, fillPrice: number): Promise<void> {
    const stopPrice = this.roundToTick(trade.currentStopLoss);
    const targetPrice = this.roundToTick(trade.target);

    const stopOrderId = await this.ib.placeStopOrder(
      symbol,
      'SELL',
      trade.remainingQuantity,
      stopPrice
    );
    trade.stopOrderId = stopOrderId;

    const targetOrderId = await this.ib.placeLimitOrder(
      symbol,
      'SELL',
      trade.remainingQuantity,
      targetPrice
    );
    trade.targetOrderId = targetOrderId;

    console.log(`📊 Exit orders placed for ${symbol}:`);
    console.log(`   Stop: $${stopPrice} (ID: ${stopOrderId})`);
    console.log(`   Target: $${targetPrice} (R:R ${this.config.targetRatio}:1) (ID: ${targetOrderId})`);
  }

  async updateTrailingStop(symbol: string, currentPrice: number): Promise<void> {
    const trade = this.activeTrades.get(symbol);
    if (!trade || trade.status !== 'filled' || !trade.entryPrice) return;

    if (currentPrice > trade.highSinceEntry) {
      trade.highSinceEntry = currentPrice;
    }

    const trailingTriggerPrice = trade.entryPrice + (trade.risk * this.config.trailingStopTrigger);

    if (this.config.useTrailingStop && !trade.trailingStopActive && trade.highSinceEntry >= trailingTriggerPrice) {
      trade.trailingStopActive = true;
      trade.currentStopLoss = trade.entryPrice;
      console.log(`📈 Trailing stop activated for ${symbol} - stop moved to breakeven $${trade.entryPrice.toFixed(2)}`);
      await this.updateStopOrder(symbol, trade);
    }

    if (trade.trailingStopActive) {
      const trailStop = trade.highSinceEntry - (trade.risk * 0.5);
      if (trailStop > trade.currentStopLoss) {
        trade.currentStopLoss = trailStop;
        console.log(`📈 Trailing stop updated for ${symbol} to $${trailStop.toFixed(2)}`);
        await this.updateStopOrder(symbol, trade);
      }
    }
  }

  private async updateStopOrder(symbol: string, trade: ActiveTrade): Promise<void> {
    if (trade.stopOrderId) {
      this.ib.cancelOrder(trade.stopOrderId);
    }
    const stopPrice = this.roundToTick(trade.currentStopLoss);
    const stopOrderId = await this.ib.placeStopOrder(
      symbol,
      'SELL',
      trade.remainingQuantity,
      stopPrice
    );
    trade.stopOrderId = stopOrderId;
  }

  async checkPartialExit(symbol: string, currentPrice: number): Promise<void> {
    const trade = this.activeTrades.get(symbol);
    if (!trade || trade.status !== 'filled' || !trade.entryPrice) return;
    if (!this.config.usePartialExit || trade.partialExitDone) return;

    const now = new Date();
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    if (currentMinutes >= this.config.partialExitTimeUTC && currentPrice > trade.entryPrice) {
      const sharesToSell = Math.floor(trade.remainingQuantity * 0.5);
      if (sharesToSell > 0) {
        console.log(`⏰ Partial exit for ${symbol}: selling ${sharesToSell} shares at $${currentPrice.toFixed(2)}`);
        await this.ib.placeMarketOrder(symbol, 'SELL', sharesToSell);
        trade.remainingQuantity -= sharesToSell;
        trade.partialExitDone = true;
        
        if (trade.stopOrderId) this.ib.cancelOrder(trade.stopOrderId);
        if (trade.targetOrderId) this.ib.cancelOrder(trade.targetOrderId);
        await this.placeExitOrders(symbol, trade, trade.entryPrice);
      }
    }
  }

  private closeTrade(symbol: string, exitPrice: number, reason: string): void {
    const trade = this.activeTrades.get(symbol);
    if (!trade || !trade.entryPrice) return;

    const pnl = (exitPrice - trade.entryPrice) * trade.remainingQuantity;
    trade.pnl = pnl;
    trade.status = 'closed';
    this.dailyPnL += pnl;

    console.log(`\n💰 Trade closed: ${symbol}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Entry: $${trade.entryPrice.toFixed(2)}`);
    console.log(`   Exit: $${exitPrice.toFixed(2)}`);
    console.log(`   P&L: $${pnl.toFixed(2)}`);
    console.log(`   Daily P&L: $${this.dailyPnL.toFixed(2)}\n`);

    if (trade.stopOrderId) this.ib.cancelOrder(trade.stopOrderId);
    if (trade.targetOrderId) this.ib.cancelOrder(trade.targetOrderId);

    this.activeTrades.delete(symbol);
  }

  async executeCandidate(candidate: GapAndGoCandidate): Promise<boolean> {
    if (this.dailyTradeCount >= this.config.maxDailyTrades) {
      console.log(`⏸️ Daily trade limit reached (${this.config.maxDailyTrades})`);
      return false;
    }

    if (this.activeTrades.has(candidate.symbol)) {
      console.log(`⏸️ Already have active trade for ${candidate.symbol}`);
      return false;
    }

    if (candidate.score < this.config.minScore) {
      console.log(`⏸️ Score too low for ${candidate.symbol}: ${candidate.score}`);
      return false;
    }

    const entryPrice = candidate.premarketHigh;
    const stopLoss = candidate.premarketLow;
    const risk = entryPrice - stopLoss;
    const target = entryPrice + (risk * this.config.targetRatio);

    const riskPerShare = entryPrice - stopLoss;
    const maxRiskDollars = this.config.positionSize * (this.config.riskPercent / 100);
    const quantity = Math.floor(maxRiskDollars / riskPerShare);

    if (quantity < 1) {
      console.log(`⏸️ Position size too small for ${candidate.symbol}`);
      return false;
    }

    console.log(`\n🚀 Executing Gap & Go trade for ${candidate.symbol}`);
    console.log(`   Score: ${candidate.score}`);
    console.log(`   Gap: +${candidate.gapPercent.toFixed(1)}%`);
    console.log(`   Entry: MARKET ORDER`);
    console.log(`   Stop loss: $${stopLoss.toFixed(2)}`);
    console.log(`   Target: $${target.toFixed(2)}`);
    console.log(`   Quantity: ${quantity} shares`);
    console.log(`   Risk: $${(riskPerShare * quantity).toFixed(2)}`);

    // Use market order for immediate entry (limit orders get rejected if price moved)
    const orderId = await this.ib.placeMarketOrder(
      candidate.symbol,
      'BUY',
      quantity
    );

    const trade: ActiveTrade = {
      symbol: candidate.symbol,
      entryOrderId: orderId,
      initialStopLoss: stopLoss,
      currentStopLoss: stopLoss,
      target,
      quantity,
      remainingQuantity: quantity,
      risk,
      highSinceEntry: entryPrice,
      trailingStopActive: false,
      partialExitDone: false,
      status: 'pending_entry'
    };

    this.activeTrades.set(candidate.symbol, trade);
    this.dailyTradeCount++;

    return true;
  }

  async scanAndExecute(): Promise<void> {
    console.log('\n📡 Scanning for Gap & Go setups...');

    try {
      const candidates = await scanMomentumGaps({
        minGapPercent: 5,
        maxGapPercent: 100,
        minPrice: 1,
        maxPrice: 20,
        minRelativeVolume: 2,
        maxFloat: 50000000,
        minVolume: 100000
      });

      console.log(`Found ${candidates.length} gap candidates`);

      const sortedCandidates = candidates
        .filter(c => c.score >= this.config.minScore)
        .sort((a, b) => b.score - a.score);

      for (const candidate of sortedCandidates) {
        if (this.dailyTradeCount >= this.config.maxDailyTrades) break;
        if (this.activeTrades.has(candidate.symbol)) continue;

        const today = new Date().toISOString().split('T')[0];
        const setup = await analyzeGapAndGoSetup(
          candidate.symbol,
          today,
          candidate.previousClose,
          candidate.float
        );

        if (setup && setup.score >= this.config.minScore) {
          await this.executeCandidate(setup);
        }
      }
    } catch (error) {
      console.error('Scan error:', error);
    }
  }

  async startAutoTrading(intervalMs: number = 60000): Promise<void> {
    if (this.isRunning) {
      console.log('Auto trading already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 Auto trading started');

    // Close any stale positions from previous days before starting
    await this.closeStalePositions();

    this.scanAndExecute();

    this.scanInterval = setInterval(() => {
      const now = new Date();
      const hours = now.getUTCHours();
      const minutes = now.getUTCMinutes();
      const totalMinutes = hours * 60 + minutes;

      const marketOpen = 14 * 60 + 30;
      const tradingWindow = 15 * 60;
      const marketClose = 21 * 60; // 4 PM EST = 21:00 UTC
      const eodCloseTime = 20 * 60 + 58; // 3:58 PM EST - close 2 min before market close

      if (totalMinutes >= eodCloseTime && totalMinutes < marketClose) {
        if (!this.hasClosedEOD) {
          console.log('🔔 End of day - closing all positions');
          this.closeAllPositions();
          this.hasClosedEOD = true;
        }
      } else if (totalMinutes >= marketOpen && totalMinutes < tradingWindow) {
        this.scanAndExecute();
        this.monitorActiveTrades();
      } else if (totalMinutes >= tradingWindow && totalMinutes < eodCloseTime) {
        this.monitorActiveTrades();
      }
    }, intervalMs);
  }

  stopAutoTrading(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Auto trading stopped');
  }

  async monitorActiveTrades(): Promise<void> {
    for (const [symbol, trade] of this.activeTrades) {
      if (trade.status !== 'filled') continue;
      
      try {
        const positions = this.ib.getPositions();
        const position = positions.get(symbol);
        if (position && position.marketValue && position.quantity) {
          const currentPrice = position.marketValue / Math.abs(position.quantity);
          await this.updateTrailingStop(symbol, currentPrice);
          await this.checkPartialExit(symbol, currentPrice);
        }
      } catch (error) {
        console.warn(`Error monitoring ${symbol}:`, error);
      }
    }
  }

  closeAllPositions(): void {
    console.log('Closing all positions...');
    for (const [symbol, trade] of this.activeTrades) {
      if (trade.status === 'filled') {
        console.log(`  Closing ${symbol}: ${trade.remainingQuantity} shares`);
        this.ib.placeMarketOrder(symbol, 'SELL', trade.remainingQuantity);
      } else if (trade.status === 'pending_entry') {
        console.log(`  Cancelling pending order for ${symbol}`);
        this.ib.cancelOrder(trade.entryOrderId);
      }
    }
    this.ib.cancelAllOrders();
    this.activeTrades.clear();
    console.log('All positions closed and orders cancelled');
  }

  getActiveTrades(): Map<string, ActiveTrade> {
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
    this.hasClosedEOD = false;
    this.hasClosedStalePositions = false;
  }
}

export async function createGapAndGoExecutor(
  paperTrading: boolean = true,
  config: Partial<GapAndGoTradeConfig> = {}
): Promise<GapAndGoExecutor> {
  const ib = createIBClient(paperTrading);
  await ib.connect();
  return new GapAndGoExecutor(ib, config);
}
