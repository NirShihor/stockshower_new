import { Request, Response } from 'express';
import { fetchUKHistoricalBars } from './ukDataAPI.js';

/**
 * UK GAP SCANNER (opening-range model)
 *
 * Why this is separate from the US gap scan (stockAnalysis.ts):
 *  - There is NO cheap "whole UK market in one call" endpoint (US uses Polygon grouped-daily),
 *    so we iterate a curated top-~50 liquid FTSE universe instead of the full market.
 *  - There is NO UK pre-market data on our feed (verified: 0 bars before 08:00 UK). So instead of
 *    a pre-market-range entry, UK uses the 08:00-08:15 OPENING RANGE ("first 15 min") as the
 *    entry/stop basis. We populate first15MinHigh/Low/Close; the frontend already falls back to
 *    those when premarketHigh/Low are absent (GapScannerPage: `stock.premarketHigh || stock.first15MinHigh`).
 *
 * Output shape matches the US scan's envelope exactly so the existing frontend consumes it unchanged.
 */

// Curated liquid FTSE-100 constituents (base symbols; ukDataAPI appends ".L").
// Kept to ~50 to bound API calls/latency, per the chosen scope.
const TOP_UK_GAP_UNIVERSE = [
  'AAL', 'ABF', 'AHT', 'ANTO', 'AV', 'AZN', 'BARC', 'BATS', 'BP', 'BNZL',
  'BRBY', 'BT', 'BTRW', 'CCH', 'CNA', 'CPG', 'CRDA', 'DCC', 'DGE', 'ENT',
  'EXPN', 'FERG', 'FRES', 'GLEN', 'GSK', 'HLMA', 'HSBA', 'IMB', 'III', 'ITRK',
  'KGF', 'LGEN', 'LLOY', 'LSEG', 'NG', 'NWG', 'NXT', 'PRU', 'PSN', 'REL',
  'RIO', 'RKT', 'RMV', 'RR', 'SGE', 'SGRO', 'SHEL', 'SN', 'SSE', 'STAN',
  'SVT', 'TSCO', 'ULVR', 'VOD', 'WPP',
];

interface UKGapStock {
  stockSymbol: string;
  currentPrice: string;
  twentyDayHigh: string;
  gapPercentage: string;
  analysis: string;
  suitable: boolean;
  isBlueChip?: boolean;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  previousClose?: string;
  volume?: number;
  companyName?: string;
  exchange?: string;
  first15MinHigh?: string;
  first15MinLow?: string;
  first15MinClose?: string;
  // premarket fields intentionally omitted for UK (no pre-market data)
}

// Gap thresholds mirror the US scanner's volatility bands.
const GAP_LIMITS = {
  low: { min: 2.5, max: 15 },
  medium: { min: 2.0, max: 25 },
  high: { min: 1.5, max: 40 },
};

// Run an array of async tasks with bounded concurrency (protect the UK data API from a burst).
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i]); } catch { results[i] = null as any; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Time helper: get the UK wall-clock hour/minute for a candle timestamp.
function ukHM(iso: string): { h: number; m: number } {
  const s = new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false });
  const [h, m] = s.split(':');
  return { h: parseInt(h, 10), m: parseInt(m, 10) };
}

/**
 * Scan the UK universe for gap-ups or gap-downs using the opening-range model.
 */
export async function scanUKGaps(
  direction: 'up' | 'down',
  volatilityLevel: 'low' | 'medium' | 'high' = 'low'
): Promise<{ stocks: UKGapStock[]; totalFound: number; timestamp: Date; scanDuration: string; status: 'completed' | 'partial' }> {
  const startTime = Date.now();
  const limits = GAP_LIMITS[volatilityLevel] || GAP_LIMITS.low;
  const today = new Date().toISOString().split('T')[0];
  // Look back ~7 calendar days of daily bars to reliably get today + previous session.
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`[UK-GAP] Scanning ${TOP_UK_GAP_UNIVERSE.length} UK symbols for gap-${direction}s (volatility=${volatilityLevel})...`);

  // Phase 1: daily bars for gap pre-filter (cached/cheap), bounded concurrency.
  // MetaAPI caps at 5 concurrent market-data requests PER ACCOUNT, shared with the live scheduler,
  // so keep this low (3) to leave headroom and avoid TooManyRequestsError.
  const preFiltered = (await mapWithConcurrency(TOP_UK_GAP_UNIVERSE, 3, async (symbol) => {
    const daily = await fetchUKHistoricalBars(symbol, from, today, 'day', 10);
    if (!daily || daily.length < 2) return null;
    const todayBar = daily[daily.length - 1];
    const prevBar = daily[daily.length - 2];
    if (!prevBar.close || !todayBar.open) return null;
    const gapPct = ((todayBar.open - prevBar.close) / prevBar.close) * 100;
    const isUp = direction === 'up';
    const magnitude = Math.abs(gapPct);
    // Direction + magnitude + basic quality filters
    if (isUp && gapPct <= 0) return null;
    if (!isUp && gapPct >= 0) return null;
    if (magnitude < limits.min || magnitude > limits.max) return null;
    return { symbol, todayBar, prevBar, gapPct };
  })).filter(Boolean) as Array<{ symbol: string; todayBar: any; prevBar: any; gapPct: number }>;

  console.log(`[UK-GAP] Phase 1: ${preFiltered.length} gap-${direction} candidates from ${TOP_UK_GAP_UNIVERSE.length} symbols`);

  // Phase 2: minute bars for candidates -> precise 08:00 open + 08:00-08:15 opening range.
  const enriched = (await mapWithConcurrency(preFiltered, 2, async (c) => {
    const minutes = await fetchUKHistoricalBars(c.symbol, today, today, 'minute', 500);
    if (!minutes || minutes.length === 0) return null;

    // Opening-range window: 08:00:00 -> 08:14:59 UK
    const openingRange = minutes.filter((b: any) => {
      const { h, m } = ukHM(b.start);
      return h === 8 && m < 15;
    });
    if (openingRange.length === 0) return null; // opening range not formed yet (before ~08:15 UK)

    const first15High = Math.max(...openingRange.map((b: any) => b.high));
    const first15Low = Math.min(...openingRange.map((b: any) => b.low));
    const first15Close = openingRange[openingRange.length - 1].close;

    // True session open = first bar at/after 08:00; recompute gap precisely from it.
    const sessionOpen = openingRange[0].open;
    const preciseGap = ((sessionOpen - c.prevBar.close) / c.prevBar.close) * 100;

    // Current price = latest minute close; session high/low so far
    const last = minutes[minutes.length - 1];
    const sessionHigh = Math.max(...minutes.map((b: any) => b.high));
    const sessionLow = Math.min(...minutes.map((b: any) => b.low));
    const dayVolume = minutes.reduce((s: number, b: any) => s + (b.volume || 0), 0);

    const gapStr = `${preciseGap >= 0 ? '+' : ''}${preciseGap.toFixed(2)}%`;
    const analysis = `${c.symbol}.L gapped ${direction} ${Math.abs(preciseGap).toFixed(1)}% at the 08:00 open (open ${sessionOpen.toFixed(2)}, prev close ${c.prevBar.close.toFixed(2)}). ` +
      `Opening range (08:00-08:15): high ${first15High.toFixed(2)}, low ${first15Low.toFixed(2)}. ` +
      `Entry uses the opening range (no UK pre-market data).`;

    const stock: UKGapStock = {
      stockSymbol: `${c.symbol}.L`,
      // Keep all prices in the broker's native LSE units (pence) so currentPrice, the opening range,
      // and the entry/stop the UI derives from first15Min are all consistent with MetaAPI .L quotes.
      currentPrice: `${last.close.toFixed(2)}`,
      twentyDayHigh: `${sessionHigh.toFixed(2)}`,
      gapPercentage: gapStr,
      analysis,
      suitable: true,
      openPrice: `${sessionOpen.toFixed(2)}`,
      highPrice: `${sessionHigh.toFixed(2)}`,
      lowPrice: `${sessionLow.toFixed(2)}`,
      previousClose: `${c.prevBar.close.toFixed(2)}`,
      volume: dayVolume,
      exchange: 'LSE',
      first15MinHigh: `${first15High.toFixed(2)}`,
      first15MinLow: `${first15Low.toFixed(2)}`,
      first15MinClose: `${first15Close.toFixed(2)}`,
    };
    return { stock, magnitude: Math.abs(preciseGap) };
  })).filter(Boolean) as Array<{ stock: UKGapStock; magnitude: number }>;

  // Sort by gap magnitude desc, cap at 50
  enriched.sort((a, b) => b.magnitude - a.magnitude);
  const stocks = enriched.map(e => e.stock).slice(0, 50);

  const duration = (Date.now() - startTime) / 1000;
  console.log(`[UK-GAP] Scan complete: ${stocks.length} qualified gap-${direction} stocks in ${duration.toFixed(1)}s`);

  return {
    stocks,
    totalFound: stocks.length,
    timestamp: new Date(),
    scanDuration: `${duration.toFixed(2)}s`,
    status: 'completed',
  };
}
