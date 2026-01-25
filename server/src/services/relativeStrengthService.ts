import { fetchHistoricalBars } from '../handlers/polygonAPI.js';

export interface RelativeStrengthResult {
  symbol: string;
  date: string;
  stockReturn12M: number;
  spyReturn12M: number;
  relativeReturn: number;
  rsRating: number;
  rsRank: number;
  totalStocks: number;
}

const RS_UNIVERSE = [
  // Mega Cap Tech (10)
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  // Semiconductors (17) - removed ADI, NXPI (not on FxPro)
  'AMD', 'INTC', 'QCOM', 'TXN', 'AMAT', 'LRCX', 'MU', 'MRVL', 'ON', 'SNPS', 'CDNS', 'KLAC', 'ASML', 'MCHP', 'SWKS', 'ARM', 'SMCI',
  // Software & Cloud (20)
  'ADBE', 'NOW', 'INTU', 'PANW', 'CRWD', 'SNOW', 'DDOG', 'NET', 'PLTR', 'SHOP', 'WDAY', 'TEAM', 'OKTA', 'ZS', 'FTNT', 'HUBS', 'DOCU', 'ZM', 'COIN', 'MSTR',
  // Internet & E-commerce (8) - removed BKNG (not on FxPro)
  'NFLX', 'PYPL', 'ABNB', 'UBER', 'DASH', 'EBAY', 'ETSY', 'MELI',
  // Financials (15)
  'V', 'MA', 'JPM', 'BAC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'C', 'WFC', 'SPGI', 'MCO', 'CME', 'ICE',
  // Healthcare & Pharma (19)
  'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD', 'VRTX', 'REGN', 'ISRG', 'MRNA', 'BIIB', 'ILMN', 'DXCM',
  // Consumer Discretionary (19)
  'HD', 'LOW', 'COST', 'WMT', 'TGT', 'NKE', 'SBUX', 'MCD', 'LULU', 'ROST', 'TJX', 'DG', 'DLTR', 'ORLY', 'AZO', 'CMG', 'DPZ', 'YUM', 'ULTA',
  // Consumer Staples (12)
  'PG', 'KO', 'PEP', 'PM', 'MO', 'CL', 'KHC', 'MDLZ', 'GIS', 'HSY', 'STZ', 'MNST',
  // Energy (12)
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'OXY', 'VLO', 'PSX', 'MPC', 'HAL', 'DVN',
  // Industrials (19)
  'CAT', 'DE', 'BA', 'HON', 'RTX', 'LMT', 'GD', 'NOC', 'GE', 'MMM', 'UPS', 'FDX', 'UNP', 'CSX', 'URI', 'EMR', 'ETN', 'ITW', 'PH',
  // Materials (7) - removed LIN (not on FxPro)
  'APD', 'SHW', 'ECL', 'NEM', 'FCX', 'NUE', 'SCCO',
  // REITs & Real Estate (10)
  'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'PSA', 'DLR', 'O', 'WELL', 'AVB',
  // Utilities (7) - removed SRE (not on FxPro)
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'XEL',
  // Telecom & Media (7) - removed PARA (not on FxPro)
  'T', 'VZ', 'TMUS', 'CMCSA', 'DIS', 'WBD', 'NWSA',
  // EV & Clean Energy (7)
  'RIVN', 'LCID', 'ENPH', 'SEDG', 'FSLR', 'RUN', 'PLUG',
  // Gaming & Entertainment (7) - removed WYNN (not on FxPro)
  'EA', 'TTWO', 'RBLX', 'DKNG', 'PENN', 'MGM', 'LVS',
  // Aerospace & Defense (4)
  'AXON', 'HII', 'LHX', 'TDG',
  // Misc High Growth (16) - removed SQ, VRSK, VRSN (not on FxPro)
  'SOFI', 'HOOD', 'AFRM', 'UPST', 'APP', 'ROKU', 'TTD', 'BILL', 'PCTY', 'PAYC', 'VEEV', 'CPRT', 'ODFL', 'POOL', 'IDXX', 'PODD', 'ALGN', 'MKTX'
];

async function calculate12MonthReturn(
  apiKey: string,
  symbol: string,
  endDate: string
): Promise<number | null> {
  const end = new Date(endDate);
  const start = new Date(endDate);
  start.setFullYear(start.getFullYear() - 1);
  
  try {
    const candles = await fetchHistoricalBars(
      apiKey,
      symbol,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
      'day',
      1,
      300
    );
    
    if (candles.length < 200) return null;
    
    const oldestPrice = candles[0].close;
    const latestPrice = candles[candles.length - 1].close;
    
    return ((latestPrice - oldestPrice) / oldestPrice) * 100;
  } catch (error) {
    console.error(`[RS] Error fetching ${symbol}:`, error);
    return null;
  }
}

export async function calculateRelativeStrength(
  symbol: string,
  date: string,
  universe: string[] = RS_UNIVERSE
): Promise<RelativeStrengthResult | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('[RS] No Polygon API key');
    return null;
  }
  
  console.log(`[RS] Calculating relative strength for ${symbol} on ${date}`);
  
  const [stockReturn, spyReturn] = await Promise.all([
    calculate12MonthReturn(apiKey, symbol, date),
    calculate12MonthReturn(apiKey, 'SPY', date)
  ]);
  
  if (stockReturn === null || spyReturn === null) {
    return null;
  }
  
  const relativeReturn = stockReturn - spyReturn;
  
  const allReturns: { symbol: string; return12M: number }[] = [];
  
  for (const sym of universe) {
    const ret = await calculate12MonthReturn(apiKey, sym, date);
    if (ret !== null) {
      allReturns.push({ symbol: sym, return12M: ret });
    }
  }
  
  allReturns.sort((a, b) => b.return12M - a.return12M);
  
  const rank = allReturns.findIndex(s => s.symbol === symbol) + 1;
  const rsRating = Math.round(((allReturns.length - rank) / allReturns.length) * 99);
  
  return {
    symbol,
    date,
    stockReturn12M: Math.round(stockReturn * 100) / 100,
    spyReturn12M: Math.round(spyReturn * 100) / 100,
    relativeReturn: Math.round(relativeReturn * 100) / 100,
    rsRating,
    rsRank: rank,
    totalStocks: allReturns.length
  };
}

export async function getRSRankings(
  date: string,
  universe: string[] = RS_UNIVERSE
): Promise<{ symbol: string; return12M: number; rsRating: number }[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return [];
  
  const allReturns: { symbol: string; return12M: number }[] = [];
  
  for (const sym of universe) {
    const ret = await calculate12MonthReturn(apiKey, sym, date);
    if (ret !== null) {
      allReturns.push({ symbol: sym, return12M: ret });
    }
  }
  
  allReturns.sort((a, b) => b.return12M - a.return12M);
  
  return allReturns.map((s, i) => ({
    symbol: s.symbol,
    return12M: Math.round(s.return12M * 100) / 100,
    rsRating: Math.round(((allReturns.length - i - 1) / allReturns.length) * 99)
  }));
}

export { RS_UNIVERSE };
