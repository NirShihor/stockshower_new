import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsPath = path.resolve(__dirname, '../../gap_and_go_backtest_results.json');
const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

const symbols = new Set<string>();
for (const trade of data.trades) {
  symbols.add(trade.symbol);
}

const sortedSymbols = Array.from(symbols).sort();

console.log(`\n=== ${sortedSymbols.length} UNIQUE SYMBOLS TRADED ===\n`);
console.log(sortedSymbols.join(', '));

console.log('\n\nThese are mostly small-cap/micro-cap stocks.');
console.log('FxPro and most CFD brokers typically only offer large-cap stocks (S&P 500, NASDAQ 100).');
console.log('\nYou would need a broker that offers US small-cap stocks as CFDs, or trade them directly via a US broker.');
