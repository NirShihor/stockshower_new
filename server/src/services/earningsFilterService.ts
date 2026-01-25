import axios from 'axios';

export interface EarningsCheckResult {
  symbol: string;
  pass: boolean;
  reason: string;
  currentEarnings?: {
    quarterlyGrowth: string;
    annualGrowth: string;
    trend: string;
  };
  institutionalOwnership?: string;
  error?: string;
}

const MIN_QUARTERLY_GROWTH = 20;
const MIN_ANNUAL_GROWTH = 20;

export async function checkEarningsWithPerplexity(symbol: string): Promise<EarningsCheckResult> {
  const apiKey = process.env.FMP_API_KEY;
  
  if (!apiKey) {
    console.log(`[EARNINGS] FMP API key not configured, skipping earnings check for ${symbol}`);
    return {
      symbol,
      pass: true,
      reason: 'Earnings check skipped - no API key'
    };
  }

  try {
    console.log(`[EARNINGS] Checking earnings for ${symbol} via FMP...`);
    
    const response = await axios.get(
      `https://financialmodelingprep.com/stable/income-statement`,
      {
        params: {
          symbol: symbol,
          period: 'quarter',
          limit: 12,
          apikey: apiKey
        },
        timeout: 10000
      }
    );
    
    const statements = response.data;
    
    if (!statements || statements.length < 8) {
      console.log(`[EARNINGS] ${symbol}: Not enough quarterly data (${statements?.length || 0} quarters, need 8)`);
      return {
        symbol,
        pass: true,
        reason: 'Earnings data insufficient - allowing trade'
      };
    }
    
    const latest = statements[0];
    const sameQuarterLastYear = statements[4];
    
    const latestEps = latest.eps || latest.epsDiluted;
    const lastYearEps = sameQuarterLastYear.eps || sameQuarterLastYear.epsDiluted;
    
    if (latestEps === null || latestEps === undefined || 
        lastYearEps === null || lastYearEps === undefined || lastYearEps === 0) {
      console.log(`[EARNINGS] ${symbol}: Missing EPS data`);
      return {
        symbol,
        pass: true,
        reason: 'EPS data missing - allowing trade'
      };
    }
    
    const qGrowth = ((latestEps - lastYearEps) / Math.abs(lastYearEps)) * 100;
    const qGrowthRounded = Math.round(qGrowth * 10) / 10;
    
    const latestYearEps = statements.slice(0, 4).reduce((sum: number, q: any) => sum + (q.eps || 0), 0);
    const prevYearEps = statements.slice(4, 8).reduce((sum: number, q: any) => sum + (q.eps || 0), 0);
    
    let annualGrowthRounded = 0;
    let annualGrowthStr = 'N/A';
    
    if (prevYearEps !== 0) {
      const annualGrowth = ((latestYearEps - prevYearEps) / Math.abs(prevYearEps)) * 100;
      annualGrowthRounded = Math.round(annualGrowth * 10) / 10;
      annualGrowthStr = `${annualGrowthRounded}%`;
    }
    
    const qPass = qGrowthRounded >= MIN_QUARTERLY_GROWTH;
    const aPass = annualGrowthRounded >= MIN_ANNUAL_GROWTH;
    
    let pass = false;
    let reason = '';
    
    if (qPass && aPass) {
      pass = true;
      reason = `Earnings PASS: C=${qGrowthRounded}% (≥${MIN_QUARTERLY_GROWTH}%), A=${annualGrowthStr} (≥${MIN_ANNUAL_GROWTH}%)`;
    } else if (!qPass && !aPass) {
      pass = false;
      reason = `Earnings FAIL: C=${qGrowthRounded}% (need ≥${MIN_QUARTERLY_GROWTH}%), A=${annualGrowthStr} (need ≥${MIN_ANNUAL_GROWTH}%)`;
    } else if (!qPass) {
      pass = false;
      reason = `Earnings FAIL: C=${qGrowthRounded}% (need ≥${MIN_QUARTERLY_GROWTH}%), A=${annualGrowthStr} OK`;
    } else {
      pass = false;
      reason = `Earnings FAIL: C=${qGrowthRounded}% OK, A=${annualGrowthStr} (need ≥${MIN_ANNUAL_GROWTH}%)`;
    }
    
    console.log(`[EARNINGS] ${symbol}: ${reason}`);
    
    return {
      symbol,
      pass,
      reason,
      currentEarnings: {
        quarterlyGrowth: `${qGrowthRounded}%`,
        annualGrowth: annualGrowthStr,
        trend: aPass ? 'GROWING' : 'FLAT'
      }
    };
    
  } catch (error: any) {
    console.error(`[EARNINGS] Error checking ${symbol}:`, error.message);
    return {
      symbol,
      pass: true,
      reason: 'Earnings check failed - allowing trade',
      error: error.message
    };
  }
}

export async function checkMultipleEarnings(symbols: string[]): Promise<Map<string, EarningsCheckResult>> {
  const results = new Map<string, EarningsCheckResult>();
  
  for (const symbol of symbols) {
    const result = await checkEarningsWithPerplexity(symbol);
    results.set(symbol, result);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return results;
}

export interface SharesFloatData {
  symbol: string;
  floatShares: number | null;
  outstandingShares: number | null;
}

export async function getSharesFloat(symbol: string): Promise<SharesFloatData> {
  const apiKey = process.env.FMP_API_KEY;
  
  if (!apiKey) {
    return { symbol, floatShares: null, outstandingShares: null };
  }

  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/stable/shares-float`,
      {
        params: {
          symbol: symbol,
          apikey: apiKey
        },
        timeout: 5000
      }
    );
    
    if (response.data && response.data.length > 0) {
      const data = response.data[0];
      return {
        symbol,
        floatShares: data.floatShares || null,
        outstandingShares: data.outstandingShares || null
      };
    }
    
    return { symbol, floatShares: null, outstandingShares: null };
    
  } catch (error: any) {
    console.error(`[SHARES] Error fetching float for ${symbol}:`, error.message);
    return { symbol, floatShares: null, outstandingShares: null };
  }
}
