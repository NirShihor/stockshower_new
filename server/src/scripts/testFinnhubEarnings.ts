import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

async function testFinnhubEarnings(symbol: string) {
  const apiKey = process.env.FINNHUB_API_KEY;
  
  console.log(`\n--- Testing ${symbol} ---`);
  
  try {
    const response = await axios.get(`https://finnhub.io/api/v1/stock/earnings`, {
      params: {
        symbol: symbol,
        token: apiKey
      }
    });
    
    const earnings = response.data;
    console.log(`Earnings data (${earnings.length} quarters):`);
    
    if (earnings.length >= 5) {
      const latest = earnings[0];
      const sameQuarterLastYear = earnings[4];
      
      console.log(`Latest: Q${latest.quarter} ${latest.year} - EPS: ${latest.actual}`);
      console.log(`Same Q last year: Q${sameQuarterLastYear.quarter} ${sameQuarterLastYear.year} - EPS: ${sameQuarterLastYear.actual}`);
      
      if (latest.actual && sameQuarterLastYear.actual && sameQuarterLastYear.actual !== 0) {
        const growth = ((latest.actual - sameQuarterLastYear.actual) / Math.abs(sameQuarterLastYear.actual)) * 100;
        console.log(`YoY EPS Growth: ${growth.toFixed(1)}%`);
      }
    }
    
    console.log('\nRaw data:', JSON.stringify(earnings.slice(0, 5), null, 2));
    
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}

async function main() {
  const symbols = ['NVDA', 'AAPL', 'MSFT', 'AMD'];
  
  for (const symbol of symbols) {
    await testFinnhubEarnings(symbol);
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
