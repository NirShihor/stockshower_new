import { Trade } from './src/db/models/Trade.js';
import { connectDatabase } from './src/db/connection.js';

// Simple function to get current stock price (you'll need to implement this with your preferred API)
async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    // Using a mock price for demonstration - replace with actual API call
    // You can use your existing Polygon API handler here
    
    // For now, I'll simulate by calculating based on entry + some random movement
    // In reality, you'd call Polygon API or another price source
    const mockPrices: Record<string, number> = {
      'AAPL': 185.50,
      'MSFT': 380.25,
      'GOOGL': 140.75,
      'AMZN': 145.30,
      'TSLA': 245.80,
      'META': 325.40,
      'NVDA': 875.20,
      'PFE': 28.45,
      'HD': 355.60,
      'PYPL': 62.15,
      'CRM': 235.80,
      'UNH': 545.30,
      'PG': 165.20,
      'NFLX': 485.75,
      'JNJ': 158.90,
      'CSCO': 56.80,
      'V': 285.40,
      'INTC': 24.85,
      'JPM': 195.75,
      'WMT': 165.85
    };
    
    return mockPrices[symbol] || null;
  } catch (error) {
    console.error(`Error getting price for ${symbol}:`, error);
    return null;
  }
}

async function calculateUnrealizedPnL() {
  try {
    await connectDatabase();
    console.log('=== CALCULATING UNREALIZED P&L FOR OPEN TRADES ===\n');
    
    // Get all open (filled) trades
    const openTrades = await Trade.find({
      status: 'filled'
    }).sort({ signalTime: -1 });
    
    console.log(`Found ${openTrades.length} open trades to analyze\n`);
    
    const results: any[] = [];
    let processedCount = 0;
    
    for (const trade of openTrades) {
      processedCount++;
      
      const entryPrice = trade.actualEntryPrice || trade.entryPrice;
      const stopLoss = trade.stopLoss;
      const takeProfit = trade.takeProfit;
      const direction = trade.direction;
      const symbol = trade.symbol;
      
      if (!entryPrice || !symbol) {
        console.log(`Skipping ${symbol} - missing entry price`);
        continue;
      }
      
      // Get current price (using mock data for now)
      const currentPrice = await getCurrentPrice(symbol);
      
      if (!currentPrice) {
        console.log(`Skipping ${symbol} - couldn't get current price`);
        continue;
      }
      
      // Calculate unrealized P&L
      let unrealizedPnL = 0;
      let exitReason = '';
      let wouldWin = false;
      
      if (direction === 'long') {
        unrealizedPnL = (currentPrice - entryPrice) * (trade.volume || 100);
        
        // Check if stopped out or hit target
        if (stopLoss && currentPrice <= stopLoss) {
          exitReason = 'stop_loss';
          unrealizedPnL = (stopLoss - entryPrice) * (trade.volume || 100);
        } else if (takeProfit && currentPrice >= takeProfit) {
          exitReason = 'take_profit';
          unrealizedPnL = (takeProfit - entryPrice) * (trade.volume || 100);
          wouldWin = true;
        } else {
          exitReason = 'current_market';
          wouldWin = unrealizedPnL > 0;
        }
      } else { // short
        unrealizedPnL = (entryPrice - currentPrice) * (trade.volume || 100);
        
        // Check if stopped out or hit target
        if (stopLoss && currentPrice >= stopLoss) {
          exitReason = 'stop_loss';
          unrealizedPnL = (entryPrice - stopLoss) * (trade.volume || 100);
        } else if (takeProfit && currentPrice <= takeProfit) {
          exitReason = 'take_profit';
          unrealizedPnL = (entryPrice - takeProfit) * (trade.volume || 100);
          wouldWin = true;
        } else {
          exitReason = 'current_market';
          wouldWin = unrealizedPnL > 0;
        }
      }
      
      const result = {
        symbol: trade.symbol,
        pattern: trade.patternName,
        score: trade.patternScore,
        direction: trade.direction,
        entryPrice,
        currentPrice,
        stopLoss,
        takeProfit,
        unrealizedPnL,
        unrealizedPnLPercent: ((unrealizedPnL / Math.abs(entryPrice * (trade.volume || 100))) * 100),
        exitReason,
        wouldWin,
        signalTime: trade.signalTime,
        // Market conditions from signal data
        marketConditions: trade.marketConditions || {},
        atSupport: trade.signalData?.context?.atSupport || false,
        atResistance: trade.signalData?.context?.atResistance || false,
        trend: trade.signalData?.context?.trend || 'unknown',
        volumeRatio: trade.signalData?.context?.volumeRatio || 1,
        isHighVolume: trade.signalData?.context?.isHighVolume || false
      };
      
      results.push(result);
      
      if (processedCount % 10 === 0) {
        console.log(`Processed ${processedCount}/${openTrades.length} trades...`);
      }
    }
    
    // Analysis of results
    console.log('\n=== UNREALIZED P&L ANALYSIS ===\n');
    
    const winners = results.filter(r => r.wouldWin);
    const losers = results.filter(r => !r.wouldWin);
    const winRate = (winners.length / results.length * 100);
    
    console.log(`Total analyzed: ${results.length}`);
    console.log(`Winners: ${winners.length}`);
    console.log(`Losers: ${losers.length}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}%`);
    
    const totalPnL = results.reduce((sum, r) => sum + r.unrealizedPnL, 0);
    const avgPnL = totalPnL / results.length;
    console.log(`Total Unrealized P&L: £${totalPnL.toFixed(2)}`);
    console.log(`Average P&L per trade: £${avgPnL.toFixed(2)}`);
    
    const avgWin = winners.length > 0 ? winners.reduce((sum, r) => sum + r.unrealizedPnL, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((sum, r) => sum + Math.abs(r.unrealizedPnL), 0) / losers.length : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
    
    console.log(`Average Win: £${avgWin.toFixed(2)}`);
    console.log(`Average Loss: £${avgLoss.toFixed(2)}`);
    console.log(`Profit Factor: ${profitFactor.toFixed(2)}`);
    
    // Pattern analysis
    console.log('\n=== PATTERN PERFORMANCE ===\n');
    const patternStats = results.reduce((acc, result) => {
      const pattern = result.pattern;
      if (!acc[pattern]) {
        acc[pattern] = { total: 0, wins: 0, totalPnL: 0, avgScore: 0 };
      }
      acc[pattern].total++;
      acc[pattern].avgScore += result.score;
      acc[pattern].totalPnL += result.unrealizedPnL;
      if (result.wouldWin) acc[pattern].wins++;
      return acc;
    }, {} as Record<string, any>);
    
    const sortedPatterns = Object.entries(patternStats)
      .map(([pattern, stats]) => ({
        pattern,
        total: stats.total,
        winRate: (stats.wins / stats.total * 100).toFixed(1),
        avgPnL: (stats.totalPnL / stats.total).toFixed(2),
        totalPnL: stats.totalPnL.toFixed(2),
        avgScore: (stats.avgScore / stats.total).toFixed(1)
      }))
      .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
    
    sortedPatterns.forEach(p => {
      console.log(`${p.pattern}: ${p.total} trades, ${p.winRate}% win, £${p.avgPnL} avg, Score: ${p.avgScore}`);
    });
    
    // Score range analysis
    console.log('\n=== SCORE RANGE ANALYSIS ===\n');
    const scoreRanges = [
      { min: 50, max: 60, label: '50-60' },
      { min: 60, max: 70, label: '60-70' },
      { min: 70, max: 80, label: '70-80' },
      { min: 80, max: 90, label: '80-90' },
      { min: 90, max: 100, label: '90-100' }
    ];
    
    scoreRanges.forEach(range => {
      const rangeResults = results.filter(r => r.score >= range.min && r.score < range.max);
      if (rangeResults.length > 0) {
        const rangeWinners = rangeResults.filter(r => r.wouldWin);
        const rangeWinRate = (rangeWinners.length / rangeResults.length * 100).toFixed(1);
        const rangeAvgPnL = (rangeResults.reduce((sum, r) => sum + r.unrealizedPnL, 0) / rangeResults.length).toFixed(2);
        console.log(`Score ${range.label}: ${rangeResults.length} trades, ${rangeWinRate}% win, £${rangeAvgPnL} avg`);
      }
    });
    
    // Market conditions analysis
    console.log('\n=== MARKET CONDITIONS ANALYSIS ===\n');
    
    const trendsAnalysis = ['up', 'down', 'sideways'].map(trend => {
      const trendResults = results.filter(r => r.trend === trend);
      if (trendResults.length > 0) {
        const trendWinners = trendResults.filter(r => r.wouldWin);
        const trendWinRate = (trendWinners.length / trendResults.length * 100).toFixed(1);
        const trendAvgPnL = (trendResults.reduce((sum, r) => sum + r.unrealizedPnL, 0) / trendResults.length).toFixed(2);
        return { trend, count: trendResults.length, winRate: trendWinRate, avgPnL: trendAvgPnL };
      }
      return null;
    }).filter(Boolean);
    
    trendsAnalysis.forEach(analysis => {
      if (analysis) {
        console.log(`${analysis.trend} trend: ${analysis.count} trades, ${analysis.winRate}% win, £${analysis.avgPnL} avg`);
      }
    });
    
    const highVolumeResults = results.filter(r => r.isHighVolume);
    if (highVolumeResults.length > 0) {
      const hvWinners = highVolumeResults.filter(r => r.wouldWin);
      const hvWinRate = (hvWinners.length / highVolumeResults.length * 100).toFixed(1);
      const hvAvgPnL = (highVolumeResults.reduce((sum, r) => sum + r.unrealizedPnL, 0) / highVolumeResults.length).toFixed(2);
      console.log(`High volume: ${highVolumeResults.length} trades, ${hvWinRate}% win, £${hvAvgPnL} avg`);
    }
    
    // Best and worst performers
    console.log('\n=== BEST PERFORMERS ===\n');
    const bestTrades = results
      .filter(r => r.wouldWin)
      .sort((a, b) => b.unrealizedPnL - a.unrealizedPnL)
      .slice(0, 5);
    
    bestTrades.forEach((trade, i) => {
      console.log(`${i+1}. ${trade.symbol} ${trade.pattern} (Score: ${trade.score}): £${trade.unrealizedPnL.toFixed(2)}`);
    });
    
    console.log('\n=== WORST PERFORMERS ===\n');
    const worstTrades = results
      .filter(r => !r.wouldWin)
      .sort((a, b) => a.unrealizedPnL - b.unrealizedPnL)
      .slice(0, 5);
    
    worstTrades.forEach((trade, i) => {
      console.log(`${i+1}. ${trade.symbol} ${trade.pattern} (Score: ${trade.score}): £${trade.unrealizedPnL.toFixed(2)}`);
    });
    
    // Recommendations
    console.log('\n=== RECOMMENDATIONS FOR FILTERING ===\n');
    
    // Find best score threshold
    const bestScoreRange = scoreRanges
      .map(range => {
        const rangeResults = results.filter(r => r.score >= range.min && r.score < range.max);
        if (rangeResults.length >= 5) {
          const rangeWinners = rangeResults.filter(r => r.wouldWin);
          return {
            range: range.label,
            winRate: rangeWinners.length / rangeResults.length * 100,
            count: rangeResults.length,
            avgPnL: rangeResults.reduce((sum, r) => sum + r.unrealizedPnL, 0) / rangeResults.length
          };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => (b?.winRate || 0) - (a?.winRate || 0))[0];
    
    if (bestScoreRange) {
      console.log(`Best score range: ${bestScoreRange.range} (${bestScoreRange.winRate.toFixed(1)}% win rate, ${bestScoreRange.count} trades)`);
    }
    
    // Find best patterns
    const profitablePatterns = sortedPatterns.filter(p => 
      parseFloat(p.winRate) > 50 && p.total >= 3 && parseFloat(p.avgPnL) > 0
    );
    
    if (profitablePatterns.length > 0) {
      console.log('\nProfitable patterns to focus on:');
      profitablePatterns.forEach(p => {
        console.log(`- ${p.pattern}: ${p.winRate}% win rate, £${p.avgPnL} avg P&L`);
      });
    }
    
    // Find patterns to avoid
    const badPatterns = sortedPatterns.filter(p => 
      parseFloat(p.winRate) < 40 && p.total >= 5
    );
    
    if (badPatterns.length > 0) {
      console.log('\nPatterns to avoid:');
      badPatterns.forEach(p => {
        console.log(`- ${p.pattern}: ${p.winRate}% win rate, £${p.avgPnL} avg P&L`);
      });
    }
    
    // Export detailed results
    console.log(`\n=== SAVING DETAILED RESULTS ===\n`);
    const fs = await import('fs');
    const detailedResults = {
      summary: {
        totalTrades: results.length,
        winners: winners.length,
        losers: losers.length,
        winRate: winRate,
        totalPnL: totalPnL,
        avgPnL: avgPnL,
        profitFactor: profitFactor
      },
      patternAnalysis: sortedPatterns,
      scoreAnalysis: scoreRanges.map(range => {
        const rangeResults = results.filter(r => r.score >= range.min && r.score < range.max);
        if (rangeResults.length > 0) {
          const rangeWinners = rangeResults.filter(r => r.wouldWin);
          return {
            range: range.label,
            trades: rangeResults.length,
            winRate: (rangeWinners.length / rangeResults.length * 100),
            avgPnL: rangeResults.reduce((sum, r) => sum + r.unrealizedPnL, 0) / rangeResults.length
          };
        }
        return null;
      }).filter(Boolean),
      allTrades: results
    };
    
    fs.writeFileSync('unrealized_pnl_analysis.json', JSON.stringify(detailedResults, null, 2));
    console.log('Detailed results saved to: unrealized_pnl_analysis.json');
    
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

calculateUnrealizedPnL();