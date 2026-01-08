import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { TradeService } from '../db/services/tradeService.js';
import { Trade } from '../db/models/Trade.js';
import { TradingCircuitBreaker } from '../helpers/circuitBreaker.js';

class PositionMonitorService {
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs = 60000; // Check every 60 seconds - reduced to avoid MetaAPI rate limits
  private circuitBreaker: TradingCircuitBreaker;
  private breakEvenPositions: Set<string> = new Set();
  
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
      
      // Clean up trades with invalid position IDs
      const invalidPositionTrades = await Trade.find({
        status: { $in: ['placed', 'filled', 'partial'] },
        $or: [
          { mt5PositionId: 'N/A' },
          { mt5PositionId: 'undefined' },
          { mt5PositionId: null },
          { mt5PositionId: '' }
        ]
      });
      
      console.log(`Found ${invalidPositionTrades.length} trades with invalid position IDs to clean up`);
      
      for (const trade of invalidPositionTrades) {
        console.log(`🧹 Cleaning up invalid position trade ${trade._id} (${trade.symbol})`);
        
        await Trade.findByIdAndUpdate(
          trade._id,
          {
            status: 'cancelled',
            cancelReason: 'invalid_position_id',
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
            // Skip invalid position IDs (e.g., "N/A" from failed order placements)
            if (!trade.mt5PositionId || trade.mt5PositionId === 'N/A' || trade.mt5PositionId === 'undefined') {
              console.log(`⚠️ Skipping trade ${trade._id} - invalid position ID: ${trade.mt5PositionId}`);
              // Mark as closed with unknown outcome to stop further processing
              trade.status = 'closed';
              trade.exitReason = 'invalid_position';
              trade.closedTime = new Date();
              trade.pnlAmount = 0;
              trade.pnlPercent = 0;
              await trade.save();
              continue;
            }
            
            const position = positionMap.get(trade.mt5PositionId);
            
            if (!position) {
              // Position no longer exists - it was closed!
              // Try multiple methods to get closure details
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
                // BACKUP CLOSURE: If no historical data, mark as closed with estimated P&L
                console.log(`⚠️ Trade ${trade._id} closed but no details available - using backup closure`);
                const estimatedClosePrice = trade.actualEntryPrice || trade.entryPrice;
                
                trade.status = 'closed';
                trade.exitReason = 'system_backup';
                trade.closedTime = new Date();
                trade.exitPrice = estimatedClosePrice;
                // Mark as break-even since we can't determine actual exit
                trade.pnlAmount = 0;
                trade.pnlPercent = 0;
                await trade.save();
                
                console.log(`🔄 Trade ${trade._id} marked closed with backup system`);
              }
            } else {
              // ACTIVE PRICE MONITORING: Check if position should be closed based on current price
              await this.checkActivePriceTargets(trade, position);
              
              // TIMEOUT CLOSURE: Check if position has been open too long
              await this.checkPositionTimeout(trade);
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

  private async checkActivePriceTargets(trade: any, position: any): Promise<void> {
    try {
      const currentPrice = position.currentPrice || position.openPrice;
      
      if (!currentPrice || !trade.stopLoss || !trade.takeProfit) {
        return;
      }

      const isLong = trade.direction === 'long';
      const entryPrice = trade.actualEntryPrice || trade.entryPrice;
      const positionId = position.id || trade.mt5PositionId;

      if (entryPrice && positionId && !this.breakEvenPositions.has(positionId)) {
        const initialRisk = Math.abs(entryPrice - trade.stopLoss);
        const currentProfit = isLong 
          ? currentPrice - entryPrice 
          : entryPrice - currentPrice;

        if (currentProfit >= initialRisk) {
          console.log(`🔒 Break-even triggered for ${trade.symbol}: profit ${currentProfit.toFixed(2)} >= risk ${initialRisk.toFixed(2)}`);
          
          const result = await metaApiHandler.modifyPosition(positionId, entryPrice);
          
          if (result.success) {
            this.breakEvenPositions.add(positionId);
            trade.stopLoss = entryPrice;
            trade.breakEvenTriggered = true;
            trade.breakEvenTime = new Date();
            await trade.save();
            console.log(`✅ ${trade.symbol} SL moved to break-even at ${entryPrice}`);
          } else {
            console.error(`❌ Failed to move SL to break-even for ${trade.symbol}: ${result.error}`);
          }
        }
      }

      let shouldClose = false;
      let exitReason: 'stop_loss' | 'take_profit' | null = null;

      if (isLong) {
        if (currentPrice <= trade.stopLoss) {
          shouldClose = true;
          exitReason = 'stop_loss';
        } else if (currentPrice >= trade.takeProfit) {
          shouldClose = true;
          exitReason = 'take_profit';
        }
      } else {
        if (currentPrice >= trade.stopLoss) {
          shouldClose = true;
          exitReason = 'stop_loss';
        } else if (currentPrice <= trade.takeProfit) {
          shouldClose = true;
          exitReason = 'take_profit';
        }
      }

      if (shouldClose && exitReason) {
        console.log(`🎯 Active monitoring triggered: ${trade.symbol} hit ${exitReason} at ${currentPrice}`);
        
        try {
          await metaApiHandler.closePosition(position.id);
          
          await TradeService.closeTrade(
            trade.mt5PositionId,
            currentPrice,
            exitReason,
            0
          );
          
          this.breakEvenPositions.delete(positionId);
          console.log(`✅ Position ${position.id} closed via active monitoring`);
        } catch (closeError) {
          console.error(`❌ Failed to close position ${position.id} via active monitoring:`, closeError);
          
          trade.status = 'closed';
          trade.exitReason = exitReason;
          trade.exitPrice = currentPrice;
          trade.closedTime = new Date();
          
          if (entryPrice) {
            const pnlPercent = isLong 
              ? ((currentPrice - entryPrice) / entryPrice) * 100
              : ((entryPrice - currentPrice) / entryPrice) * 100;
            
            trade.pnlPercent = pnlPercent;
            trade.pnlAmount = (pnlPercent / 100) * (trade.positionSizeGBP || 5);
          }
          
          await trade.save();
          this.breakEvenPositions.delete(positionId);
          console.log(`🔄 Trade ${trade._id} force-closed via fallback system`);
        }
      }
    } catch (error) {
      console.error(`Error in active price monitoring for trade ${trade._id}:`, error);
    }
  }

  private async checkPositionTimeout(trade: any): Promise<void> {
    try {
      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      const totalMinutes = utcHours * 60 + utcMinutes;
      
      const marketCloseMinutes = 21 * 60; // 4 PM EST = 21:00 UTC
      const isAfterMarketClose = totalMinutes >= marketCloseMinutes;
      
      if (isAfterMarketClose) {
        console.log(`🔔 End of day closure: ${trade._id} (${trade.symbol}) - market closed at 21:00 UTC`);
        
        try {
          if (trade.mt5PositionId) {
            await metaApiHandler.closePosition(trade.mt5PositionId);
          }
        } catch (error) {
          console.error(`Failed to close via MetaAPI for EOD:`, error);
        }

        trade.status = 'closed';
        trade.exitReason = 'end_of_day';
        trade.closedTime = new Date();
        trade.exitPrice = trade.actualEntryPrice || trade.entryPrice;
        trade.pnlAmount = 0;
        trade.pnlPercent = 0;
        
        await trade.save();
        console.log(`✅ Trade ${trade._id} closed at end of day`);
        return;
      }
      
      // Use filled time if available, otherwise signal time
      const openTime = trade.filledTime || trade.signalTime;
      if (!openTime) return;

      const hoursOpen = (Date.now() - openTime.getTime()) / (1000 * 60 * 60);
      const maxHours = 6; // Close positions after 6 hours if still open

      if (hoursOpen > maxHours) {
        console.log(`⏰ Position ${trade._id} (${trade.symbol}) open for ${hoursOpen.toFixed(1)} hours - forcing closure`);
        
        try {
          // Try to close via MetaAPI first
          if (trade.mt5PositionId) {
            await metaApiHandler.closePosition(trade.mt5PositionId);
          }
        } catch (error) {
          console.error(`Failed to close via MetaAPI, using database closure:`, error);
        }

        // Mark as closed in database regardless
        trade.status = 'closed';
        trade.exitReason = 'timeout';
        trade.closedTime = new Date();
        trade.exitPrice = trade.actualEntryPrice || trade.entryPrice;
        
        // Mark as break-even since we're force closing
        trade.pnlAmount = -1; // Small loss for forced closure
        trade.pnlPercent = -0.2; // 0.2% loss
        
        await trade.save();
        console.log(`🔄 Trade ${trade._id} force-closed due to timeout`);
      }
    } catch (error) {
      console.error(`Error in position timeout check for trade ${trade._id}:`, error);
    }
  }
}

export const positionMonitor = new PositionMonitorService();
export default positionMonitor;