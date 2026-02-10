import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { UK_UNIVERSE } from '../services/relativeStrengthService.js';
import { getStockSector } from '../services/sectorAnalysisService.js';

const CACHE_DIR = path.join(process.cwd(), 'data', 'uk_historical');

interface CachedCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SymbolCache {
  symbol: string;
  candles: CachedCandle[];
}

const symbolDataCache = new Map<string, CachedCandle[]>();

function loadCachedData(): number {
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  let loadedCount = 0;
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8')) as SymbolCache;
      if (data.candles && data.candles.length > 0) {
        symbolDataCache.set(data.symbol, data.candles);
        loadedCount++;
      }
    } catch {}
  }
  return loadedCount;
}

function getCandlesForSymbol(symbol: string, endDate: string, lookbackTradingDays: number): CachedCandle[] {
  const allCandles = symbolDataCache.get(symbol.toUpperCase());
  if (!allCandles) return [];

  // Filter to candles on or before endDate
  const endDateObj = new Date(endDate);
  const validCandles = allCandles.filter(c => new Date(c.date) <= endDateObj);

  // Take the last N trading days
  return validCandles.slice(-lookbackTradingDays);
}

function getCandleOnDate(symbol: string, date: string): CachedCandle | null {
  const allCandles = symbolDataCache.get(symbol.toUpperCase());
  if (!allCandles) return null;
  return allCandles.find(c => c.date === date) || null;
}

function calculateRSRating(symbol: string, date: string): { rsRating: number; return12M: number } | null {
  const candles = getCandlesForSymbol(symbol, date, 260);
  if (candles.length < 200) return null;

  const oldestPrice = candles[0].close;
  const latestPrice = candles[candles.length - 1].close;
  const stockReturn = ((latestPrice - oldestPrice) / oldestPrice) * 100;

  const allReturns: { symbol: string; return12M: number }[] = [];
  for (const sym of UK_UNIVERSE) {
    const symCandles = getCandlesForSymbol(sym, date, 260);
    if (symCandles.length >= 200) {
      const ret = ((symCandles[symCandles.length - 1].close - symCandles[0].close) / symCandles[0].close) * 100;
      allReturns.push({ symbol: sym, return12M: ret });
    }
  }

  allReturns.sort((a, b) => b.return12M - a.return12M);
  const rank = allReturns.findIndex(r => r.symbol === symbol) + 1;
  const rsRating = Math.round(((allReturns.length - rank) / allReturns.length) * 99);

  return { rsRating, return12M: Math.round(stockReturn * 100) / 100 };
}

function calculate52WeekHigh(candles: CachedCandle[]): { high: number; percentFromHigh: number } {
  if (candles.length === 0) return { high: 0, percentFromHigh: -100 };
  const high = Math.max(...candles.map(c => c.high));
  const currentPrice = candles[candles.length - 1].close;
  const percentFromHigh = ((currentPrice - high) / high) * 100;
  return { high, percentFromHigh };
}

async function diagnose() {
  console.log('='.repeat(60));
  console.log('UK CANSLIM DIAGNOSTIC');
  console.log('='.repeat(60));

  const loaded = loadCachedData();
  console.log(`Loaded ${loaded} symbols\n`);

  // Check a sample symbol's data
  const sampleSymbol = 'BP';
  const sampleData = symbolDataCache.get(sampleSymbol);
  if (sampleData) {
    console.log(`Sample data for ${sampleSymbol}:`);
    console.log(`  Total candles: ${sampleData.length}`);
    console.log(`  First: ${sampleData[0].date}, Close: ${sampleData[0].close}`);
    console.log(`  Last: ${sampleData[sampleData.length-1].date}, Close: ${sampleData[sampleData.length-1].close}`);
  } else {
    console.log(`No data found for ${sampleSymbol}`);
  }
  console.log('');

  const testDate = '2024-06-15';  // Mid-year for good RS calculation
  console.log(`Test date: ${testDate}`);

  // Check candles retrieval for test date
  const testCandles = getCandlesForSymbol(sampleSymbol, testDate, 260);
  console.log(`Candles for ${sampleSymbol} up to ${testDate}: ${testCandles.length}`);
  if (testCandles.length > 0) {
    console.log(`  First: ${testCandles[0].date}`);
    console.log(`  Last: ${testCandles[testCandles.length-1].date}`);
  }
  console.log('');

  let hasEnoughData = 0;
  let passesRS = 0;
  let nearHigh = 0;
  let inBuyZone = 0;

  const topPerformers: { symbol: string; rsRating: number; percentFromHigh: number; return12M: number }[] = [];

  for (const symbol of UK_UNIVERSE) {
    const candles = getCandlesForSymbol(symbol, testDate, 300);
    if (candles.length < 200) continue;
    hasEnoughData++;

    const rsData = calculateRSRating(symbol, testDate);
    if (!rsData) continue;

    const highData = calculate52WeekHigh(candles.slice(-260));

    topPerformers.push({
      symbol,
      rsRating: rsData.rsRating,
      percentFromHigh: highData.percentFromHigh,
      return12M: rsData.return12M
    });

    if (rsData.rsRating >= 80) passesRS++;
    if (highData.percentFromHigh >= -15) nearHigh++;
    if (highData.percentFromHigh >= -5 && highData.percentFromHigh <= 5) inBuyZone++;
  }

  console.log(`Symbols with enough data (200+ days): ${hasEnoughData}`);
  console.log(`Symbols with RS >= 80: ${passesRS}`);
  console.log(`Symbols within 15% of 52-week high: ${nearHigh}`);
  console.log(`Symbols in buy zone (-5% to +5%): ${inBuyZone}`);

  // Show top performers by RS
  topPerformers.sort((a, b) => b.rsRating - a.rsRating);
  console.log(`\nTop 20 by RS Rating:`);
  for (const p of topPerformers.slice(0, 20)) {
    const sector = getStockSector(p.symbol, 'UK');
    console.log(`  ${p.symbol.padEnd(6)} RS: ${p.rsRating.toString().padStart(2)}, ${p.percentFromHigh.toFixed(1).padStart(6)}% from high, 12M: ${p.return12M.toFixed(1).padStart(6)}%, ${sector}`);
  }

  // Show those that might pass all filters
  const candidates = topPerformers.filter(p =>
    p.rsRating >= 80 &&
    p.percentFromHigh >= -15 &&
    p.percentFromHigh <= 5
  );

  console.log(`\nPotential Candidates (RS>=80, -15% to +5% from high): ${candidates.length}`);
  for (const c of candidates.slice(0, 10)) {
    console.log(`  ${c.symbol}: RS ${c.rsRating}, ${c.percentFromHigh.toFixed(1)}% from high`);
  }

  console.log('\n' + '='.repeat(60));
}

diagnose().catch(console.error);
