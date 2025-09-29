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

export function startMockDataFeed(onCandle: (candle: Candle) => void) {
  if (intervalId) return;
  
  console.log('Starting mock data feed for testing...');
  
  intervalId = setInterval(() => {
    mockStocks.forEach(stock => {
      const candle = generateCandle(stock);
      onCandle(candle);
      
      // Update stock price for next candle
      updateStockPrice(stock);
    });
  }, 5000); // Every 5 seconds for faster testing
}

export function stopMockDataFeed() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Mock data feed stopped');
  }
}

function generateCandle(stock: MockStock): Candle {
  const now = new Date();
  const open = stock.currentPrice;
  
  // Generate some movement based on trend and volatility
  let trendBias = 0;
  if (stock.trend === 'up') trendBias = 0.002;
  else if (stock.trend === 'down') trendBias = -0.002;
  
  const movement = (Math.random() - 0.5) * stock.volatility + trendBias;
  const close = open * (1 + movement);
  
  // Generate high/low with some realistic spread
  const spread = Math.abs(close - open);
  const high = Math.max(open, close) + (Math.random() * spread * 0.5);
  const low = Math.min(open, close) - (Math.random() * spread * 0.5);
  
  return {
    symbol: stock.symbol,
    timeframe: '1m',
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    close: Number(close.toFixed(2)),
    volume: Math.floor(Math.random() * 1000000) + 100000,
    start: new Date(now.getTime() - 60000).toISOString(),
    end: now.toISOString()
  };
}

function updateStockPrice(stock: MockStock) {
  // Sometimes reverse trend to create engulfing opportunities
  if (Math.random() < 0.1) {
    stock.trend = stock.trend === 'up' ? 'down' : stock.trend === 'down' ? 'up' : 'sideways';
  }
  
  // Update current price for next candle
  const movement = (Math.random() - 0.5) * stock.volatility * 0.5;
  stock.currentPrice = stock.currentPrice * (1 + movement);
}