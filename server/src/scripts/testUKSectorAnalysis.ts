import dotenv from 'dotenv';
dotenv.config();

import { getSectorAnalysis, getStockSector } from '../services/sectorAnalysisService.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

async function testUKSectorAnalysis() {
  console.log('Testing UK Sector Analysis for CAN SLIM...\n');

  // Initialize MetaAPI for UK data
  metaApiHandler.reinitialize();
  await new Promise(resolve => setTimeout(resolve, 3000));

  const today = new Date().toISOString().split('T')[0];

  // Test 1: Get UK Sector Analysis
  console.log('='.repeat(60));
  console.log('TEST 1: UK Sector Analysis');
  console.log('='.repeat(60));

  const ukSectorAnalysis = await getSectorAnalysis(today, 0, 'UK');

  if (ukSectorAnalysis) {
    console.log(`\nMarket: ${ukSectorAnalysis.market}`);
    console.log(`Timestamp: ${ukSectorAnalysis.timestamp}`);
    console.log(`\nSector Rankings:`);
    for (const sector of ukSectorAnalysis.sectors) {
      console.log(`  ${sector.rank}. ${sector.name} (${sector.symbol}): ${sector.changePercent >= 0 ? '+' : ''}${sector.changePercent.toFixed(2)}% | Momentum: ${sector.momentum}`);
    }
    console.log(`\nLeaders: ${ukSectorAnalysis.leaders.join(', ')}`);
    console.log(`Laggards: ${ukSectorAnalysis.laggards.join(', ')}`);
    console.log(`Rotation Warning: ${ukSectorAnalysis.rotationWarning ? 'YES' : 'No'}`);
  } else {
    console.log('ERROR: Failed to get UK sector analysis');
  }

  // Test 2: UK Stock to Sector Mapping
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: UK Stock to Sector Mapping');
  console.log('='.repeat(60));

  const testStocks = [
    'SHEL', 'BP',     // Energy
    'AZN', 'GSK',     // Healthcare
    'HSBA', 'BARC', 'LLOY',  // Financials
    'RIO', 'GLEN',    // Materials
    'VOD', 'BT',      // Communications
    'ULVR', 'DGE',    // Consumer Staples
    'NXT', 'MKS',     // Consumer Discretionary
    'SSE', 'NG',      // Utilities
    'BAES', 'RR',     // Industrials
    'SAGE',           // Technology
    'LAND', 'BLND',   // Real Estate
  ];

  console.log('\nStock -> Sector Mapping:');
  for (const stock of testStocks) {
    const sector = getStockSector(stock, 'UK');
    const status = sector !== 'unknown' ? '✓' : '✗';
    console.log(`  ${status} ${stock.padEnd(6)} -> ${sector}`);
  }

  // Count mapped vs unmapped
  const mapped = testStocks.filter(s => getStockSector(s, 'UK') !== 'unknown').length;
  console.log(`\nMapped: ${mapped}/${testStocks.length}`);

  // Test 3: Sector matching for CAN SLIM
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Sector Matching for CAN SLIM');
  console.log('='.repeat(60));

  if (ukSectorAnalysis) {
    console.log('\nChecking if stocks match sector rankings:');
    for (const stock of ['SHEL', 'AZN', 'HSBA', 'VOD', 'RIO']) {
      const stockSector = getStockSector(stock, 'UK');
      const sectorData = ukSectorAnalysis.sectors.find(s => s.sector === stockSector);

      if (sectorData) {
        const isLeading = ukSectorAnalysis.leaders.includes(sectorData.name);
        const status = sectorData.rank <= 5 && sectorData.momentum !== 'losing' ? 'PASS' : 'FAIL';
        console.log(`  ${stock}: ${sectorData.name} (Rank #${sectorData.rank}, ${sectorData.momentum}) -> ${status}`);
      } else {
        console.log(`  ${stock}: Sector "${stockSector}" not found in analysis`);
      }
    }
  }

  // Test 4: Compare US vs UK sector mapping
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: US vs UK Sector Function');
  console.log('='.repeat(60));

  console.log('\nSame symbol, different markets:');
  const sharedSymbols = ['BP', 'HSBA', 'VOD', 'RIO'];  // These are UK stocks
  for (const sym of sharedSymbols) {
    const usSector = getStockSector(sym, 'US');
    const ukSector = getStockSector(sym, 'UK');
    console.log(`  ${sym}: US="${usSector}", UK="${ukSector}"`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete.');
  console.log('='.repeat(60));

  process.exit(0);
}

testUKSectorAnalysis().catch(console.error);
