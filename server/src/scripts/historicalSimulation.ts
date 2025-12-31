import { connectDatabase } from '../db/connection.js';
import { BacktestEngine } from '../backtesting/engine/backtestEngine.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function runHistoricalSimulation() {
  try {
    await connectDatabase();
    console.log('🚀 === 60-DAY HISTORICAL SIMULATION ===\n');

    const args = process.argv.slice(2);
    const fromArg = args.find(a => a.startsWith('--from='))?.split('=')[1];
    const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1];
    const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'polygon';
    const source = (sourceArg === 'local' ? 'local' : 'polygon') as 'polygon' | 'local';

    let endDate = toArg ? new Date(toArg) : new Date();
    // Default to the end of the day if just a date is provided
    if (toArg && !toArg.includes('T')) {
      endDate.setHours(23, 59, 59, 999);
    }

    let startDate = fromArg ? new Date(fromArg) : new Date(endDate.getTime() - (60 * 24 * 60 * 60 * 1000));
    // Default to start of day
    if (fromArg && !fromArg.includes('T')) {
      startDate.setHours(0, 0, 0, 0);
    }

    // Symbols derived from trade history / training insights
    const symbols = [
      'ADBE', 'META', 'JPM', 'NFLX', 'MRK', 
      'CSCO', 'MMM', 'PG', 'MA', 'BA', 
      'INTC', 'UNH', 'TMO', 'CRM', 'AAPL',
      'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA'
    ];

    console.log(`📅 PERIOD: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log(`📊 WATCHLIST: ${symbols.join(', ')}`);
    console.log(`🔌 SOURCE: ${source.toUpperCase()}`);
    console.log('');

    const config = {
      symbols: symbols,
      startDate: startDate,
      endDate: endDate,
      initialBalance: 100000,
      positionSizeGBP: 10000,
      maxConcurrentPositions: 10,
      enableAutoExecution: true,
      autoExecutionThreshold: 70, 
      enableCircuitBreaker: false,
      enableTrapFades: false,
      slippageModel: 'fixed' as const,
      slippageBps: 2,
      commissionPerTrade: 1.0,
      source: source // Pass the data source to the config
    };

    const engine = new BacktestEngine(config);

    console.log('🔍 RUNNING SIMULATION...');
    const startTime = Date.now();
    const results = await engine.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Backtest completed in ${duration}s`);
    
    // Performance Summary
    console.log('\n📈 === PERFORMANCE SUMMARY ===');
    console.log(`Total Trades: ${results.summary.totalTrades}`);
    console.log(`Win Rate: ${results.summary.winRate.toFixed(1)}%`);
    console.log(`Total P&L: $${results.summary.totalPnL.toFixed(2)}`);
    console.log(`ROI: ${results.summary.totalPnLPercent.toFixed(2)}%`);
    console.log(`Max Drawdown: ${results.summary.maxDrawdownPercent.toFixed(2)}%`);
    console.log(`Profit Factor: ${results.summary.profitFactor.toFixed(2)}`);
    
    // Pattern Performance
    console.log('\n🎨 === PATTERN PERFORMANCE ===');
    const sortedPatterns = Array.from(results.patternPerformance.entries())
      .sort((a, b) => b[1].totalPnL - a[1].totalPnL);

    sortedPatterns.forEach(([pattern, stats]) => {
      console.log(`${pattern.padEnd(25)} | Trades: ${stats.count.toString().padEnd(3)} | WR: ${stats.winRate.toFixed(1)}% | PnL: $${stats.totalPnL.toFixed(2)}`);
    });

    // Monthly Performance
    console.log('\n📅 === MONTHLY PERFORMANCE ===');
    const monthlyStats = new Map<string, { count: number, pnl: number, wins: number }>();
    
    // Sort trades by date first
    const sortedTrades = [...results.trades].sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    sortedTrades.forEach(t => {
        const date = new Date(t.entryTime);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyStats.has(month)) {
            monthlyStats.set(month, { count: 0, pnl: 0, wins: 0 });
        }
        const m = monthlyStats.get(month)!;
        m.count++;
        m.pnl += (t.pnl || 0); // Handle potential undefined pnl
        if ((t.pnl || 0) > 0) m.wins++;
    });

    monthlyStats.forEach((stats, month) => {
        const wr = stats.count > 0 ? (stats.wins / stats.count * 100) : 0;
        console.log(`${month} | Trades: ${stats.count.toString().padEnd(3)} | WR: ${wr.toFixed(1)}% | PnL: $${stats.pnl.toFixed(2)}`);
    });

    // Save Results
    const fs = await import('fs');
    const outPath = path.resolve(__dirname, '../../backtest_results_full.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to ${outPath}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Simulation failed:', error);
    process.exit(1);
  }
}

runHistoricalSimulation();
