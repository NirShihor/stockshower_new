import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { Candle } from '../candlestick/types/index.js';

interface SectorData {
  symbol: string;
  name: string;
  sector: string;
  current: number;
  changePercent: number;
  weekChangePercent: number;
  relativeStrength: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  rank: number;
  momentum: 'gaining' | 'losing' | 'stable';
  rankChange: number;
}

export interface SectorAnalysis {
  timestamp: string;
  sectors: SectorData[];
  leaders: string[];
  laggards: string[];
  sectorMap: Map<string, SectorData>;
  summary: string;
  rotationWarning: boolean;
}

const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology', sector: 'technology' },
  { symbol: 'XLF', name: 'Financials', sector: 'financials' },
  { symbol: 'XLE', name: 'Energy', sector: 'energy' },
  { symbol: 'XLV', name: 'Healthcare', sector: 'healthcare' },
  { symbol: 'XLI', name: 'Industrials', sector: 'industrials' },
  { symbol: 'XLY', name: 'Consumer Discretionary', sector: 'consumer_discretionary' },
  { symbol: 'XLP', name: 'Consumer Staples', sector: 'consumer_staples' },
  { symbol: 'XLU', name: 'Utilities', sector: 'utilities' },
  { symbol: 'XLB', name: 'Materials', sector: 'materials' },
  { symbol: 'XLRE', name: 'Real Estate', sector: 'real_estate' },
  { symbol: 'XLC', name: 'Communications', sector: 'communications' }
];

const STOCK_TO_SECTOR: Record<string, string> = {
  AAPL: 'technology', MSFT: 'technology', GOOGL: 'technology', AMZN: 'consumer_discretionary',
  META: 'technology', NVDA: 'technology', TSLA: 'consumer_discretionary', AMD: 'technology',
  INTC: 'technology', CRM: 'technology', NFLX: 'communications', ADBE: 'technology',
  PYPL: 'technology', CSCO: 'technology', QCOM: 'technology', AVGO: 'technology',
  TXN: 'technology', MU: 'technology', AMAT: 'technology', LRCX: 'technology',
  JPM: 'financials', BAC: 'financials', WFC: 'financials', GS: 'financials',
  MS: 'financials', C: 'financials', V: 'financials', MA: 'financials',
  AXP: 'financials', BLK: 'financials',
  JNJ: 'healthcare', PFE: 'healthcare', UNH: 'healthcare', MRK: 'healthcare',
  ABBV: 'healthcare', LLY: 'healthcare', TMO: 'healthcare', ABT: 'healthcare',
  BMY: 'healthcare', AMGN: 'healthcare',
  XOM: 'energy', CVX: 'energy', COP: 'energy', SLB: 'energy', EOG: 'energy',
  OXY: 'energy', VLO: 'energy', MPC: 'energy', PSX: 'energy', HAL: 'energy',
  BA: 'industrials', CAT: 'industrials', HON: 'industrials', GE: 'industrials',
  MMM: 'industrials', UNP: 'industrials', RTX: 'industrials', DE: 'industrials',
  LMT: 'industrials', NOC: 'industrials',
  KO: 'consumer_staples', PEP: 'consumer_staples', WMT: 'consumer_staples',
  PG: 'consumer_staples', COST: 'consumer_staples',
  HD: 'consumer_discretionary', NKE: 'consumer_discretionary', MCD: 'consumer_discretionary',
  SBUX: 'consumer_discretionary', TGT: 'consumer_discretionary',
  DIS: 'communications', CMCSA: 'communications', T: 'communications',
  VZ: 'communications', TMUS: 'communications', CHTR: 'communications'
};

function calculateWeekChange(candles: Candle[]): number {
  if (candles.length < 5) return 0;
  const fiveDaysAgo = candles[candles.length - 5]?.open || candles[0].open;
  const current = candles[candles.length - 1].close;
  return ((current - fiveDaysAgo) / fiveDaysAgo) * 100;
}

function determineTrend(candles: Candle[]): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < 5) return 'neutral';
  
  const recent = candles.slice(-5);
  const closes = recent.map(c => c.close);
  
  let upDays = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) upDays++;
  }
  
  if (upDays >= 4) return 'bullish';
  if (upDays <= 1) return 'bearish';
  return 'neutral';
}

async function fetchSectorData(
  apiKey: string,
  etf: { symbol: string; name: string; sector: string },
  date: string,
  spyChange: number
): Promise<SectorData | null> {
  try {
    const endDate = date;
    const startDateObj = new Date(date);
    startDateObj.setDate(startDateObj.getDate() - 14);
    const startDate = startDateObj.toISOString().split('T')[0];
    
    const candles = await fetchHistoricalBars(
      apiKey,
      etf.symbol,
      startDate,
      endDate,
      'day',
      1,
      14
    );
    
    if (candles.length === 0) return null;
    
    const latest = candles[candles.length - 1];
    const prevDay = candles.length > 1 ? candles[candles.length - 2] : latest;
    
    const changePercent = ((latest.close - prevDay.close) / prevDay.close) * 100;
    const weekChange = calculateWeekChange(candles);
    const relativeStrength = changePercent - spyChange;
    
    const threeDayChange = candles.length >= 3 
      ? ((latest.close - candles[candles.length - 3].close) / candles[candles.length - 3].close) * 100 
      : changePercent;
    
    return {
      symbol: etf.symbol,
      name: etf.name,
      sector: etf.sector,
      current: latest.close,
      changePercent: Math.round(changePercent * 100) / 100,
      weekChangePercent: Math.round(weekChange * 100) / 100,
      relativeStrength: Math.round(relativeStrength * 100) / 100,
      trend: determineTrend(candles),
      rank: 0,
      momentum: 'stable',
      rankChange: 0,
      threeDayChange: Math.round(threeDayChange * 100) / 100
    } as SectorData & { threeDayChange: number };
  } catch (error) {
    console.error(`[SECTOR-ANALYSIS] Error fetching ${etf.symbol}:`, error);
    return null;
  }
}

export async function getSectorAnalysis(date: string, spyChange: number = 0): Promise<SectorAnalysis | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('[SECTOR-ANALYSIS] No Polygon API key configured');
    return null;
  }
  
  console.log(`[SECTOR-ANALYSIS] Fetching sector data for ${date}`);
  
  const sectorPromises = SECTOR_ETFS.map(etf => 
    fetchSectorData(apiKey, etf, date, spyChange)
  );
  
  const results = await Promise.all(sectorPromises);
  const sectors = results.filter((s): s is SectorData => s !== null);
  
  const sectorsWithThreeDayChange = sectors as (SectorData & { threeDayChange: number })[];
  
  sectors.sort((a, b) => b.changePercent - a.changePercent);
  const todayRanks = new Map<string, number>();
  sectors.forEach((s, i) => {
    s.rank = i + 1;
    todayRanks.set(s.sector, i + 1);
  });
  
  sectorsWithThreeDayChange.sort((a, b) => b.threeDayChange - a.threeDayChange);
  const threeDayRanks = new Map<string, number>();
  sectorsWithThreeDayChange.forEach((s, i) => {
    threeDayRanks.set(s.sector, i + 1);
  });
  
  for (const sector of sectors) {
    const todayRank = todayRanks.get(sector.sector) || 0;
    const threeDayRank = threeDayRanks.get(sector.sector) || 0;
    sector.rankChange = threeDayRank - todayRank;
    
    if (sector.rankChange >= 3) {
      sector.momentum = 'gaining';
    } else if (sector.rankChange <= -3) {
      sector.momentum = 'losing';
    } else {
      sector.momentum = 'stable';
    }
  }
  
  sectors.sort((a, b) => a.rank - b.rank);
  
  const leaders = sectors.slice(0, 3).map(s => s.name);
  const laggards = sectors.slice(-3).reverse().map(s => s.name);
  
  const sectorMap = new Map<string, SectorData>();
  for (const s of sectors) {
    sectorMap.set(s.sector, s);
  }
  
  const losingSectors = sectors.filter(s => s.momentum === 'losing').map(s => s.name);
  const rotationWarning = losingSectors.length >= 2;
  
  let summary = `Leading: ${leaders.join(', ')}. Lagging: ${laggards.join(', ')}.`;
  if (losingSectors.length > 0) {
    summary += ` Losing momentum: ${losingSectors.join(', ')}.`;
  }
  console.log(`[SECTOR-ANALYSIS] ${summary}`);
  
  return {
    timestamp: new Date().toISOString(),
    sectors,
    leaders,
    laggards,
    sectorMap,
    summary,
    rotationWarning
  };
}

export function getStockSector(symbol: string): string {
  return STOCK_TO_SECTOR[symbol] || 'unknown';
}

export function getSectorStrength(sectorAnalysis: SectorAnalysis, symbol: string): {
  sector: string;
  sectorName: string;
  isLeading: boolean;
  isLagging: boolean;
  relativeStrength: number;
  rank: number;
  momentum: 'gaining' | 'losing' | 'stable';
  rankChange: number;
} | null {
  const sectorKey = getStockSector(symbol);
  const sectorData = sectorAnalysis.sectorMap.get(sectorKey);
  
  if (!sectorData) return null;
  
  return {
    sector: sectorKey,
    sectorName: sectorData.name,
    isLeading: sectorAnalysis.leaders.includes(sectorData.name),
    isLagging: sectorAnalysis.laggards.includes(sectorData.name),
    relativeStrength: sectorData.relativeStrength,
    rank: sectorData.rank,
    momentum: sectorData.momentum,
    rankChange: sectorData.rankChange
  };
}

export function formatSectorAnalysisForAI(analysis: SectorAnalysis): string {
  let output = `SECTOR ANALYSIS\n`;
  output += '='.repeat(50) + '\n\n';
  
  if (analysis.rotationWarning) {
    output += `⚠️ ROTATION WARNING: Multiple sectors losing momentum - be cautious!\n\n`;
  }
  
  output += `SECTOR RANKINGS (by today's performance):\n`;
  for (const sector of analysis.sectors) {
    const arrow = sector.changePercent >= 0 ? '↑' : '↓';
    const rsSign = sector.relativeStrength >= 0 ? '+' : '';
    const status = analysis.leaders.includes(sector.name) ? ' [LEADING]' : 
                   analysis.laggards.includes(sector.name) ? ' [LAGGING]' : '';
    const momentumStr = sector.momentum === 'gaining' ? ' 📈GAINING' :
                        sector.momentum === 'losing' ? ' 📉LOSING' : '';
    
    output += `${sector.rank}. ${sector.name} (${sector.symbol}): ${arrow} ${Math.abs(sector.changePercent).toFixed(2)}%`;
    output += ` | RS: ${rsSign}${sector.relativeStrength.toFixed(2)}%${status}${momentumStr}\n`;
  }
  
  output += `\nKEY INSIGHT: ${analysis.summary}\n\n`;
  
  return output;
}
