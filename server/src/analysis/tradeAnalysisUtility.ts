// @ts-nocheck
import { Trade, ITrade } from '../db/models/Trade.js';
import { connectDatabase } from '../db/connection.js';

interface AnalysisConfig {
  startDate?: Date;
  endDate?: Date;
  includeAll?: boolean; // Include all statuses, not just closed
  minTrades?: number; // Minimum trades for pattern analysis
}

interface PatternMetrics {
  patternName: string;
  totalTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgScore: number;
  scoreRange: { min: number; max: number };
  avgPnL: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  
  // Market conditions
  avgVolumeFactor: number;
  atSupportRate: number;
  atResistanceRate: number;
  trendAlignedRate: number;
  avgStopDistance: number;
  avgRiskReward: number;
  
  // Timing analysis
  avgHoldTime: number; // hours
  timeOfDayPattern: Record<string, number>;
  
  // Exit analysis
  exitReasons: Record<string, number>;
  
  // Best/worst performers
  bestTrades: Array<{ symbol: string; pnl: number; score: number }>;
  worstTrades: Array<{ symbol: string; pnl: number; score: number }>;
}

interface MarketConditionAnalysis {
  condition: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  patterns: Record<string, { trades: number; winRate: number }>;
}

interface ScoreRangeAnalysis {
  range: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  patterns: Record<string, number>;
}

interface SymbolPerformance {
  symbol: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  bestPattern: string;
  worstPattern: string;
}

interface TimeAnalysis {
  hourOfDay: Record<string, { trades: number; winRate: number; avgPnL: number }>;
  dayOfWeek: Record<string, { trades: number; winRate: number; avgPnL: number }>;
  sessionAnalysis: {
    premarket: { trades: number; winRate: number; avgPnL: number };
    regular: { trades: number; winRate: number; avgPnL: number };
    afterhours: { trades: number; winRate: number; avgPnL: number };
  };
}

interface ComprehensiveAnalysisResults {
  summary: {
    totalSignals: number;
    filledTrades: number;
    closedTrades: number;
    fillRate: number;
    overallWinRate: number;
    totalPnL: number;
    avgPnL: number;
    profitFactor: number;
    sharpeRatio: number;
  };
  
  patternAnalysis: PatternMetrics[];
  scoreAnalysis: ScoreRangeAnalysis[];
  marketConditions: MarketConditionAnalysis[];
  symbolPerformance: SymbolPerformance[];
  timeAnalysis: TimeAnalysis;
  
  // Key insights and recommendations
  insights: {
    topPerformingPatterns: string[];
    worstPerformingPatterns: string[];
    optimalScoreRanges: string[];
    bestMarketConditions: string[];
    recommendedFilters: string[];
    riskManagementIssues: string[];
  };
}

export class TradeAnalysisUtility {
  
  static async runComprehensiveAnalysis(config: AnalysisConfig = {}): Promise<ComprehensiveAnalysisResults> {
    try {
      await connectDatabase();
      
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default 30 days
        endDate = new Date(),
        includeAll = false,
        minTrades = 3
      } = config;
      
      console.log(`🔍 Running comprehensive trade analysis from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      // Fetch all relevant trades
      const query: any = {
        signalTime: { $gte: startDate, $lte: endDate }
      };
      
      if (!includeAll) {
        query.status = { $in: ['filled', 'closed'] };
      }
      
      const trades = await Trade.find(query).lean() as ITrade[];
      
      if (trades.length === 0) {
        throw new Error('No trades found in the specified date range');
      }
      
      console.log(`📊 Found ${trades.length} trades for analysis`);
      
      // Run all analysis functions
      const results: ComprehensiveAnalysisResults = {
        summary: this.calculateSummaryMetrics(trades),
        patternAnalysis: this.analyzePatterns(trades, minTrades),
        scoreAnalysis: this.analyzeScoreRanges(trades),
        marketConditions: this.analyzeMarketConditions(trades),
        symbolPerformance: this.analyzeSymbolPerformance(trades),
        timeAnalysis: this.analyzeTimingPatterns(trades),
        insights: { 
          topPerformingPatterns: [],
          worstPerformingPatterns: [],
          optimalScoreRanges: [],
          bestMarketConditions: [],
          recommendedFilters: [],
          riskManagementIssues: []
        }
      };
      
      // Generate insights
      results.insights = this.generateInsights(results);
      
      return results;
      
    } catch (error) {
      console.error('❌ Error in comprehensive analysis:', error);
      throw error;
    }
  }
  
  private static calculateSummaryMetrics(trades: ITrade[]) {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnlAmount !== undefined);
    const filledTrades = trades.filter(t => ['filled', 'closed'].includes(t.status));
    
    const winningTrades = closedTrades.filter(t => t.pnlAmount! > 0);
    const losingTrades = closedTrades.filter(t => t.pnlAmount! < 0);
    
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnlAmount!, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlAmount!), 0) / losingTrades.length : 0;
    
    // Calculate Sharpe ratio (simplified)
    const returns = closedTrades.map(t => (t.pnlPercentage || 0) / 100);
    const avgReturn = returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
    const stdDev = returns.length > 1 ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)) : 0;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    
    return {
      totalSignals: trades.length,
      filledTrades: filledTrades.length,
      closedTrades: closedTrades.length,
      fillRate: trades.length > 0 ? (filledTrades.length / trades.length) * 100 : 0,
      overallWinRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
      totalPnL: Number(totalPnL.toFixed(2)),
      avgPnL: closedTrades.length > 0 ? Number((totalPnL / closedTrades.length).toFixed(2)) : 0,
      profitFactor: avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0,
      sharpeRatio: Number(sharpeRatio.toFixed(3))
    };
  }
  
  private static analyzePatterns(trades: ITrade[], minTrades: number): PatternMetrics[] {
    const patternGroups = trades.reduce((acc, trade) => {
      const pattern = trade.patternName;
      if (!acc[pattern]) acc[pattern] = [];
      acc[pattern].push(trade);
      return acc;
    }, {} as Record<string, ITrade[]>);
    
    return Object.entries(patternGroups)
      .filter(([_, patternTrades]) => patternTrades.length >= minTrades)
      .map(([patternName, patternTrades]) => {
        const closedTrades = patternTrades.filter(t => t.status === 'closed' && t.pnlAmount !== undefined);
        const winningTrades = closedTrades.filter(t => t.pnlAmount! > 0);
        const losingTrades = closedTrades.filter(t => t.pnlAmount! < 0);
        
        const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
        const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnlAmount!, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlAmount!), 0) / losingTrades.length : 0;
        
        // Score analysis
        const scores = patternTrades.filter(t => t.patternScore).map(t => t.patternScore);
        const avgScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;
        
        // Market conditions analysis
        const tradesWithConditions = patternTrades.filter(t => t.marketConditions);
        const atSupport = tradesWithConditions.filter(t => t.marketConditions?.nearSupport).length;
        const atResistance = tradesWithConditions.filter(t => t.marketConditions?.nearResistance).length;
        const trendAligned = tradesWithConditions.filter(t => 
          (t.direction === 'long' && t.marketConditions?.trend === 'up') ||
          (t.direction === 'short' && t.marketConditions?.trend === 'down')
        ).length;
        
        // Stop distance analysis
        const stopDistances = patternTrades
          .filter(t => t.entryPrice && t.stopLoss)
          .map(t => Math.abs(t.entryPrice - t.stopLoss) / t.entryPrice * 100);
        
        const avgStopDistance = stopDistances.length > 0 ? 
          stopDistances.reduce((sum, d) => sum + d, 0) / stopDistances.length : 0;
        
        // Risk/reward analysis
        const rrRatios = patternTrades
          .filter(t => t.entryPrice && t.stopLoss && t.takeProfit)
          .map(t => {
            const stopDistance = Math.abs(t.entryPrice - t.stopLoss);
            const profitDistance = Math.abs(t.takeProfit - t.entryPrice);
            return profitDistance / stopDistance;
          });
        
        const avgRiskReward = rrRatios.length > 0 ? 
          rrRatios.reduce((sum, r) => sum + r, 0) / rrRatios.length : 0;
        
        // Hold time analysis
        const holdTimes = closedTrades
          .filter(t => t.filledTime && t.closedTime)
          .map(t => (new Date(t.closedTime!).getTime() - new Date(t.filledTime!).getTime()) / (1000 * 60 * 60));
        
        const avgHoldTime = holdTimes.length > 0 ? 
          holdTimes.reduce((sum, h) => sum + h, 0) / holdTimes.length : 0;
        
        // Time of day analysis
        const timeOfDayPattern = patternTrades.reduce((acc, trade) => {
          const hour = new Date(trade.signalTime).getHours();
          const hourKey = `${hour}:00`;
          acc[hourKey] = (acc[hourKey] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        // Exit reasons
        const exitReasons = closedTrades.reduce((acc, trade) => {
          const reason = trade.exitReason || 'unknown';
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        // Best/worst trades
        const sortedTrades = closedTrades.sort((a, b) => (b.pnlAmount || 0) - (a.pnlAmount || 0));
        const bestTrades = sortedTrades.slice(0, 3).map(t => ({
          symbol: t.symbol,
          pnl: t.pnlAmount || 0,
          score: t.patternScore || 0
        }));
        const worstTrades = sortedTrades.slice(-3).map(t => ({
          symbol: t.symbol,
          pnl: t.pnlAmount || 0,
          score: t.patternScore || 0
        }));
        
        return {
          patternName,
          totalTrades: patternTrades.length,
          closedTrades: closedTrades.length,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
          avgScore: Number(avgScore.toFixed(1)),
          scoreRange: {
            min: scores.length > 0 ? Math.min(...scores) : 0,
            max: scores.length > 0 ? Math.max(...scores) : 0
          },
          avgPnL: closedTrades.length > 0 ? Number((totalPnL / closedTrades.length).toFixed(2)) : 0,
          totalPnL: Number(totalPnL.toFixed(2)),
          avgWin: Number(avgWin.toFixed(2)),
          avgLoss: Number(avgLoss.toFixed(2)),
          profitFactor: avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0,
          avgVolumeFactor: tradesWithConditions.length > 0 ? 
            tradesWithConditions.reduce((sum, t) => sum + (t.marketConditions?.volume || 1), 0) / tradesWithConditions.length : 0,
          atSupportRate: tradesWithConditions.length > 0 ? (atSupport / tradesWithConditions.length) * 100 : 0,
          atResistanceRate: tradesWithConditions.length > 0 ? (atResistance / tradesWithConditions.length) * 100 : 0,
          trendAlignedRate: tradesWithConditions.length > 0 ? (trendAligned / tradesWithConditions.length) * 100 : 0,
          avgStopDistance: Number(avgStopDistance.toFixed(2)),
          avgRiskReward: Number(avgRiskReward.toFixed(2)),
          avgHoldTime: Number(avgHoldTime.toFixed(1)),
          timeOfDayPattern,
          exitReasons,
          bestTrades,
          worstTrades
        };
      })
      .sort((a, b) => b.totalPnL - a.totalPnL);
  }
  
  private static analyzeScoreRanges(trades: ITrade[]): ScoreRangeAnalysis[] {
    const ranges = [
      { min: 0, max: 50, label: '0-50' },
      { min: 50, max: 60, label: '50-60' },
      { min: 60, max: 70, label: '60-70' },
      { min: 70, max: 80, label: '70-80' },
      { min: 80, max: 90, label: '80-90' },
      { min: 90, max: 100, label: '90-100' }
    ];
    
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnlAmount !== undefined && t.patternScore);
    
    return ranges.map(range => {
      const rangeLines = closedTrades.filter(t => 
        t.patternScore >= range.min && t.patternScore < range.max
      );
      
      const winningTrades = rangeLines.filter(t => t.pnlAmount! > 0);
      const totalPnL = rangeLines.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
      
      const patterns = rangeLines.reduce((acc, trade) => {
        acc[trade.patternName] = (acc[trade.patternName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      return {
        range: range.label,
        trades: rangeLines.length,
        winRate: rangeLines.length > 0 ? (winningTrades.length / rangeLines.length) * 100 : 0,
        avgPnL: rangeLines.length > 0 ? Number((totalPnL / rangeLines.length).toFixed(2)) : 0,
        patterns
      };
    }).filter(range => range.trades > 0);
  }
  
  private static analyzeMarketConditions(trades: ITrade[]): MarketConditionAnalysis[] {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnlAmount !== undefined && t.marketConditions);
    
    const conditions = [
      { key: 'nearSupport', label: 'At Support' },
      { key: 'nearResistance', label: 'At Resistance' },
      { key: 'highVolume', label: 'High Volume' },
      { key: 'trendAligned', label: 'Trend Aligned' }
    ];
    
    const volatilityLevels = ['low', 'medium', 'high'];
    const trendDirections = ['up', 'down', 'sideways'];
    
    const results: MarketConditionAnalysis[] = [];
    
    // Analyze boolean conditions
    conditions.forEach(condition => {
      let conditionTrades: ITrade[] = [];
      
      if (condition.key === 'trendAligned') {
        conditionTrades = closedTrades.filter(t => 
          (t.direction === 'long' && t.marketConditions?.trend === 'up') ||
          (t.direction === 'short' && t.marketConditions?.trend === 'down')
        );
      } else if (condition.key === 'highVolume') {
        conditionTrades = closedTrades.filter(t => (t.marketConditions?.volume || 1) > 1.5);
      } else {
        conditionTrades = closedTrades.filter(t => t.marketConditions?.[condition.key as keyof typeof t.marketConditions]);
      }
      
      if (conditionTrades.length > 0) {
        const winningTrades = conditionTrades.filter(t => t.pnlAmount! > 0);
        const totalPnL = conditionTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
        
        const patterns = conditionTrades.reduce((acc, trade) => {
          if (!acc[trade.patternName]) {
            acc[trade.patternName] = { trades: 0, winRate: 0 };
          }
          acc[trade.patternName].trades++;
          return acc;
        }, {} as Record<string, { trades: number; winRate: number }>);
        
        // Calculate win rates for each pattern
        Object.keys(patterns).forEach(patternName => {
          const patternTrades = conditionTrades.filter(t => t.patternName === patternName);
          const patternWins = patternTrades.filter(t => t.pnlAmount! > 0).length;
          patterns[patternName].winRate = patternTrades.length > 0 ? (patternWins / patternTrades.length) * 100 : 0;
        });
        
        results.push({
          condition: condition.label,
          trades: conditionTrades.length,
          winRate: (winningTrades.length / conditionTrades.length) * 100,
          avgPnL: Number((totalPnL / conditionTrades.length).toFixed(2)),
          patterns
        });
      }
    });
    
    // Analyze volatility levels
    volatilityLevels.forEach(level => {
      const levelTrades = closedTrades.filter(t => t.marketConditions?.volatility === level);
      
      if (levelTrades.length > 0) {
        const winningTrades = levelTrades.filter(t => t.pnlAmount! > 0);
        const totalPnL = levelTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
        
        const patterns = levelTrades.reduce((acc, trade) => {
          if (!acc[trade.patternName]) {
            acc[trade.patternName] = { trades: 0, winRate: 0 };
          }
          acc[trade.patternName].trades++;
          return acc;
        }, {} as Record<string, { trades: number; winRate: number }>);
        
        Object.keys(patterns).forEach(patternName => {
          const patternTrades = levelTrades.filter(t => t.patternName === patternName);
          const patternWins = patternTrades.filter(t => t.pnlAmount! > 0).length;
          patterns[patternName].winRate = patternTrades.length > 0 ? (patternWins / patternTrades.length) * 100 : 0;
        });
        
        results.push({
          condition: `${level.charAt(0).toUpperCase() + level.slice(1)} Volatility`,
          trades: levelTrades.length,
          winRate: (winningTrades.length / levelTrades.length) * 100,
          avgPnL: Number((totalPnL / levelTrades.length).toFixed(2)),
          patterns
        });
      }
    });
    
    // Analyze trend directions
    trendDirections.forEach(trend => {
      const trendTrades = closedTrades.filter(t => t.marketConditions?.trend === trend);
      
      if (trendTrades.length > 0) {
        const winningTrades = trendTrades.filter(t => t.pnlAmount! > 0);
        const totalPnL = trendTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
        
        const patterns = trendTrades.reduce((acc, trade) => {
          if (!acc[trade.patternName]) {
            acc[trade.patternName] = { trades: 0, winRate: 0 };
          }
          acc[trade.patternName].trades++;
          return acc;
        }, {} as Record<string, { trades: number; winRate: number }>);
        
        Object.keys(patterns).forEach(patternName => {
          const patternTrades = trendTrades.filter(t => t.patternName === patternName);
          const patternWins = patternTrades.filter(t => t.pnlAmount! > 0).length;
          patterns[patternName].winRate = patternTrades.length > 0 ? (patternWins / patternTrades.length) * 100 : 0;
        });
        
        results.push({
          condition: `${trend.charAt(0).toUpperCase() + trend.slice(1)} Trend`,
          trades: trendTrades.length,
          winRate: (winningTrades.length / trendTrades.length) * 100,
          avgPnL: Number((totalPnL / trendTrades.length).toFixed(2)),
          patterns
        });
      }
    });
    
    return results.sort((a, b) => b.winRate - a.winRate);
  }
  
  private static analyzeSymbolPerformance(trades: ITrade[]): SymbolPerformance[] {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnlAmount !== undefined);
    const symbolGroups = closedTrades.reduce((acc, trade) => {
      if (!acc[trade.symbol]) acc[trade.symbol] = [];
      acc[trade.symbol].push(trade);
      return acc;
    }, {} as Record<string, ITrade[]>);
    
    return Object.entries(symbolGroups)
      .filter(([_, symbolTrades]) => symbolTrades.length >= 2) // At least 2 trades
      .map(([symbol, symbolTrades]) => {
        const winningTrades = symbolTrades.filter(t => t.pnlAmount! > 0);
        const totalPnL = symbolTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
        
        // Find best and worst patterns for this symbol
        const patternPerformance = symbolTrades.reduce((acc, trade) => {
          if (!acc[trade.patternName]) {
            acc[trade.patternName] = { pnl: 0, trades: 0 };
          }
          acc[trade.patternName].pnl += (trade.pnlAmount || 0);
          acc[trade.patternName].trades++;
          return acc;
        }, {} as Record<string, { pnl: number; trades: number }>);
        
        const sortedPatterns = Object.entries(patternPerformance)
          .sort(([,a], [,b]) => b.pnl - a.pnl);
        
        return {
          symbol,
          trades: symbolTrades.length,
          winRate: (winningTrades.length / symbolTrades.length) * 100,
          avgPnL: Number((totalPnL / symbolTrades.length).toFixed(2)),
          bestPattern: sortedPatterns[0]?.[0] || 'N/A',
          worstPattern: sortedPatterns[sortedPatterns.length - 1]?.[0] || 'N/A'
        };
      })
      .sort((a, b) => b.avgPnL - a.avgPnL);
  }
  
  private static analyzeTimingPatterns(trades: ITrade[]): TimeAnalysis {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.pnlAmount !== undefined);
    
    // Hour of day analysis
    const hourOfDay = closedTrades.reduce((acc, trade) => {
      const hour = new Date(trade.signalTime).getHours();
      const hourKey = `${hour.toString().padStart(2, '0')}:00`;
      
      if (!acc[hourKey]) {
        acc[hourKey] = { trades: 0, wins: 0, totalPnL: 0 };
      }
      
      acc[hourKey].trades++;
      acc[hourKey].totalPnL += (trade.pnlAmount || 0);
      if (trade.pnlAmount! > 0) acc[hourKey].wins++;
      
      return acc;
    }, {} as Record<string, { trades: number; wins: number; totalPnL: number }>);
    
    // Convert to final format
    const hourAnalysis = Object.entries(hourOfDay).reduce((acc, [hour, data]) => {
      acc[hour] = {
        trades: data.trades,
        winRate: (data.wins / data.trades) * 100,
        avgPnL: Number((data.totalPnL / data.trades).toFixed(2))
      };
      return acc;
    }, {} as Record<string, { trades: number; winRate: number; avgPnL: number }>);
    
    // Day of week analysis
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = closedTrades.reduce((acc, trade) => {
      const dayIndex = new Date(trade.signalTime).getDay();
      const dayName = dayNames[dayIndex];
      
      if (!acc[dayName]) {
        acc[dayName] = { trades: 0, wins: 0, totalPnL: 0 };
      }
      
      acc[dayName].trades++;
      acc[dayName].totalPnL += (trade.pnlAmount || 0);
      if (trade.pnlAmount! > 0) acc[dayName].wins++;
      
      return acc;
    }, {} as Record<string, { trades: number; wins: number; totalPnL: number }>);
    
    const dayAnalysis = Object.entries(dayOfWeek).reduce((acc, [day, data]) => {
      acc[day] = {
        trades: data.trades,
        winRate: (data.wins / data.trades) * 100,
        avgPnL: Number((data.totalPnL / data.trades).toFixed(2))
      };
      return acc;
    }, {} as Record<string, { trades: number; winRate: number; avgPnL: number }>);
    
    // Session analysis (simplified - based on hour)
    const sessionStats = {
      premarket: { trades: 0, wins: 0, totalPnL: 0 }, // 4-9:30 AM ET
      regular: { trades: 0, wins: 0, totalPnL: 0 },    // 9:30 AM - 4 PM ET
      afterhours: { trades: 0, wins: 0, totalPnL: 0 }  // 4-8 PM ET
    };
    
    closedTrades.forEach(trade => {
      const hour = new Date(trade.signalTime).getHours();
      let session: keyof typeof sessionStats;
      
      if (hour >= 4 && hour < 9.5) session = 'premarket';
      else if (hour >= 9.5 && hour < 16) session = 'regular';
      else if (hour >= 16 && hour < 20) session = 'afterhours';
      else return; // Skip other hours
      
      sessionStats[session].trades++;
      sessionStats[session].totalPnL += (trade.pnlAmount || 0);
      if (trade.pnlAmount! > 0) sessionStats[session].wins++;
    });
    
    const sessionAnalysis = Object.entries(sessionStats).reduce((acc, [session, data]) => {
      acc[session as keyof typeof acc] = {
        trades: data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        avgPnL: data.trades > 0 ? Number((data.totalPnL / data.trades).toFixed(2)) : 0
      };
      return acc;
    }, {} as TimeAnalysis['sessionAnalysis']);
    
    return {
      hourOfDay: hourAnalysis,
      dayOfWeek: dayAnalysis,
      sessionAnalysis
    };
  }
  
  private static generateInsights(results: ComprehensiveAnalysisResults) {
    const insights = {
      topPerformingPatterns: [] as string[],
      worstPerformingPatterns: [] as string[],
      optimalScoreRanges: [] as string[],
      bestMarketConditions: [] as string[],
      recommendedFilters: [] as string[],
      riskManagementIssues: [] as string[]
    };
    
    // Top performing patterns (win rate > 60% and positive PnL)
    insights.topPerformingPatterns = results.patternAnalysis
      .filter(p => p.winRate > 60 && p.totalPnL > 0 && p.closedTrades >= 3)
      .map(p => `${p.patternName} (${p.winRate.toFixed(1)}% win rate, $${p.totalPnL} total PnL)`)
      .slice(0, 3);
    
    // Worst performing patterns (win rate < 40% or negative total PnL)
    insights.worstPerformingPatterns = results.patternAnalysis
      .filter(p => (p.winRate < 40 || p.totalPnL < 0) && p.closedTrades >= 3)
      .sort((a, b) => a.winRate - b.winRate)
      .map(p => `${p.patternName} (${p.winRate.toFixed(1)}% win rate, $${p.totalPnL} total PnL)`)
      .slice(0, 3);
    
    // Optimal score ranges
    insights.optimalScoreRanges = results.scoreAnalysis
      .filter(s => s.winRate > 55 && s.trades >= 3)
      .sort((a, b) => b.winRate - a.winRate)
      .map(s => `Score ${s.range}: ${s.winRate.toFixed(1)}% win rate (${s.trades} trades)`)
      .slice(0, 3);
    
    // Best market conditions
    insights.bestMarketConditions = results.marketConditions
      .filter(m => m.winRate > 55 && m.trades >= 3)
      .sort((a, b) => b.winRate - a.winRate)
      .map(m => `${m.condition}: ${m.winRate.toFixed(1)}% win rate (${m.trades} trades)`)
      .slice(0, 3);
    
    // Generate specific recommendations
    if (results.summary.overallWinRate < 50) {
      insights.recommendedFilters.push(`Overall win rate is ${results.summary.overallWinRate.toFixed(1)}% - consider increasing minimum score thresholds`);
    }
    
    if (results.summary.fillRate < 80) {
      insights.recommendedFilters.push(`Fill rate is only ${results.summary.fillRate.toFixed(1)}% - review entry buffer settings`);
    }
    
    // Risk management issues
    const highStopLossPatterns = results.patternAnalysis.filter(p => p.avgStopDistance > 2.0);
    if (highStopLossPatterns.length > 0) {
      insights.riskManagementIssues.push(`High stop distances: ${highStopLossPatterns.map(p => p.patternName).join(', ')}`);
    }
    
    const lowRRPatterns = results.patternAnalysis.filter(p => p.avgRiskReward < 1.5);
    if (lowRRPatterns.length > 0) {
      insights.riskManagementIssues.push(`Low risk/reward ratios: ${lowRRPatterns.map(p => p.patternName).join(', ')}`);
    }
    
    // Pattern-specific recommendations
    results.patternAnalysis.forEach(pattern => {
      if (pattern.atResistanceRate > 60 && pattern.winRate < 50) {
        insights.recommendedFilters.push(`${pattern.patternName}: Avoid entries at resistance (${pattern.atResistanceRate.toFixed(1)}% are at resistance with ${pattern.winRate.toFixed(1)}% win rate)`);
      }
      
      if (pattern.trendAlignedRate < 40 && pattern.winRate < 50) {
        insights.recommendedFilters.push(`${pattern.patternName}: Require trend alignment (only ${pattern.trendAlignedRate.toFixed(1)}% are trend-aligned)`);
      }
    });
    
    return insights;
  }
}

// Export function for direct usage
export async function runTradeAnalysis(config: AnalysisConfig = {}) {
  try {
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    return results;
  } catch (error) {
    console.error('❌ Trade analysis failed:', error);
    throw error;
  }
}

export default TradeAnalysisUtility;