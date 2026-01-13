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
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
  'V', 'XOM', 'JPM', 'PG', 'MA', 'HD', 'CVX', 'LLY', 'ABBV', 'MRK',
  'PEP', 'KO', 'COST', 'AVGO', 'TMO', 'MCD', 'WMT', 'CSCO', 'ACN', 'ABT',
  'CRM', 'DHR', 'NKE', 'TXN', 'NEE', 'UPS', 'PM', 'RTX', 'HON', 'ORCL',
  'IBM', 'QCOM', 'LOW', 'SPGI', 'BA', 'CAT', 'GS', 'AMD', 'INTC', 'AMAT',
  'NFLX', 'ADBE', 'PYPL', 'INTU', 'ADI', 'LRCX', 'MU', 'NOW', 'PANW', 'SNPS'
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
