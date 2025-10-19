import axios from 'axios';
import https from 'https';
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { TradeService } from '../db/services/tradeService.js';

export interface MetaApiOrderResult {
  success: boolean;
  data?: {
    orderId?: string;
    positionId?: string;
    message?: string;
  };
  error?: string;
}

class MetaApiRestHandler {
  private token: string;
  private accountId: string;
  private provisioningUrl = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';
  private clientUrl = 'https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai';
  private axiosInstance: any;

  constructor() {
    this.token = process.env.METAAPI_TOKEN || '';
    this.accountId = process.env.METAAPI_ACCOUNT_ID || '';
    
    // Create axios instance with SSL configuration
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Accept self-signed certificates
      })
    });
  }

  private getHeaders() {
    return {
      'auth-token': this.token,
      'Content-Type': 'application/json'
    };
  }

  private convertToMT5Symbol(symbol: string): string {
    // Common NASDAQ stocks that need .O suffix
    const nasdaqStocks = ['AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'NFLX', 'DLTR', 'CSX'];
    
    // Common NYSE stocks that need .N suffix  
    const nyseStocks = ['JNJ', 'JPM', 'V', 'PG', 'HD', 'MA', 'BAC', 'WMT', 'DIS', 'KO', 'PFE', 'MRK', 'UNH', 'CVX', 'XOM', 'VZ', 'T', 'MMM', 'CAT', 'BA', 'IBM', 'GE', 'GM', 'F', 'CRM'];
    
    if (nasdaqStocks.includes(symbol)) {
      return `${symbol}.O`;
    } else if (nyseStocks.includes(symbol)) {
      return `${symbol}.N`;
    }
    
    // For other symbols, return as-is
    return symbol;
  }

  async checkStatus(): Promise<{ connected: boolean; error?: string; accountInfo?: any }> {
    try {
      console.log(`[MetaApi] Checking account status for ID: ${this.accountId}`);
      console.log(`[MetaApi] Using provisioning URL: ${this.provisioningUrl}`);
      
      // Check account connection status
      const response = await this.axiosInstance.get(
        `${this.provisioningUrl}/users/current/accounts/${this.accountId}`,
        { headers: this.getHeaders() }
      );

      const account = response.data;
      console.log('[MetaApi] Account status response:', account);
      
      // Get account information if connected
      if (account.connectionStatus === 'CONNECTED') {
        try {
          const infoResponse = await this.axiosInstance.get(
            `${this.clientUrl}/users/current/accounts/${this.accountId}/account-information`,
            { headers: this.getHeaders() }
          );
          
          return {
            connected: true,
            accountInfo: {
              balance: infoResponse.data.balance,
              equity: infoResponse.data.equity,
              margin: infoResponse.data.margin,
              freeMargin: infoResponse.data.freeMargin,
              currency: infoResponse.data.currency,
              leverage: infoResponse.data.leverage,
              broker: infoResponse.data.broker
            }
          };
        } catch (infoError: any) {
          // Account is connected but can't get detailed info - that's OK for trading
          console.log('[MetaApi] Account connected but unable to fetch detailed info:', infoError.response?.status);
          return {
            connected: true,
            accountInfo: {
              login: account.login,
              server: account.server,
              type: account.type,
              region: account.region,
              status: 'Connected but limited info'
            }
          };
        }
      }
      
      return {
        connected: false,
        error: `Account status: ${account.connectionStatus}. State: ${account.state}. Deploy status: ${account.deploymentState}`
      };
    } catch (error: any) {
      console.error('MetaApi status check error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.response?.config?.url,
        message: error.message
      });
      
      // If it's a 404, the account might not exist in this region
      if (error.response?.status === 404) {
        return {
          connected: false,
          error: `Account not found in London region. Status: ${error.response?.status}`
        };
      }
      
      return {
        connected: false,
        error: error.response?.data?.error || error.message || 'MetaApi not connected'
      };
    }
  }

  async cancelPendingOrdersForSymbol(symbol: string): Promise<{ success: boolean; canceledCount: number; errors: string[] }> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      
      // Get all pending orders
      const ordersResponse = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
        { headers: this.getHeaders() }
      );

      const orders = ordersResponse.data;
      if (!orders || orders.length === 0) {
        return { success: true, canceledCount: 0, errors: [] };
      }

      const errors: string[] = [];
      let canceledCount = 0;

      // Filter orders for this symbol (need to check both with and without suffix)
      const baseSymbol = symbol.replace(/\.[ON]$/, ''); // Remove .O or .N suffix if present
      
      for (const order of orders) {
        const orderBaseSymbol = order.symbol.replace(/\.[ON]$/, '');
        
        if (orderBaseSymbol === baseSymbol) {
          try {
            const cancelRequest = {
              actionType: 'ORDER_CANCEL',
              orderId: order.id.toString()
            };

            console.log(`[MetaApi] Cancel request for order ${order.id}:`, JSON.stringify(cancelRequest, null, 2));
            console.log(`[MetaApi] Canceling existing order ${order.id} for ${order.symbol}`);
            
            await this.axiosInstance.post(
              `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
              cancelRequest,
              { headers: this.getHeaders() }
            );

            canceledCount++;
            console.log(`[MetaApi] Successfully canceled order ${order.id}`);
          } catch (error: any) {
            const errorMsg = `Failed to cancel order ${order.id}: ${error.response?.data?.error || error.message}`;
            console.error(`[MetaApi] ${errorMsg}`);
            errors.push(errorMsg);
          }
        }
      }

      if (canceledCount > 0) {
        console.log(`[MetaApi] Canceled ${canceledCount} existing orders for ${symbol}`);
      }

      return { success: errors.length === 0, canceledCount, errors };
    } catch (error: any) {
      console.error('[MetaApi] Error canceling orders for symbol:', error.response?.data || error.message);
      return {
        success: false,
        canceledCount: 0,
        errors: [`Failed to check orders: ${error.message}`]
      };
    }
  }

  async placeOrder(signal: ComprehensiveSignal): Promise<MetaApiOrderResult> {
    // Declare variables that will be used in catch blocks
    let actionType: string = '';
    let orderRequest: any = {};
    
    try {
      const { symbol, plan, currentPrice } = signal;
      const isLong = plan.direction === 'long';
      
      // Validate currentPrice is provided
      if (currentPrice === undefined) {
        return {
          success: false,
          error: 'Current price is required but not provided in the signal'
        };
      }
      
      // Log the incoming signal data to debug price mismatch
      console.log(`[MetaApi] Incoming signal data:`, {
        symbol,
        patternName: signal.pattern?.name,
        currentPrice,
        plan: {
          direction: plan.direction,
          entry: plan.entry,
          stop: plan.stop,
          targets: plan.targets,
        },
        timestamp: new Date().toISOString()
      });
      
      // Cancel any existing pending orders for this symbol first
      console.log(`[MetaApi] Checking for existing pending orders for ${symbol}...`);
      const cancelResult = await this.cancelPendingOrdersForSymbol(symbol);
      console.log(`[MetaApi] Cancellation result:`, cancelResult);
      if (cancelResult.canceledCount > 0) {
        console.log(`[MetaApi] Canceled ${cancelResult.canceledCount} existing orders for ${symbol} before placing new order`);
      }
      if (cancelResult.errors.length > 0) {
        console.warn(`[MetaApi] Errors during cancellation: ${cancelResult.errors.join(', ')}`);
      }
      
      // Log cancellation errors but continue with new order placement
      if (cancelResult.errors.length > 0) {
        console.warn(`[MetaApi] Could not cancel some existing orders for ${symbol}, but proceeding with new order: ${cancelResult.errors.join(', ')}`);
      }
      
      // Wait a moment for cancellations to complete
      if (cancelResult.canceledCount > 0) {
        console.log(`[MetaApi] Waiting 1 second for cancellations to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Position sizing to target £5 MARGIN (not notional value)
      const targetMarginGBP = 5; // £5 margin per trade
      const gbpToUsd = 1.30; // Approximate exchange rate
      const targetMarginUSD = targetMarginGBP * gbpToUsd; // $6.50 margin
      let volume = 0.01; // Default fallback
      
      try {
        // Calculate volume based on £5 target margin
        // This will use leverage to control much larger positions
        const entryPrice = plan.entry;
        
        // Assume average margin requirement of 2% (1:50 leverage)
        // You can adjust this based on specific stock margin requirements
        const estimatedMarginPercent = 0.02; // 2% margin = 1:50 leverage
        
        // Calculate notional value that £5 margin can control
        const notionalValueUSD = targetMarginUSD / estimatedMarginPercent; // $6.50 / 0.02 = $325
        
        // Calculate lots needed (1 lot = 1 share at entry price)
        const sharesNeeded = notionalValueUSD / entryPrice;
        
        // Round to 2 decimal places for MT5 (0.01 increments)
        volume = Math.round(sharesNeeded * 100) / 100;
        
        // Apply safety limits - much higher now since we're targeting margin
        volume = Math.max(volume, 0.01); // Minimum 0.01 lots
        volume = Math.min(volume, 10.0);  // Maximum 10 lots (£50 margin max)
        
        // Calculate actual values for logging
        const actualNotionalUSD = volume * entryPrice;
        const actualMarginUSD = actualNotionalUSD * estimatedMarginPercent;
        const actualMarginGBP = actualMarginUSD / gbpToUsd;
        const actualNotionalGBP = actualNotionalUSD / gbpToUsd;
        
        console.log(`[MetaApi] Margin-based position sizing:`, {
          targetMarginGBP: `£${targetMarginGBP}`,
          targetMarginUSD: `$${targetMarginUSD.toFixed(2)}`,
          estimatedLeverage: `1:${(1/estimatedMarginPercent).toFixed(0)}`,
          stockPrice: `$${entryPrice}`,
          calculatedLots: sharesNeeded.toFixed(3),
          actualLots: volume,
          actualNotionalUSD: `$${actualNotionalUSD.toFixed(2)}`,
          actualNotionalGBP: `£${actualNotionalGBP.toFixed(2)}`,
          actualMarginUSD: `$${actualMarginUSD.toFixed(2)}`,
          actualMarginGBP: `£${actualMarginGBP.toFixed(2)}`
        });
        
      } catch (error: any) {
        console.log('[MetaApi] Error calculating margin-based position size, using default:', error.message);
        volume = 0.01;
      }

      // Convert symbol to MT5 format (add .O for NASDAQ stocks)
      const mt5Symbol = this.convertToMT5Symbol(symbol);
      
      // Check if we can get quotes for this symbol first and get accurate current price
      let currentMarketPrice = currentPrice;
      try {
        const quoteCheck = await this.checkSymbolQuotes(mt5Symbol);
        if (!quoteCheck.success) {
          return {
            success: false,
            error: `No quotes available for ${mt5Symbol}. ${quoteCheck.error}`
          };
        }
        // Use the actual market price if available
        if (quoteCheck.quotes?.bid && quoteCheck.quotes?.ask) {
          // Use mid-price for order type decisions
          currentMarketPrice = (quoteCheck.quotes.bid + quoteCheck.quotes.ask) / 2;
          console.log(`[MetaApi] Current market price for ${mt5Symbol}: Bid=${quoteCheck.quotes.bid}, Ask=${quoteCheck.quotes.ask}, Mid=${currentMarketPrice}`);
        }
      } catch (quoteError) {
        console.log('[MetaApi] Quote check failed, proceeding with order anyway');
      }
      
      // Determine order type and adjust entry price if needed
      const minDistancePercent = 0.007; // 0.7% minimum distance - provides adequate margin for MT5 orders
      const priceDiff = Math.abs((plan.entry - currentMarketPrice) / currentMarketPrice);
      
      let adjustedEntry = plan.entry;
      
      console.log(`[MetaApi] Price analysis:`, {
        originalEntry: plan.entry,
        signalCurrentPrice: currentPrice,
        marketCurrentPrice: currentMarketPrice,
        priceDiffPercent: (priceDiff * 100).toFixed(2) + '%',
        minRequiredPercent: (minDistancePercent * 100).toFixed(1) + '%',
        willNeedAdjustment: priceDiff < minDistancePercent
      });
      
      if (isLong) {
        if (plan.entry > currentMarketPrice && priceDiff >= minDistancePercent) {
          actionType = 'ORDER_TYPE_BUY_STOP';
          console.log(`[MetaApi] Using BUY_STOP: Entry ${plan.entry} > Current ${currentMarketPrice}, diff ${(priceDiff*100).toFixed(2)}% >= ${(minDistancePercent*100).toFixed(1)}%`);
        } else if (plan.entry < currentMarketPrice && priceDiff >= minDistancePercent) {
          actionType = 'ORDER_TYPE_BUY_LIMIT';
          console.log(`[MetaApi] Using BUY_LIMIT: Entry ${plan.entry} < Current ${currentMarketPrice}, diff ${(priceDiff*100).toFixed(2)}% >= ${(minDistancePercent*100).toFixed(1)}%`);
        } else {
          // For very close prices, use a small stop above current price to catch upward movement
          actionType = 'ORDER_TYPE_BUY_STOP';
          adjustedEntry = currentMarketPrice + (currentMarketPrice * minDistancePercent);
          console.log(`[MetaApi] Adjusted BUY_STOP: Entry too close (${(priceDiff*100).toFixed(2)}%), adjusted to ${adjustedEntry.toFixed(2)} (above market for breakout)`);
        }
      } else {
        if (plan.entry < currentMarketPrice && priceDiff >= minDistancePercent) {
          actionType = 'ORDER_TYPE_SELL_STOP';
          console.log(`[MetaApi] Using SELL_STOP: Entry ${plan.entry} < Current ${currentMarketPrice}, diff ${(priceDiff*100).toFixed(2)}% >= ${(minDistancePercent*100).toFixed(1)}%`);
        } else if (plan.entry > currentMarketPrice && priceDiff >= minDistancePercent) {
          actionType = 'ORDER_TYPE_SELL_LIMIT';
          console.log(`[MetaApi] Using SELL_LIMIT: Entry ${plan.entry} > Current ${currentMarketPrice}, diff ${(priceDiff*100).toFixed(2)}% >= ${(minDistancePercent*100).toFixed(1)}%`);
        } else {
          // For very close prices, use a small stop below current price to catch downward movement
          actionType = 'ORDER_TYPE_SELL_STOP';
          adjustedEntry = currentMarketPrice - (currentMarketPrice * minDistancePercent);
          console.log(`[MetaApi] Adjusted SELL_STOP: Entry too close (${(priceDiff*100).toFixed(2)}%), adjusted to ${adjustedEntry.toFixed(2)} (below market for breakdown)`);
        }
      }
      
      // Validate and adjust stop levels relative to adjusted entry
      let adjustedStopLoss = plan.stop;
      let adjustedTakeProfit = plan.targets[0];
      
      console.log(`[MetaApi] Order validation:
        Direction: ${plan.direction} (${actionType})
        Current Price: ${currentMarketPrice}
        Original Entry: ${plan.entry} -> Adjusted Entry: ${adjustedEntry}
        Original Stop: ${plan.stop}
        Original TP: ${plan.targets[0]}
      `);
      
      // Ensure minimum distances for stops (many brokers require this)
      const minStopDistance = adjustedEntry * 0.01; // Increased to 1% minimum distance
      
      if (isLong) {
        // For long positions: SL below entry, TP above entry
        if (adjustedStopLoss >= adjustedEntry) {
          adjustedStopLoss = adjustedEntry - minStopDistance;
          console.warn(`[MetaApi] Adjusted SL for long: ${adjustedStopLoss} (was ${plan.stop}) - SL was above entry`);
        } else if ((adjustedEntry - adjustedStopLoss) < minStopDistance) {
          adjustedStopLoss = adjustedEntry - minStopDistance;
          console.warn(`[MetaApi] Increased SL distance for long: ${adjustedStopLoss} (was ${plan.stop}) - distance too small`);
        }
        
        if (adjustedTakeProfit <= adjustedEntry) {
          adjustedTakeProfit = adjustedEntry + minStopDistance;
          console.warn(`[MetaApi] Adjusted TP for long: ${adjustedTakeProfit} (was ${plan.targets[0]}) - TP was below entry`);
        } else if ((adjustedTakeProfit - adjustedEntry) < minStopDistance) {
          adjustedTakeProfit = adjustedEntry + minStopDistance;
          console.warn(`[MetaApi] Increased TP distance for long: ${adjustedTakeProfit} (was ${plan.targets[0]}) - distance too small`);
        }
      } else {
        // For short positions: SL above entry, TP below entry
        if (adjustedStopLoss <= adjustedEntry) {
          adjustedStopLoss = adjustedEntry + minStopDistance;
          console.warn(`[MetaApi] Adjusted SL for short: ${adjustedStopLoss} (was ${plan.stop}) - SL was below entry`);
        } else if ((adjustedStopLoss - adjustedEntry) < minStopDistance) {
          adjustedStopLoss = adjustedEntry + minStopDistance;
          console.warn(`[MetaApi] Increased SL distance for short: ${adjustedStopLoss} (was ${plan.stop}) - distance too small`);
        }
        
        if (adjustedTakeProfit >= adjustedEntry) {
          adjustedTakeProfit = adjustedEntry - minStopDistance;
          console.warn(`[MetaApi] Adjusted TP for short: ${adjustedTakeProfit} (was ${plan.targets[0]}) - TP was above entry`);
        } else if ((adjustedEntry - adjustedTakeProfit) < minStopDistance) {
          adjustedTakeProfit = adjustedEntry - minStopDistance;
          console.warn(`[MetaApi] Increased TP distance for short: ${adjustedTakeProfit} (was ${plan.targets[0]}) - distance too small`);
        }
      }
      
      // Round prices to proper decimal places (most stocks use 2 decimals)
      const roundedEntry = Math.round(adjustedEntry * 100) / 100;
      const roundedStopLoss = Math.round(adjustedStopLoss * 100) / 100;
      const roundedTakeProfit = Math.round(adjustedTakeProfit * 100) / 100;
      
      console.log(`[MetaApi] Final order prices:
        Entry: ${roundedEntry}
        Stop Loss: ${roundedStopLoss}
        Take Profit: ${roundedTakeProfit}
        SL Distance: ${Math.abs(roundedEntry - roundedStopLoss)}
        TP Distance: ${Math.abs(roundedTakeProfit - roundedEntry)}
      `);
      
      orderRequest = {
        symbol: mt5Symbol,
        actionType: actionType,
        volume: volume,
        stopLoss: roundedStopLoss,
        takeProfit: roundedTakeProfit,
        comment: `Signal: ${signal.pattern.name}`
      };
      
      // Create trade record before placing order
      let tradeId: string | undefined;
      try {
        const scannerType = signal.pattern.name.includes('Gap') ? 'gap' : 'pattern';
        // Convert MT5 order type to database format (remove ORDER_TYPE_ prefix)
        const dbOrderType = actionType.replace('ORDER_TYPE_', '');
        const trade = await TradeService.createTradeFromSignal(
          signal,
          mt5Symbol,
          dbOrderType,
          volume,
          scannerType
        );
        tradeId = trade._id.toString();
        console.log(`[MetaApi] Created trade record: ${tradeId}`);
      } catch (tradeError) {
        console.error('[MetaApi] Error creating trade record:', tradeError);
        // Continue with order placement even if trade saving fails
      }

      // Only add openPrice if we have a valid entry price (not null for market orders)
      if (roundedEntry !== null && !isNaN(roundedEntry)) {
        orderRequest.openPrice = roundedEntry;
      }
      
      // Add expiration if supported by broker
      // Note: Some brokers don't support expiration times on pending orders
      // Commenting out for now - using automated cleanup every 10 minutes to cancel orders older than 15 minutes
      /*
      const expirationTime = new Date(Date.now() + 15 * 60 * 1000);
      orderRequest.expiration = {
        type: 'ORDER_TIME_SPECIFIED',
        time: expirationTime.toISOString()
      };
      */

      console.log(`[MetaApi] Placing order via REST:`, JSON.stringify(orderRequest, null, 2));
      
      // Use London region for trading since account is deployed there
      const tradingUrl = `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${this.accountId}/trade`;
      console.log(`[MetaApi] Using trading URL: ${tradingUrl}`);
      
      const response = await this.axiosInstance.post(
        tradingUrl,
        orderRequest,
        { headers: this.getHeaders() }
      );
      
      console.log('[MetaApi] Full order response:', JSON.stringify(response.data, null, 2));
      console.log('[MetaApi] Response status:', response.status);
      
      // After placing order, immediately check if it appears in pending orders
      console.log('[MetaApi] Verifying order was actually placed by checking pending orders...');
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const ordersCheck = await this.axiosInstance.get(
          `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${this.accountId}/orders`,
          { headers: this.getHeaders() }
        );
        
        const orders = ordersCheck.data || [];
        const newOrderId = response.data.orderId;
        const foundOrder = orders.find((o: any) => o.id === newOrderId);
        
        console.log(`[MetaApi] Order verification: Looking for order ${newOrderId}`);
        console.log(`[MetaApi] Found ${orders.length} total pending orders`);
        console.log(`[MetaApi] Order ${newOrderId} found in pending orders:`, !!foundOrder);
        
        if (foundOrder) {
          console.log(`[MetaApi] Order ${newOrderId} details:`, foundOrder);
        } else {
          console.log('[MetaApi] All current pending orders:', orders.map((o: any) => ({ id: o.id, symbol: o.symbol, type: o.type })));
        }
      } catch (verifyError) {
        console.error('[MetaApi] Error verifying order placement:', verifyError);
      }
      
      // Check if the trade was actually successful
      if (response.data.stringCode && response.data.stringCode !== 'TRADE_RETCODE_DONE') {
        return {
          success: false,
          error: `${response.data.stringCode}: ${response.data.message}`
        };
      }
      
      // Only return success if we have a proper trade execution
      if (response.data.orderId || response.data.ticket || response.data.positionId) {
        const result: MetaApiOrderResult = {
          success: true,
          data: {
            orderId: response.data.orderId || response.data.ticket || response.data.id || 'N/A',
            positionId: response.data.positionId || 'N/A',
            message: `${actionType} order placed successfully`
          }
        };
        
        // Update trade record with order result
        if (tradeId) {
          try {
            await TradeService.updateTradeWithOrderResult(
              tradeId,
              result,
              roundedEntry // Use the adjusted entry price
            );
            console.log(`[MetaApi] Updated trade record ${tradeId} with order result`);
          } catch (updateError) {
            console.error('[MetaApi] Error updating trade record:', updateError);
          }
        }
        
        return result;
      } else {
        const result: MetaApiOrderResult = {
          success: false,
          error: response.data.message || 'Order was not executed'
        };
        
        // Update trade record as rejected
        if (tradeId) {
          try {
            await TradeService.updateTradeWithOrderResult(tradeId, result);
            console.log(`[MetaApi] Updated trade record ${tradeId} as rejected`);
          } catch (updateError) {
            console.error('[MetaApi] Error updating trade record:', updateError);
          }
        }
        
        return result;
      }
    } catch (error: any) {
      console.error('Error placing MetaApi order:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: JSON.stringify(error.response?.data, null, 2),
        url: error.response?.config?.url,
        message: error.message
      });
      
      // If 404, try alternative trading endpoint
      if (error.response?.status === 404 && orderRequest && actionType) {
        console.log('[MetaApi] REST trade endpoint not found, trying RPC endpoint...');
        try {
          // Try the RPC endpoint for trading with London region
          const rpcUrl = `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${this.accountId}/rpc`;
          console.log(`[MetaApi] Trying RPC URL: ${rpcUrl}`);
          
          const rpcResponse = await this.axiosInstance.post(
            rpcUrl,
            {
              type: 'trade',
              ...orderRequest
            },
            { headers: this.getHeaders() }
          );
          
          return {
            success: true,
            data: {
              orderId: rpcResponse.data.orderId,
              positionId: rpcResponse.data.positionId,
              message: `${actionType} order placed via RPC`
            }
          };
        } catch (rpcError: any) {
          console.error('RPC endpoint also failed:', rpcError.response?.data);
          return {
            success: false,
            error: 'Both REST and RPC trading endpoints unavailable. Please check MetaApi documentation for correct trading method.'
          };
        }
      }
      
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to place order'
      };
    }
  }

  async previewOrder(signal: ComprehensiveSignal): Promise<{
    success: boolean;
    data?: {
      original: {
        entry: number;
        stop: number;
        takeProfit: number;
      };
      adjusted: {
        entry: number;
        stop: number;
        takeProfit: number;
        orderType: string;
      };
      adjustmentReason?: string;
      currentMarketPrice?: number;
    };
    error?: string;
  }> {
    try {
      const { symbol, plan, currentPrice } = signal;
      const isLong = plan.direction === 'long';
      
      // Validate currentPrice is provided
      if (currentPrice === undefined) {
        return {
          success: false,
          error: 'Current price is required but not provided in the signal'
        };
      }
      
      // Convert symbol to MT5 format
      const mt5Symbol = this.convertToMT5Symbol(symbol);
      
      // Get current market price
      let currentMarketPrice = currentPrice;
      try {
        const quoteCheck = await this.checkSymbolQuotes(mt5Symbol);
        if (quoteCheck.success && quoteCheck.quotes?.bid && quoteCheck.quotes?.ask) {
          currentMarketPrice = (quoteCheck.quotes.bid + quoteCheck.quotes.ask) / 2;
        }
      } catch (error) {
        console.log('[MetaApi] Using signal price for preview');
      }
      
      // Calculate price adjustments
      const minDistancePercent = 0.007; // 0.7% minimum distance - provides adequate margin for MT5 orders
      const priceDiff = Math.abs((plan.entry - currentMarketPrice) / currentMarketPrice);
      
      let adjustedEntry = plan.entry;
      let orderType: string;
      let adjustmentReason: string | undefined;
      
      if (isLong) {
        if (plan.entry > currentMarketPrice && priceDiff >= minDistancePercent) {
          orderType = 'BUY_STOP';
        } else if (plan.entry < currentMarketPrice && priceDiff >= minDistancePercent) {
          orderType = 'BUY_LIMIT';
        } else {
          orderType = 'BUY_STOP';
          adjustedEntry = currentMarketPrice + (currentMarketPrice * minDistancePercent);
          adjustmentReason = `Entry price too close to market (${(priceDiff * 100).toFixed(2)}%). Adjusted to BUY_STOP above market to catch upward breakout.`;
        }
      } else {
        if (plan.entry < currentMarketPrice && priceDiff >= minDistancePercent) {
          orderType = 'SELL_STOP';
        } else if (plan.entry > currentMarketPrice && priceDiff >= minDistancePercent) {
          orderType = 'SELL_LIMIT';
        } else {
          orderType = 'SELL_STOP';
          adjustedEntry = currentMarketPrice - (currentMarketPrice * minDistancePercent);
          adjustmentReason = `Entry price too close to market (${(priceDiff * 100).toFixed(2)}%). Adjusted to SELL_STOP below market to catch downward breakdown.`;
        }
      }
      
      // Adjust stop loss and take profit if needed
      let adjustedStopLoss = plan.stop;
      let adjustedTakeProfit = plan.targets[0];
      const minStopDistance = adjustedEntry * 0.01; // 1% minimum distance
      
      if (isLong) {
        if (adjustedStopLoss >= adjustedEntry || (adjustedEntry - adjustedStopLoss) < minStopDistance) {
          adjustedStopLoss = adjustedEntry - minStopDistance;
          if (!adjustmentReason) adjustmentReason = 'Stop loss adjusted to maintain minimum distance from entry.';
        }
        if (adjustedTakeProfit <= adjustedEntry || (adjustedTakeProfit - adjustedEntry) < minStopDistance) {
          adjustedTakeProfit = adjustedEntry + minStopDistance;
          if (!adjustmentReason) adjustmentReason = 'Take profit adjusted to maintain minimum distance from entry.';
        }
      } else {
        if (adjustedStopLoss <= adjustedEntry || (adjustedStopLoss - adjustedEntry) < minStopDistance) {
          adjustedStopLoss = adjustedEntry + minStopDistance;
          if (!adjustmentReason) adjustmentReason = 'Stop loss adjusted to maintain minimum distance from entry.';
        }
        if (adjustedTakeProfit >= adjustedEntry || (adjustedEntry - adjustedTakeProfit) < minStopDistance) {
          adjustedTakeProfit = adjustedEntry - minStopDistance;
          if (!adjustmentReason) adjustmentReason = 'Take profit adjusted to maintain minimum distance from entry.';
        }
      }
      
      // Round prices
      const roundedEntry = Math.round(adjustedEntry * 100) / 100;
      const roundedStopLoss = Math.round(adjustedStopLoss * 100) / 100;
      const roundedTakeProfit = Math.round(adjustedTakeProfit * 100) / 100;
      
      return {
        success: true,
        data: {
          original: {
            entry: plan.entry,
            stop: plan.stop,
            takeProfit: plan.targets[0]
          },
          adjusted: {
            entry: roundedEntry,
            stop: roundedStopLoss,
            takeProfit: roundedTakeProfit,
            orderType: orderType
          },
          adjustmentReason,
          currentMarketPrice: Math.round(currentMarketPrice * 100) / 100
        }
      };
    } catch (error: any) {
      console.error('[MetaApi] Error previewing order:', error);
      return {
        success: false,
        error: error.message || 'Failed to preview order'
      };
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      
      const [accountResponse, positionsResponse, ordersResponse] = await Promise.all([
        this.axiosInstance.get(
          `${londonClientUrl}/users/current/accounts/${this.accountId}/account-information`,
          { headers: this.getHeaders() }
        ),
        this.axiosInstance.get(
          `${londonClientUrl}/users/current/accounts/${this.accountId}/positions`,
          { headers: this.getHeaders() }
        ),
        this.axiosInstance.get(
          `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
          { headers: this.getHeaders() }
        )
      ]);
      
      return {
        success: true,
        data: {
          account: accountResponse.data,
          openPositions: positionsResponse.data.length,
          pendingOrders: ordersResponse.data.length,
          positions: positionsResponse.data.map((p: any) => ({
            symbol: p.symbol,
            type: p.type,
            volume: p.volume,
            openPrice: p.openPrice,
            currentPrice: p.currentPrice,
            profit: p.profit,
            swap: p.swap
          }))
        }
      };
    } catch (error: any) {
      console.error('Error getting account info:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to get account info'
      };
    }
  }

  async validateSignal(signal: ComprehensiveSignal): Promise<{ valid: boolean; issues?: string[] }> {
    const issues: string[] = [];
    
    if (!signal.symbol) issues.push('Missing symbol');
    if (!signal.plan) issues.push('Missing trade plan');
    if (!signal.plan.entry) issues.push('Missing entry price');
    if (!signal.plan.stop) issues.push('Missing stop loss');
    if (!signal.plan.targets?.length) issues.push('Missing profit targets');
    
    return {
      valid: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined
    };
  }

  async getAvailableSymbols(): Promise<any> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/symbols`,
        { headers: this.getHeaders() }
      );
      
      return {
        success: true,
        symbols: response.data
      };
    } catch (error: any) {
      console.error('Error getting symbols:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to get symbols'
      };
    }
  }

  async checkSymbolQuotes(symbol: string): Promise<any> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/symbols/${symbol}/current-price`,
        { headers: this.getHeaders() }
      );
      
      console.log(`[MetaApi] Current price for ${symbol}:`, response.data);
      
      return {
        success: true,
        quotes: response.data
      };
    } catch (error: any) {
      console.error(`Error getting quotes for ${symbol}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'No quotes available'
      };
    }
  }

  async closeAllPositions(): Promise<{ success: boolean; results: any[]; error?: string }> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      
      // Get all open positions
      const positionsResponse = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/positions`,
        { headers: this.getHeaders() }
      );

      const positions = positionsResponse.data;
      if (!positions || positions.length === 0) {
        console.log('[MetaApi] No open positions to close');
        return { success: true, results: [] };
      }

      console.log(`[MetaApi] Found ${positions.length} open positions to close`);
      const closeResults = [];

      for (const position of positions) {
        try {
          const closeRequest = {
            actionType: 'POSITION_CLOSE_ID',
            positionId: position.id,
            comment: 'End of day auto-close'
          };

          console.log(`[MetaApi] Closing position ${position.id} for ${position.symbol}`);
          
          const closeResponse = await this.axiosInstance.post(
            `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
            closeRequest,
            { headers: this.getHeaders() }
          );

          closeResults.push({
            positionId: position.id,
            symbol: position.symbol,
            success: true,
            result: closeResponse.data
          });

          console.log(`[MetaApi] Successfully closed position ${position.id}`);
        } catch (error: any) {
          console.error(`[MetaApi] Failed to close position ${position.id}:`, error.response?.data);
          closeResults.push({
            positionId: position.id,
            symbol: position.symbol,
            success: false,
            error: error.response?.data?.error || error.message
          });
        }
      }

      return { success: true, results: closeResults };
    } catch (error: any) {
      console.error('[MetaApi] Error closing all positions:', error.response?.data || error.message);
      return {
        success: false,
        results: [],
        error: error.response?.data?.error || error.message || 'Failed to close positions'
      };
    }
  }

  async cancelAllPendingOrders(): Promise<{ success: boolean; results: any[]; error?: string }> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      
      // Get all pending orders
      const ordersResponse = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
        { headers: this.getHeaders() }
      );

      const orders = ordersResponse.data;
      if (!orders || orders.length === 0) {
        console.log('[MetaApi] No pending orders to cancel');
        return { success: true, results: [] };
      }

      console.log(`[MetaApi] Found ${orders.length} pending orders to cancel`);
      const cancelResults = [];

      for (const order of orders) {
        try {
          const cancelRequest = {
            actionType: 'ORDER_CANCEL',
            orderId: order.id
          };

          console.log(`[MetaApi] Canceling order ${order.id} for ${order.symbol}`);
          
          const cancelResponse = await this.axiosInstance.post(
            `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
            cancelRequest,
            { headers: this.getHeaders() }
          );

          cancelResults.push({
            orderId: order.id,
            symbol: order.symbol,
            success: true,
            result: cancelResponse.data
          });

          console.log(`[MetaApi] Successfully canceled order ${order.id}`);
        } catch (error: any) {
          console.error(`[MetaApi] Failed to cancel order ${order.id}:`, error.response?.data);
          cancelResults.push({
            orderId: order.id,
            symbol: order.symbol,
            success: false,
            error: error.response?.data?.error || error.message
          });
        }
      }

      return { success: true, results: cancelResults };
    } catch (error: any) {
      console.error('[MetaApi] Error canceling all orders:', error.response?.data || error.message);
      return {
        success: false,
        results: [],
        error: error.response?.data?.error || error.message || 'Failed to cancel orders'
      };
    }
  }

  async endOfDayCleanup(): Promise<{ success: boolean; closedPositions: number; canceledOrders: number; errors: string[] }> {
    console.log('[MetaApi] Starting end-of-day cleanup...');
    
    const errors: string[] = [];
    let closedPositions = 0;
    let canceledOrders = 0;

    try {
      // Close all positions first
      const closeResult = await this.closeAllPositions();
      if (closeResult.success) {
        closedPositions = closeResult.results.filter(r => r.success).length;
        const closeErrors = closeResult.results.filter(r => !r.success);
        closeErrors.forEach(e => errors.push(`Position ${e.positionId}: ${e.error}`));
      } else {
        errors.push(`Failed to close positions: ${closeResult.error}`);
      }

      // Cancel all pending orders
      const cancelResult = await this.cancelAllPendingOrders();
      if (cancelResult.success) {
        canceledOrders = cancelResult.results.filter(r => r.success).length;
        const cancelErrors = cancelResult.results.filter(r => !r.success);
        cancelErrors.forEach(e => errors.push(`Order ${e.orderId}: ${e.error}`));
      } else {
        errors.push(`Failed to cancel orders: ${cancelResult.error}`);
      }

      console.log(`[MetaApi] End-of-day cleanup completed: ${closedPositions} positions closed, ${canceledOrders} orders canceled, ${errors.length} errors`);
      
      return {
        success: errors.length === 0,
        closedPositions,
        canceledOrders,
        errors
      };
    } catch (error: any) {
      console.error('[MetaApi] End-of-day cleanup failed:', error);
      return {
        success: false,
        closedPositions,
        canceledOrders,
        errors: [`Cleanup failed: ${error.message}`]
      };
    }
  }

  async cancelOldOrders(): Promise<{ success: boolean; canceledCount: number; errors: string[] }> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      
      // Cancel orders older than 15 minutes - trading conditions change rapidly
      // Get all pending orders
      const ordersResponse = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
        { headers: this.getHeaders() }
      );

      const orders = ordersResponse.data;
      console.log(`[MetaApi] Found ${orders?.length || 0} pending orders to check`);
      
      if (!orders || orders.length === 0) {
        console.log('[MetaApi] No pending orders found - nothing to cancel');
        return { success: true, canceledCount: 0, errors: [] };
      }

      const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
      console.log(`[MetaApi] Will cancel orders placed before: ${new Date(fifteenMinutesAgo).toISOString()}`);
      const errors: string[] = [];
      let canceledCount = 0;

      for (const order of orders) {
        try {
          // Debug: Log the order structure to understand the time fields
          console.log(`[MetaApi] Checking order ${order.id}:`, {
            id: order.id,
            symbol: order.symbol,
            time: order.time,
            openTime: order.openTime,
            createdAt: order.createdAt,
            timestamp: order.timestamp,
            allKeys: Object.keys(order)
          });
          
          // Try multiple possible time fields
          let orderTime = null;
          const timeFields = ['time', 'openTime', 'createdAt', 'timestamp', 'createTime'];
          
          for (const field of timeFields) {
            if (order[field]) {
              orderTime = new Date(order[field]).getTime();
              if (!isNaN(orderTime)) {
                console.log(`[MetaApi] Using ${field} for order time: ${new Date(orderTime).toISOString()}`);
                break;
              }
            }
          }
          
          if (!orderTime || isNaN(orderTime)) {
            // If no valid time found, assume it's a new order (don't cancel)
            console.log(`[MetaApi] No valid time found for order ${order.id}, skipping cancellation`);
            continue;
          }
          
          const ageInMinutes = (Date.now() - orderTime) / (60 * 1000);
          console.log(`[MetaApi] Order ${order.id} age: ${ageInMinutes.toFixed(1)} minutes`);
          
          if (orderTime < fifteenMinutesAgo) {
            const cancelRequest = {
              actionType: 'ORDER_CANCEL',
              orderId: order.id
            };

            console.log(`[MetaApi] Canceling old order ${order.id} for ${order.symbol} (placed at ${new Date(orderTime).toISOString()}, age: ${ageInMinutes.toFixed(1)} minutes)`);
            
            await this.axiosInstance.post(
              `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
              cancelRequest,
              { headers: this.getHeaders() }
            );

            canceledCount++;
            console.log(`[MetaApi] Successfully canceled old order ${order.id}`);
          } else {
            console.log(`[MetaApi] Order ${order.id} is only ${ageInMinutes.toFixed(1)} minutes old, keeping it`);
          }
        } catch (error: any) {
          const errorMsg = `Failed to cancel order ${order.id}: ${error.response?.data?.error || error.message}`;
          console.error(`[MetaApi] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      if (canceledCount > 0) {
        console.log(`[MetaApi] Canceled ${canceledCount} old orders`);
      }

      return { success: errors.length === 0, canceledCount, errors };
    } catch (error: any) {
      console.error('[MetaApi] Error checking for old orders:', error.response?.data || error.message);
      return {
        success: false,
        canceledCount: 0,
        errors: [`Failed to check orders: ${error.message}`]
      };
    }
  }

  private orderCleanupInterval: NodeJS.Timeout | null = null;

  startOrderCleanup(): void {
    // Clear any existing interval
    if (this.orderCleanupInterval) {
      clearInterval(this.orderCleanupInterval);
    }

    // Run immediately on start
    this.cancelOldOrders().then(result => {
      if (result.canceledCount > 0) {
        console.log(`[MetaApi] Initial cleanup: Canceled ${result.canceledCount} orders older than 15 minutes`);
      }
    });

    // Then run every 5 minutes (more frequent for 15-minute threshold)
    this.orderCleanupInterval = setInterval(async () => {
      const et = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
      const etDate = new Date(et);
      const hour = etDate.getHours();
      const day = etDate.getDay();
      const minutes = etDate.getMinutes();

      // Only run during market hours (9:30 AM - 4:00 PM ET, Monday-Friday)
      const isMarketHours = day >= 1 && day <= 5 && 
        ((hour === 9 && minutes >= 30) || (hour > 9 && hour < 16));
      
      if (isMarketHours) {
        console.log(`[MetaApi] Running order cleanup at ${et} (canceling orders older than 15 minutes)...`);
        const result = await this.cancelOldOrders();
        if (result.canceledCount > 0 || result.errors.length > 0) {
          console.log(`[MetaApi] Order cleanup complete: ${result.canceledCount} canceled, ${result.errors.length} errors`);
        }
      } else {
        console.log(`[MetaApi] Skipping order cleanup - outside market hours (${et})`);
      }
    }, 5 * 60 * 1000); // Every 5 minutes for tighter control

    console.log('[MetaApi] Order cleanup scheduler started (runs every 5 minutes)');
  }

  stopOrderCleanup(): void {
    if (this.orderCleanupInterval) {
      clearInterval(this.orderCleanupInterval);
      this.orderCleanupInterval = null;
      console.log('[MetaApi] Order cleanup scheduler stopped');
    }
  }

  startEndOfDayScheduler(): void {
    // Calculate time until 3:50 PM ET (10 minutes before market close)
    const scheduleCleanup = () => {
      const now = new Date();
      const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      
      // Set target time to 3:50 PM ET today
      const targetTime = new Date(et);
      targetTime.setHours(15, 50, 0, 0); // 3:50 PM
      
      // If it's already past 3:50 PM today, schedule for tomorrow
      if (et > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      // Skip weekends (Saturday = 6, Sunday = 0)
      while (targetTime.getDay() === 0 || targetTime.getDay() === 6) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      const msUntilCleanup = targetTime.getTime() - et.getTime();
      
      console.log(`[MetaApi] End-of-day cleanup scheduled for ${targetTime.toLocaleString("en-US", {timeZone: "America/New_York"})} ET (in ${Math.round(msUntilCleanup / 1000 / 60)} minutes)`);
      
      setTimeout(async () => {
        console.log('[MetaApi] Executing scheduled end-of-day cleanup (10 minutes before market close)...');
        await this.endOfDayCleanup();
        
        // Schedule next cleanup for tomorrow
        scheduleCleanup();
      }, msUntilCleanup);
    };

    scheduleCleanup();
  }

  // Position monitoring methods for trade tracking
  async getPositions(): Promise<any[]> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/positions`,
        { headers: this.getHeaders() }
      );
      return response.data || [];
    } catch (error: any) {
      console.error('[MetaApi] Error getting positions:', error.response?.data || error.message);
      return [];
    }
  }

  async getOrders(): Promise<any[]> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
        { headers: this.getHeaders() }
      );
      return response.data || [];
    } catch (error: any) {
      console.error('[MetaApi] Error getting orders:', error.response?.data || error.message);
      return [];
    }
  }

  async getClosedPosition(positionId: string): Promise<any | null> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      // Try to get historical data for closed position
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/history-deals`,
        { 
          headers: this.getHeaders(),
          params: {
            positionId: positionId,
            limit: 10
          }
        }
      );
      
      const deals = response.data || [];
      // Find the closing deal (type should be OUT)
      const closingDeal = deals.find((deal: any) => 
        deal.positionId === positionId && 
        (deal.entryType === 'DEAL_ENTRY_OUT' || deal.type === 'DEAL_TYPE_SELL')
      );
      
      if (closingDeal) {
        return {
          closePrice: closingDeal.price,
          closeTime: closingDeal.time,
          commission: closingDeal.commission || 0,
          profit: closingDeal.profit || 0
        };
      }
      
      return null;
    } catch (error: any) {
      console.error('[MetaApi] Error getting closed position:', error.response?.data || error.message);
      return null;
    }
  }
}

export const metaApiHandler = new MetaApiRestHandler();