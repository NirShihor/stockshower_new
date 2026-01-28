import express, { Request, Response } from 'express';
import { TradeAnalysisUtility } from '../analysis/tradeAnalysisUtility.js';

const router = express.Router();

// Comprehensive trade analysis endpoint
router.post('/comprehensive', async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      includeAll = false,
      minTrades = 3
    } = req.body;
    
    console.log('🔍 Running comprehensive trade analysis...');
    
    const config = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      includeAll,
      minTrades
    };
    
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    
    res.json({
      success: true,
      analysis: results,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in comprehensive analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Comprehensive analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Quick insights endpoint - returns just the key findings
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days as string));
    
    const config = {
      startDate: cutoff,
      endDate: new Date(),
      includeAll: false,
      minTrades: 2
    };
    
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    
    // Return simplified insights
    res.json({
      success: true,
      period: `Last ${days} days`,
      summary: results.summary,
      insights: results.insights,
      topPatterns: results.patternAnalysis.slice(0, 5),
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error generating insights:', error);
    res.status(500).json({
      success: false,
      error: 'Insights generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Pattern-specific deep dive
router.get('/pattern/:patternName', async (req: Request, res: Response) => {
  try {
    const patternName = req.params.patternName as string;
    const { days = 30 } = req.query;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days as string));
    
    const config = {
      startDate: cutoff,
      endDate: new Date(),
      includeAll: false,
      minTrades: 1
    };
    
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    
    // Find the specific pattern
    const patternData = results.patternAnalysis.find(p => 
      p.patternName.toLowerCase() === (patternName as string).toLowerCase()
    );
    
    if (!patternData) {
      return res.status(404).json({
        success: false,
        error: `Pattern '${patternName}' not found in the analysis period`
      });
    }
    
    // Get market conditions specific to this pattern
    const patternMarketConditions = results.marketConditions
      .map(condition => ({
        ...condition,
        patternData: condition.patterns[patternName as string] || { trades: 0, winRate: 0 }
      }))
      .filter(c => c.patternData.trades > 0)
      .sort((a, b) => b.patternData.winRate - a.patternData.winRate);
    
    res.json({
      success: true,
      pattern: patternData,
      marketConditions: patternMarketConditions,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in pattern analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Pattern analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Symbol performance analysis
router.get('/symbol/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const { days = 30 } = req.query;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days as string));
    
    const config = {
      startDate: cutoff,
      endDate: new Date(),
      includeAll: false,
      minTrades: 1
    };
    
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    
    // Find the specific symbol
    const symbolData = results.symbolPerformance.find(s => 
      s.symbol.toLowerCase() === (symbol as string).toLowerCase()
    );
    
    if (!symbolData) {
      return res.status(404).json({
        success: false,
        error: `Symbol '${symbol}' not found in the analysis period`
      });
    }
    
    // Get patterns for this symbol
    const symbolPatterns = results.patternAnalysis.filter(p => 
      p.bestTrades.some(t => t.symbol === symbol) || 
      p.worstTrades.some(t => t.symbol === symbol)
    );
    
    res.json({
      success: true,
      symbol: symbolData,
      patterns: symbolPatterns,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in symbol analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Symbol analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Score range analysis
router.get('/score-analysis', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days as string));
    
    const config = {
      startDate: cutoff,
      endDate: new Date(),
      includeAll: false,
      minTrades: 2
    };
    
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    
    res.json({
      success: true,
      scoreAnalysis: results.scoreAnalysis,
      recommendations: results.insights.optimalScoreRanges,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in score analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Score analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Market conditions correlation analysis
router.get('/market-conditions', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days as string));
    
    const config = {
      startDate: cutoff,
      endDate: new Date(),
      includeAll: false,
      minTrades: 2
    };
    
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    
    res.json({
      success: true,
      marketConditions: results.marketConditions,
      recommendations: results.insights.bestMarketConditions,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in market conditions analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Market conditions analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Time-based performance analysis
router.get('/time-analysis', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days as string));
    
    const config = {
      startDate: cutoff,
      endDate: new Date(),
      includeAll: false,
      minTrades: 2
    };
    
    const results = await TradeAnalysisUtility.runComprehensiveAnalysis(config);
    
    res.json({
      success: true,
      timeAnalysis: results.timeAnalysis,
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in time analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Time analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;