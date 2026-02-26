import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

export interface TrailingStopConfig {
  // Trailing percentage (e.g., 0.08 for 8%, 0.03 for 3%)
  trailPercent: number;
  // Minimum profit percentage before trailing kicks in (e.g., 0.01 for 1%)
  // This prevents adjusting stop on tiny moves
  minProfitToTrail: number;
}

export interface TrailingStopResult {
  positionsChecked: number;
  stopsAdjusted: number;
  adjustments: Array<{
    symbol: string;
    positionId: string;
    entryPrice: number;
    currentPrice: number;
    oldStop: number;
    newStop: number;
    profitPercent: number;
  }>;
  errors: string[];
}

// Default configs by symbol type
const TRAILING_CONFIGS: Record<string, TrailingStopConfig> = {
  // Gold uses 3% trailing (matches initial stop)
  'GOLD': {
    trailPercent: 0.03,
    minProfitToTrail: 0.01, // Start trailing after 1% profit
  },
  // Default for stocks (CAN SLIM uses 8%)
  'DEFAULT': {
    trailPercent: 0.08,
    minProfitToTrail: 0.02, // Start trailing after 2% profit
  },
};

function getConfigForSymbol(symbol: string): TrailingStopConfig {
  if (symbol === 'GOLD' || symbol.includes('GOLD')) {
    return TRAILING_CONFIGS['GOLD'];
  }
  return TRAILING_CONFIGS['DEFAULT'];
}

export async function updateTrailingStops(): Promise<TrailingStopResult> {
  const result: TrailingStopResult = {
    positionsChecked: 0,
    stopsAdjusted: 0,
    adjustments: [],
    errors: [],
  };

  try {
    const positions = await metaApiHandler.getPositions();
    result.positionsChecked = positions.length;

    if (positions.length === 0) {
      console.log('[TRAILING-STOP] No open positions to check');
      return result;
    }

    console.log(`[TRAILING-STOP] Checking ${positions.length} open positions...`);

    for (const position of positions) {
      try {
        // Only process long positions (BUY)
        if (position.type !== 'POSITION_TYPE_BUY') {
          continue;
        }

        const symbol = position.symbol;
        const positionId = position.id;
        const entryPrice = position.openPrice;
        const currentPrice = position.currentPrice;
        const currentStop = position.stopLoss || 0;
        const currentTakeProfit = position.takeProfit;

        if (!entryPrice || !currentPrice) {
          result.errors.push(`${symbol}: Missing price data`);
          continue;
        }

        const config = getConfigForSymbol(symbol);
        const profitPercent = (currentPrice - entryPrice) / entryPrice;

        // Only trail if we're in profit above minimum threshold
        if (profitPercent < config.minProfitToTrail) {
          continue;
        }

        // Calculate new trailing stop level
        const newStop = Math.round(currentPrice * (1 - config.trailPercent) * 100) / 100;

        // Only adjust if new stop is higher than current stop
        if (newStop <= currentStop) {
          continue;
        }

        // Don't let stop go below entry (safety check)
        if (newStop < entryPrice) {
          continue;
        }

        console.log(`[TRAILING-STOP] ${symbol}: Adjusting stop from $${currentStop.toFixed(2)} to $${newStop.toFixed(2)} (profit: ${(profitPercent * 100).toFixed(2)}%)`);

        const modifyResult = await metaApiHandler.modifyPosition(positionId, newStop, currentTakeProfit);

        if (modifyResult.success) {
          result.stopsAdjusted++;
          result.adjustments.push({
            symbol,
            positionId,
            entryPrice,
            currentPrice,
            oldStop: currentStop,
            newStop,
            profitPercent: profitPercent * 100,
          });
          console.log(`[TRAILING-STOP] ${symbol}: Stop adjusted successfully`);
        } else {
          result.errors.push(`${symbol}: Failed to adjust stop - ${modifyResult.error}`);
          console.error(`[TRAILING-STOP] ${symbol}: Failed to adjust stop - ${modifyResult.error}`);
        }

      } catch (posError: any) {
        result.errors.push(`${position.symbol}: ${posError.message}`);
        console.error(`[TRAILING-STOP] Error processing position:`, posError.message);
      }
    }

    if (result.stopsAdjusted > 0) {
      console.log(`[TRAILING-STOP] Adjusted ${result.stopsAdjusted} stops`);
    } else {
      console.log('[TRAILING-STOP] No stops needed adjustment');
    }

  } catch (error: any) {
    console.error('[TRAILING-STOP] Error updating trailing stops:', error.message);
    result.errors.push(`General error: ${error.message}`);
  }

  return result;
}

// Get current trailing stop status for all positions (for display/debugging)
export async function getTrailingStopStatus(): Promise<Array<{
  symbol: string;
  positionId: string;
  entryPrice: number;
  currentPrice: number;
  currentStop: number;
  potentialNewStop: number;
  profitPercent: number;
  wouldAdjust: boolean;
}>> {
  const status: Array<{
    symbol: string;
    positionId: string;
    entryPrice: number;
    currentPrice: number;
    currentStop: number;
    potentialNewStop: number;
    profitPercent: number;
    wouldAdjust: boolean;
  }> = [];

  try {
    const positions = await metaApiHandler.getPositions();

    for (const position of positions) {
      if (position.type !== 'POSITION_TYPE_BUY') {
        continue;
      }

      const symbol = position.symbol;
      const entryPrice = position.openPrice;
      const currentPrice = position.currentPrice;
      const currentStop = position.stopLoss || 0;

      if (!entryPrice || !currentPrice) {
        continue;
      }

      const config = getConfigForSymbol(symbol);
      const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      const potentialNewStop = Math.round(currentPrice * (1 - config.trailPercent) * 100) / 100;
      const wouldAdjust = profitPercent >= config.minProfitToTrail * 100 &&
                          potentialNewStop > currentStop &&
                          potentialNewStop >= entryPrice;

      status.push({
        symbol,
        positionId: position.id,
        entryPrice,
        currentPrice,
        currentStop,
        potentialNewStop,
        profitPercent,
        wouldAdjust,
      });
    }
  } catch (error: any) {
    console.error('[TRAILING-STOP] Error getting status:', error.message);
  }

  return status;
}
