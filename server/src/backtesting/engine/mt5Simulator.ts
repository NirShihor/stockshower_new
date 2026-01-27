import { BacktestCandle, BacktestPosition, SimulatedFill, BacktestTick } from '../types/backtestTypes.js';
import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';

export class MT5Simulator {
  private slippageBps: number;
  private commissionPerTrade: number;
  private pendingOrders: Map<string, BacktestPosition> = new Map();

  constructor(slippageBps: number = 2, commissionPerTrade: number = 0.5) {
    this.slippageBps = slippageBps;
    this.commissionPerTrade = commissionPerTrade;
  }

  // Simulate bid/ask spread based on volatility and liquidity
  private calculateSpread(candle: BacktestCandle, symbol: string): number {
    const price = candle.close;
    const volatility = (candle.high - candle.low) / candle.close;
    
    // Base spread in basis points
    let spreadBps = 2;
    
    // Increase spread for high volatility
    if (volatility > 0.02) spreadBps += 2;
    if (volatility > 0.04) spreadBps += 3;
    
    // Increase spread for low volume (low liquidity)
    const typicalVolume = 1000000; // Adjust based on symbol
    const volumeRatio = candle.volume / typicalVolume;
    if (volumeRatio < 0.5) spreadBps += 2;
    if (volumeRatio < 0.2) spreadBps += 3;
    
    return (price * spreadBps) / 10000;
  }

  // Get current tick with bid/ask
  getCurrentTick(candle: BacktestCandle, symbol: string): BacktestTick {
    const spread = this.calculateSpread(candle, symbol);
    const mid = candle.close;
    
    return {
      timestamp: candle.timestamp,
      bid: mid - spread / 2,
      ask: mid + spread / 2,
      spread: spread
    };
  }

  // Place a new order
  placeOrder(
    signal: ComprehensiveSignal,
    positionSizeGBP: number,
    currentCandle: BacktestCandle
  ): BacktestPosition {
    const tick = this.getCurrentTick(currentCandle, signal.symbol);
    const entryPrice = signal.plan.entry;
    
    // Calculate position size in shares
    const size = positionSizeGBP / entryPrice;
    
    const position: BacktestPosition = {
      id: `BT_${signal.id}_${Date.now()}`,
      symbol: signal.symbol,
      signal: signal,
      entryTime: currentCandle.timestamp,
      entryPrice: entryPrice,
      plannedEntryPrice: entryPrice,
      slippage: 0,
      size: size,
      direction: signal.plan.direction === 'long' ? 'long' : 'short',
      stopLoss: signal.plan.stop,
      takeProfit: signal.plan.targets[0],
      status: 'pending',
      commission: this.commissionPerTrade
    };

    this.pendingOrders.set(position.id, position);
    return position;
  }

  // Check if pending orders should be filled
  checkPendingOrders(candle: BacktestCandle): BacktestPosition[] {
    const filledPositions: BacktestPosition[] = [];

    for (const [id, position] of this.pendingOrders) {
      // ONLY check orders for the current candle's symbol
      if (position.symbol !== candle.symbol) continue;

      const shouldFill = this.shouldFillOrder(position, candle);
      
      if (shouldFill) {
        const fill = this.simulateFill(position, candle);
        position.entryPrice = fill.fillPrice;
        position.slippage = fill.slippage;
        position.commission = fill.commission;
        position.status = 'filled';
        
        filledPositions.push(position);
        this.pendingOrders.delete(id);
      }
    }

    return filledPositions;
  }

  // Check if order should be filled based on price action
  private shouldFillOrder(position: BacktestPosition, candle: BacktestCandle): boolean {
    const entryPrice = position.plannedEntryPrice;
    
    if (position.direction === 'long') {
      // For long positions, fill if price goes above entry
      return candle.high >= entryPrice;
    } else {
      // For short positions, fill if price goes below entry
      return candle.low <= entryPrice;
    }
  }

  // Simulate realistic fill with slippage
  private simulateFill(position: BacktestPosition, candle: BacktestCandle): SimulatedFill {
    const tick = this.getCurrentTick(candle, position.symbol);
    const plannedEntry = position.plannedEntryPrice;
    
    let fillPrice: number;
    let slippage: number;

    if (position.direction === 'long') {
      // Buy at ask price
      fillPrice = Math.max(tick.ask, plannedEntry);
      
      // Additional slippage for market orders
      const additionalSlippage = (fillPrice * this.slippageBps) / 10000;
      fillPrice += additionalSlippage;
      
      // Ensure we don't fill outside the candle range
      fillPrice = Math.min(fillPrice, candle.high);
    } else {
      // Sell at bid price
      fillPrice = Math.min(tick.bid, plannedEntry);
      
      // Additional slippage for market orders
      const additionalSlippage = (fillPrice * this.slippageBps) / 10000;
      fillPrice -= additionalSlippage;
      
      // Ensure we don't fill outside the candle range
      fillPrice = Math.max(fillPrice, candle.low);
    }

    slippage = Math.abs(fillPrice - plannedEntry);

    return {
      fillPrice,
      slippage,
      commission: this.commissionPerTrade,
      fillTime: candle.timestamp
    };
  }

  // Check if position should be closed (stop loss or take profit)
  checkPositionExit(position: BacktestPosition, candle: BacktestCandle): {
    shouldExit: boolean;
    exitPrice: number;
    exitReason: 'stop_loss' | 'take_profit' | 'signal' | 'end_of_data';
  } | null {
    if (position.status !== 'filled') return null;

    const { stopLoss, takeProfit, direction } = position;

    // Check stop loss
    if (direction === 'long') {
      if (candle.low <= stopLoss) {
        // Stop loss hit
        const exitPrice = Math.min(stopLoss, candle.low);
        return {
          shouldExit: true,
          exitPrice,
          exitReason: 'stop_loss'
        };
      }
      if (candle.high >= takeProfit) {
        // Take profit hit
        const exitPrice = Math.min(takeProfit, candle.high);
        return {
          shouldExit: true,
          exitPrice,
          exitReason: 'take_profit'
        };
      }
    } else {
      // Short position
      if (candle.high >= stopLoss) {
        // Stop loss hit
        const exitPrice = Math.max(stopLoss, candle.high);
        return {
          shouldExit: true,
          exitPrice,
          exitReason: 'stop_loss'
        };
      }
      if (candle.low <= takeProfit) {
        // Take profit hit
        const exitPrice = Math.max(takeProfit, candle.low);
        return {
          shouldExit: true,
          exitPrice,
          exitReason: 'take_profit'
        };
      }
    }

    return null;
  }

  // Close position and calculate P&L
  closePosition(
    position: BacktestPosition, 
    exitPrice: number, 
    exitReason: 'stop_loss' | 'take_profit' | 'signal' | 'end_of_data',
    exitTime: Date
  ): BacktestPosition {
    position.exitPrice = exitPrice;
    position.exitReason = exitReason;
    position.exitTime = exitTime;
    position.status = 'closed';

    // Calculate P&L
    const entryValue = position.entryPrice * position.size;
    const exitValue = exitPrice * position.size;
    
    if (position.direction === 'long') {
      position.pnl = exitValue - entryValue - position.commission * 2;
    } else {
      position.pnl = entryValue - exitValue - position.commission * 2;
    }

    position.pnlPercent = (position.pnl / entryValue) * 100;

    return position;
  }

  // Cancel pending order
  cancelOrder(orderId: string): boolean {
    return this.pendingOrders.delete(orderId);
  }

  // Get all pending orders
  getPendingOrders(): BacktestPosition[] {
    return Array.from(this.pendingOrders.values());
  }

  // Clear all pending orders
  clearPendingOrders(): void {
    this.pendingOrders.clear();
  }
}