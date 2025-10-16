import { comprehensiveScanner } from './src/candlestick/comprehensiveScanner.js';
import { Candle } from './src/candlestick/types/index.js';

// Create test candles with various patterns
const testCandles: Candle[] = [
  // Historical candles for context
  {
    symbol: 'TEST',
    timeframe: '5m',
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1000,
    start: new Date('2025-09-30T10:00:00Z').toISOString(),
    end: new Date('2025-09-30T10:05:00Z').toISOString()
  },
  {
    symbol: 'TEST',
    timeframe: '5m',
    open: 101,
    high: 103,
    low: 100.5,
    close: 102.5,
    volume: 1200,
    start: new Date('2025-09-30T10:05:00Z').toISOString(),
    end: new Date('2025-09-30T10:10:00Z').toISOString()
  },
  // Doji pattern - very small body
  {
    symbol: 'TEST',
    timeframe: '5m',
    open: 102.45,
    high: 103,
    low: 102,
    close: 102.5, // Very small body
    volume: 1500,
    start: new Date('2025-09-30T10:10:00Z').toISOString(),
    end: new Date('2025-09-30T10:15:00Z').toISOString()
  },
  // Hammer pattern - long lower wick
  {
    symbol: 'TEST',
    timeframe: '5m',
    open: 100,
    high: 100.5,
    low: 98, // Long lower wick
    close: 100.3,
    volume: 2000,
    start: new Date('2025-09-30T10:15:00Z').toISOString(),
    end: new Date('2025-09-30T10:20:00Z').toISOString()
  },
  // Bullish Marubozu - no wicks
  {
    symbol: 'TEST',
    timeframe: '5m',
    open: 100,
    high: 105.1, // Very small upper wick
    low: 99.95, // Very small lower wick
    close: 105,
    volume: 3000,
    start: new Date('2025-09-30T10:20:00Z').toISOString(),
    end: new Date('2025-09-30T10:25:00Z').toISOString()
  }
];

console.log('Testing pattern detection with synthetic candles...\n');

// Add more candles for history
for (let i = 0; i < 30; i++) {
  const basePrice = 95 + Math.random() * 10;
  const range = 0.5 + Math.random() * 2;
  const bullish = Math.random() > 0.5;
  
  const candle: Candle = {
    symbol: 'TEST',
    timeframe: '5m',
    open: basePrice,
    high: basePrice + range,
    low: basePrice - range * 0.8,
    close: bullish ? basePrice + range * 0.7 : basePrice - range * 0.6,
    volume: 800 + Math.random() * 400,
    start: new Date(`2025-09-30T09:${30 - i}:00Z`).toISOString(),
    end: new Date(`2025-09-30T09:${35 - i}:00Z`).toISOString()
  };
  
  testCandles.unshift(candle); // Add to beginning
}

// Process each candle through the scanner
testCandles.forEach((candle, index) => {
  console.log(`\nProcessing candle ${index + 1}/${testCandles.length} at ${candle.start}`);
  console.log(`  Open: ${candle.open}, High: ${candle.high}, Low: ${candle.low}, Close: ${candle.close}`);
  
  const signals = comprehensiveScanner.scan(candle);
  
  if (signals.length > 0) {
    console.log(`  ✅ PATTERNS FOUND:`);
    signals.forEach(signal => {
      console.log(`    - ${signal.pattern.name} (${signal.pattern.direction}) - Score: ${signal.score}`);
      console.log(`      Notes: ${signal.notes.join(', ')}`);
    });
  } else {
    console.log(`  ❌ No patterns detected`);
  }
});

// Check history size
console.log(`\n\nFinal history size: ${comprehensiveScanner.getHistorySize('TEST')} candles`);

// Test with a strong engulfing pattern
console.log('\n\n=== Testing Engulfing Pattern ===');
comprehensiveScanner.clearHistory('TEST');

const engulfingCandles: Candle[] = [
  // Build history
  ...Array(25).fill(0).map((_, i) => ({
    symbol: 'TEST',
    timeframe: '5m',
    open: 100 + i * 0.1,
    high: 100.5 + i * 0.1,
    low: 99.5 + i * 0.1,
    close: 100.2 + i * 0.1,
    volume: 1000,
    start: new Date(`2025-09-30T12:${i * 5}:00Z`).toISOString(),
    end: new Date(`2025-09-30T12:${i * 5 + 5}:00Z`).toISOString()
  })),
  // Bearish candle
  {
    symbol: 'TEST',
    timeframe: '5m',
    open: 105,
    high: 105.2,
    low: 103,
    close: 103.2,
    volume: 1500,
    start: new Date('2025-09-30T14:00:00Z').toISOString(),
    end: new Date('2025-09-30T14:05:00Z').toISOString()
  },
  // Bullish engulfing
  {
    symbol: 'TEST',
    timeframe: '5m',
    open: 103,
    high: 106, // Engulfs previous candle
    low: 102.8,
    close: 105.8,
    volume: 2500,
    start: new Date('2025-09-30T14:05:00Z').toISOString(),
    end: new Date('2025-09-30T14:10:00Z').toISOString()
  }
];

engulfingCandles.forEach((candle, index) => {
  const signals = comprehensiveScanner.scan(candle);
  if (signals.length > 0 && index >= engulfingCandles.length - 2) {
    console.log(`\nCandle ${index + 1}: ${candle.start}`);
    console.log(`  Open: ${candle.open}, High: ${candle.high}, Low: ${candle.low}, Close: ${candle.close}`);
    signals.forEach(signal => {
      console.log(`  🎯 ${signal.pattern.name} - Score: ${signal.score}`);
    });
  }
});

process.exit(0);