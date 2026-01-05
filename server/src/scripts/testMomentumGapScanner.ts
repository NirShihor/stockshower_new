import { runMomentumGapScan } from '../handlers/momentumGapScanner.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('Testing Momentum Gap Scanner...\n');
  
  if (!process.env.POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY not set in environment');
    process.exit(1);
  }
  
  await runMomentumGapScan();
  
  process.exit(0);
}

main().catch(error => {
  console.error('Scanner failed:', error);
  process.exit(1);
});
