// @ts-nocheck
import express, { Request, Response } from 'express';
import { Trade } from '../../db/models/Trade.js';

const router = express.Router();

// Analyze pattern performance in detail
router.post('/analyze-patterns', async (req: Request, res: Response) => {
  try {
    const {
      startDate = "2025-11-18",
      endDate = "2025-11-24"
    } = req.body;

    // Fetch all trades with pattern data
    const trades = await Trade.find({
      signalTime: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      'signalData.pattern': { $exists: true }
    }).lean();

    // Analyze each pattern type
    const patternAnalysis: Record<string, any> = {};

    for (const trade of trades) {
      if (!trade.signalData) continue;
      
      const pattern = trade.signalData.pattern.name;
      const signal = trade.signalData;
      
      if (!patternAnalysis[pattern]) {
        patternAnalysis[pattern] = {
          count: 0,
          scores: [],
          contexts: [],
          avgScore: 0,
          atSupport: 0,
          atResistance: 0,
          withHighVolume: 0,
          trendAligned: 0,
          stopDistances: [],
          outcomes: []
        };
      }
      
      const analysis = patternAnalysis[pattern];
      analysis.count++;
      analysis.scores.push(signal.score);
      
      if (signal.context.atSupport) analysis.atSupport++;
      if (signal.context.atResistance) analysis.atResistance++;
      if (signal.context.isHighVolume) analysis.withHighVolume++;
      if (signal.context.trend === 'up' && signal.pattern.direction === 'bullish') analysis.trendAligned++;
      
      // Calculate stop distance
      const stopDistance = Math.abs(signal.plan.entry - signal.plan.stop) / signal.plan.entry * 100;
      analysis.stopDistances.push(stopDistance);
      
      // Track outcome if available
      if (trade.pnlAmount !== undefined) {
        analysis.outcomes.push({
          symbol: trade.symbol,
          pnl: trade.pnlAmount,
          exitReason: trade.exitReason || 'unknown'
        });
      }
    }

    // Calculate averages
    for (const pattern in patternAnalysis) {
      const analysis = patternAnalysis[pattern];
      analysis.avgScore = analysis.scores.reduce((a, b) => a + b, 0) / analysis.scores.length;
      analysis.avgStopDistance = analysis.stopDistances.reduce((a, b) => a + b, 0) / analysis.stopDistances.length;
      analysis.supportRate = (analysis.atSupport / analysis.count * 100).toFixed(1);
      analysis.resistanceRate = (analysis.atResistance / analysis.count * 100).toFixed(1);
      analysis.highVolumeRate = (analysis.withHighVolume / analysis.count * 100).toFixed(1);
      analysis.trendAlignedRate = (analysis.trendAligned / analysis.count * 100).toFixed(1);
      
      // Clean up arrays for response
      delete analysis.scores;
      delete analysis.stopDistances;
    }

    // Overall statistics
    const totalTrades = trades.length;
    const uniqueSymbols = [...new Set(trades.map(t => t.symbol))];
    
    res.json({
      summary: {
        totalTrades,
        uniqueSymbols: uniqueSymbols.length,
        symbols: uniqueSymbols,
        dateRange: { startDate, endDate }
      },
      patterns: patternAnalysis,
      insights: generateInsights(patternAnalysis)
    });

  } catch (error) {
    console.error('Error analyzing patterns:', error);
    res.status(500).json({ 
      error: 'Failed to analyze patterns',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

function generateInsights(patterns: Record<string, any>): string[] {
  const insights: string[] = [];
  
  for (const [pattern, data] of Object.entries(patterns)) {
    // Check for red flags
    if (data.avgStopDistance < 0.5) {
      insights.push(`⚠️ ${pattern}: Average stop distance only ${data.avgStopDistance.toFixed(2)}% - too tight`);
    }
    
    if (parseFloat(data.resistanceRate) > 50) {
      insights.push(`⚠️ ${pattern}: ${data.resistanceRate}% of entries are at resistance - poor entry location`);
    }
    
    if (parseFloat(data.supportRate) < 50 && pattern.includes('Bounce')) {
      insights.push(`⚠️ ${pattern}: Only ${data.supportRate}% are at support - not true bounces`);
    }
    
    if (parseFloat(data.highVolumeRate) < 50) {
      insights.push(`⚠️ ${pattern}: Only ${data.highVolumeRate}% have high volume - weak signals`);
    }
    
    if (data.outcomes.length > 0) {
      const losses = data.outcomes.filter((o: any) => o.pnl < 0).length;
      const winRate = ((data.outcomes.length - losses) / data.outcomes.length * 100).toFixed(1);
      insights.push(`📊 ${pattern}: ${winRate}% win rate from ${data.outcomes.length} completed trades`);
    }
  }
  
  return insights;
}

export default router;