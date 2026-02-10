import { metaApiHandler } from './metaApiRestHandler.js';
import { getMarketstackHistoricalData } from './marketstackAPI.js';
import { Candle } from '../candlestick/types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Flag to control whether to use Marketstack (real volume) or MetaAPI (tick volume)
// Disabled for UK: Marketstack has poor UK coverage (only major FTSE stocks) and strict rate limits
// MetaAPI provides tick volume but works reliably for all UK stocks
const USE_MARKETSTACK = false;

// MetaAPI concurrency limiter (max 3 concurrent requests, leaving 2 slots for other operations)
// MetaAPI has a hard limit of 5 concurrent historical data requests per account
const MAX_CONCURRENT_METAAPI = 3;
let currentMetaApiRequests = 0;
const metaApiQueue: (() => void)[] = [];

async function acquireMetaApiSlot(): Promise<void> {
  if (currentMetaApiRequests < MAX_CONCURRENT_METAAPI) {
    currentMetaApiRequests++;
    // Small delay between requests to avoid bursts
    await new Promise(resolve => setTimeout(resolve, 100));
    return;
  }
  // Wait for a slot to become available
  return new Promise((resolve) => {
    metaApiQueue.push(() => {
      currentMetaApiRequests++;
      resolve();
    });
  });
}

function releaseMetaApiSlot(): void {
  currentMetaApiRequests--;
  const next = metaApiQueue.shift();
  if (next) {
    // Small delay before processing next queued request
    setTimeout(next, 100);
  }
}

// Path to cached UK historical data
const UK_CACHE_DIR = path.join(__dirname, '../../data/uk_historical');

// In-memory cache for loaded files (avoid re-reading from disk)
const fileCache: Map<string, { candles: Candle[], loadedAt: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache for MetaAPI candles (avoid duplicate fetches for same symbol)
// Key: "SYMBOL.L" -> caches the largest fetch (300 candles) and reuses for smaller requests
const metaApiCandleCache: Map<string, { candles: Candle[], fetchedAt: number }> = new Map();
const METAAPI_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes (intraday refresh)

// Cache-only mode for backtesting (no API calls)
let cacheOnlyMode = false;

/**
 * Enable/disable cache-only mode (useful for backtesting)
 * When enabled, API calls are skipped entirely
 */
export function setCacheOnlyMode(enabled: boolean): void {
  cacheOnlyMode = enabled;
  console.log(`[UK Data] Cache-only mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Get list of symbols available in the file cache
 */
export function getCachedSymbols(): string[] {
  if (!fs.existsSync(UK_CACHE_DIR)) {
    return [];
  }

  const files = fs.readdirSync(UK_CACHE_DIR);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Fetch UK historical bars from file cache first, then API if needed
 * Priority: 1) File cache 2) Marketstack 3) MetaAPI
 * In cache-only mode, only file cache is used (no API fallback)
 */
export async function fetchUKHistoricalBars(
  symbol: string,
  from: string,
  to: string,
  timespan: 'minute' | 'hour' | 'day' = 'day',
  limit: number = 300
): Promise<Candle[]> {
  // For daily data, try file cache first
  if (timespan === 'day') {
    const cached = fetchFromFileCache(symbol, from, to);
    if (cached.length > 0) {
      return cached.slice(-limit);
    }
  }

  // In cache-only mode, don't try APIs
  if (cacheOnlyMode) {
    return [];
  }

  // For daily data, try Marketstack if available
  if (USE_MARKETSTACK && timespan === 'day') {
    return fetchUKHistoricalBarsMarketstack(symbol, from, to, limit);
  }

  // Fall back to MetaAPI for intraday or if Marketstack not configured
  return fetchUKHistoricalBarsMetaAPI(symbol, from, to, timespan, limit);
}

/**
 * Fetch UK historical bars from local file cache
 * Uses cached Yahoo Finance data from /server/data/uk_historical/
 */
function fetchFromFileCache(
  symbol: string,
  from: string,
  to: string
): Candle[] {
  const baseSymbol = symbol.replace('.L', '').toUpperCase();
  const cacheKey = baseSymbol;

  // Check in-memory cache first
  const memCached = fileCache.get(cacheKey);
  if (memCached && Date.now() - memCached.loadedAt < CACHE_TTL_MS) {
    return filterCandlesByDate(memCached.candles, from, to);
  }

  // Load from file
  const filePath = path.join(UK_CACHE_DIR, `${baseSymbol}.json`);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    if (!data.candles || !Array.isArray(data.candles)) {
      return [];
    }

    // Convert cached format to Candle format
    const candles: Candle[] = data.candles.map((bar: any) => ({
      symbol: baseSymbol,
      timeframe: '1d',
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume || 0,
      start: new Date(bar.date).toISOString(),
      end: new Date(bar.date).toISOString()
    }));

    // Store in memory cache
    fileCache.set(cacheKey, { candles, loadedAt: Date.now() });

    const filtered = filterCandlesByDate(candles, from, to);
    if (filtered.length > 0) {
      console.log(`[UK Data] File cache: ${filtered.length} candles for ${baseSymbol} (${from} to ${to})`);
    }
    return filtered;
  } catch (error) {
    console.error(`[UK Data] Error reading cache for ${baseSymbol}:`, error);
    return [];
  }
}

/**
 * Filter candles by date range
 */
function filterCandlesByDate(candles: Candle[], from: string, to: string): Candle[] {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  return candles.filter(c => {
    const candleDate = new Date(c.start);
    return candleDate >= fromDate && candleDate <= toDate;
  });
}

/**
 * Clear the in-memory file cache (useful for testing)
 */
export function clearUKFileCache(): void {
  fileCache.clear();
  console.log('[UK Data] File cache cleared');
}

/**
 * Fetch UK historical bars from Marketstack (has real trading volume)
 */
async function fetchUKHistoricalBarsMarketstack(
  symbol: string,
  from: string,
  to: string,
  limit: number = 300
): Promise<Candle[]> {
  // Marketstack uses XLON exchange code for LSE
  // Symbol format: SYMBOL.XLON (e.g., BP.XLON, SHEL.XLON)
  const baseSymbol = symbol.replace('.L', '').toUpperCase();
  const marketstackSymbol = `${baseSymbol}.XLON`;

  console.log(`[UK Data] Fetching from Marketstack: ${marketstackSymbol} (${from} to ${to})`);

  try {
    const data = await getMarketstackHistoricalData(marketstackSymbol, from, to);

    if (!data || data.length === 0) {
      console.warn(`[UK Data] No Marketstack data for ${marketstackSymbol}, falling back to MetaAPI`);
      return fetchUKHistoricalBarsMetaAPI(symbol, from, to, 'day', limit);
    }

    // Marketstack returns data sorted by date ASC
    const candles: Candle[] = data.slice(-limit).map((bar) => ({
      symbol: baseSymbol,
      timeframe: '1d',
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,  // Real trading volume from Marketstack!
      start: new Date(bar.date).toISOString(),
      end: new Date(bar.date).toISOString()
    }));

    console.log(`[UK Data] Marketstack: ${candles.length} candles for ${baseSymbol} (real volume)`);
    return candles;
  } catch (error) {
    console.error(`[UK Data] Marketstack error for ${marketstackSymbol}:`, error);
    // Fall back to MetaAPI
    return fetchUKHistoricalBarsMetaAPI(symbol, from, to, 'day', limit);
  }
}

/**
 * Fetch UK historical bars from MetaAPI (tick volume only)
 * Uses concurrency limiter to avoid exceeding MetaAPI's 5 concurrent request limit
 */
async function fetchUKHistoricalBarsMetaAPI(
  symbol: string,
  from: string,
  to: string,
  timespan: 'minute' | 'hour' | 'day' = 'day',
  limit: number = 300
): Promise<Candle[]> {
  const ukSymbol = symbol.endsWith('.L') ? symbol : `${symbol}.L`;

  const timeframeMap: Record<string, string> = {
    'minute': '1m',
    'hour': '1h',
    'day': '1d'
  };
  const timeframe = timeframeMap[timespan] || '1d';

  // Acquire a slot before making the MetaAPI request
  await acquireMetaApiSlot();

  try {
    console.log(`[UK Data] Fetching from MetaAPI: ${ukSymbol} (${limit} ${timeframe} candles)`);

    const result = await metaApiHandler.getHistoricalCandles(ukSymbol, timeframe, limit);

    if (!result.success || !result.candles) {
      console.error(`[UK Data] MetaAPI failed for ${ukSymbol}:`, result.error);
      return [];
    }

    const candles: Candle[] = result.candles.map((bar: any) => ({
      symbol: symbol.toUpperCase().replace('.L', ''),
      timeframe: timeframe,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.tickVolume || 0,  // Note: tick volume, not real volume
      start: new Date(bar.time).toISOString(),
      end: new Date(bar.time).toISOString()
    }));

    console.log(`[UK Data] MetaAPI: ${candles.length} candles for ${ukSymbol} (tick volume)`);
    return candles;
  } finally {
    // Always release the slot, even on error
    releaseMetaApiSlot();
  }
}

export function convertToUKSymbol(symbol: string): string {
  return symbol.endsWith('.L') ? symbol : `${symbol}.L`;
}

export function getBaseSymbol(ukSymbol: string): string {
  return ukSymbol.endsWith('.L') ? ukSymbol.slice(0, -2) : ukSymbol;
}
