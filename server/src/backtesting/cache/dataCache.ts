import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

export interface CachedBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
}

export interface DailyCache {
  symbol: string;
  date: string;
  bars: CachedBar[];
  fetchedAt: string;
}

export interface DailyOHLC {
  symbol: string;
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const CACHE_DIR = path.resolve(process.cwd(), 'data_cache');
const INTRADAY_DIR = path.join(CACHE_DIR, 'intraday');
const DAILY_DIR = path.join(CACHE_DIR, 'daily');

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(INTRADAY_DIR)) fs.mkdirSync(INTRADAY_DIR, { recursive: true });
  if (!fs.existsSync(DAILY_DIR)) fs.mkdirSync(DAILY_DIR, { recursive: true });
}

function getIntradayCachePath(symbol: string, date: string): string {
  const symbolDir = path.join(INTRADAY_DIR, symbol);
  if (!fs.existsSync(symbolDir)) fs.mkdirSync(symbolDir, { recursive: true });
  return path.join(symbolDir, `${date}.json`);
}

function getDailyCachePath(date: string): string {
  return path.join(DAILY_DIR, `${date}.json`);
}

async function makePolygonRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${POLYGON_BASE_URL}${endpoint}`);
  url.searchParams.append('apiKey', POLYGON_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  const response = await axios.get(url.toString());
  return response.data;
}

export async function getIntradayBars(symbol: string, date: string, useCache: boolean = true): Promise<CachedBar[]> {
  ensureCacheDir();
  const cachePath = getIntradayCachePath(symbol, date);
  
  if (useCache && fs.existsSync(cachePath)) {
    const cached: DailyCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return cached.bars;
  }
  
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/ticker/${symbol}/range/5/minute/${date}/${date}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' }
    );
    
    const bars: CachedBar[] = data.results || [];
    
    if (useCache && bars.length > 0) {
      const cache: DailyCache = {
        symbol,
        date,
        bars,
        fetchedAt: new Date().toISOString()
      };
      fs.writeFileSync(cachePath, JSON.stringify(cache));
    }
    
    return bars;
  } catch {
    return [];
  }
}

export async function getDailyData(date: string, symbols: string[], useCache: boolean = true): Promise<Map<string, DailyOHLC>> {
  ensureCacheDir();
  const cachePath = getDailyCachePath(date);
  const result = new Map<string, DailyOHLC>();
  
  if (useCache && fs.existsSync(cachePath)) {
    const cached: DailyOHLC[] = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    for (const item of cached) {
      if (symbols.includes(item.symbol)) {
        result.set(item.symbol, item);
      }
    }
    if (result.size > 0) return result;
  }
  
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/grouped/locale/us/market/stocks/${date}`,
      { adjusted: 'true', include_otc: 'false' }
    );
    
    const allData: DailyOHLC[] = [];
    
    if (data.results) {
      for (const bar of data.results) {
        const item: DailyOHLC = {
          symbol: bar.T,
          date,
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: bar.v
        };
        allData.push(item);
        if (symbols.includes(bar.T)) {
          result.set(bar.T, item);
        }
      }
    }
    
    if (useCache && allData.length > 0) {
      fs.writeFileSync(cachePath, JSON.stringify(allData));
    }
    
    return result;
  } catch {
    return result;
  }
}

export async function preloadCache(
  symbols: string[],
  startDate: string,
  endDate: string,
  onProgress?: (current: number, total: number, symbol: string, date: string) => void
): Promise<{ success: number; failed: number }> {
  ensureCacheDir();
  
  const days = getTradingDays(startDate, endDate);
  const total = days.length * symbols.length + days.length;
  let current = 0;
  let success = 0;
  let failed = 0;
  
  console.log(`\nPreloading cache: ${symbols.length} symbols × ${days.length} days = ${total} requests\n`);
  
  for (const date of days) {
    current++;
    onProgress?.(current, total, 'DAILY', date);
    
    const cachePath = getDailyCachePath(date);
    if (!fs.existsSync(cachePath)) {
      try {
        await getDailyData(date, symbols, true);
        success++;
        await delay(50);
      } catch {
        failed++;
      }
    } else {
      success++;
    }
  }
  
  for (const symbol of symbols) {
    for (const date of days) {
      current++;
      onProgress?.(current, total, symbol, date);
      
      const cachePath = getIntradayCachePath(symbol, date);
      if (!fs.existsSync(cachePath)) {
        try {
          const bars = await getIntradayBars(symbol, date, true);
          if (bars.length > 0) success++;
          else failed++;
          await delay(50);
        } catch {
          failed++;
        }
      } else {
        success++;
      }
    }
  }
  
  return { success, failed };
}

export function getCacheStats(): { intradayFiles: number; dailyFiles: number; sizeBytes: number } {
  ensureCacheDir();
  
  let intradayFiles = 0;
  let dailyFiles = 0;
  let sizeBytes = 0;
  
  if (fs.existsSync(DAILY_DIR)) {
    const dailyFileList = fs.readdirSync(DAILY_DIR);
    dailyFiles = dailyFileList.length;
    for (const f of dailyFileList) {
      sizeBytes += fs.statSync(path.join(DAILY_DIR, f)).size;
    }
  }
  
  if (fs.existsSync(INTRADAY_DIR)) {
    const symbolDirs = fs.readdirSync(INTRADAY_DIR);
    for (const sym of symbolDirs) {
      const symDir = path.join(INTRADAY_DIR, sym);
      if (fs.statSync(symDir).isDirectory()) {
        const files = fs.readdirSync(symDir);
        intradayFiles += files.length;
        for (const f of files) {
          sizeBytes += fs.statSync(path.join(symDir, f)).size;
        }
      }
    }
  }
  
  return { intradayFiles, dailyFiles, sizeBytes };
}

export function clearCache(): void {
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true });
  }
  ensureCacheDir();
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
