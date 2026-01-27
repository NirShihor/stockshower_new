import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { runFlexibleBacktest, LARGE_CAP_SYMBOLS } from '../engine/flexibleBacktestEngine.js';
import {
  FlexibleBacktestConfig,
  EntryStrategy,
  EntryTiming,
  StopLossStrategy,
  TargetStrategy,
  TradeDirection
} from '../types/flexibleBacktestTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function printUsage() {
  console.log(`
Flexible Backtest Runner

Usage: npx tsx src/backtesting/scripts/runFlexibleBacktest.ts [options]

Entry Options:
  --entry=<strategy>        Entry strategy: drop_from_open, drop_from_vwap, below_vwap, breakout_high, breakout_low
  --entry-threshold=<n>     Entry threshold % (default: 2)
  --entry-timing=<timing>   Entry timing: immediate, candle_close, pullback (default: immediate)
  --confirm-candles=<n>     Confirmation candles for candle_close timing (default: 1)

Stop Loss Options:
  --stop=<strategy>         Stop strategy: fixed_percent, atr_based, below_low, trailing
  --stop-value=<n>          Stop value (% or ATR multiplier) (default: 1)
  --trailing-activation=<n> % profit before trailing activates (default: 0.5)
  --trailing-distance=<n>   Trailing stop distance % (default: same as stop-value)

Target Options:
  --target=<strategy>       Target strategy: fixed_rr, fixed_percent, vwap, open_price, eod_hold
  --target-value=<n>        Target value (R:R ratio or %) (default: 2)

Filter Options:
  --direction=<dir>         Trade direction: long, short, both (default: long)
  --min-price=<n>           Minimum stock price (default: 20)
  --max-price=<n>           Maximum stock price (default: 500)
  --window-start=<n>        Trading window start (minutes after open) (default: 30)
  --window-end=<n>          Trading window end (minutes after open) (default: 330)
  --no-spy-filter           Disable SPY filter
  --spy-threshold=<n>       SPY drop % to skip day (default: 1.5)

Position Options:
  --size=<n>                Position size $ (default: 10000)
  --max-trades=<n>          Max daily trades (default: 5)
  --commission=<n>          Commission per trade $ (default: 1)
  --slippage=<n>            Slippage in basis points (default: 2)

Date Range:
  --from=<date>             Start date YYYY-MM-DD (default: 1 month ago)
  --to=<date>               End date YYYY-MM-DD (default: today)

Output:
  --output=<file>           Output file path (default: flexible_backtest_results.json)
  --quiet                   Suppress trade-by-trade output

Examples:
  # Mean reversion style (buy dips, target VWAP)
  npx tsx src/backtesting/scripts/runFlexibleBacktest.ts --entry=drop_from_open --entry-threshold=2 --target=vwap --stop=fixed_percent --stop-value=1

  # Breakout style (buy breakouts, fixed R:R)
  npx tsx src/backtesting/scripts/runFlexibleBacktest.ts --entry=breakout_high --target=fixed_rr --target-value=2 --stop=atr_based --stop-value=1.5

  # Trailing stop test
  npx tsx src/backtesting/scripts/runFlexibleBacktest.ts --entry=drop_from_open --stop=trailing --stop-value=0.5 --trailing-activation=0.5 --target=eod_hold
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  
  if (!process.env.POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY not set in environment');
    process.exit(1);
  }
  
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);
  
  const endDate = getArg('to') || new Date().toISOString().split('T')[0];
  const startDate = getArg('from') || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })();
  
  const entryStrategy = (getArg('entry') || 'drop_from_open') as EntryStrategy;
  const entryThreshold = parseFloat(getArg('entry-threshold') || '2');
  const entryTiming = (getArg('entry-timing') || 'immediate') as EntryTiming;
  const confirmationCandles = parseInt(getArg('confirm-candles') || '1');
  
  const stopLossStrategy = (getArg('stop') || 'fixed_percent') as StopLossStrategy;
  const stopLossValue = parseFloat(getArg('stop-value') || '1');
  const trailingActivation = parseFloat(getArg('trailing-activation') || '0.5');
  const trailingDistance = parseFloat(getArg('trailing-distance') || String(stopLossValue));
  
  const targetStrategy = (getArg('target') || 'fixed_rr') as TargetStrategy;
  const targetValue = parseFloat(getArg('target-value') || '2');
  
  const direction = (getArg('direction') || 'long') as TradeDirection;
  const minPrice = parseFloat(getArg('min-price') || '20');
  const maxPrice = parseFloat(getArg('max-price') || '500');
  const tradingWindowStart = parseInt(getArg('window-start') || '30');
  const tradingWindowEnd = parseInt(getArg('window-end') || '330');
  const useSpyFilter = !hasFlag('no-spy-filter');
  const spyFilterThreshold = parseFloat(getArg('spy-threshold') || '1.5');
  
  const positionSize = parseFloat(getArg('size') || '10000');
  const maxDailyTrades = parseInt(getArg('max-trades') || '5');
  const commissionPerTrade = parseFloat(getArg('commission') || '1');
  const slippageBps = parseFloat(getArg('slippage') || '2');
  
  const outputFile = getArg('output') || 'flexible_backtest_results.json';
  
  const config: FlexibleBacktestConfig = {
    startDate,
    endDate,
    entryStrategy,
    entryThreshold,
    entryTiming,
    confirmationCandles,
    stopLossStrategy,
    stopLossValue,
    trailingActivation,
    trailingDistance,
    targetStrategy,
    targetValue,
    positionSize,
    maxDailyTrades,
    direction,
    minPrice,
    maxPrice,
    tradingWindowStart,
    tradingWindowEnd,
    useSpyFilter,
    spyFilterThreshold,
    symbols: LARGE_CAP_SYMBOLS,
    commissionPerTrade,
    slippageBps
  };
  
  console.log('📊 Flexible Backtest Runner\n');
  console.log('Configuration:');
  console.log(`  Entry: ${entryStrategy} @ ${entryThreshold}% (${entryTiming})`);
  console.log(`  Stop: ${stopLossStrategy} @ ${stopLossValue}${stopLossStrategy === 'atr_based' ? 'x ATR' : '%'}`);
  if (stopLossStrategy === 'trailing') {
    console.log(`  Trailing: activates at ${trailingActivation}%, distance ${trailingDistance}%`);
  }
  console.log(`  Target: ${targetStrategy} @ ${targetValue}${targetStrategy === 'fixed_rr' ? ':1 R:R' : targetStrategy === 'fixed_percent' ? '%' : ''}`);
  console.log(`  Direction: ${direction}`);
  console.log(`  Window: ${tradingWindowStart}-${tradingWindowEnd} mins after open`);
  console.log(`  SPY Filter: ${useSpyFilter ? `ON (skip if < -${spyFilterThreshold}%)` : 'OFF'}`);
  console.log(`  Position: $${positionSize}, max ${maxDailyTrades}/day`);
  console.log(`  Period: ${startDate} to ${endDate}`);
  console.log(`  Symbols: ${LARGE_CAP_SYMBOLS.length} large caps\n`);
  
  const result = await runFlexibleBacktest(config);
  
  const resultForJson = {
    ...result,
    bySymbol: Object.fromEntries(result.bySymbol)
  };
  
  const outputPath = path.resolve(__dirname, '../../../', outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(resultForJson, null, 2));
  console.log(`\n💾 Results saved to ${outputPath}`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('Backtest failed:', error);
  process.exit(1);
});
