import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import axios from 'axios';

async function testSharesFloat(symbol: string) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.log('FMP_API_KEY not found');
    return;
  }
  
  console.log(`\n--- Testing ${symbol} ---`);
  
  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/stable/shares-float`,
      {
        params: {
          symbol: symbol,
          apikey: apiKey
        }
      }
    );
    
    console.log('Shares Float Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.length > 0) {
      const data = response.data[0];
      const floatShares = data.floatShares || data.freeFloat;
      const outstandingShares = data.outstandingShares;
      
      console.log(`Float Shares: ${(floatShares / 1e9).toFixed(2)}B`);
      console.log(`Outstanding Shares: ${(outstandingShares / 1e9).toFixed(2)}B`);
    }
    
  } catch (error: any) {
    console.error('Error:', JSON.stringify(error.response?.data, null, 2) || error.message);
  }
}

async function main() {
  const symbols = ['NVDA', 'AAPL', 'AMD', 'LLY'];
  
  for (const symbol of symbols) {
    await testSharesFloat(symbol);
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
