import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { TradeService } from '../db/services/tradeService.js';
import { Trade } from '../db/models/Trade.js';
import { TradingCircuitBreaker } from '../helpers/circuitBreaker.js';

class PositionMonitorService {
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs = 30000; // Check every 30 seconds
  private circuitBreaker: TradingCircuitBreaker;
  
  constructor() {
    this.circuitBreaker = new TradingCircuitBreaker();
  }
  
  async start() {
    console.log('📊 Starting MT5 position monitoring service...');
    
    // Clean up any stuck trades on startup
    await this.cleanupStuckTrades();
    
    // Initial check
    await this.checkPositions();
    
    // Set up interval
    this.intervalId = setInterval(() => {
      this.checkPositions().catch(console.error);
    }, this.checkIntervalMs);
  }
  
  async cleanupStuckTrades() {
    try {
      console.log('🧹 Performing one-time cleanup of stuck trades...');
      
      // Find trades that have been "placed" for more than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const stuckTrades = await Trade.find({
        status: 'placed',
        orderPlacedTime: { $lt: oneHourAgo }
      });
      
      console.log(`Found ${stuckTrades.length} stuck trades to clean up`);
      
      for (const trade of stuckTrades) {
        console.log(`🧹 Cleaning up stuck trade ${trade._id} (${trade.symbol}) placed at ${trade.orderPlacedTime}`);
        
        await Trade.findByIdAndUpdate(
          trade._id,
          {
            status: 'cancelled',
            cancelReason: 'cleanup_stuck',
            cancelTime: new Date()
          }
        );
      }
      
      console.log('✅ Stuck trades cleanup completed');
    } catch (error) {
      console.error('Error during stuck trades cleanup:', error);
    }
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('📊 Stopped MT5 position monitoring service');
    }
  }
  
  private async checkPositions() {
    try {
      // Get all trades that are not yet closed
      const openTrades = await Trade.find({
        status: { $in: ['placed', 'filled', 'partial'] }
      });
      
      if (openTrades.length === 0) {
        return;
      }
      
      console.log(`📊 Checking ${openTrades.length} open trades...`);
      
      // Get current positions from MT5
      const positions = await metaApiHandler.getPositions();
      const orders = await metaApiHandler.getOrders();
      
      // Create maps for quick lookup
      const positionMap = new Map(
        positions.map(p => [p.id || p.positionId, p])
      );
      const orderMap = new Map(
        orders.map(o => [o.id || o.orderId, o])
      );
      
      // Check each trade
      for (const trade of openTrades) {
        try {
          // Check if order was filled (became a position)
          if (trade.status === 'placed' && trade.mt5OrderId) {
            const order = orderMap.get(trade.mt5OrderId);
            
            if (!order) {
              // Order no longer exists, check if it became a position
              const position = Array.from(positionMap.values()).find(
                p => p.comment?.includes(trade.patternName) && 
                     p.symbol === trade.mt5Symbol
              );
              
              if (position) {
                // Order was filled!
                console.log(`✅ Trade ${trade._id} filled at ${position.openPrice}`);
                await TradeService.updateTradeFilled(
                  trade.mt5OrderId,
                  position.openPrice,
                  new Date(position.time)
                );
                
                // Update with position ID for tracking
                trade.mt5PositionId = position.id || position.positionId;
                trade.actualEntryPrice = position.openPrice;
                trade.status = 'filled';
                await trade.save();
              } else {
                // Order was cancelled or rejected - determine reason
                console.log(`❌ Trade ${trade._id} (${trade.symbol}) order not found - current status: ${trade.status}`);
                
                // Check if already marked as cancelled to avoid repeated processing
                if (trade.status === 'cancelled') {
                  console.log(`⚠️ Trade ${trade._id} already marked as cancelled, skipping`);
                  continue;
                }
                
                // Check if it's end of day (market close)
                const now = new Date();
                const marketCloseET = new Date();
                marketCloseET.setUTCHours(21, 0, 0, 0); // 4 PM ET = 21:00 UTC
                
                let cancelReason: 'price_never_reached' | 'end_of_day' | 'timeout' = 'price_never_reached';
                
                if (now > marketCloseET) {
                  cancelReason = 'end_of_day';
                } else if (trade.orderPlacedTime) {
                  // Check how long the order was active
                  const orderAge = now.getTime() - trade.orderPlacedTime.getTime();
                  const hoursAge = orderAge / (1000 * 60 * 60);
                  
                  if (hoursAge > 4) {
                    cancelReason = 'timeout';
                  }
                }
                
                // Update trade status
                console.log(`📊 Updating trade ${trade._id} from ${trade.status} to cancelled (${cancelReason})`);
                
                const result = await Trade.findByIdAndUpdate(
                  trade._id,
                  {
                    status: 'cancelled',
                    cancelReason: cancelReason,
                    cancelTime: new Date()
                  },
                  { new: true }
                );
                
                if (result) {
                  console.log(`✅ Trade ${trade._id} successfully updated to cancelled status`);
                } else {
                  console.error(`❌ Failed to update trade ${trade._id} status`);
                }
              }
            }
          }
          
          // Check if filled position was closed
          if (trade.status === 'filled' && trade.mt5PositionId) {
            const position = positionMap.get(trade.mt5PositionId);
            
            if (!position) {
              // Position no longer exists - it was closed!
              // Need to get historical data to find exit details
              const historicalData = await metaApiHandler.getClosedPosition(trade.mt5PositionId);
              
              if (historicalData) {
                const exitReason = this.determineExitReason(
                  historicalData,
                  trade.stopLoss,
                  trade.takeProfit
                );
                
                console.log(`💰 Trade ${trade._id} closed at ${historicalData.closePrice} (${exitReason})`);
                
                await TradeService.closeTrade(
                  trade.mt5PositionId,
                  historicalData.closePrice,
                  exitReason,
                  historicalData.commission || 0
                );
                
                // Update circuit breaker with closed trade result
                const closedTrade = await Trade.findOne({ mt5PositionId: trade.mt5PositionId });
                if (closedTrade) {
                  await this.circuitBreaker.updateTradeResult(closedTrade);
                }
              } else {
                // Fallback - mark as closed without details
                console.log(`⚠️ Trade ${trade._id} closed but no details available`);
                trade.status = 'closed';
                trade.exitReason = 'system';
                trade.closedTime = new Date();
                await trade.save();
              }
            }
          }
        } catch (error) {
          console.error(`Error checking trade ${trade._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in position monitoring:', error);
    }
  }
  
  private determineExitReason(
    position: any,
    stopLoss: number,
    takeProfit: number
  ): 'stop_loss' | 'take_profit' | 'manual' {
    const closePrice = position.closePrice;
    const direction = position.type === 'POSITION_TYPE_BUY' ? 'long' : 'short';
    
    // Check if hit stop loss (with small tolerance for slippage)
    if (direction === 'long') {
      if (closePrice <= stopLoss + 0.10) return 'stop_loss';
      if (closePrice >= takeProfit - 0.10) return 'take_profit';
    } else {
      if (closePrice >= stopLoss - 0.10) return 'stop_loss';
      if (closePrice <= takeProfit + 0.10) return 'take_profit';
    }
    
    return 'manual';
  }
}

export const positionMonitor = new PositionMonitorService();
export default positionMonitor;