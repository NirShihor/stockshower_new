import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import axios from 'axios';

async function testFmpEarnings(symbol: string) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.log('FMP_API_KEY not found in .env');
    return;
  }
  console.log('Using API key:', apiKey.slice(0, 8) + '...');
  
  console.log(`\n--- Testing ${symbol} ---`);
  
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/stable/income-statement`,
      {
        params: {
          symbol: symbol,
          period: 'quarter',
          apikey: apiKey
        }
      }
    );
    
    const statements = response.data;
    console.log(`Income statements (${statements.length} quarters):`);
    
    if (statements.length >= 5) {
      const latest = statements[0];
      const sameQuarterLastYear = statements[4];
      
      console.log(`Latest: ${latest.date} - EPS: ${latest.eps}`);
      console.log(`Same Q last year: ${sameQuarterLastYear.date} - EPS: ${sameQuarterLastYear.eps}`);
      
      if (latest.eps !== null && sameQuarterLastYear.eps !== null && sameQuarterLastYear.eps !== 0) {
        const growth = ((latest.eps - sameQuarterLastYear.eps) / Math.abs(sameQuarterLastYear.eps)) * 100;
        console.log(`YoY EPS Growth: ${growth.toFixed(1)}%`);
        console.log(`PASS (≥20%): ${growth >= 20 ? 'YES' : 'NO'}`);
      }
    }
    
    console.log('\nRaw data (first 5):');
    console.log(JSON.stringify(statements.slice(0, 5).map((s: any) => ({ date: s.date, eps: s.eps, epsDiluted: s.epsDiluted, revenue: s.revenue })), null, 2));
    
  } catch (error: any) {
    console.error(`Error:`, JSON.stringify(error.response?.data, null, 2) || error.message);
  }
}

async function main() {
  const symbols = ['NVDA', 'AAPL', 'MSFT', 'AMD'];
  
  for (const symbol of symbols) {
    await testFmpEarnings(symbol);
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
