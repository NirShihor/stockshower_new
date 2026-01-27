import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface GapCandidate {
  symbol: string;
  gapPercent: number;
  price: number;
  previousClose: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  float?: number;
  marketCap?: number;
  premarketHigh?: number;
  premarketLow?: number;
  exchange?: string;
  score: number;
  reasons: string[];
}

interface TickerDetails {
  ticker: string;
  name: string;
  market_cap?: number;
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
  primary_exchange?: string;
}

interface PolygonBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
  t: number;
  n: number;
}

interface GroupedDailyBar {
  T: string;  // ticker
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
  vw: number; // volume weighted average
  n?: number; // number of transactions
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

async function getGroupedDaily(date: string): Promise<GroupedDailyBar[]> {
  try {
    const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: 'true',
      include_otc: 'false'
    });
    return data.results || [];
  } catch (error) {
    console.error(`Failed to get grouped daily for ${date}:`, error);
    return [];
  }
}

async function getTickerDetails(symbol: string): Promise<TickerDetails | null> {
  try {
    const data = await makePolygonRequest(`/v3/reference/tickers/${symbol}`);
    return data.results || null;
  } catch (error) {
    console.warn(`Could not get ticker details for ${symbol}`);
    return null;
  }
}

async function getHistoricalBars(symbol: string, days: number = 20): Promise<PolygonBar[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days - 10); // Extra days for weekends
    
    const from = startDate.toISOString().split('T')[0];
    const to = endDate.toISOString().split('T')[0];
    
    const data = await makePolygonRequest(`/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`, {
      adjusted: 'true',
      sort: 'desc',
      limit: String(days)
    });
    
    return data.results || [];
  } catch (error) {
    console.warn(`Could not get historical bars for ${symbol}`);
    return [];
  }
}

function calculateAverageVolume(bars: PolygonBar[]): number {
  if (!bars || bars.length === 0) return 0;
  const sum = bars.reduce((acc, bar) => acc + bar.v, 0);
  return sum / bars.length;
}

function getTradingDates(): { today: string; yesterday: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // For "yesterday", we need the last trading day with data
  // Start from yesterday and go back until we find data
  let yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Skip weekends
  while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
    yesterday.setDate(yesterday.getDate() - 1);
  }
  
  return {
    today,
    yesterday: yesterday.toISOString().split('T')[0]
  };
}

async function findLastTradingDayWithData(): Promise<string | null> {
  // Go back up to 10 days to find a day with market data
  const today = new Date();
  
  for (let i = 1; i <= 10; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    
    // Skip weekends
    if (checkDate.getDay() === 0 || checkDate.getDay() === 6) continue;
    
    const dateStr = checkDate.toISOString().split('T')[0];
    const data = await getGroupedDaily(dateStr);
    
    if (data && data.length > 0) {
      console.log(`Found last trading day with data: ${dateStr}`);
      return dateStr;
    }
  }
  
  return null;
}

export interface MomentumScanConfig {
  minGapPercent: number;      // Minimum gap % (default 5)
  maxGapPercent: number;      // Maximum gap % (default 100)
  minPrice: number;           // Minimum price (default 1)
  maxPrice: number;           // Maximum price (default 20)
  minRelativeVolume: number;  // Minimum relative volume (default 2)
  maxFloat?: number;          // Maximum float in millions (default 50)
  minVolume: number;          // Minimum absolute volume (default 100000)
}

const DEFAULT_CONFIG: MomentumScanConfig = {
  minGapPercent: 5,
  maxGapPercent: 100,
  minPrice: 1,
  maxPrice: 20,
  minRelativeVolume: 2,
  maxFloat: 50000000, // 50M shares
  minVolume: 100000
};

export async function scanMomentumGaps(config: Partial<MomentumScanConfig> = {}): Promise<GapCandidate[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  console.log('=== MOMENTUM GAP SCANNER ===');
  console.log('Config:', cfg);
  
  // Find the last trading day with data (handles holidays)
  const lastTradingDay = await findLastTradingDayWithData();
  
  if (!lastTradingDay) {
    console.log('Could not find any recent trading day with data');
    return [];
  }
  
  // For live trading, we use today's date and compare against last trading day
  const today = new Date().toISOString().split('T')[0];
  const yesterday = lastTradingDay;
  
  console.log(`Scanning: today ${today} vs previous trading day ${yesterday}`);
  
  // Get today's data (might be empty if market just opened)
  let todayData = await getGroupedDaily(today);
  
  // If no data for today yet (market just opened), use snapshot/live data approach
  // Fall back to using yesterday as "today" for comparison with day before
  if (!todayData.length) {
    console.log(`No grouped daily data for today yet (market just opened)`);
    console.log(`Using previous trading day data to find gap candidates...`);
    
    // Find the day before the last trading day
    const prevDate = new Date(lastTradingDay);
    prevDate.setDate(prevDate.getDate() - 1);
    while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
      prevDate.setDate(prevDate.getDate() - 1);
    }
    const dayBeforeYesterday = prevDate.toISOString().split('T')[0];
    
    // Check if that day has data
    const dayBeforeData = await getGroupedDaily(dayBeforeYesterday);
    if (dayBeforeData.length > 0) {
      todayData = await getGroupedDaily(lastTradingDay);
      console.log(`Using: ${lastTradingDay} vs ${dayBeforeYesterday} (historical mode)`);
    }
  }
  
  const yesterdayData = await getGroupedDaily(yesterday);
  
  if (!todayData.length || !yesterdayData.length) {
    console.log('No market data available after fallbacks');
    return [];
  }
  
  console.log(`Using: ${todayData.length} stocks for analysis`);
  
  console.log(`Market data: ${todayData.length} stocks today, ${yesterdayData.length} yesterday`);
  
  // Create lookup for yesterday's closes
  const yesterdayMap = new Map<string, number>();
  yesterdayData.forEach(bar => yesterdayMap.set(bar.T, bar.c));
  
  // Phase 1: Quick filter on basic criteria
  const candidates: { bar: GroupedDailyBar; prevClose: number; gapPercent: number }[] = [];
  
  for (const bar of todayData) {
    const prevClose = yesterdayMap.get(bar.T);
    if (!prevClose) continue;
    
    const gapPercent = ((bar.o - prevClose) / prevClose) * 100;
    
    // Basic filters
    if (gapPercent < cfg.minGapPercent) continue;
    if (gapPercent > cfg.maxGapPercent) continue;
    if (bar.o < cfg.minPrice) continue;
    if (bar.o > cfg.maxPrice) continue;
    if (bar.v < cfg.minVolume) continue;
    
    candidates.push({ bar, prevClose, gapPercent });
  }
  
  console.log(`Phase 1: ${candidates.length} candidates after basic filters`);
  
  // Sort by gap percent descending
  candidates.sort((a, b) => b.gapPercent - a.gapPercent);
  
  // Phase 2: Detailed analysis on top candidates (limit to avoid rate limits)
  const maxToAnalyze = Math.min(candidates.length, 50);
  const results: GapCandidate[] = [];
  
  console.log(`Phase 2: Analyzing top ${maxToAnalyze} candidates...`);
  
  for (let i = 0; i < maxToAnalyze; i++) {
    const { bar, prevClose, gapPercent } = candidates[i];
    const symbol = bar.T;
    
    try {
      // Get historical data for relative volume calculation
      const historicalBars = await getHistoricalBars(symbol, 20);
      const avgVolume = calculateAverageVolume(historicalBars);
      const relativeVolume = avgVolume > 0 ? bar.v / avgVolume : 0;
      
      // Filter by relative volume
      if (relativeVolume < cfg.minRelativeVolume) {
        continue;
      }
      
      // Get ticker details for float
      const details = await getTickerDetails(symbol);
      const float = details?.weighted_shares_outstanding || details?.share_class_shares_outstanding;
      
      // Filter by float if configured and available
      if (cfg.maxFloat && float && float > cfg.maxFloat) {
        continue;
      }
      
      // Calculate score based on Warrior Trading criteria
      let score = 0;
      const reasons: string[] = [];
      
      // Gap size scoring
      if (gapPercent >= 20) {
        score += 30;
        reasons.push(`Strong gap +${gapPercent.toFixed(1)}%`);
      } else if (gapPercent >= 10) {
        score += 20;
        reasons.push(`Good gap +${gapPercent.toFixed(1)}%`);
      } else {
        score += 10;
        reasons.push(`Gap +${gapPercent.toFixed(1)}%`);
      }
      
      // Relative volume scoring
      if (relativeVolume >= 10) {
        score += 30;
        reasons.push(`Very high volume ${relativeVolume.toFixed(1)}x`);
      } else if (relativeVolume >= 5) {
        score += 25;
        reasons.push(`High volume ${relativeVolume.toFixed(1)}x`);
      } else if (relativeVolume >= 2) {
        score += 15;
        reasons.push(`Above avg volume ${relativeVolume.toFixed(1)}x`);
      }
      
      // Float scoring (lower is better for momentum)
      if (float) {
        if (float < 10000000) { // < 10M
          score += 25;
          reasons.push(`Very low float ${(float / 1000000).toFixed(1)}M`);
        } else if (float < 20000000) { // < 20M
          score += 20;
          reasons.push(`Low float ${(float / 1000000).toFixed(1)}M`);
        } else if (float < 50000000) { // < 50M
          score += 10;
          reasons.push(`Moderate float ${(float / 1000000).toFixed(1)}M`);
        }
      }
      
      // Price scoring (prefer $2-$10 sweet spot)
      if (bar.o >= 2 && bar.o <= 10) {
        score += 15;
        reasons.push(`Ideal price range $${bar.o.toFixed(2)}`);
      } else if (bar.o >= 1 && bar.o < 2) {
        score += 5;
        reasons.push(`Low price $${bar.o.toFixed(2)}`);
      } else if (bar.o > 10) {
        score += 10;
        reasons.push(`Higher price $${bar.o.toFixed(2)}`);
      }
      
      const candidate: GapCandidate = {
        symbol,
        gapPercent,
        price: bar.o,
        previousClose: prevClose,
        volume: bar.v,
        avgVolume,
        relativeVolume,
        float,
        marketCap: details?.market_cap,
        exchange: details?.primary_exchange,
        score,
        reasons
      };
      
      results.push(candidate);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.warn(`Error analyzing ${symbol}:`, error);
    }
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  console.log(`\n=== TOP MOMENTUM GAP CANDIDATES ===`);
  results.slice(0, 10).forEach((r, i) => {
    console.log(`${i + 1}. ${r.symbol} | Gap: +${r.gapPercent.toFixed(1)}% | Price: $${r.price.toFixed(2)} | RelVol: ${r.relativeVolume.toFixed(1)}x | Float: ${r.float ? (r.float / 1000000).toFixed(1) + 'M' : 'N/A'} | Score: ${r.score}`);
    console.log(`   ${r.reasons.join(' | ')}`);
  });
  
  return results;
}

export async function runMomentumGapScan(): Promise<void> {
  console.log('\n🚀 Running Momentum Gap Scanner (Warrior Trading Style)...\n');
  
  const results = await scanMomentumGaps({
    minGapPercent: 5,
    maxGapPercent: 100,
    minPrice: 1,
    maxPrice: 20,
    minRelativeVolume: 2,
    maxFloat: 50000000,
    minVolume: 100000
  });
  
  console.log(`\n✅ Found ${results.length} momentum gap candidates`);
}
