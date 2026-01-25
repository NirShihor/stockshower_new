// @ts-nocheck
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';

const mockPatterns = [
  { name: 'Bullish Engulfing', class: 'double' as const, direction: 'bullish' as const },
  { name: 'Bearish Engulfing', class: 'double' as const, direction: 'bearish' as const },
  { name: 'Hammer', class: 'single' as const, direction: 'bullish' as const },
  { name: 'Shooting Star', class: 'single' as const, direction: 'bearish' as const },
  { name: 'Morning Star', class: 'triple' as const, direction: 'bullish' as const },
  { name: 'Evening Star', class: 'triple' as const, direction: 'bearish' as const },
  { name: 'Doji', class: 'single' as const, direction: 'neutral' as const },
];

const mockSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

let mockSignalInterval: NodeJS.Timeout | null = null;
let onSignalCallback: ((signal: ComprehensiveSignal) => void) | null = null;

export function startMockSignalFeed(onSignal: (signal: ComprehensiveSignal) => void) {
  console.log('Starting mock signal feed...');
  onSignalCallback = onSignal;
  
  // Generate a mock signal every 10-15 seconds
  mockSignalInterval = setInterval(() => {
    const signal = generateMockSignal();
    console.log(`🎭 Generated mock signal: ${signal.symbol} ${signal.pattern.name} (Score: ${signal.score})`);
    onSignal(signal);
  }, Math.random() * 5000 + 10000); // Between 10-15 seconds
}

export function stopMockSignalFeed() {
  console.log('Stopping mock signal feed...');
  if (mockSignalInterval) {
    clearInterval(mockSignalInterval);
    mockSignalInterval = null;
  }
  onSignalCallback = null;
}

function generateMockSignal(): ComprehensiveSignal {
  const symbol = mockSymbols[Math.floor(Math.random() * mockSymbols.length)];
  const pattern = mockPatterns[Math.floor(Math.random() * mockPatterns.length)];
  
  // Generate realistic price data
  const basePrice = getBasePriceForSymbol(symbol);
  const variation = 0.02; // 2% variation
  const currentPrice = basePrice * (1 + (Math.random() - 0.5) * variation);
  
  // Generate entry price based on pattern direction
  const isLong = pattern.direction === 'bullish';
  const entry = currentPrice * (1 + (Math.random() - 0.5) * 0.01); // 1% from current
  const stopDistance = basePrice * 0.015; // 1.5% stop distance
  const stop = isLong ? entry - stopDistance : entry + stopDistance;
  const target1 = isLong ? entry + (stopDistance * 2) : entry - (stopDistance * 2);
  const target2 = isLong ? entry + (stopDistance * 4) : entry - (stopDistance * 4);
  
  // Generate high scores (70-95) so they definitely appear
  const score = Math.floor(Math.random() * 25) + 70;
  
  const notes = [
    `${pattern.class.charAt(0).toUpperCase() + pattern.class.slice(1)} candle pattern`,
    'Strong volume confirmation',
    'Clear invalidation level',
    'Trend context supports pattern'
  ];
  
  // Add score-specific notes
  if (score >= 90) {
    notes.push('Exceptional setup quality');
  } else if (score >= 80) {
    notes.push('High probability setup');
  } else {
    notes.push('Good risk/reward ratio');
  }
  
  return {
    id: `mock-${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    symbol,
    timeframe: '5m',
    time: new Date().toISOString(),
    pattern: {
      name: pattern.name,
      class: pattern.class,
      direction: pattern.direction,
      barsInvolved: pattern.class === 'single' ? 1 : pattern.class === 'double' ? 2 : 3,
      patternHigh: Math.max(entry, currentPrice) + (Math.random() * 0.5),
      patternLow: Math.min(entry, currentPrice) - (Math.random() * 0.5)
    },
    context: {
      trend: Math.random() > 0.5 ? 'up' : 'down',
      atSupport: isLong && Math.random() > 0.5,
      atResistance: !isLong && Math.random() > 0.5,
      nearestSupport: isLong ? stop * 0.99 : undefined,
      nearestResistance: !isLong ? stop * 1.01 : undefined,
      atr: basePrice * 0.02,
      volumeFactor: 1.2 + Math.random() * 1.8, // 1.2x to 3x volume
      isHighVolume: Math.random() > 0.3,
      isWideRange: Math.random() > 0.4
    },
    confirmation: {
      triggerSide: isLong ? 'above_high' : 'below_low',
      triggerPrice: entry,
      invalidationPrice: stop,
      validForBars: 10
    },
    plan: {
      direction: isLong ? 'long' : 'short',
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      risk: Number(Math.abs(entry - stop).toFixed(2)),
      targets: [Number(target1.toFixed(2)), Number(target2.toFixed(2))],
      positionQty: Math.floor(Math.random() * 200) + 50, // 50-250 shares
      riskRewardRatio: '1:2'
    },
    score,
    notes,
    currentPrice: Number(currentPrice.toFixed(2))
  };
}

function getBasePriceForSymbol(symbol: string): number {
  const prices: { [key: string]: number } = {
    'AAPL': 175,
    'MSFT': 420,
    'GOOGL': 140,
    'AMZN': 145,
    'TSLA': 250
  };
  return prices[symbol] || 100;
}