import { Candle } from '../candlestick/types/index.js';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'candle-debug.log');
let candleCount = 0;
let lastLogTime = Date.now();

export function logCandleActivity(candle: Candle) {
  candleCount++;
  
  // Log summary every 5 minutes
  if (Date.now() - lastLogTime > 5 * 60 * 1000) {
    const summary = `[${new Date().toISOString()}] Received ${candleCount} candles in last 5 minutes\n`;
    fs.appendFileSync(LOG_FILE, summary);
    
    console.log(`Candle activity: ${candleCount} candles in last 5 minutes`);
    candleCount = 0;
    lastLogTime = Date.now();
  }
  
  // Log first few candles for debugging
  if (candleCount <= 5) {
    const detail = `[${new Date().toISOString()}] ${candle.symbol}: O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close}\n`;
    fs.appendFileSync(LOG_FILE, detail);
  }
}

export function logPatternCheck(symbol: string, reason: string) {
  const log = `[${new Date().toISOString()}] Pattern check for ${symbol}: ${reason}\n`;
  fs.appendFileSync(LOG_FILE, log);
}