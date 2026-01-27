
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsPath = path.resolve(__dirname, '../../backtest_results_full.json');

interface Trade {
    id: string;
    symbol: string;
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    exitPrice: number;
    direction: 'long' | 'short';
    pnl: number;
    signal: {
        pattern: {
            name: string;
        };
    };
    exitReason: string;
}

interface Results {
    summary: any;
    trades: Trade[];
}

function analyze() {
    if (!fs.existsSync(resultsPath)) {
        console.error('No results file found at:', resultsPath);
        process.exit(1);
    }

    const data: Results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    const trades = data.trades.sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    console.log(`\n🔍 === DEEP DIVE ANALYSIS (${trades.length} Trades) ===\n`);

    // 1. Symbol Performance
    const bySymbol = new Map<string, { count: number, pnl: number, wins: number }>();
    trades.forEach(t => {
        if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, { count: 0, pnl: 0, wins: 0 });
        const s = bySymbol.get(t.symbol)!;
        s.count++;
        s.pnl += t.pnl;
        if (t.pnl > 0) s.wins++;
    });

    console.log('📊 BY SYMBOL:');
    Array.from(bySymbol.entries())
        .sort((a, b) => b[1].pnl - a[1].pnl)
        .forEach(([sym, stats]) => {
            const wr = (stats.wins / stats.count) * 100;
            console.log(`${sym.padEnd(6)} | Trades: ${stats.count} | WR: ${wr.toFixed(1)}% | PnL: $${stats.pnl.toFixed(2)}`);
        });

    // 2. Direction Performance
    const byDir = new Map<string, { count: number, pnl: number, wins: number }>();
    trades.forEach(t => {
        if (!byDir.has(t.direction)) byDir.set(t.direction, { count: 0, pnl: 0, wins: 0 });
        const s = byDir.get(t.direction)!;
        s.count++;
        s.pnl += t.pnl;
        if (t.pnl > 0) s.wins++;
    });

    console.log('\n↔️ BY DIRECTION:');
    Array.from(byDir.entries()).forEach(([dir, stats]) => {
        const wr = (stats.wins / stats.count) * 100;
        console.log(`${dir.padEnd(6)} | Trades: ${stats.count} | WR: ${wr.toFixed(1)}% | PnL: $${stats.pnl.toFixed(2)}`);
    });

    // 3. April vs Nov Comparison
    const aprilTrades = trades.filter(t => new Date(t.entryTime).getMonth() === 3); // April is index 3
    const novTrades = trades.filter(t => new Date(t.entryTime).getMonth() === 10); // Nov is index 10

    console.log('\n🗓️ APRIL vs NOVEMBER Breakdown:');
    
    function analyzeMonth(name: string, monthTrades: Trade[]) {
        console.log(`\n--- ${name} (${monthTrades.length} Trades) ---`);
        const pnl = monthTrades.reduce((sum, t) => sum + t.pnl, 0);
        console.log(`Total PnL: $${pnl.toFixed(2)}`);
        
        // Top winning pattern
        const pat = new Map<string, number>();
        monthTrades.forEach(t => {
            pat.set(t.signal.pattern.name, (pat.get(t.signal.pattern.name) || 0) + t.pnl);
        });
        const bestPat = Array.from(pat.entries()).sort((a,b) => b[1] - a[1])[0];
        const worstPat = Array.from(pat.entries()).sort((a,b) => a[1] - b[1])[0];
        
        console.log(`Best Pattern: ${bestPat ? bestPat[0] + ' ($' + bestPat[1].toFixed(2) + ')' : 'None'}`);
        console.log(`Worst Pattern: ${worstPat ? worstPat[0] + ' ($' + worstPat[1].toFixed(2) + ')' : 'None'}`);

        // Long vs Short PnL
        const longPnL = monthTrades.filter(t => t.direction === 'long').reduce((s,t) => s + t.pnl, 0);
        const shortPnL = monthTrades.filter(t => t.direction === 'short').reduce((s,t) => s + t.pnl, 0);
        console.log(`Long PnL: $${longPnL.toFixed(2)} | Short PnL: $${shortPnL.toFixed(2)}`);
    }

    analyzeMonth('APRIL', aprilTrades);
    analyzeMonth('NOVEMBER', novTrades);

    // 4. Pattern Deep Dive
     console.log('\n🎨 PATTERN PERFORMANCE (FULL YEAR):');
     const byPattern = new Map<string, { count: number, pnl: number, wins: number }>();
     trades.forEach(t => {
         const name = t.signal.pattern.name;
         if (!byPattern.has(name)) byPattern.set(name, { count: 0, pnl: 0, wins: 0 });
         const s = byPattern.get(name)!;
         s.count++;
         s.pnl += t.pnl;
         if (t.pnl > 0) s.wins++;
     });
     
     Array.from(byPattern.entries())
        .sort((a, b) => b[1].pnl - a[1].pnl)
        .forEach(([pat, stats]) => {
             const wr = (stats.wins / stats.count) * 100;
             console.log(`${pat.padEnd(25)} | Trades: ${stats.count} | WR: ${wr.toFixed(1)}% | PnL: $${stats.pnl.toFixed(2)}`);
        });

}

analyze();
