import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const WATCHLIST = [
  'ADBE', 'META', 'JPM', 'NFLX', 'MRK', 'CSCO', 'MMM', 'PG', 'MA', 'BA',
  'INTC', 'UNH', 'TMO', 'CRM', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA',
  'V', 'DIS', 'PYPL', 'BAC', 'WZ', 'AMD', 'INTU', 'ORCL', 'NKE', 'HON',
  'COST', 'HD', 'WMT', 'KO', 'PEP', 'ABT', 'PFE', 'XOM', 'CVX', 'LLY'
];

async function exportData() {
  const args = process.argv.slice(2);
  const allArg = args.includes('--all');
  const symbolArg = args.find(a => a.startsWith('--symbol='))?.split('=')[1];
  const fromArg = args.find(a => a.startsWith('--from='))?.split('=')[1];
  const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1];
  const timeframe = (args.find(a => a.startsWith('--timeframe='))?.split('=')[1] || 'minute') as 'minute' | 'hour' | 'day';
  const multiplier = parseInt(args.find(a => a.startsWith('--multiplier='))?.split('=')[1] || '1');
  
  if ((!allArg && !symbolArg) || !fromArg || !toArg) {
    console.error('Usage: \n  Single: npx tsx src/scripts/exportHistoricalData.ts --symbol=NVDA --from=YYYY-MM-DD --to=YYYY-MM-DD\n  All:    npx tsx src/scripts/exportHistoricalData.ts --all --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exit(1);
  }

  const symbols = allArg ? WATCHLIST : [symbolArg!.toUpperCase()];
  const apiKey = process.env.POLYGON_API_KEY;
  
  // Create exports directory
  const exportDir = path.resolve(__dirname, '../../exports');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);

  for (const symbol of symbols) {
    try {
      console.log(`\n📥 [${symbols.indexOf(symbol) + 1}/${symbols.length}] Fetching ${symbol}...`);
      
      const candles = await fetchHistoricalBars(apiKey!, symbol, fromArg!, toArg!, timeframe, multiplier, 50000);
      
      if (candles.length > 0) {
        const filename = `${symbol}_${fromArg}_to_${toArg}.json`;
        fs.writeFileSync(path.join(exportDir, filename), JSON.stringify(candles, null, 2));
        console.log(`✅ Saved ${candles.length} candles.`);
      }

      // Small delay to avoid API rate limits
      if (allArg) await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error: any) {
      console.error(`❌ Failed ${symbol}:`, error.message);
    }
  }
}

exportData();
