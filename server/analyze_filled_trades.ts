// @ts-nocheck
import { Trade } from './src/db/models/Trade.js';
import { connectDatabase } from './src/db/connection.js';

async function analyzeFilledTrades() {
  try {
    await connectDatabase();
    console.log('=== ANALYZING ALL FILLED TRADES ===');
    
    // Get all filled trades (both closed and open)
    const filledTrades = await Trade.find({
      status: { $in: ['filled', 'closed'] }
    }).sort({ signalTime: -1 });
    
    console.log(`Total filled trades: ${filledTrades.length}`);
    
    // Breakdown by status
    const statusBreakdown = filledTrades.reduce((acc, trade) => {
      acc[trade.status] = (acc[trade.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n=== STATUS BREAKDOWN ===');
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`${status}: ${count}`);
    });
    
    // Look for any P&L data in filled trades
    const tradesWithPnL = filledTrades.filter(trade => 
      trade.pnlAmount !== undefined && trade.pnlAmount !== null
    );
    
    console.log(`\nTrades with P&L data: ${tradesWithPnL.length}`);
    
    if (tradesWithPnL.length > 0) {
      const winners = tradesWithPnL.filter(t => t.pnlAmount! > 0);
      const losers = tradesWithPnL.filter(t => t.pnlAmount! < 0);
      const breakeven = tradesWithPnL.filter(t => t.pnlAmount === 0);
      
      console.log(`Winners: ${winners.length}`);
      console.log(`Losers: ${losers.length}`);
      console.log(`Breakeven: ${breakeven.length}`);
      
      if (tradesWithPnL.length > 0) {
        const winRate = (winners.length / tradesWithPnL.length * 100).toFixed(1);
        console.log(`Win Rate: ${winRate}%`);
      }
    }
    
    // Check for exit reasons
    const exitReasons = filledTrades.reduce((acc, trade) => {
      if (trade.exitReason) {
        acc[trade.exitReason] = (acc[trade.exitReason] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n=== EXIT REASONS IN FILLED TRADES ===');
    Object.entries(exitReasons).forEach(([reason, count]) => {
      console.log(`${reason}: ${count}`);
    });
    
    // Look at recent filled trades
    console.log('\n=== RECENT FILLED TRADES ===');
    filledTrades.slice(0, 20).forEach(trade => {
      const pnl = trade.pnlAmount ? `P&L: £${trade.pnlAmount.toFixed(2)}` : 'No P&L';
      const exit = trade.exitReason ? `Exit: ${trade.exitReason}` : 'No exit';
      console.log(`${trade.symbol} | ${trade.patternName} | ${trade.status} | ${pnl} | ${exit} | Score: ${trade.patternScore}`);
    });
    
    // Look for any unrealized P&L calculation possibilities
    const openTrades = filledTrades.filter(t => t.status === 'filled');
    console.log(`\n=== OPEN TRADES ===`);
    console.log(`Open trades count: ${openTrades.length}`);
    
    if (openTrades.length > 0) {
      console.log('\nSample open trades:');
      openTrades.slice(0, 10).forEach(trade => {
        console.log(`${trade.symbol} | ${trade.patternName} | Entry: £${trade.entryPrice || trade.actualEntryPrice || 'Unknown'} | Stop: £${trade.stopLoss || 'Unknown'} | Score: ${trade.patternScore}`);
      });
    }
    
    // Pattern analysis for filled trades
    console.log('\n=== PATTERN PERFORMANCE (FILLED TRADES) ===');
    const patternStats = filledTrades.reduce((acc, trade) => {
      const pattern = trade.patternName;
      if (!acc[pattern]) {
        acc[pattern] = { total: 0, withPnL: 0, totalPnL: 0, winners: 0 };
      }
      acc[pattern].total++;
      if (trade.pnlAmount !== undefined && trade.pnlAmount !== null) {
        acc[pattern].withPnL++;
        acc[pattern].totalPnL += trade.pnlAmount;
        if (trade.pnlAmount > 0) acc[pattern].winners++;
      }
      return acc;
    }, {} as Record<string, any>);
    
    Object.entries(patternStats)
      .sort(([,a], [,b]) => b.total - a.total)
      .slice(0, 15)
      .forEach(([pattern, stats]) => {
        const winRate = stats.withPnL > 0 ? (stats.winners / stats.withPnL * 100).toFixed(1) : 'N/A';
        console.log(`${pattern}: ${stats.total} filled, ${stats.withPnL} with P&L, ${winRate}% win rate`);
      });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyzeFilledTrades();