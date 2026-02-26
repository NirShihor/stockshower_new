import axios from 'axios';
import https from 'https';
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { TradeService } from '../db/services/tradeService.js';
import { Trade } from '../db/models/Trade.js';

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
  private clientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
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

  reinitialize(): void {
    this.token = process.env.METAAPI_TOKEN || '';
    this.accountId = process.env.METAAPI_ACCOUNT_ID || '';
  }

  private getHeaders() {
    return {
      'auth-token': this.token,
      'Content-Type': 'application/json'
    };
  }

  private convertToMT5Symbol(symbol: string): string {
    // Commodities and forex pairs - no suffix needed
    const commodities = ['GOLD', 'XAUUSD', 'SILVER', 'XAGUSD', 'OIL', 'USOIL', 'BRENT'];
    if (commodities.includes(symbol.toUpperCase())) {
      return symbol;
    }

    const nasdaqStocks = [
      'AAPL', 'ABNB', 'ADBE', 'ADI', 'ADP', 'ADSK', 'AFRM', 'AKAM', 'ALGN', 'ALNY',
      'AMAT', 'AMD', 'AMGN', 'AMZN', 'APP', 'ARGX', 'ARM', 'ASML', 'AVGO', 'AXON',
      'BIDU', 'BIIB', 'BILI', 'BKR', 'BMRN', 'BNTX',
      'CDNS', 'CDW', 'CHKP', 'CHRW', 'CHTR', 'CME', 'CMCSA', 'COIN', 'COST', 'CPRT',
      'CRWD', 'CSCO', 'CSGP', 'CSX', 'CTAS', 'CTSH',
      'DASH', 'DDOG', 'DKNG', 'DLTR', 'DOCU', 'DXCM',
      'EA', 'EBAY', 'ENPH', 'EQIX', 'EXAS',
      'FANG', 'FAST', 'FISV', 'FTNT',
      'GEN', 'GFS', 'GILD', 'GOOG', 'GOOGL',
      'HBAN', 'HOLX', 'HON', 'HOOD',
      'IDXX', 'ILMN', 'INCY', 'INTC', 'INTU', 'ISRG',
      'JD',
      'KDP', 'KHC', 'KLAC',
      'LCID', 'LRCX', 'LULU', 'LYFT',
      'MAR', 'MARA', 'MCHP', 'MDLZ', 'MELI', 'META', 'MNST', 'MRNA', 'MRVL', 'MSFT',
      'MSTR', 'MTCH', 'MU',
      'NFLX', 'NTES', 'NTAP', 'NTNX', 'NVAX', 'NVDA', 'NXPI',
      'ODFL', 'OKTA', 'ON', 'ORLY', 'ORCL',
      'PANW', 'PAYX', 'PCAR', 'PDD', 'PEP', 'PLTR', 'PLUG', 'PYPL',
      'QCOM',
      'REGN', 'RIOT', 'RIVN', 'RKLB', 'ROKU', 'ROP', 'ROST',
      'SBUX', 'SEDG', 'SHOP', 'SMCI', 'SNPS', 'SOFI', 'SPLK', 'SSNC', 'STX', 'SWKS',
      'TEAM', 'TER', 'TMUS', 'TSLA', 'TTD', 'TTWO', 'TXN',
      'UAL', 'ULTA',
      'VRSK', 'VRSN', 'VRTX',
      'WDAY', 'WDC',
      'XEL',
      'ZM', 'ZS'
    ];

    const nyseStocks = [
      'JNJ', 'JPM', 'V', 'PG', 'HD', 'MA', 'BAC', 'WMT', 'DIS', 'KO',
      'PFE', 'MRK', 'UNH', 'CVX', 'XOM', 'VZ', 'T', 'MMM', 'CAT', 'BA',
      'IBM', 'GE', 'GM', 'F', 'CRM', 'RTX', 'DHR', 'BSX', 'NKE', 'ABT',
      'TMO', 'WFC', 'GS', 'MS', 'AXP', 'LLY', 'ABBV', 'COP', 'SLB', 'OXY',
      'UNP', 'DE', 'LMT', 'MCD'
    ];
    
    if (nasdaqStocks.includes(symbol)) {
      return `${symbol}.O`;
    } else if (nyseStocks.includes(symbol)) {
      return `${symbol}.N`;
    }
    
    return `${symbol}.N`;
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
      // Use case-insensitive matching since MT5 may return different cases
      const baseSymbol = symbol.replace(/\.(O|N|L)$/i, '').toUpperCase(); // Remove .O, .N, or .L suffix, uppercase
      
      console.log(`[MetaApi] Looking for orders matching base symbol: ${baseSymbol}`);
      console.log(`[MetaApi] Current pending orders:`, orders.map((o: any) => o.symbol));
      
      for (const order of orders) {
        const orderBaseSymbol = order.symbol.replace(/\.(O|N|L)$/i, '').toUpperCase();
        
        console.log(`[MetaApi] Comparing: ${orderBaseSymbol} vs ${baseSymbol}`);
        
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

      // Convert symbol to MT5 format first (needed for spec lookup)
      // Skip conversion if symbol already has a market suffix (.L for UK, .O/.N for US)
      const mt5Symbol = symbol.match(/\.(L|O|N)$/) ? symbol : this.convertToMT5Symbol(symbol);

      // Position sizing based on target margin from signal config
      const targetMarginGBP = (signal as any).targetMarginGBP || 25; // £25 default margin per trade
      const gbpToUsd = 1.30; // Approximate exchange rate
      const targetMarginUSD = targetMarginGBP * gbpToUsd;
      let volume = 0.01; // Default fallback

      // Get contract size early - needed for commodities like GOLD (1 lot = 100 oz)
      let contractSize = 1; // Default for stocks (1 lot = 1 share)
      try {
        const earlySpec = await this.getSymbolSpecification(mt5Symbol);
        if (earlySpec.success && earlySpec.contractSize) {
          contractSize = earlySpec.contractSize;
        }
      } catch (e) {
        // Use default contract size of 1
      }

      try {
        // Calculate volume based on target margin
        const entryPrice = plan.entry;

        // Use actual account leverage (1:30) for margin calculations
        const estimatedMarginPercent = 0.033; // 3.33% margin = 1:30 leverage

        // Calculate notional value that margin can control with 1:30 leverage
        const notionalValueUSD = targetMarginUSD / estimatedMarginPercent;

        // Calculate lots needed, accounting for contract size
        // For stocks: 1 lot = 1 share, contractSize = 1
        // For gold: 1 lot = 100 oz, contractSize = 100
        const lotsNeeded = notionalValueUSD / (entryPrice * contractSize);

        // Round to 2 decimal places for MT5 (0.01 increments)
        volume = Math.round(lotsNeeded * 100) / 100;

        // Apply safety limits
        volume = Math.max(volume, 0.01); // Minimum 0.01 lots
        volume = Math.min(volume, 2.0);   // Maximum 2 lots

        // Calculate actual values for logging
        const actualNotionalUSD = volume * entryPrice * contractSize;
        const actualMarginUSD = actualNotionalUSD * estimatedMarginPercent;
        const actualMarginGBP = actualMarginUSD / gbpToUsd;
        const actualNotionalGBP = actualNotionalUSD / gbpToUsd;

        console.log(`[MetaApi] Margin-based position sizing:`, {
          targetMarginGBP: `£${targetMarginGBP}`,
          targetMarginUSD: `$${targetMarginUSD.toFixed(2)}`,
          estimatedLeverage: `1:${(1/estimatedMarginPercent).toFixed(0)}`,
          price: `$${entryPrice}`,
          contractSize: contractSize,
          calculatedLots: lotsNeeded.toFixed(4),
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
      
      // Check if we can get quotes for this symbol first and get accurate current price
      let currentMarketPrice = currentPrice;
      try {
        const quoteCheck = await this.checkSymbolQuotes(mt5Symbol);
        if (!quoteCheck.success) {
          const errorMsg = `No quotes available for ${mt5Symbol}. ${quoteCheck.error}`;
          await TradeService.saveFailedOrder(
            signal,
            mt5Symbol,
            'QUOTE_CHECK_FAILED',
            volume,
            errorMsg,
            signal.pattern?.name?.includes('Gap') ? 'gap' : 'pattern'
          );
          return {
            success: false,
            error: errorMsg
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

      // Get symbol specification to validate and adjust volume
      try {
        const symbolSpec = await this.getSymbolSpecification(mt5Symbol);
        if (symbolSpec.success && symbolSpec.minVolume && symbolSpec.volumeStep) {
          const originalVolume = volume;

          // Ensure volume meets minimum
          if (volume < symbolSpec.minVolume) {
            volume = symbolSpec.minVolume;
            console.log(`[MetaApi] Volume ${originalVolume} below minimum ${symbolSpec.minVolume}, adjusted to ${volume}`);
          }

          // Ensure volume doesn't exceed maximum
          if (symbolSpec.maxVolume && volume > symbolSpec.maxVolume) {
            volume = symbolSpec.maxVolume;
            console.log(`[MetaApi] Volume ${originalVolume} above maximum ${symbolSpec.maxVolume}, adjusted to ${volume}`);
          }

          // Round to valid step size
          const step = symbolSpec.volumeStep;
          const roundedVolume = Math.round(volume / step) * step;
          // Ensure we don't round down below minimum
          volume = Math.max(roundedVolume, symbolSpec.minVolume);
          // Round to avoid floating point issues
          volume = Math.round(volume * 100) / 100;

          if (volume !== originalVolume) {
            console.log(`[MetaApi] Volume adjusted from ${originalVolume} to ${volume} (min: ${symbolSpec.minVolume}, step: ${step})`);
          }
        } else {
          // If we couldn't get spec, use conservative minimum
          console.log(`[MetaApi] Could not get symbol spec, using conservative minimum volume of 1`);
          volume = Math.max(volume, 1);
        }
      } catch (specError) {
        console.log('[MetaApi] Symbol spec check failed, proceeding with calculated volume');
      }

      // Determine order type and adjust entry price if needed
      const minDistancePercent = 0.002; // 0.2% minimum distance - reduced for better fills
      const priceDiff = Math.abs((plan.entry - currentMarketPrice) / currentMarketPrice);
      
      let adjustedEntry = plan.entry;
      
      const useMarketOrder = signal.score >= 80;
      
      console.log(`[MetaApi] Price analysis:`, {
        originalEntry: plan.entry,
        signalCurrentPrice: currentPrice,
        marketCurrentPrice: currentMarketPrice,
        priceDiffPercent: (priceDiff * 100).toFixed(2) + '%',
        minRequiredPercent: (minDistancePercent * 100).toFixed(1) + '%',
        willNeedAdjustment: priceDiff < minDistancePercent,
        signalScore: signal.score,
        useMarketOrder: useMarketOrder
      });
      
      if (useMarketOrder) {
        if (isLong) {
          actionType = 'ORDER_TYPE_BUY';
          adjustedEntry = currentMarketPrice;
          console.log(`[MetaApi] HIGH SCORE (${signal.score}) - Using MARKET BUY at ${currentMarketPrice}`);
        } else {
          actionType = 'ORDER_TYPE_SELL';
          adjustedEntry = currentMarketPrice;
          console.log(`[MetaApi] HIGH SCORE (${signal.score}) - Using MARKET SELL at ${currentMarketPrice}`);
        }
      } else if (isLong) {
        // CAN SLIM: Always use BUY_STOP for breakout entries (O'Neil method)
        const isCanSlimSignal = signal.pattern?.name?.includes('CAN SLIM');

        if (isCanSlimSignal) {
          // CAN SLIM breakout strategy - always use BUY_STOP above current price
          actionType = 'ORDER_TYPE_BUY_STOP';
          if (plan.entry <= currentMarketPrice) {
            // Entry is at or below market - adjust to above market for breakout
            adjustedEntry = currentMarketPrice + (currentMarketPrice * minDistancePercent);
            console.log(`[MetaApi] CAN SLIM BUY_STOP: Entry ${plan.entry} <= Current ${currentMarketPrice}, adjusted to ${adjustedEntry.toFixed(2)} (breakout entry above market)`);
          } else {
            console.log(`[MetaApi] CAN SLIM BUY_STOP: Entry ${plan.entry} > Current ${currentMarketPrice} (breakout entry)`);
          }
        } else if (plan.entry > currentMarketPrice && priceDiff >= minDistancePercent) {
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

      // For gold/commodities converted to market order, recalculate stop based on actual entry
      // This prevents the stop from being too tight when entry changes from breakout level to market price
      const isGoldTrade = symbol.toUpperCase() === 'GOLD' || symbol.toUpperCase().includes('GOLD');
      if (isGoldTrade && useMarketOrder) {
        const goldStopPercent = 0.03; // 3% stop for gold
        const originalStop = adjustedStopLoss;
        if (isLong) {
          adjustedStopLoss = adjustedEntry * (1 - goldStopPercent);
        } else {
          adjustedStopLoss = adjustedEntry * (1 + goldStopPercent);
        }
        // Also adjust take profit to maintain R:R ratio
        const riskAmount = Math.abs(adjustedEntry - adjustedStopLoss);
        const targetMultiple = 2; // 2:1 R:R for gold
        if (isLong) {
          adjustedTakeProfit = adjustedEntry + (riskAmount * targetMultiple);
        } else {
          adjustedTakeProfit = adjustedEntry - (riskAmount * targetMultiple);
        }
        console.log(`[MetaApi] GOLD market order - recalculated stops based on actual entry:`);
        console.log(`   Original SL: $${originalStop.toFixed(2)} -> New SL: $${adjustedStopLoss.toFixed(2)} (${(goldStopPercent * 100)}% from entry)`);
        console.log(`   New TP: $${adjustedTakeProfit.toFixed(2)} (${targetMultiple}:1 R:R)`);
      }

      const isSwingTrade = (signal as any).tradeType === 'swing';
      const isGapAndGo = signal.pattern?.name?.includes('Gap') || false;
      
      console.log(`[MetaApi] Order validation:
        Direction: ${plan.direction} (${actionType})
        Trade Type: ${isSwingTrade ? 'SWING' : 'DAY'}
        Is Gap and Go: ${isGapAndGo}
        Current Price: ${currentMarketPrice}
        Original Entry: ${plan.entry} -> Adjusted Entry: ${adjustedEntry}
        Original Stop: ${plan.stop}
        Original TP: ${plan.targets[0]}
      `);
      
      if (isSwingTrade || isGapAndGo) {
        console.log(`[MetaApi] ${isGapAndGo ? 'GAP AND GO' : 'SWING TRADE'} - Using provided stops without ATR-based adjustments`);
        
        if (isLong) {
          if (adjustedStopLoss >= adjustedEntry) {
            const swingStopDistance = adjustedEntry * 0.03;
            adjustedStopLoss = adjustedEntry - swingStopDistance;
            console.warn(`[MetaApi] Fixed invalid SL for swing long: ${adjustedStopLoss}`);
          }
          if (adjustedTakeProfit <= adjustedEntry) {
            const swingTargetDistance = adjustedEntry * 0.05;
            adjustedTakeProfit = adjustedEntry + swingTargetDistance;
            console.warn(`[MetaApi] Fixed invalid TP for swing long: ${adjustedTakeProfit}`);
          }
        } else {
          if (adjustedStopLoss <= adjustedEntry) {
            const swingStopDistance = adjustedEntry * 0.03;
            adjustedStopLoss = adjustedEntry + swingStopDistance;
            console.warn(`[MetaApi] Fixed invalid SL for swing short: ${adjustedStopLoss}`);
          }
          if (adjustedTakeProfit >= adjustedEntry) {
            const swingTargetDistance = adjustedEntry * 0.05;
            adjustedTakeProfit = adjustedEntry - swingTargetDistance;
            console.warn(`[MetaApi] Fixed invalid TP for swing short: ${adjustedTakeProfit}`);
          }
        }
      } else {
        // DAY TRADING LOGIC - use ATR-based stops with tighter parameters
        const atr = signal.context?.atr || 0;
        const atrBasedStop = atr * 3;
        const fallbackStop = adjustedEntry * 0.005;
        const minStopDistance = atrBasedStop > 0 ? Math.max(atrBasedStop, fallbackStop) : fallbackStop;
        
        console.log(`[MetaApi] Stop calculation: ATR=${atr.toFixed(4)}, 3xATR=${atrBasedStop.toFixed(4)}, minStop=${minStopDistance.toFixed(4)} (${((minStopDistance/adjustedEntry)*100).toFixed(2)}%)`)
        
        const originalRisk = Math.abs(plan.entry - plan.stop);
        const originalReward = Math.abs(plan.targets[0] - plan.entry);
        const originalRRRatio = originalRisk > 0 ? originalReward / originalRisk : 1.5;
        
        if (isLong) {
          if (adjustedStopLoss >= adjustedEntry) {
            adjustedStopLoss = adjustedEntry - minStopDistance;
            console.warn(`[MetaApi] Adjusted SL for long: ${adjustedStopLoss} (was ${plan.stop}) - SL was above entry`);
          } else if ((adjustedEntry - adjustedStopLoss) < minStopDistance) {
            adjustedStopLoss = adjustedEntry - minStopDistance;
            console.warn(`[MetaApi] Increased SL distance for long: ${adjustedStopLoss} (was ${plan.stop}) to meet minimum ATR-based distance`);
          }
          
          const currentTargetDistance = adjustedTakeProfit - adjustedEntry;
          if (currentTargetDistance < (adjustedEntry * 0.005)) {
             adjustedTakeProfit = adjustedEntry + (minStopDistance * 1.2);
             console.log(`[MetaApi] Adjusted TP for long (was too close): ${adjustedTakeProfit}`);
          }
          
          const tpPercent = (adjustedTakeProfit - adjustedEntry) / adjustedEntry;
          if (tpPercent > 0.03) {
             adjustedTakeProfit = adjustedEntry * 1.0122;
             console.log(`[MetaApi] Capping extreme long TP (${(tpPercent*100).toFixed(2)}%) to historical optimal 1.22%`);
          }
        } else {
          if (adjustedStopLoss <= adjustedEntry) {
            adjustedStopLoss = adjustedEntry + minStopDistance;
            console.warn(`[MetaApi] Adjusted SL for short: ${adjustedStopLoss} (was ${plan.stop}) - SL was below entry`);
          } else if ((adjustedStopLoss - adjustedEntry) < minStopDistance) {
            adjustedStopLoss = adjustedEntry + minStopDistance;
            console.warn(`[MetaApi] Increased SL distance for short: ${adjustedStopLoss} (was ${plan.stop}) to meet minimum ATR-based distance`);
          }
          
          const currentTargetDistance = adjustedEntry - adjustedTakeProfit;
          if (currentTargetDistance < (adjustedEntry * 0.005)) {
             adjustedTakeProfit = adjustedEntry - (minStopDistance * 1.2);
             console.log(`[MetaApi] Adjusted TP for short (was too close): ${adjustedTakeProfit}`);
          }
          
          const tpPercent = (adjustedEntry - adjustedTakeProfit) / adjustedEntry;
          if (tpPercent > 0.03) {
             adjustedTakeProfit = adjustedEntry * (1 - 0.0122);
             console.log(`[MetaApi] Capping extreme short TP (${(tpPercent*100).toFixed(2)}%) to historical optimal 1.22%`);
          }
        }
      }
      
      // Round prices to proper decimal places (most stocks use 2 decimals)
      const roundedEntry = Math.round(adjustedEntry * 100) / 100;
      const roundedStopLoss = Math.round(adjustedStopLoss * 100) / 100;
      const roundedTakeProfit = Math.round(adjustedTakeProfit * 100) / 100;
      
      const finalRisk = Math.abs(roundedEntry - roundedStopLoss);
      const finalReward = Math.abs(roundedTakeProfit - roundedEntry);
      const finalRRRatio = finalRisk > 0 ? (finalReward / finalRisk).toFixed(2) : 'N/A';
      
      console.log(`[MetaApi] Final order prices:
        Entry: ${roundedEntry}
        Stop Loss: ${roundedStopLoss}
        Take Profit: ${roundedTakeProfit}
        SL Distance: ${finalRisk.toFixed(2)} (${((finalRisk/roundedEntry)*100).toFixed(2)}%)
        TP Distance: ${finalReward.toFixed(2)} (${((finalReward/roundedEntry)*100).toFixed(2)}%)
        R:R Ratio: 1:${finalRRRatio}
      `);
      
      orderRequest = {
        symbol: mt5Symbol,
        actionType: actionType,
        volume: volume,
        stopLoss: roundedStopLoss,
        takeProfit: roundedTakeProfit,
        comment: `Signal: ${signal.pattern.name}`.slice(0, 31)
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
        tradeId = trade._id?.toString() || '';
        console.log(`[MetaApi] Created trade record: ${tradeId}`);
      } catch (tradeError) {
        console.error('[MetaApi] Error creating trade record:', tradeError);
        // Continue with order placement even if trade saving fails
      }

      // Only add openPrice for pending orders (not market orders)
      // Market orders (ORDER_TYPE_BUY/SELL) execute at current market price
      const isMarketOrder = actionType === 'ORDER_TYPE_BUY' || actionType === 'ORDER_TYPE_SELL';
      if (!isMarketOrder && roundedEntry !== null && !isNaN(roundedEntry)) {
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
        const errorMsg = `${response.data.stringCode}: ${response.data.message}`;
        
        // Save failed order for analysis if no trade record exists
        if (!tradeId) {
          await TradeService.saveFailedOrder(
            signal,
            mt5Symbol,
            actionType,
            volume,
            errorMsg,
            signal.pattern?.name?.includes('Gap') ? 'gap' : 'pattern'
          );
        } else {
          await TradeService.updateTradeWithOrderResult(tradeId, { success: false, error: errorMsg });
        }
        
        return {
          success: false,
          error: errorMsg
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

        // Invalidate cache so next broker check gets fresh data
        this.invalidateBrokerCache();

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
      
      // Convert symbol to MT5 format (skip if already converted)
      const mt5Symbol = symbol.match(/\.(L|O|N)$/) ? symbol : this.convertToMT5Symbol(symbol);
      
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
      const minDistancePercent = 0.002; // 0.2% minimum distance - reduced for better fills
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
      const minStopDistance = adjustedEntry * 0.06; // 6% minimum distance - momentum trades need room for volatility
      
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

  async getSymbolSpecification(symbol: string): Promise<{
    success: boolean;
    minVolume?: number;
    maxVolume?: number;
    volumeStep?: number;
    contractSize?: number;
    error?: string;
  }> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/symbols/${symbol}/specification`,
        { headers: this.getHeaders() }
      );

      const spec = response.data;
      console.log(`[MetaApi] Symbol specification for ${symbol}:`, {
        minVolume: spec.minVolume,
        maxVolume: spec.maxVolume,
        volumeStep: spec.volumeStep,
        contractSize: spec.contractSize
      });

      return {
        success: true,
        minVolume: spec.minVolume || 0.01,
        maxVolume: spec.maxVolume || 100,
        volumeStep: spec.volumeStep || 0.01,
        contractSize: spec.contractSize || 1
      };
    } catch (error: any) {
      console.error(`Error getting symbol specification for ${symbol}:`, error.response?.data || error.message);
      // Return conservative defaults if we can't get spec
      return {
        success: false,
        minVolume: 1,  // Assume minimum 1 lot if unknown
        maxVolume: 100,
        volumeStep: 1,
        contractSize: 1,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async getHistoricalCandles(symbol: string, timeframe: string = '1d', limit: number = 100): Promise<any> {
    try {
      const marketDataUrl = 'https://mt-market-data-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${marketDataUrl}/users/current/accounts/${this.accountId}/historical-market-data/symbols/${symbol}/timeframes/${timeframe}/candles?limit=${limit}`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        candles: response.data
      };
    } catch (error: any) {
      console.error(`Error getting historical candles for ${symbol}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to get historical candles'
      };
    }
  }

  async closeAllPositions(): Promise<{ success: boolean; results: any[]; error?: string }> {
    // ============================================================
    // DISABLED - CAN SLIM positions should NEVER be auto-closed
    // Positions will only close when they hit SL or TP
    // ============================================================
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('[MetaApi] WARNING: closeAllPositions() was called but is DISABLED');
    console.log('[MetaApi] CAN SLIM mode - positions only close via SL/TP');
    console.log('[MetaApi] Caller stack:', new Error().stack);
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    return { success: true, results: [], error: 'DISABLED - CAN SLIM mode active' };
  }

  async cancelAllPendingOrders(): Promise<{ success: boolean; results: any[]; error?: string }> {
    // ============================================================
    // DISABLED - CAN SLIM orders should only be cancelled after 48h
    // Use cancelExpiredCanslimOrders() for 48-hour expiry
    // ============================================================
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('[MetaApi] WARNING: cancelAllPendingOrders() was called but is DISABLED');
    console.log('[MetaApi] CAN SLIM mode - only 48h expiry cancels orders');
    console.log('[MetaApi] Caller stack:', new Error().stack);
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    return { success: true, results: [], error: 'DISABLED - CAN SLIM mode active' };
  }

  async endOfDayCleanup(): Promise<{ success: boolean; closedPositions: number; canceledOrders: number; errors: string[] }> {
    // ============================================================
    // DISABLED - No EOD cleanup for CAN SLIM
    // Positions close via SL/TP, orders expire after 48h
    // ============================================================
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('[MetaApi] WARNING: endOfDayCleanup() was called but is DISABLED');
    console.log('[MetaApi] CAN SLIM mode - no EOD cleanup');
    console.log('[MetaApi] Caller stack:', new Error().stack);
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    return { success: true, closedPositions: 0, canceledOrders: 0, errors: ['DISABLED - CAN SLIM mode active'] };
  }

  async cancelOldOrders(): Promise<{ success: boolean; canceledCount: number; errors: string[] }> {
    // ============================================================
    // DISABLED - CAN SLIM orders only expire after 48h via cancelExpiredCanslimOrders()
    // ============================================================
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('[MetaApi] WARNING: cancelOldOrders() was called but is DISABLED');
    console.log('[MetaApi] CAN SLIM mode - use cancelExpiredCanslimOrders() for 48h expiry');
    console.log('[MetaApi] Caller stack:', new Error().stack);
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    return { success: true, canceledCount: 0, errors: ['DISABLED - CAN SLIM mode active'] };
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

  // CAN SLIM order expiry - runs once at EOD (21:00 UK time)
  // Cancels unfilled CAN SLIM orders older than 48 hours
  // Does NOT touch positions or any other orders
  private canslimExpiryTimeout: NodeJS.Timeout | null = null;

  startCanslimOrderExpiry(): void {
    const scheduleNextCheck = () => {
      // Schedule for 21:00 UK time (after US market close)
      const msUntilCheck = this.msUntilUKTime(21, 0);
      const hoursUntil = Math.floor(msUntilCheck / 1000 / 60 / 60);
      const minutesUntil = Math.floor((msUntilCheck / 1000 / 60) % 60);

      console.log(`[MetaApi] CAN SLIM order expiry scheduled in ${hoursUntil}h ${minutesUntil}m (at 21:00 UK time)`);

      this.canslimExpiryTimeout = setTimeout(async () => {
        console.log('[MetaApi] Running CAN SLIM order expiry check (21:00 UK)...');
        await this.cancelExpiredCanslimOrders();
        // Schedule next check for tomorrow
        scheduleNextCheck();
      }, msUntilCheck);
    };

    scheduleNextCheck();
  }

  private async cancelExpiredCanslimOrders(): Promise<void> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';

      const ordersResponse = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
        { headers: this.getHeaders() }
      );

      const orders = ordersResponse.data;
      if (!orders || orders.length === 0) {
        console.log('[MetaApi] No pending orders found');
        return;
      }

      const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
      let cancelledCount = 0;

      for (const order of orders) {
        // ONLY process CAN SLIM orders
        const isCanSlim = order.comment && order.comment.includes('CAN SLIM');
        if (!isCanSlim) continue;

        // Check order age
        let orderTime = null;
        const timeFields = ['time', 'openTime', 'createdAt', 'timestamp', 'createTime'];
        for (const field of timeFields) {
          if (order[field]) {
            orderTime = new Date(order[field]).getTime();
            if (!isNaN(orderTime)) break;
          }
        }

        if (orderTime && orderTime < fortyEightHoursAgo) {
          const ageInHours = (Date.now() - orderTime) / (60 * 60 * 1000);
          console.log(`[MetaApi] CAN SLIM order ${order.id} (${order.symbol}) expired after ${ageInHours.toFixed(1)} hours - cancelling`);

          try {
            await this.axiosInstance.post(
              `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
              { actionType: 'ORDER_CANCEL', orderId: order.id },
              { headers: this.getHeaders() }
            );
            console.log(`[MetaApi] Cancelled expired CAN SLIM order ${order.id}`);
            cancelledCount++;
          } catch (cancelError: any) {
            console.error(`[MetaApi] Failed to cancel order ${order.id}:`, cancelError.message);
          }
        } else {
          const ageInHours = orderTime ? (Date.now() - orderTime) / (60 * 60 * 1000) : 0;
          console.log(`[MetaApi] CAN SLIM order ${order.id} (${order.symbol}) is ${ageInHours.toFixed(1)} hours old - keeping`);
        }
      }

      console.log(`[MetaApi] CAN SLIM order expiry complete: ${cancelledCount} orders cancelled`);
    } catch (error: any) {
      console.error('[MetaApi] CAN SLIM expiry check error:', error.message);
    }
  }

  stopCanslimOrderExpiry(): void {
    if (this.canslimExpiryTimeout) {
      clearTimeout(this.canslimExpiryTimeout);
      this.canslimExpiryTimeout = null;
    }
  }

  // Cancel all pending CAN SLIM orders (used when market turns risk-off)
  async cancelAllCanslimOrders(): Promise<{ success: boolean; cancelledCount: number; errors: string[] }> {
    const errors: string[] = [];
    let cancelledCount = 0;

    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';

      const ordersResponse = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
        { headers: this.getHeaders() }
      );

      const orders = ordersResponse.data;
      if (!orders || orders.length === 0) {
        console.log('[MetaApi] No pending orders to cancel');
        return { success: true, cancelledCount: 0, errors: [] };
      }

      for (const order of orders) {
        // ONLY cancel CAN SLIM orders
        const isCanSlim = order.comment && order.comment.includes('CAN SLIM');
        if (!isCanSlim) continue;

        console.log(`[MetaApi] Cancelling CAN SLIM order ${order.id} (${order.symbol}) - market turned risk-off`);

        try {
          await this.axiosInstance.post(
            `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
            { actionType: 'ORDER_CANCEL', orderId: order.id },
            { headers: this.getHeaders() }
          );
          console.log(`[MetaApi] Cancelled CAN SLIM order ${order.id}`);
          cancelledCount++;
        } catch (cancelError: any) {
          const errorMsg = `Failed to cancel order ${order.id}: ${cancelError.message}`;
          console.error(`[MetaApi] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      console.log(`[MetaApi] Risk-off cleanup complete: ${cancelledCount} CAN SLIM orders cancelled`);
      return { success: errors.length === 0, cancelledCount, errors };
    } catch (error: any) {
      console.error('[MetaApi] Error cancelling CAN SLIM orders:', error.message);
      return { success: false, cancelledCount, errors: [error.message] };
    }
  }

  // Close all CAN SLIM positions at market price (used when market enters correction)
  async closeAllCanslimPositions(): Promise<{ success: boolean; closedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let closedCount = 0;

    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';

      const positionsResponse = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/positions`,
        { headers: this.getHeaders() }
      );

      const positions = positionsResponse.data;
      if (!positions || positions.length === 0) {
        console.log('[MetaApi] No open positions to close');
        return { success: true, closedCount: 0, errors: [] };
      }

      for (const position of positions) {
        // ONLY close CAN SLIM positions
        const isCanSlim = position.comment && position.comment.includes('CAN SLIM');
        if (!isCanSlim) continue;

        console.log(`[MetaApi] CLOSING CAN SLIM position ${position.id} (${position.symbol}) - MARKET CORRECTION`);
        console.log(`  Entry: ${position.openPrice}, Current: ${position.currentPrice}, P/L: ${position.profit}`);

        try {
          await this.axiosInstance.post(
            `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
            {
              actionType: 'POSITION_CLOSE_ID',
              positionId: position.id,
              comment: 'CAN SLIM - Market Correction Exit'
            },
            { headers: this.getHeaders() }
          );
          closedCount++;
          console.log(`[MetaApi] Position ${position.id} closed successfully`);
        } catch (closeError: any) {
          const errorMsg = `Failed to close position ${position.id}: ${closeError.message}`;
          console.error(`[MetaApi] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      // Invalidate cache after closing positions
      this.invalidateBrokerCache();

      console.log(`[MetaApi] Market correction protection: ${closedCount} CAN SLIM positions closed`);
      return { success: errors.length === 0, closedCount, errors };
    } catch (error: any) {
      console.error('[MetaApi] Error closing CAN SLIM positions:', error.message);
      return { success: false, closedCount, errors: [error.message] };
    }
  }

  // Helper to get current ET hour and minute
  private getETTime(): { hour: number; minute: number; dayOfWeek: number } {
    // Create a date in ET timezone
    const etString = new Date().toLocaleString("en-US", { 
      timeZone: "America/New_York",
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Parse the ET string to get components
    const [datePart, timePart] = etString.split(', ');
    const [month, day, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    
    // Get day of week in ET
    const etDate = new Date(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${timePart}-05:00`);
    const dayOfWeek = etDate.getUTCDay();
    
    return { hour, minute, dayOfWeek };
  }

  // Helper to calculate milliseconds until specific ET time
  private msUntilETTime(targetHour: number, targetMinute: number): number {
    const now = new Date();
    const { hour: currentETHour, minute: currentETMinute, dayOfWeek } = this.getETTime();
    
    // Calculate target time for today in ET
    let targetDate = new Date(now);
    
    // Adjust for timezone difference
    const currentTotalMinutes = currentETHour * 60 + currentETMinute;
    const targetTotalMinutes = targetHour * 60 + targetMinute;
    let minutesUntilTarget = targetTotalMinutes - currentTotalMinutes;
    
    // If target time has passed today, schedule for tomorrow
    if (minutesUntilTarget <= 0) {
      minutesUntilTarget += 24 * 60; // Add 24 hours
      targetDate.setDate(targetDate.getDate() + 1);
    }
    
    // Skip weekends
    let daysToAdd = 0;
    let checkDay = dayOfWeek;
    if (minutesUntilTarget > 0 && minutesUntilTarget < 24 * 60) {
      // Target is today, check today's day
      if (checkDay === 0 || checkDay === 6) {
        daysToAdd = checkDay === 0 ? 1 : 2; // Sunday->Monday, Saturday->Monday
      }
    } else {
      // Target is tomorrow or later
      checkDay = (checkDay + Math.floor(minutesUntilTarget / (24 * 60))) % 7;
      if (checkDay === 0) daysToAdd = 1; // Sunday->Monday
      else if (checkDay === 6) daysToAdd = 2; // Saturday->Monday
    }
    
    // Calculate final milliseconds
    return (minutesUntilTarget + (daysToAdd * 24 * 60)) * 60 * 1000;
  }

  startEndOfDayScheduler(): void {
    // NYSE closes at 4 PM ET = 21:00 UK time
    // Schedule cleanup for 20:48 UK time (12 minutes before NYSE close)
    const scheduleCleanup = () => {
      const msUntilCleanup = this.msUntilUKTime(20, 48); // 20:48 UK time
      const minutesUntilCleanup = Math.round(msUntilCleanup / 1000 / 60);
      const hoursUntilCleanup = Math.floor(minutesUntilCleanup / 60);
      const remainingMinutes = minutesUntilCleanup % 60;
      
      console.log(`[MetaApi] End-of-day cleanup scheduled in ${hoursUntilCleanup}h ${remainingMinutes}m (at 20:48 UK time)`);
      
      setTimeout(async () => {
        console.log('[MetaApi] Executing scheduled end-of-day cleanup (12 minutes before NYSE close)...');
        await this.endOfDayCleanup();
        
        // Schedule next cleanup for tomorrow
        scheduleCleanup();
      }, msUntilCleanup);
    };

    scheduleCleanup();
  }

  // Helper to calculate milliseconds until specific UK time
  private msUntilUKTime(targetHour: number, targetMinute: number): number {
    const now = new Date();
    
    // Get current UK time
    const ukString = now.toLocaleString("en-GB", { 
      timeZone: "Europe/London",
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const [datePart, timePart] = ukString.split(', ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [currentHour, currentMinute] = timePart.split(':').map(Number);
    
    // Calculate minutes until target
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const targetTotalMinutes = targetHour * 60 + targetMinute;
    let minutesUntilTarget = targetTotalMinutes - currentTotalMinutes;
    
    // If target time has passed today, schedule for tomorrow
    if (minutesUntilTarget <= 0) {
      minutesUntilTarget += 24 * 60; // Add 24 hours
    }
    
    // Get day of week in UK
    const ukDate = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
    let dayOfWeek = ukDate.getDay();
    
    // Adjust day of week if target is tomorrow
    if (minutesUntilTarget >= 24 * 60 - (currentTotalMinutes - targetTotalMinutes)) {
      dayOfWeek = (dayOfWeek + 1) % 7;
    }
    
    // Skip weekends (no trading on Sat/Sun)
    let daysToAdd = 0;
    if (dayOfWeek === 6) daysToAdd = 2; // Saturday -> Monday
    else if (dayOfWeek === 0) daysToAdd = 1; // Sunday -> Monday
    
    return (minutesUntilTarget + (daysToAdd * 24 * 60)) * 60 * 1000;
  }

  // Cache for positions and orders to reduce API calls
  private positionsCache: { data: any[]; timestamp: number } = { data: [], timestamp: 0 };
  private ordersCache: { data: any[]; timestamp: number } = { data: [], timestamp: 0 };
  private readonly BROKER_CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

  // Position monitoring methods for trade tracking
  async getPositions(forceRefresh = false): Promise<any[]> {
    const now = Date.now();

    // Return cached data if fresh enough
    if (!forceRefresh && now - this.positionsCache.timestamp < this.BROKER_CACHE_TTL_MS) {
      return this.positionsCache.data;
    }

    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/positions`,
        { headers: this.getHeaders() }
      );
      const positions = response.data || [];

      // Update cache
      this.positionsCache = { data: positions, timestamp: now };
      return positions;
    } catch (error: any) {
      // On rate limit, return cached data if available
      if (error.response?.data?.error === 'TooManyRequestsError' && this.positionsCache.data.length > 0) {
        console.log('[MetaApi] Rate limited on getPositions, using cached data');
        return this.positionsCache.data;
      }
      console.error('[MetaApi] Error getting positions:', error.response?.data || error.message);
      return this.positionsCache.data.length > 0 ? this.positionsCache.data : [];
    }
  }

  async getOrders(forceRefresh = false): Promise<any[]> {
    const now = Date.now();

    // Return cached data if fresh enough
    if (!forceRefresh && now - this.ordersCache.timestamp < this.BROKER_CACHE_TTL_MS) {
      return this.ordersCache.data;
    }

    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/orders`,
        { headers: this.getHeaders() }
      );
      const orders = response.data || [];

      // Update cache
      this.ordersCache = { data: orders, timestamp: now };
      return orders;
    } catch (error: any) {
      // On rate limit, return cached data if available
      if (error.response?.data?.error === 'TooManyRequestsError' && this.ordersCache.data.length > 0) {
        console.log('[MetaApi] Rate limited on getOrders, using cached data');
        return this.ordersCache.data;
      }
      console.error('[MetaApi] Error getting orders:', error.response?.data || error.message);
      return this.ordersCache.data.length > 0 ? this.ordersCache.data : [];
    }
  }

  // Force refresh the broker cache (use after placing orders)
  invalidateBrokerCache(): void {
    this.positionsCache.timestamp = 0;
    this.ordersCache.timestamp = 0;
  }

  async closePosition(positionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      
      const closeRequest = {
        actionType: 'POSITION_CLOSE_ID',
        positionId: positionId,
        comment: 'System auto-close'
      };

      console.log(`[MetaApi] Closing position ${positionId}`);
      
      const response = await this.axiosInstance.post(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
        closeRequest,
        { headers: this.getHeaders() }
      );

      console.log(`[MetaApi] Close position response:`, response.data);

      // Invalidate cache so next broker check gets fresh data
      this.invalidateBrokerCache();

      return { success: true };
    } catch (error: any) {
      console.error(`[MetaApi] Error closing position ${positionId}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to close position'
      };
    }
  }

  async modifyPosition(positionId: string, stopLoss?: number, takeProfit?: number): Promise<{ success: boolean; error?: string }> {
    try {
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      
      const modifyRequest: any = {
        actionType: 'POSITION_MODIFY',
        positionId: positionId
      };

      if (stopLoss !== undefined) {
        modifyRequest.stopLoss = Math.round(stopLoss * 100) / 100;
      }
      if (takeProfit !== undefined) {
        modifyRequest.takeProfit = Math.round(takeProfit * 100) / 100;
      }

      console.log(`[MetaApi] Modifying position ${positionId}:`, modifyRequest);
      
      const response = await this.axiosInstance.post(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/trade`,
        modifyRequest,
        { headers: this.getHeaders() }
      );

      console.log(`[MetaApi] Modify position response:`, response.data);
      
      if (response.data.stringCode && response.data.stringCode !== 'TRADE_RETCODE_DONE') {
        return {
          success: false,
          error: `${response.data.stringCode}: ${response.data.message}`
        };
      }
      
      return { success: true };
    } catch (error: any) {
      console.error(`[MetaApi] Error modifying position ${positionId}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to modify position'
      };
    }
  }

  private lastHistoryFetch: number = 0;
  private cachedDeals: any[] = [];
  private historyFetchCooldown = 15000; // 15 seconds between history API calls

  async getClosedPosition(positionId: string): Promise<any | null> {
    try {
      const now = Date.now();
      
      // Use cached deals if we fetched recently (avoid rate limiting)
      if (now - this.lastHistoryFetch < this.historyFetchCooldown && this.cachedDeals.length > 0) {
        const closingDeal = this.cachedDeals.find((deal: any) => 
          String(deal.positionId) === String(positionId) && 
          deal.entryType === 'DEAL_ENTRY_OUT'
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
      }
      
      const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const response = await this.axiosInstance.get(
        `${londonClientUrl}/users/current/accounts/${this.accountId}/history-deals/time/${startTime}/${endTime}`,
        { headers: this.getHeaders() }
      );
      
      this.cachedDeals = response.data || [];
      this.lastHistoryFetch = now;
      
      const closingDeal = this.cachedDeals.find((deal: any) => 
        String(deal.positionId) === String(positionId) && 
        deal.entryType === 'DEAL_ENTRY_OUT'
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
      // If rate limited, return null silently (backup closure will handle it)
      if (error.response?.data?.error === 'TooManyRequestsError') {
        return null;
      }
      console.error('[MetaApi] Error getting closed position:', error.response?.data || error.message);
      return null;
    }
  }
}

export const metaApiHandler = new MetaApiRestHandler();