import { Router, Request, Response } from 'express';
import { TradeReportSimulator, SimulationConfig } from '../engine/tradeReportSimulator.js';
import { updateTrainingInsights, getTrainingInsights, clearTrainingInsightsCache } from '../../services/aiSignalFilter.js';
import { runTrainingNow } from '../../services/trainingScheduler.js';
import path from 'path';

const router = Router();

let cachedResults: any = null;
let lastSimulationTime: Date | null = null;

router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const { maxDurationMinutes, positionSizeGBP, commissionPerTrade, forceRefresh } = req.body;

    if (cachedResults && !forceRefresh && lastSimulationTime) {
      const cacheAge = Date.now() - lastSimulationTime.getTime();
      if (cacheAge < 60 * 60 * 1000) {
        console.log('Returning cached simulation results');
        return res.json({
          success: true,
          cached: true,
          cacheAge: Math.round(cacheAge / 1000),
          results: cachedResults
        });
      }
    }

    const config: Partial<SimulationConfig> = {
      tradeReportsPath: path.join(process.cwd(), '..', 'trade_reports'),
      maxDurationMinutes: maxDurationMinutes || 240,
      positionSizeGBP: positionSizeGBP || 500,
      commissionPerTrade: commissionPerTrade !== undefined ? commissionPerTrade : 0.5
    };

    console.log('Starting trade report simulation with config:', config);
    
    const simulator = new TradeReportSimulator(config);
    const results = await simulator.runSimulation();

    cachedResults = results;
    lastSimulationTime = new Date();

    const tpHits = results.outcomes.filter(o => o.exitReason === 'take_profit').length;
    const slHits = results.outcomes.filter(o => o.exitReason === 'stop_loss').length;
    const timeoutCount = results.outcomes.filter(o => o.exitReason === 'timeout').length;

    res.json({
      success: true,
      cached: false,
      config: {
        positionSizeGBP: config.positionSizeGBP,
        maxDurationMinutes: config.maxDurationMinutes,
        commissionPerTrade: config.commissionPerTrade
      },
      results: {
        summary: {
          totalTrades: results.totalTrades,
          simulatedTrades: results.simulatedTrades,
          skippedTrades: results.skippedTrades,
          tpHits,
          slHits,
          timeouts: timeoutCount,
          tpRate: ((tpHits / results.simulatedTrades) * 100).toFixed(2) + '%',
          slRate: ((slHits / results.simulatedTrades) * 100).toFixed(2) + '%',
          profitableTrades: results.wins,
          losingTrades: results.losses,
          profitableRate: results.winRate.toFixed(2) + '%',
          totalPnl: '£' + results.totalPnl.toFixed(2),
          averagePnl: '£' + results.averagePnl.toFixed(2),
          averageWin: '£' + results.averageWin.toFixed(2),
          averageLoss: '£' + results.averageLoss.toFixed(2),
          profitFactor: results.profitFactor.toFixed(2),
          averageDuration: results.averageDuration.toFixed(1) + ' mins'
        },
        patternBreakdown: results.patternBreakdown,
        trainingDataSummary: results.trainingData.summary,
        outcomes: results.outcomes.slice(0, 20)
      }
    });
  } catch (error: any) {
    console.error('Simulation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/training-data', async (req: Request, res: Response) => {
  try {
    if (!cachedResults) {
      return res.status(400).json({
        success: false,
        error: 'No simulation results. Run /simulate first.'
      });
    }

    const { format } = req.query;

    if (format === 'prompt') {
      const prompt = generateAIPrompt(cachedResults.trainingData);
      return res.json({
        success: true,
        prompt
      });
    }

    const { lessons, summary } = cachedResults.trainingData;
    
    res.json({
      success: true,
      trainingData: cachedResults.trainingData,
      summary: {
        totalAnalyzed: summary.totalAnalyzed,
        goodSignals: summary.goodSignals,
        badSignals: summary.badSignals,
        executionIssues: summary.executionIssues,
        directionAccuracy: summary.directionAccuracy.toFixed(1) + '%',
        averageMfe: summary.averageMfe.toFixed(2) + '%',
        averageMae: summary.averageMae.toFixed(2) + '%',
        optimalStopPercent: summary.optimalStopPercent.toFixed(2) + '%',
        optimalTargetPercent: summary.optimalTargetPercent.toFixed(2) + '%'
      },
      patternRankings: summary.patternRankings,
      keyInsights: summary.keyInsights,
      lessonsSample: lessons.slice(0, 10)
    });
  } catch (error: any) {
    console.error('Training data error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/analysis', async (req: Request, res: Response) => {
  try {
    if (!cachedResults) {
      return res.status(400).json({
        success: false,
        error: 'No simulation results. Run /simulate first.'
      });
    }

    const analysis = generateAnalysis(cachedResults);

    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/ai-filter-config', async (req: Request, res: Response) => {
  try {
    if (!cachedResults) {
      return res.status(400).json({
        success: false,
        error: 'No simulation results. Run /simulate first.'
      });
    }

    const config = generateAIFilterConfig(cachedResults);

    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    console.error('AI filter config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/apply-training', async (req: Request, res: Response) => {
  try {
    if (!cachedResults) {
      return res.status(400).json({
        success: false,
        error: 'No simulation results. Run /simulate first.'
      });
    }

    const { summary } = cachedResults.trainingData;

    const patternsToAvoid = summary.patternRankings
      .filter((p: any) => p.recommendation === 'avoid')
      .map((p: any) => p.pattern);

    const patternsToPrefer = summary.patternRankings
      .filter((p: any) => p.recommendation === 'preferred')
      .map((p: any) => p.pattern);

    const patternsToInvert = summary.patternRankings
      .filter((p: any) => p.directionAccuracy < 30 && p.count >= 5)
      .map((p: any) => p.pattern);

    const trainingInsights = {
      directionAccuracy: summary.directionAccuracy,
      averageMfe: summary.averageMfe,
      averageMae: summary.averageMae,
      optimalStopPercent: summary.optimalStopPercent,
      optimalTargetPercent: summary.optimalTargetPercent,
      patternRankings: summary.patternRankings.map((p: any) => ({
        pattern: p.pattern,
        directionAccuracy: p.directionAccuracy,
        count: p.count,
        recommendation: p.recommendation,
        avgMfe: p.avgMfe
      })),
      keyInsights: summary.keyInsights,
      patternsToAvoid,
      patternsToPrefer,
      patternsToInvert
    };

    updateTrainingInsights(trainingInsights);

    res.json({
      success: true,
      message: 'Training insights applied to AI filter',
      insights: {
        directionAccuracy: summary.directionAccuracy.toFixed(1) + '%',
        patternsToPrefer,
        patternsToAvoid,
        patternsToInvert,
        optimalStopPercent: summary.optimalStopPercent.toFixed(2) + '%',
        optimalTargetPercent: summary.optimalTargetPercent.toFixed(2) + '%'
      }
    });
  } catch (error: any) {
    console.error('Apply training error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/current-training', async (req: Request, res: Response) => {
  try {
    const insights = getTrainingInsights();
    
    if (!insights) {
      return res.json({
        success: true,
        hasTraining: false,
        message: 'No training data loaded. Run simulation and apply training first.'
      });
    }

    res.json({
      success: true,
      hasTraining: true,
      insights: {
        directionAccuracy: insights.directionAccuracy.toFixed(1) + '%',
        averageMfe: insights.averageMfe.toFixed(2) + '%',
        averageMae: insights.averageMae.toFixed(2) + '%',
        optimalStopPercent: insights.optimalStopPercent.toFixed(2) + '%',
        optimalTargetPercent: insights.optimalTargetPercent.toFixed(2) + '%',
        totalPatterns: insights.patternRankings.length,
        patternsToPrefer: insights.patternsToPrefer,
        patternsToAvoid: insights.patternsToAvoid,
        patternsToInvert: insights.patternsToInvert,
        keyInsights: insights.keyInsights
      }
    });
  } catch (error: any) {
    console.error('Get current training error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/clear-training', async (req: Request, res: Response) => {
  try {
    clearTrainingInsightsCache();
    res.json({
      success: true,
      message: 'Training insights cache cleared'
    });
  } catch (error: any) {
    console.error('Clear training error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/regenerate-from-database', async (req: Request, res: Response) => {
  try {
    console.log('[TRAINING] Regenerating training insights from database trades...');
    
    await runTrainingNow();
    
    const insights = getTrainingInsights();
    
    res.json({
      success: true,
      message: `Training insights regenerated from ${insights?.totalTradesAnalyzed || 0} trades`,
      insights: insights ? {
        totalTrades: insights.totalTradesAnalyzed,
        directionAccuracy: insights.directionAccuracy.toFixed(1) + '%',
        patternsAnalyzed: insights.patternRankings.length,
        symbolsAnalyzed: insights.symbolPerformance?.length || 0,
        timePeriodsAnalyzed: insights.timeOfDayPerformance?.length || 0,
        patternsToPrefer: insights.patternsToPrefer,
        patternsToAvoid: insights.patternsToAvoid,
        patternsToInvert: insights.patternsToInvert,
        keyInsights: insights.keyInsights
      } : null
    });
    
  } catch (error: any) {
    console.error('Regenerate training error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function generateAIPrompt(trainingData: any): string {
  const { lessons, summary } = trainingData;

  const goodSignalLessons = lessons.filter((l: any) => l.lesson.signalQuality === 'good').slice(0, 5);
  const badSignalLessons = lessons.filter((l: any) => l.lesson.signalQuality === 'bad').slice(0, 5);

  const goodExamples = goodSignalLessons.map((l: any) => ({
    pattern: l.features.patternName,
    score: l.features.patternScore,
    direction: l.features.direction,
    trend: l.features.trend,
    trendAligned: l.features.trendAligned,
    volumeFactor: l.features.volumeFactor?.toFixed(2),
    isHighVolume: l.features.isHighVolume,
    outcome: l.actualOutcome,
    directionCorrect: l.excursion.directionCorrect,
    mfePercent: l.excursion.mfePercent?.toFixed(2) + '%',
    recommendedAction: l.lesson.recommendedAction
  }));

  const badExamples = badSignalLessons.map((l: any) => ({
    pattern: l.features.patternName,
    score: l.features.patternScore,
    direction: l.features.direction,
    trend: l.features.trend,
    trendAligned: l.features.trendAligned,
    outcome: l.actualOutcome,
    directionCorrect: l.excursion.directionCorrect,
    maePercent: l.excursion.maePercent?.toFixed(2) + '%',
    whatWentWrong: l.lesson.whatWentWrong
  }));

  const preferredPatterns = summary.patternRankings
    .filter((p: any) => p.recommendation === 'preferred')
    .map((p: any) => p.pattern);
  const avoidPatterns = summary.patternRankings
    .filter((p: any) => p.recommendation === 'avoid')
    .map((p: any) => p.pattern);

  return `You are evaluating stock trading signals. Based on historical MFE/MAE analysis of ${summary.totalAnalyzed} trades:

**KEY METRICS:**
- Direction Accuracy: ${summary.directionAccuracy.toFixed(1)}% (price moved in predicted direction more than against)
- Average MFE: ${summary.averageMfe.toFixed(2)}% (how far price moved in our favour)
- Average MAE: ${summary.averageMae.toFixed(2)}% (how far price moved against us)
- Optimal Stop: ${summary.optimalStopPercent.toFixed(2)}%
- Optimal Target: ${summary.optimalTargetPercent.toFixed(2)}%

**SIGNAL QUALITY ANALYSIS:**
- Good Signals: ${summary.goodSignals} (direction was correct)
- Bad Signals: ${summary.badSignals} (price never moved in predicted direction)
- Execution Issues: ${summary.executionIssues} (right direction but stopped out)

**PREFERRED PATTERNS:** ${preferredPatterns.join(', ') || 'None identified yet'}
**PATTERNS TO AVOID:** ${avoidPatterns.join(', ') || 'None identified yet'}

**KEY INSIGHTS:**
${summary.keyInsights.map((i: string) => '- ' + i).join('\n')}

**GOOD SIGNAL EXAMPLES (direction was correct):**
${JSON.stringify(goodExamples, null, 2)}

**BAD SIGNAL EXAMPLES (direction was wrong):**
${JSON.stringify(badExamples, null, 2)}

**YOUR TASK:**
When presented with a new signal, analyze it against these patterns and respond with:
- "EXECUTE" if it matches good signal characteristics (especially preferred patterns, trend-aligned)
- "SKIP" if it matches bad signal characteristics (avoid patterns, counter-trend without reversal setup)
- "MODIFY" if the signal is good but needs adjusted SL/TP
- Brief reasoning (1-2 sentences)`;
}

function generateAnalysis(results: any): any {
  const { outcomes, patternBreakdown, trainingData } = results;

  const patternRanking = Object.entries(patternBreakdown)
    .map(([name, data]: [string, any]) => ({
      pattern: name,
      count: data.count,
      winRate: data.winRate,
      avgPnl: data.avgPnl,
      score: data.winRate * 0.6 + (data.avgPnl > 0 ? 20 : -20) + data.count * 0.5
    }))
    .sort((a, b) => b.score - a.score);

  const bestPatterns = patternRanking.filter(p => p.winRate > 50 && p.avgPnl > 0);
  const worstPatterns = patternRanking.filter(p => p.winRate < 40 || p.avgPnl < 0);

  const trendAnalysis = {
    aligned: outcomes.filter((o: any) => o.features.trendAligned),
    counterTrend: outcomes.filter((o: any) => !o.features.trendAligned)
  };

  const alignedWinRate = trendAnalysis.aligned.length > 0
    ? (trendAnalysis.aligned.filter((o: any) => o.outcome === 'win').length / trendAnalysis.aligned.length) * 100
    : 0;

  const counterWinRate = trendAnalysis.counterTrend.length > 0
    ? (trendAnalysis.counterTrend.filter((o: any) => o.outcome === 'win').length / trendAnalysis.counterTrend.length) * 100
    : 0;

  const volumeAnalysis = {
    highVolume: outcomes.filter((o: any) => o.features.isHighVolume),
    lowVolume: outcomes.filter((o: any) => !o.features.isHighVolume)
  };

  const highVolWinRate = volumeAnalysis.highVolume.length > 0
    ? (volumeAnalysis.highVolume.filter((o: any) => o.outcome === 'win').length / volumeAnalysis.highVolume.length) * 100
    : 0;

  const lowVolWinRate = volumeAnalysis.lowVolume.length > 0
    ? (volumeAnalysis.lowVolume.filter((o: any) => o.outcome === 'win').length / volumeAnalysis.lowVolume.length) * 100
    : 0;

  return {
    patternRanking,
    recommendations: {
      bestPatterns: bestPatterns.map(p => p.pattern),
      worstPatterns: worstPatterns.map(p => p.pattern),
      trendAlignment: {
        alignedWinRate: alignedWinRate.toFixed(1) + '%',
        counterTrendWinRate: counterWinRate.toFixed(1) + '%',
        recommendation: alignedWinRate > counterWinRate + 10 
          ? 'STRONGLY prefer trend-aligned trades' 
          : alignedWinRate > counterWinRate 
            ? 'Slightly prefer trend-aligned trades'
            : 'Trend alignment not significant'
      },
      volume: {
        highVolumeWinRate: highVolWinRate.toFixed(1) + '%',
        lowVolumeWinRate: lowVolWinRate.toFixed(1) + '%',
        recommendation: highVolWinRate > lowVolWinRate + 10
          ? 'REQUIRE high volume for entries'
          : 'Volume not a strong differentiator'
      }
    }
  };
}

function generateAIFilterConfig(results: any): any {
  const analysis = generateAnalysis(results);
  const { patternRanking, recommendations } = analysis;
  const { summary, lessons } = results.trainingData;

  const goodPatterns = summary.patternRankings
    .filter((p: any) => p.recommendation === 'preferred')
    .map((p: any) => p.pattern);

  const badPatterns = summary.patternRankings
    .filter((p: any) => p.recommendation === 'avoid')
    .map((p: any) => p.pattern);

  const goodSignalLessons = lessons.filter((l: any) => l.lesson.signalQuality === 'good');
  const avgGoodScore = goodSignalLessons.length > 0
    ? goodSignalLessons.reduce((sum: number, l: any) => sum + l.features.patternScore, 0) / goodSignalLessons.length
    : 70;

  return {
    filterRules: {
      minScore: Math.max(65, Math.floor(avgGoodScore - 10)),
      preferredPatterns: goodPatterns,
      avoidPatterns: badPatterns,
      requireTrendAlignment: parseFloat(recommendations.trendAlignment.alignedWinRate) > parseFloat(recommendations.trendAlignment.counterTrendWinRate) + 10,
      requireHighVolume: parseFloat(recommendations.volume.highVolumeWinRate) > parseFloat(recommendations.volume.lowVolumeWinRate) + 10,
      maxTrapRisk: 'medium',
      suggestedStopPercent: summary.optimalStopPercent,
      suggestedTargetPercent: summary.optimalTargetPercent
    },
    mfeAnalysis: {
      directionAccuracy: summary.directionAccuracy.toFixed(1) + '%',
      avgMfe: summary.averageMfe.toFixed(2) + '%',
      avgMae: summary.averageMae.toFixed(2) + '%',
      signalEdge: summary.averageMfe > summary.averageMae ? 'positive' : 'negative'
    },
    prompt: generateAIPrompt(results.trainingData),
    keyInsights: summary.keyInsights,
    expectedDirectionAccuracy: summary.directionAccuracy.toFixed(1) + '%'
  };
}

export default router;
