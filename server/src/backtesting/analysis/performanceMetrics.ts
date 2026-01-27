import { BacktestResults, BacktestPosition } from '../types/backtestTypes.js';

export class PerformanceAnalyzer {
  
  static generateDetailedReport(results: BacktestResults): string {
    const { summary, trades, patternPerformance } = results;
    
    let report = `
BACKTEST PERFORMANCE REPORT
===========================

Test Period: ${results.config.startDate.toLocaleDateString()} - ${results.config.endDate.toLocaleDateString()}
Symbols Tested: ${results.config.symbols.join(', ')}
Initial Balance: $${results.config.initialBalance.toFixed(2)}

OVERALL PERFORMANCE
-------------------
Total Trades: ${summary.totalTrades}
Win Rate: ${summary.winRate.toFixed(2)}% (${summary.winningTrades}W / ${summary.losingTrades}L)
Total P&L: $${summary.totalPnL.toFixed(2)} (${summary.totalPnLPercent.toFixed(2)}%)
Max Drawdown: ${summary.maxDrawdownPercent.toFixed(2)}%

RISK METRICS
------------
Sharpe Ratio: ${summary.sharpeRatio.toFixed(2)}
Profit Factor: ${summary.profitFactor.toFixed(2)}
Average Win: $${summary.averageWin.toFixed(2)}
Average Loss: $${summary.averageLoss.toFixed(2)}
Largest Win: $${summary.largestWin.toFixed(2)}
Largest Loss: $${summary.largestLoss.toFixed(2)}

CONSISTENCY
-----------
Max Consecutive Wins: ${summary.consecutiveWins}
Max Consecutive Losses: ${summary.consecutiveLosses}
Time in Market: ${summary.timeInMarket.toFixed(2)}%

PATTERN PERFORMANCE
-------------------`;

    // Add pattern performance
    const sortedPatterns = Array.from(patternPerformance.entries())
      .sort((a, b) => b[1].totalPnL - a[1].totalPnL);

    for (const [pattern, stats] of sortedPatterns) {
      report += `
${pattern}:
  Trades: ${stats.count}
  Win Rate: ${stats.winRate.toFixed(2)}%
  Avg P&L: $${stats.avgPnL.toFixed(2)}
  Total P&L: $${stats.totalPnL.toFixed(2)}`;
    }

    return report;
  }

  static calculateMonthlyReturns(results: BacktestResults): Map<string, number> {
    const monthlyReturns = new Map<string, number>();
    
    for (const trade of results.trades) {
      if (!trade.exitTime) continue;
      
      const monthKey = `${trade.exitTime.getFullYear()}-${(trade.exitTime.getMonth() + 1).toString().padStart(2, '0')}`;
      const currentReturn = monthlyReturns.get(monthKey) || 0;
      monthlyReturns.set(monthKey, currentReturn + trade.pnl!);
    }
    
    return monthlyReturns;
  }

  static analyzeTimeOfDay(results: BacktestResults): Map<number, { count: number; winRate: number; avgPnL: number }> {
    const hourlyStats = new Map<number, { wins: number; losses: number; totalPnL: number }>();
    
    // Initialize hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats.set(hour, { wins: 0, losses: 0, totalPnL: 0 });
    }
    
    // Analyze trades by hour
    for (const trade of results.trades) {
      const hour = trade.entryTime.getHours();
      const stats = hourlyStats.get(hour)!;
      
      if (trade.pnl! > 0) {
        stats.wins++;
      } else {
        stats.losses++;
      }
      stats.totalPnL += trade.pnl!;
    }
    
    // Calculate final metrics
    const hourlyMetrics = new Map<number, { count: number; winRate: number; avgPnL: number }>();
    for (const [hour, stats] of hourlyStats) {
      const totalTrades = stats.wins + stats.losses;
      if (totalTrades > 0) {
        hourlyMetrics.set(hour, {
          count: totalTrades,
          winRate: (stats.wins / totalTrades) * 100,
          avgPnL: stats.totalPnL / totalTrades
        });
      }
    }
    
    return hourlyMetrics;
  }

  static analyzeHoldingPeriods(results: BacktestResults): {
    avgHoldingMinutes: number;
    winnerAvgMinutes: number;
    loserAvgMinutes: number;
    distribution: Map<string, number>;
  } {
    let totalMinutes = 0;
    let winnerMinutes = 0;
    let loserMinutes = 0;
    let winnerCount = 0;
    let loserCount = 0;
    
    const distribution = new Map<string, number>([
      ['< 5 min', 0],
      ['5-15 min', 0],
      ['15-30 min', 0],
      ['30-60 min', 0],
      ['1-2 hours', 0],
      ['> 2 hours', 0]
    ]);
    
    for (const trade of results.trades) {
      if (!trade.exitTime) continue;
      
      const holdingMinutes = (trade.exitTime.getTime() - trade.entryTime.getTime()) / (1000 * 60);
      totalMinutes += holdingMinutes;
      
      if (trade.pnl! > 0) {
        winnerMinutes += holdingMinutes;
        winnerCount++;
      } else {
        loserMinutes += holdingMinutes;
        loserCount++;
      }
      
      // Update distribution
      if (holdingMinutes < 5) distribution.set('< 5 min', distribution.get('< 5 min')! + 1);
      else if (holdingMinutes < 15) distribution.set('5-15 min', distribution.get('5-15 min')! + 1);
      else if (holdingMinutes < 30) distribution.set('15-30 min', distribution.get('15-30 min')! + 1);
      else if (holdingMinutes < 60) distribution.set('30-60 min', distribution.get('30-60 min')! + 1);
      else if (holdingMinutes < 120) distribution.set('1-2 hours', distribution.get('1-2 hours')! + 1);
      else distribution.set('> 2 hours', distribution.get('> 2 hours')! + 1);
    }
    
    return {
      avgHoldingMinutes: results.trades.length > 0 ? totalMinutes / results.trades.length : 0,
      winnerAvgMinutes: winnerCount > 0 ? winnerMinutes / winnerCount : 0,
      loserAvgMinutes: loserCount > 0 ? loserMinutes / loserCount : 0,
      distribution
    };
  }

  static findBestAndWorstDays(results: BacktestResults): {
    bestDays: Array<{ date: string; pnl: number; trades: number }>;
    worstDays: Array<{ date: string; pnl: number; trades: number }>;
  } {
    const dailyPnL = new Map<string, { pnl: number; trades: number }>();
    
    for (const trade of results.trades) {
      if (!trade.exitTime) continue;
      
      const dateKey = trade.exitTime.toLocaleDateString();
      const current = dailyPnL.get(dateKey) || { pnl: 0, trades: 0 };
      current.pnl += trade.pnl!;
      current.trades++;
      dailyPnL.set(dateKey, current);
    }
    
    const dailyArray = Array.from(dailyPnL.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => b.pnl - a.pnl);
    
    return {
      bestDays: dailyArray.slice(0, 5),
      worstDays: dailyArray.slice(-5).reverse()
    };
  }

  static calculateRiskAdjustedMetrics(results: BacktestResults): {
    calmarRatio: number;
    sortinoRatio: number;
    ulcerIndex: number;
  } {
    const returns = results.equityCurve.map((point, idx) => {
      if (idx === 0) return 0;
      return (point.balance - results.equityCurve[idx - 1].balance) / results.equityCurve[idx - 1].balance;
    });

    // Calmar Ratio (annual return / max drawdown)
    const annualReturn = (results.summary.totalPnLPercent / 100) * 
      (252 / results.trades.length); // Rough annualization
    const calmarRatio = results.summary.maxDrawdownPercent > 0 
      ? annualReturn / (results.summary.maxDrawdownPercent / 100)
      : 0;

    // Sortino Ratio (only considers downside deviation)
    const downsideReturns = returns.filter(r => r < 0);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const downsideDeviation = Math.sqrt(
      downsideReturns.reduce((sum, r) => sum + r * r, 0) / downsideReturns.length
    );
    const sortinoRatio = downsideDeviation > 0 
      ? (avgReturn / downsideDeviation) * Math.sqrt(252)
      : 0;

    // Ulcer Index (measures depth and duration of drawdowns)
    const ulcerIndex = this.calculateUlcerIndex(results.equityCurve);

    return {
      calmarRatio,
      sortinoRatio,
      ulcerIndex
    };
  }

  private static calculateUlcerIndex(equityCurve: Array<{ balance: number }>): number {
    let sumSquaredDrawdowns = 0;
    let maxBalance = equityCurve[0].balance;
    
    for (const point of equityCurve) {
      if (point.balance > maxBalance) {
        maxBalance = point.balance;
      }
      const drawdown = (maxBalance - point.balance) / maxBalance;
      sumSquaredDrawdowns += drawdown * drawdown;
    }
    
    return Math.sqrt(sumSquaredDrawdowns / equityCurve.length) * 100;
  }

  static generateCSVExport(results: BacktestResults): string {
    let csv = 'Trade ID,Symbol,Pattern,Entry Time,Entry Price,Exit Time,Exit Price,Direction,P&L,P&L %,Exit Reason,Score\n';
    
    for (const trade of results.trades) {
      csv += [
        trade.id,
        trade.symbol,
        trade.signal.pattern.name,
        trade.entryTime.toISOString(),
        trade.entryPrice.toFixed(2),
        trade.exitTime?.toISOString() || '',
        trade.exitPrice?.toFixed(2) || '',
        trade.direction,
        trade.pnl?.toFixed(2) || '',
        trade.pnlPercent?.toFixed(2) || '',
        trade.exitReason || '',
        trade.signal.score
      ].join(',') + '\n';
    }
    
    return csv;
  }
}