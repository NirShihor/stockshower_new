import dotenv from 'dotenv';
dotenv.config();

import { getMarketContext } from '../services/marketContextService.js';

const date = process.argv[2] || new Date().toISOString().split('T')[0];

async function main() {
  console.log(`\nChecking market context for ${date}...\n`);
  
  const ctx = await getMarketContext(date);
  
  if (!ctx) {
    console.log('Failed to get market context');
    return;
  }
  
  console.log('='.repeat(50));
  console.log(`MARKET REGIME: ${ctx.regime.toUpperCase()}`);
  console.log('='.repeat(50));
  console.log(`\nReason: ${ctx.regimeReason}\n`);
  
  console.log('SPY (S&P 500):');
  console.log(`  Price: $${ctx.spy.current.toFixed(2)}`);
  console.log(`  Trend: ${ctx.spy.trend}`);
  console.log(`  Week: ${ctx.spy.weekChangePercent >= 0 ? '+' : ''}${ctx.spy.weekChangePercent}%`);
  console.log(`  Above 20 EMA: ${ctx.spy.aboveEma20 ? 'Yes' : 'No'}`);
  
  console.log('\nQQQ (Nasdaq 100):');
  console.log(`  Price: $${ctx.qqq.current.toFixed(2)}`);
  console.log(`  Trend: ${ctx.qqq.trend}`);
  console.log(`  Week: ${ctx.qqq.weekChangePercent >= 0 ? '+' : ''}${ctx.qqq.weekChangePercent}%`);
  console.log(`  Above 20 EMA: ${ctx.qqq.aboveEma20 ? 'Yes' : 'No'}`);
  
  console.log('\nVIX (Fear Index):');
  console.log(`  Level: ${ctx.vix.current.toFixed(1)}`);
  const vixLevel = ctx.vix.current < 15 ? 'LOW (complacent)' : 
                   ctx.vix.current > 25 ? 'HIGH (fearful)' :
                   ctx.vix.current > 20 ? 'ELEVATED' : 'MODERATE';
  console.log(`  Reading: ${vixLevel}`);
  
  console.log('\n' + '='.repeat(50));
  console.log(`RECOMMENDATION: ${ctx.regime === 'risk-on' ? 'OK to trade breakouts' : 'Stay cautious / reduce exposure'}`);
  console.log('='.repeat(50) + '\n');
}

main().catch(console.error);
