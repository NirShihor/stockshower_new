import { Candle } from '../candlestick/types/index.js';

interface MockStock {
  symbol: string;
  currentPrice: number;
  trend: 'up' | 'down' | 'sideways';
  volatility: number;
}

const mockStocks: MockStock[] = [
  { symbol: 'AAPL', currentPrice: 190.50, trend: 'up', volatility: 0.02 },
  { symbol: 'MSFT', currentPrice: 420.75, trend: 'down', volatility: 0.015 },
  { symbol: 'GOOGL', currentPrice: 142.30, trend: 'sideways', volatility: 0.025 },
  { symbol: 'AMZN', currentPrice: 155.80, trend: 'up', volatility: 0.03 },
  { symbol: 'TSLA', currentPrice: 248.90, trend: 'down', volatility: 0.05 },
];

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false; // Flag to track if mock data should be running
const lastGeneratedTimes = new Map<string, string>(); // Track last generated time per symbol

export function startMockDataFeed(onCandle: (candle: Candle) => void) {
  // Clear any existing interval before starting a new one
  if (intervalId) {
    console.log('Mock data feed already running, stopping existing one first');
    stopMockDataFeed();
  }
  
  console.log('Starting mock data feed for testing...');
  globalOnCandle = onCandle; // Store for use in stopMockDataFeed
  isRunning = true; // Set flag to true
  
  intervalId = setInterval(() => {
    if (!isRunning) return; // Check if we should still be running
    
    mockStocks.forEach(stock => {
      if (!isRunning) return; // Check again for each stock
      
      const currentMinute = new Date();
      currentMinute.setSeconds(0, 0);
      const timeKey = currentMinute.toISOString();
      
      // Skip if we already generated a candle for this symbol at this time
      if (lastGeneratedTimes.get(stock.symbol) === timeKey) {
        return;
      }
      
      const candle = generateCandle(stock);
      onCandle(candle);
      
      // Track that we generated this candle
      lastGeneratedTimes.set(stock.symbol, timeKey);
      
      // Update stock price for next candle
      updateStockPrice(stock);
    });
  }, 5000); // Every 5 seconds for faster testing
}

export function stopMockDataFeed() {
  isRunning = false; // Set flag immediately to stop any running callbacks
  
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Mock data feed stopped');
    
    // Force complete any pending periods by sending a future candle
    const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
    mockStocks.forEach(stock => {
      const futureCandle: Candle = {
        symbol: stock.symbol,
        timeframe: '1m',
        open: stock.currentPrice,
        high: stock.currentPrice,
        low: stock.currentPrice,
        close: stock.currentPrice,
        volume: 0,
        start: futureTime.toISOString(),
        end: new Date(futureTime.getTime() + 60000).toISOString()
      };
      console.log(`Sending future candle to complete pending periods for ${stock.symbol}`);
      globalOnCandle?.(futureCandle);
    });
  }
  
  // Clear tracking data
  lastGeneratedTimes.clear();
  globalOnCandle = null; // Clear callback
}

let globalOnCandle: ((candle: Candle) => void) | null = null;

function generateCandle(stock: MockStock): Candle {
  if (!isRunning) { // Emergency stop check
    throw new Error('Mock data feed has been stopped');
  }
  
  // Use current time rounded to the current minute
  const now = new Date();
  const currentMinute = new Date(now);
  currentMinute.setSeconds(0, 0); // Round to start of minute
  const open = stock.currentPrice;
  
  // Generate some movement based on trend and volatility
  let trendBias = 0;
  if (stock.trend === 'up') trendBias = 0.005; // Increased for more dramatic moves
  else if (stock.trend === 'down') trendBias = -0.005;
  
  // Occasionally create strong pattern-forming candles
  let movement = (Math.random() - 0.5) * stock.volatility + trendBias;
  
  // 30% chance to create a strong pattern candle
  if (Math.random() < 0.3) {
    movement = movement * 5; // Much more dramatic movement for clear patterns
  }
  
  const close = open * (1 + movement);
  
  // Generate high/low with more dramatic spread for better patterns
  const spread = Math.abs(close - open);
  const extraSpread = Math.random() * stock.volatility * stock.currentPrice * 0.3; // Additional spread
  
  let high = Math.max(open, close) + (Math.random() * spread * 0.8) + extraSpread;
  let low = Math.min(open, close) - (Math.random() * spread * 0.8) - extraSpread;
  
  // Occasionally create doji-like candles (close near open)
  if (Math.random() < 0.15) {
    const djiClose = open + (Math.random() - 0.5) * stock.currentPrice * 0.001; // Very small body
    return {
      symbol: stock.symbol,
      timeframe: '1m',
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(djiClose.toFixed(2)),
      volume: Math.floor(Math.random() * 2000000) + 100000, // Higher volume for significant candles
      start: currentMinute.toISOString(),
      end: new Date(currentMinute.getTime() + 60000).toISOString()
    };
  }
  
  return {
    symbol: stock.symbol,
    timeframe: '1m',
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    close: Number(close.toFixed(2)),
    volume: Math.floor(Math.random() * 1500000) + 100000,
    start: currentMinute.toISOString(),
    end: new Date(currentMinute.getTime() + 60000).toISOString()
  };
}

function updateStockPrice(stock: MockStock) {
  if (!isRunning) return; // Check flag before any operations
  
  // More frequent trend reversals to create engulfing opportunities
  if (Math.random() < 0.15) {
    const oldTrend = stock.trend;
    stock.trend = stock.trend === 'up' ? 'down' : stock.trend === 'down' ? 'up' : (Math.random() < 0.5 ? 'up' : 'down');
    if (isRunning) { // Only log if still running
      console.log(`[MOCK] ${stock.symbol} trend changed from ${oldTrend} to ${stock.trend}`);
    }
  }
  
  // Update current price for next candle
  const movement = (Math.random() - 0.5) * stock.volatility * 0.5;
  stock.currentPrice = stock.currentPrice * (1 + movement);
}