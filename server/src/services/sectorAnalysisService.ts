import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { fetchUKHistoricalBars } from '../handlers/ukDataAPI.js';
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
  market: 'US' | 'UK';
}

// US Sector ETFs (S&P sector SPDR ETFs)
const US_SECTOR_ETFS = [
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

// UK Sector Proxies - largest/most liquid stock in each sector
// Used because UK sector ETFs are not available on all data providers
const UK_SECTOR_PROXIES = [
  { symbol: 'SAGE', name: 'Technology', sector: 'technology' },           // Sage Group - UK tech leader
  { symbol: 'HSBA', name: 'Financials', sector: 'financials' },           // HSBC - largest UK bank
  { symbol: 'SHEL', name: 'Energy', sector: 'energy' },                   // Shell - largest UK energy
  { symbol: 'AZN', name: 'Healthcare', sector: 'healthcare' },            // AstraZeneca
  { symbol: 'BAES', name: 'Industrials', sector: 'industrials' },         // BAE Systems
  { symbol: 'NXT', name: 'Consumer Discretionary', sector: 'consumer_discretionary' }, // Next
  { symbol: 'ULVR', name: 'Consumer Staples', sector: 'consumer_staples' }, // Unilever
  { symbol: 'SSE', name: 'Utilities', sector: 'utilities' },              // SSE
  { symbol: 'RIO', name: 'Materials', sector: 'materials' },              // Rio Tinto
  { symbol: 'LAND', name: 'Real Estate', sector: 'real_estate' },         // Land Securities
  { symbol: 'VOD', name: 'Communications', sector: 'communications' }     // Vodafone
];

// Backward compatibility alias
const SECTOR_ETFS = US_SECTOR_ETFS;

// US Stock to Sector mapping
const US_STOCK_TO_SECTOR: Record<string, string> = {
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

// UK Stock to Sector mapping (FTSE 100/250 stocks mapped to ICB sectors)
const UK_STOCK_TO_SECTOR: Record<string, string> = {
  // Energy
  BP: 'energy', SHEL: 'energy', ENOG: 'energy', TLW: 'energy', HBR: 'energy',

  // Materials (Mining, Chemicals)
  RIO: 'materials', GLEN: 'materials', ANTO: 'materials', AAL: 'materials', FRES: 'materials',
  BHPB: 'materials', S32: 'materials', CRDA: 'materials', JMAT: 'materials', MNDI: 'materials',
  EVOK: 'materials', FXPO: 'materials', KAZ: 'materials', POLY: 'materials',

  // Industrials (Aerospace, Defence, Engineering, Support Services)
  BAES: 'industrials', RR: 'industrials', WEIR: 'industrials', IMI: 'industrials',
  CKN: 'industrials', SMIN: 'industrials', MGNS: 'industrials', RTO: 'industrials',
  BALF: 'industrials', EXPN: 'industrials', DCC: 'industrials', BNZL: 'industrials',
  FERG: 'industrials', RS1R: 'industrials', HLMA: 'industrials', DPLM: 'industrials',
  HAYS: 'industrials', PAGE: 'industrials', HFD: 'industrials', BOY: 'industrials',
  VTY: 'industrials', ITRK: 'industrials', HWDN: 'industrials', GRI: 'industrials',
  TRST: 'industrials', IWG: 'industrials', RHIM: 'industrials', ESNT: 'industrials',

  // Consumer Discretionary (Retail, Travel, Media)
  NXT: 'consumer_discretionary', MKS: 'consumer_discretionary', JD: 'consumer_discretionary',
  BRBY: 'consumer_discretionary', FRAS: 'consumer_discretionary', ABF: 'consumer_discretionary',
  OCDO: 'consumer_discretionary', AO: 'consumer_discretionary', WIZZ: 'consumer_discretionary',
  EZJ: 'consumer_discretionary', ICAG: 'consumer_discretionary', CCL: 'consumer_discretionary',
  TUI: 'consumer_discretionary', WTB: 'consumer_discretionary', ENT: 'consumer_discretionary',
  WOSG: 'consumer_discretionary', GYM: 'consumer_discretionary', DLN: 'consumer_discretionary',
  PETS: 'consumer_discretionary', WHR: 'consumer_discretionary', FORT: 'consumer_discretionary',
  GAW: 'consumer_discretionary', FOUR: 'consumer_discretionary', THG: 'consumer_discretionary',
  AUTOA: 'consumer_discretionary', CCH: 'consumer_discretionary', SBRY: 'consumer_discretionary',
  TSCO: 'consumer_discretionary', KGF: 'consumer_discretionary',

  // Consumer Staples (Food, Beverages, Tobacco, Household)
  ULVR: 'consumer_staples', BATS: 'consumer_staples', IMB: 'consumer_staples',
  DGE: 'consumer_staples', AHT: 'consumer_staples', CRST: 'consumer_staples',
  GENG: 'consumer_staples', TATE: 'consumer_staples', AG: 'consumer_staples',
  PFD: 'consumer_staples', CHG: 'consumer_staples',

  // Healthcare (Pharma, Biotech, Medical Equipment)
  AZN: 'healthcare', GSK: 'healthcare', HIK: 'healthcare', SN: 'healthcare',
  CNOV: 'healthcare', OXB: 'healthcare', GENL: 'healthcare', HCM: 'healthcare',

  // Financials (Banks, Insurance, Asset Management)
  HSBA: 'financials', BARC: 'financials', LLOY: 'financials', NWG: 'financials',
  STAN: 'financials', LGEN: 'financials', PRU: 'financials', PHNX: 'financials',
  AV: 'financials', SDR: 'financials', III: 'financials', INVP: 'financials',
  JUP: 'financials', ABDN: 'financials', ASHM: 'financials', SJP: 'financials',
  SLA: 'financials', FCAM: 'financials', BKG: 'financials', MCRO: 'financials',
  MONY: 'financials', OSB: 'financials', RCH: 'financials', SMWH: 'financials',
  CBG: 'financials', BOCH: 'financials', INCH: 'financials', CMC: 'financials',
  LSEG: 'financials', ICG: 'financials', HICL: 'financials', INPP: 'financials',
  PNN: 'financials', RSW: 'financials', SVS: 'financials', TRIG: 'financials',

  // Utilities
  SSE: 'utilities', NG: 'utilities', UU: 'utilities', SVT: 'utilities',
  CNA: 'utilities', CNNE: 'utilities', DRX: 'utilities',

  // Real Estate
  LAND: 'real_estate', BLND: 'real_estate', SGRO: 'real_estate', HMSO: 'real_estate',
  UTG: 'real_estate', SHB: 'real_estate', SAFE: 'real_estate', GPE: 'real_estate',
  BREI: 'real_estate', SREI: 'real_estate', UKCM: 'real_estate',
  PHP: 'real_estate', BBOX: 'real_estate', DIGS: 'real_estate', GPOR: 'real_estate',
  HSL: 'real_estate', MCKS: 'real_estate', PSN: 'real_estate',

  // Communications (Telecom, Media)
  VOD: 'communications', BT: 'communications', ITV: 'communications',
  WPP: 'communications', REL: 'communications', PSON: 'communications',
  INF: 'communications', AUTO: 'communications', RMV: 'communications',
  FDM: 'communications', STVG: 'communications', STV: 'communications',

  // Technology
  SAGE: 'technology', AVON: 'technology', BYIT: 'technology',
  PTEC: 'technology', KNOS: 'technology', ALFA: 'technology', ASC: 'technology',
  CTEC: 'technology', GBSS: 'technology', HSPH: 'technology',
  IDOX: 'technology', IOTP: 'technology', KAIM: 'technology', NCC: 'technology',
  SGE: 'technology', SOPH: 'technology', SOLG: 'technology', OXIG: 'technology'
};

// Combined mapping for backward compatibility
const STOCK_TO_SECTOR: Record<string, string> = { ...US_STOCK_TO_SECTOR };

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
  etf: { symbol: string; name: string; sector: string },
  date: string,
  benchmarkChange: number,
  market: 'US' | 'UK' = 'US'
): Promise<SectorData | null> {
  try {
    const endDate = date;
    const startDateObj = new Date(date);
    startDateObj.setDate(startDateObj.getDate() - 14);
    const startDate = startDateObj.toISOString().split('T')[0];

    let candles: Candle[];

    if (market === 'UK') {
      candles = await fetchUKHistoricalBars(
        etf.symbol,
        startDate,
        endDate,
        'day',
        14
      );
    } else {
      const apiKey = process.env.POLYGON_API_KEY;
      if (!apiKey) {
        console.error('[SECTOR-ANALYSIS] No Polygon API key');
        return null;
      }

      candles = await fetchHistoricalBars(
        apiKey,
        etf.symbol,
        startDate,
        endDate,
        'day',
        1,
        14
      );
    }

    if (candles.length === 0) return null;

    const latest = candles[candles.length - 1];
    const prevDay = candles.length > 1 ? candles[candles.length - 2] : latest;

    const changePercent = ((latest.close - prevDay.close) / prevDay.close) * 100;
    const weekChange = calculateWeekChange(candles);
    const relativeStrength = changePercent - benchmarkChange;

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

export async function getSectorAnalysis(
  date: string,
  benchmarkChange: number = 0,
  market: 'US' | 'UK' = 'US'
): Promise<SectorAnalysis | null> {
  // For US, we need Polygon API key
  if (market === 'US') {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.error('[SECTOR-ANALYSIS] No Polygon API key configured');
      return null;
    }
  }

  const sectorProxies = market === 'UK' ? UK_SECTOR_PROXIES : US_SECTOR_ETFS;

  console.log(`[SECTOR-ANALYSIS] Fetching ${market} sector data for ${date}`);

  const sectorPromises = sectorProxies.map(etf =>
    fetchSectorData(etf, date, benchmarkChange, market)
  );

  const results = await Promise.all(sectorPromises);
  const sectors = results.filter((s): s is SectorData => s !== null);

  if (sectors.length === 0) {
    console.error(`[SECTOR-ANALYSIS] No sector data available for ${market}`);
    return null;
  }

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

  let summary = `${market} Leading: ${leaders.join(', ')}. Lagging: ${laggards.join(', ')}.`;
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
    rotationWarning,
    market
  };
}

export function getStockSector(symbol: string, market: 'US' | 'UK' = 'US'): string {
  // Normalize symbol (remove exchange suffix if present)
  const baseSymbol = symbol.replace('.L', '').replace('.O', '').replace('.N', '').toUpperCase();

  if (market === 'UK') {
    return UK_STOCK_TO_SECTOR[baseSymbol] || 'unknown';
  }

  return US_STOCK_TO_SECTOR[baseSymbol] || 'unknown';
}

export function getSectorStrength(
  sectorAnalysis: SectorAnalysis,
  symbol: string,
  market: 'US' | 'UK' = 'US'
): {
  sector: string;
  sectorName: string;
  isLeading: boolean;
  isLagging: boolean;
  relativeStrength: number;
  rank: number;
  momentum: 'gaining' | 'losing' | 'stable';
  rankChange: number;
} | null {
  const sectorKey = getStockSector(symbol, market);
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
