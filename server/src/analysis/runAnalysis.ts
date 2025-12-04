#!/usr/bin/env tsx

/**
 * Comprehensive Trade Analysis CLI Tool
 * 
 * Usage:
 *   npm run analyze-trades
 *   npm run analyze-trades -- --days 14
 *   npm run analyze-trades -- --start 2025-11-01 --end 2025-11-25
 *   npm run analyze-trades -- --pattern "Bullish Engulfing"
 *   npm run analyze-trades -- --symbol AAPL
 */

import { runTradeAnalysis } from './tradeAnalysisUtility.js';
import { connectDatabase } from '../db/connection.js';
import { Trade } from '../db/models/Trade.js';

interface CliArgs {
  days?: number;
  start?: string;
  end?: string;
  pattern?: string;
  symbol?: string;
  includeAll?: boolean;
  minTrades?: number;
  export?: string;
  summary?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {};
  
  for (let i = 2; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--days':
        parsed.days = parseInt(value);
        break;
      case '--start':
        parsed.start = value;
        break;
      case '--end':
        parsed.end = value;
        break;
      case '--pattern':
        parsed.pattern = value;
        break;
      case '--symbol':
        parsed.symbol = value;
        break;
      case '--include-all':
        parsed.includeAll = true;
        i--; // No value for this flag
        break;
      case '--min-trades':
        parsed.minTrades = parseInt(value);
        break;
      case '--export':
        parsed.export = value;
        break;
      case '--summary':
        parsed.summary = true;
        i--; // No value for this flag
        break;
      default:
        console.warn(`Unknown flag: ${flag}`);
        i--;
        break;
    }
  }
  
  return parsed;
}

function printSummary(results: any) {
  console.log('\n🎯 TRADE ANALYSIS SUMMARY');
  console.log('=' .repeat(50));
  
  const { summary, insights } = results;
  
  console.log(`📊 Overall Performance:`);
  console.log(`   Total Signals: ${summary.totalSignals}`);
  console.log(`   Fill Rate: ${summary.fillRate.toFixed(1)}%`);
  console.log(`   Win Rate: ${summary.overallWinRate.toFixed(1)}%`);
  console.log(`   Total P&L: $${summary.totalPnL}`);
  console.log(`   Average P&L: $${summary.avgPnL}`);
  console.log(`   Profit Factor: ${summary.profitFactor}`);
  console.log(`   Sharpe Ratio: ${summary.sharpeRatio}`);
  
  console.log(`\n🏆 Top Performing Patterns:`);
  insights.topPerformingPatterns.forEach((pattern: string, i: number) => {
    console.log(`   ${i + 1}. ${pattern}`);
  });
  
  console.log(`\n❌ Worst Performing Patterns:`);
  insights.worstPerformingPatterns.forEach((pattern: string, i: number) => {
    console.log(`   ${i + 1}. ${pattern}`);
  });
  
  console.log(`\n🎚️ Optimal Score Ranges:`);
  insights.optimalScoreRanges.forEach((range: string, i: number) => {
    console.log(`   ${i + 1}. ${range}`);
  });
  
  console.log(`\n📈 Best Market Conditions:`);
  insights.bestMarketConditions.forEach((condition: string, i: number) => {
    console.log(`   ${i + 1}. ${condition}`);
  });
  
  if (insights.recommendedFilters.length > 0) {
    console.log(`\n💡 Recommendations:`);
    insights.recommendedFilters.forEach((filter: string, i: number) => {
      console.log(`   ${i + 1}. ${filter}`);
    });
  }
  
  if (insights.riskManagementIssues.length > 0) {
    console.log(`\n⚠️ Risk Management Issues:`);
    insights.riskManagementIssues.forEach((issue: string, i: number) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }
}

function printPatternDetails(results: any, patternName: string) {
  const pattern = results.patternAnalysis.find((p: any) => 
    p.patternName.toLowerCase().includes(patternName.toLowerCase())
  );
  
  if (!pattern) {
    console.log(`❌ Pattern '${patternName}' not found`);
    return;
  }
  
  console.log(`\n📋 PATTERN ANALYSIS: ${pattern.patternName}`);
  console.log('=' .repeat(50));
  
  console.log(`📊 Performance Metrics:`);
  console.log(`   Total Trades: ${pattern.totalTrades}`);
  console.log(`   Closed Trades: ${pattern.closedTrades}`);
  console.log(`   Win Rate: ${pattern.winRate.toFixed(1)}%`);
  console.log(`   Average Score: ${pattern.avgScore}`);
  console.log(`   Score Range: ${pattern.scoreRange.min} - ${pattern.scoreRange.max}`);
  console.log(`   Total P&L: $${pattern.totalPnL}`);
  console.log(`   Average P&L: $${pattern.avgPnL}`);
  console.log(`   Average Win: $${pattern.avgWin}`);
  console.log(`   Average Loss: $${pattern.avgLoss}`);
  console.log(`   Profit Factor: ${pattern.profitFactor}`);
  
  console.log(`\n🏗️ Market Context:`);
  console.log(`   At Support Rate: ${pattern.atSupportRate.toFixed(1)}%`);
  console.log(`   At Resistance Rate: ${pattern.atResistanceRate.toFixed(1)}%`);
  console.log(`   Trend Aligned Rate: ${pattern.trendAlignedRate.toFixed(1)}%`);
  console.log(`   Average Volume Factor: ${pattern.avgVolumeFactor.toFixed(2)}`);
  
  console.log(`\n⏱️ Risk & Timing:`);
  console.log(`   Average Stop Distance: ${pattern.avgStopDistance.toFixed(2)}%`);
  console.log(`   Average Risk/Reward: ${pattern.avgRiskReward.toFixed(2)}`);
  console.log(`   Average Hold Time: ${pattern.avgHoldTime.toFixed(1)} hours`);
  
  console.log(`\n🚪 Exit Reasons:`);
  Object.entries(pattern.exitReasons).forEach(([reason, count]) => {
    console.log(`   ${reason}: ${count}`);
  });
  
  if (pattern.bestTrades.length > 0) {
    console.log(`\n🏆 Best Trades:`);
    pattern.bestTrades.forEach((trade: any, i: number) => {
      console.log(`   ${i + 1}. ${trade.symbol}: $${trade.pnl.toFixed(2)} (Score: ${trade.score})`);
    });
  }
  
  if (pattern.worstTrades.length > 0) {
    console.log(`\n💸 Worst Trades:`);
    pattern.worstTrades.forEach((trade: any, i: number) => {
      console.log(`   ${i + 1}. ${trade.symbol}: $${trade.pnl.toFixed(2)} (Score: ${trade.score})`);
    });
  }
}

function printSymbolDetails(results: any, symbolName: string) {
  const symbol = results.symbolPerformance.find((s: any) => 
    s.symbol.toLowerCase() === symbolName.toLowerCase()
  );
  
  if (!symbol) {
    console.log(`❌ Symbol '${symbolName}' not found`);
    return;
  }
  
  console.log(`\n📈 SYMBOL ANALYSIS: ${symbol.symbol}`);
  console.log('=' .repeat(50));
  
  console.log(`📊 Performance:`);
  console.log(`   Total Trades: ${symbol.trades}`);
  console.log(`   Win Rate: ${symbol.winRate.toFixed(1)}%`);
  console.log(`   Average P&L: $${symbol.avgPnL}`);
  console.log(`   Best Pattern: ${symbol.bestPattern}`);
  console.log(`   Worst Pattern: ${symbol.worstPattern}`);
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    
    console.log('🚀 Starting comprehensive trade analysis...');
    
    await connectDatabase();
    
    // Determine date range
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (args.start) {
      startDate = new Date(args.start);
    } else if (args.days) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - args.days);
    }
    
    if (args.end) {
      endDate = new Date(args.end);
    }
    
    const config = {
      startDate,
      endDate,
      includeAll: args.includeAll || false,
      minTrades: args.minTrades || 3
    };
    
    console.log(`📅 Analysis period: ${startDate?.toISOString().split('T')[0] || 'All time'} to ${endDate?.toISOString().split('T')[0] || 'Now'}`);
    
    const results = await runTradeAnalysis(config);
    
    if (args.summary) {
      printSummary(results);
    } else if (args.pattern) {
      printPatternDetails(results, args.pattern);
    } else if (args.symbol) {
      printSymbolDetails(results, args.symbol);
    } else {
      // Full detailed output
      console.log('\n📄 COMPREHENSIVE TRADE ANALYSIS RESULTS');
      console.log('=' .repeat(60));
      console.log(JSON.stringify(results, null, 2));
    }
    
    // Export to file if requested
    if (args.export) {
      const fs = await import('fs');
      const exportData = {
        generatedAt: new Date().toISOString(),
        config,
        results
      };
      
      fs.writeFileSync(args.export, JSON.stringify(exportData, null, 2));
      console.log(`\n💾 Results exported to: ${args.export}`);
    }
    
    console.log('\n✅ Analysis completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

// Show usage if no args provided
if (process.argv.length <= 2) {
  console.log('📖 Comprehensive Trade Analysis Tool');
  console.log('\nUsage:');
  console.log('  tsx runAnalysis.ts [options]');
  console.log('\nOptions:');
  console.log('  --days <number>        Analyze last N days');
  console.log('  --start <date>         Start date (YYYY-MM-DD)');
  console.log('  --end <date>           End date (YYYY-MM-DD)');
  console.log('  --pattern <name>       Focus on specific pattern');
  console.log('  --symbol <symbol>      Focus on specific symbol');
  console.log('  --include-all          Include all trade statuses');
  console.log('  --min-trades <number>  Minimum trades for pattern analysis');
  console.log('  --export <file>        Export results to JSON file');
  console.log('  --summary              Show summary only');
  console.log('\nExamples:');
  console.log('  tsx runAnalysis.ts --days 7 --summary');
  console.log('  tsx runAnalysis.ts --pattern "Bullish Engulfing"');
  console.log('  tsx runAnalysis.ts --start 2025-11-01 --export results.json');
  process.exit(0);
}

main();