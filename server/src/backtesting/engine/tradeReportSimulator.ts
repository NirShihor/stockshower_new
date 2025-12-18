import { HistoricalDataLoader } from './dataLoader.js';
import { BacktestCandle } from '../types/backtestTypes.js';
import fs from 'fs';
import path from 'path';

export interface TradeReportEntry {
  _id: { $oid: string };
  symbol: string;
  mt5Symbol: string;
  patternName: string;
  patternScore: number;
  patternClass: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  direction: 'long' | 'short';
  orderType: string;
  volume: number;
  signalTime: { $date: string };
  marketConditions: {
    trend: string;
    volatility: string;
    volume: number;
    atr: number;
    nearSupport: boolean;
    nearResistance: boolean;
  };
  timeframe: string;
  signalData: {
    id: string;
    pattern: {
      name: string;
      class: string;
      direction: string;
      barsInvolved: number;
      patternHigh: number;
      patternLow: number;
    };
    context: {
      trend: string;
      atSupport: boolean;
      atResistance: boolean;
      atr: number;
      volumeFactor: number;
      isHighVolume: boolean;
      isWideRange: boolean;
    };
    plan: {
      direction: string;
      entry: number;
      stop: number;
      risk: number;
      targets: number[];
      riskRewardRatio: string;
    };
    score: number;
    notes: string[];
    trapRisk: string;
  };
  status: string;
  actualEntryPrice?: number;
  filledTime?: { $date: string };
}

export interface PriceExcursion {
  mfe: number;
  mfePercent: number;
  mfeTime: number;
  mae: number;
  maePercent: number;
  maeTime: number;
  movedInDirection: boolean;
  maxFavourableBeforeAdverse: number;
  reachedOriginalTarget: boolean;
  wouldHaveWonWithTighterStop: boolean;
  optimalStopPercent: number;
  optimalTargetPercent: number;
  priceAtTimeout?: number;
  directionCorrect: boolean;
}

export interface SimulatedOutcome {
  tradeId: string;
  symbol: string;
  patternName: string;
  patternScore: number;
  patternClass: string;
  direction: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitPrice: number;
  exitReason: 'stop_loss' | 'take_profit' | 'timeout';
  pnl: number;
  pnlPercent: number;
  durationMinutes: number;
  outcome: 'win' | 'loss' | 'timeout';
  features: TradeFeatures;
  excursion: PriceExcursion;
}

export interface TradeFeatures {
  patternName: string;
  patternClass: string;
  patternScore: number;
  direction: string;
  trend: string;
  trendAligned: boolean;
  volatility: string;
  atr: number;
  atrPercent: number;
  volumeFactor: number;
  isHighVolume: boolean;
  isWideRange: boolean;
  atSupport: boolean;
  atResistance: boolean;
  trapRisk: string;
  riskRewardRatio: number;
  stopPercent: number;
  targetPercent: number;
  notes: string[];
}

export interface SimulationResults {
  totalTrades: number;
  simulatedTrades: number;
  skippedTrades: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  totalPnl: number;
  averagePnl: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  averageDuration: number;
  outcomes: SimulatedOutcome[];
  patternBreakdown: Record<string, { count: number; wins: number; winRate: number; avgPnl: number }>;
  trainingData: TrainingDataset;
}

export interface TradeLesson {
  tradeId: string;
  features: TradeFeatures;
  actualOutcome: 'tp_hit' | 'sl_hit' | 'timeout';
  excursion: PriceExcursion;
  lesson: {
    signalQuality: 'good' | 'bad' | 'neutral';
    executionQuality: 'good' | 'bad' | 'neutral';
    whatWentWrong?: string;
    whatCouldImprove?: string;
    recommendedAction: 'take' | 'skip' | 'modify_sl' | 'modify_tp';
    suggestedStopPercent?: number;
    suggestedTargetPercent?: number;
  };
}

export interface TrainingDataset {
  lessons: TradeLesson[];
  summary: {
    totalAnalyzed: number;
    goodSignals: number;
    badSignals: number;
    executionIssues: number;
    directionAccuracy: number;
    averageMfe: number;
    averageMae: number;
    optimalStopPercent: number;
    optimalTargetPercent: number;
    patternRankings: Array<{
      pattern: string;
      count: number;
      tpRate: number;
      avgMfe: number;
      directionAccuracy: number;
      recommendation: 'preferred' | 'acceptable' | 'avoid';
    }>;
    keyInsights: string[];
  };
}

export interface SimulationConfig {
  tradeReportsPath: string;
  maxDurationMinutes: number;
  positionSizeGBP: number;
  commissionPerTrade: number;
}

export class TradeReportSimulator {
  private dataLoader: HistoricalDataLoader;
  private config: SimulationConfig;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.dataLoader = new HistoricalDataLoader();
    this.config = {
      tradeReportsPath: config.tradeReportsPath || path.join(process.cwd(), '..', 'trade_reports'),
      maxDurationMinutes: config.maxDurationMinutes || 240,
      positionSizeGBP: config.positionSizeGBP || 50,
      commissionPerTrade: config.commissionPerTrade || 0.5
    };
  }

  async loadTradeReports(): Promise<TradeReportEntry[]> {
    const reportsDir = this.config.tradeReportsPath;
    console.log(`Loading trade reports from: ${reportsDir}`);

    if (!fs.existsSync(reportsDir)) {
      throw new Error(`Trade reports directory not found: ${reportsDir}`);
    }

    const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.js'));
    console.log(`Found ${files.length} trade report files`);

    const allTrades: TradeReportEntry[] = [];

    for (const file of files) {
      const filePath = path.join(reportsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      try {
        const trades = JSON.parse(content) as TradeReportEntry[];
        allTrades.push(...trades);
        console.log(`Loaded ${trades.length} trades from ${file}`);
      } catch (error) {
        console.error(`Failed to parse ${file}:`, error);
      }
    }

    return allTrades;
  }

  async runSimulation(): Promise<SimulationResults> {
    const trades = await this.loadTradeReports();
    console.log(`Total trades loaded: ${trades.length}`);

    const filledTrades = trades.filter(t => t.status === 'filled' && t.filledTime);
    console.log(`Filled trades to simulate: ${filledTrades.length}`);

    const outcomes: SimulatedOutcome[] = [];
    let skipped = 0;

    for (const trade of filledTrades) {
      try {
        const outcome = await this.simulateTrade(trade);
        if (outcome) {
          outcomes.push(outcome);
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error simulating trade ${trade._id.$oid}:`, error);
        skipped++;
      }
    }

    return this.calculateResults(outcomes, trades.length, skipped);
  }

  private async simulateTrade(trade: TradeReportEntry): Promise<SimulatedOutcome | null> {
    const entryTime = new Date(trade.filledTime?.$date || trade.signalTime.$date);
    const entryPrice = trade.actualEntryPrice || trade.entryPrice;
    const stopLoss = trade.stopLoss;
    const takeProfit = trade.takeProfit;

    const endTime = new Date(entryTime.getTime() + this.config.maxDurationMinutes * 60 * 1000);

    try {
      const candles = await this.dataLoader.loadData(
        trade.symbol,
        entryTime,
        endTime,
        '1'
      );

      if (candles.length === 0) {
        console.log(`No candle data for ${trade.symbol} at ${entryTime.toISOString()}`);
        return null;
      }

      const maxExitTime = entryTime.getTime() + this.config.maxDurationMinutes * 60 * 1000;
      const candlesAfterEntry = candles.filter(c => 
        c.timestamp.getTime() > entryTime.getTime() && 
        c.timestamp.getTime() <= maxExitTime
      );
      
      if (candlesAfterEntry.length === 0) {
        console.log(`No candles after entry for ${trade.symbol}`);
        return null;
      }

      let exitPrice = entryPrice;
      let exitReason: 'stop_loss' | 'take_profit' | 'timeout' = 'timeout';
      let exitCandle = candlesAfterEntry[candlesAfterEntry.length - 1];

      let mfe = 0;
      let mae = 0;
      let mfeTime = 0;
      let maeTime = 0;
      let maxFavourableBeforeAdverse = 0;
      let currentFavourable = 0;
      let hitAdverse = false;

      for (let i = 0; i < candlesAfterEntry.length; i++) {
        const candle = candlesAfterEntry[i];
        const minutesFromEntry = (candle.timestamp.getTime() - entryTime.getTime()) / (60 * 1000);

        if (trade.direction === 'long') {
          const favourable = candle.high - entryPrice;
          const adverse = entryPrice - candle.low;
          
          if (favourable > mfe) {
            mfe = favourable;
            mfeTime = minutesFromEntry;
          }
          if (adverse > mae) {
            mae = adverse;
            maeTime = minutesFromEntry;
            hitAdverse = true;
          }
          
          if (!hitAdverse && favourable > currentFavourable) {
            currentFavourable = favourable;
            maxFavourableBeforeAdverse = currentFavourable;
          }
        } else {
          const favourable = entryPrice - candle.low;
          const adverse = candle.high - entryPrice;
          
          if (favourable > mfe) {
            mfe = favourable;
            mfeTime = minutesFromEntry;
          }
          if (adverse > mae) {
            mae = adverse;
            maeTime = minutesFromEntry;
            hitAdverse = true;
          }
          
          if (!hitAdverse && favourable > currentFavourable) {
            currentFavourable = favourable;
            maxFavourableBeforeAdverse = currentFavourable;
          }
        }

        const exitCheck = this.checkExit(trade.direction, candle, stopLoss, takeProfit);
        
        if (exitCheck && exitReason === 'timeout') {
          exitPrice = exitCheck.exitPrice;
          exitReason = exitCheck.exitReason;
          exitCandle = candle;
        }
      }

      if (exitReason === 'timeout') {
        exitPrice = exitCandle.close;
      }

      const durationMinutes = (exitCandle.timestamp.getTime() - entryTime.getTime()) / (60 * 1000);

      const pnl = this.calculatePnl(trade.direction, entryPrice, exitPrice);
      const pnlPercent = (pnl / entryPrice) * 100;

      const outcome: 'win' | 'loss' | 'timeout' = 
        exitReason === 'take_profit' ? 'win' :
        exitReason === 'stop_loss' ? 'loss' : 'timeout';

      const features = this.extractFeatures(trade);

      const targetDistance = Math.abs(takeProfit - entryPrice);
      const stopDistance = Math.abs(stopLoss - entryPrice);
      const mfePercent = (mfe / entryPrice) * 100;
      const maePercent = (mae / entryPrice) * 100;
      
      const reachedOriginalTarget = mfe >= targetDistance;
      const directionCorrect = mfe > mae;
      const wouldHaveWonWithTighterStop = exitReason === 'stop_loss' && reachedOriginalTarget;
      
      const optimalStopPercent = maePercent > 0 ? maePercent * 1.1 : 0.5;
      const optimalTargetPercent = mfePercent > 0 ? mfePercent * 0.8 : 1.0;

      const excursion: PriceExcursion = {
        mfe,
        mfePercent,
        mfeTime,
        mae,
        maePercent,
        maeTime,
        movedInDirection: mfe > 0,
        maxFavourableBeforeAdverse,
        reachedOriginalTarget,
        wouldHaveWonWithTighterStop,
        optimalStopPercent,
        optimalTargetPercent,
        priceAtTimeout: exitReason === 'timeout' ? exitPrice : undefined,
        directionCorrect
      };

      return {
        tradeId: trade._id.$oid,
        symbol: trade.symbol,
        patternName: trade.patternName,
        patternScore: trade.patternScore,
        patternClass: trade.patternClass,
        direction: trade.direction,
        entryPrice,
        stopLoss,
        takeProfit,
        exitPrice,
        exitReason,
        pnl,
        pnlPercent,
        durationMinutes,
        outcome,
        features,
        excursion
      };
    } catch (error) {
      console.error(`Failed to get data for ${trade.symbol}:`, error);
      return null;
    }
  }

  private checkExit(
    direction: 'long' | 'short',
    candle: BacktestCandle,
    stopLoss: number,
    takeProfit: number
  ): { exitPrice: number; exitReason: 'stop_loss' | 'take_profit' } | null {
    if (direction === 'long') {
      if (candle.low <= stopLoss) {
        return { exitPrice: stopLoss, exitReason: 'stop_loss' };
      }
      if (candle.high >= takeProfit) {
        return { exitPrice: takeProfit, exitReason: 'take_profit' };
      }
    } else {
      if (candle.high >= stopLoss) {
        return { exitPrice: stopLoss, exitReason: 'stop_loss' };
      }
      if (candle.low <= takeProfit) {
        return { exitPrice: takeProfit, exitReason: 'take_profit' };
      }
    }
    return null;
  }

  private calculatePnl(direction: 'long' | 'short', entryPrice: number, exitPrice: number): number {
    const positionSize = this.config.positionSizeGBP / entryPrice;
    const commission = this.config.commissionPerTrade * 2;

    if (direction === 'long') {
      return (exitPrice - entryPrice) * positionSize - commission;
    } else {
      return (entryPrice - exitPrice) * positionSize - commission;
    }
  }

  private extractFeatures(trade: TradeReportEntry): TradeFeatures {
    const signalData = trade.signalData;
    const context = signalData?.context || trade.marketConditions;
    const plan = signalData?.plan;

    const stopPercent = Math.abs(trade.stopLoss - trade.entryPrice) / trade.entryPrice * 100;
    const targetPercent = Math.abs(trade.takeProfit - trade.entryPrice) / trade.entryPrice * 100;

    const trendAligned = (trade.direction === 'long' && context.trend === 'up') ||
                         (trade.direction === 'short' && context.trend === 'down');

    const rrMatch = plan?.riskRewardRatio?.match(/1:([\d.]+)/);
    const riskRewardRatio = rrMatch ? parseFloat(rrMatch[1]) : targetPercent / stopPercent;

    return {
      patternName: trade.patternName,
      patternClass: trade.patternClass,
      patternScore: trade.patternScore,
      direction: trade.direction,
      trend: context.trend || trade.marketConditions.trend,
      trendAligned,
      volatility: trade.marketConditions.volatility,
      atr: context.atr || trade.marketConditions.atr,
      atrPercent: ((context.atr || trade.marketConditions.atr) / trade.entryPrice) * 100,
      volumeFactor: context.volumeFactor || trade.marketConditions.volume,
      isHighVolume: context.isHighVolume || false,
      isWideRange: context.isWideRange || false,
      atSupport: context.atSupport || trade.marketConditions.nearSupport,
      atResistance: context.atResistance || trade.marketConditions.nearResistance,
      trapRisk: signalData?.trapRisk || 'none',
      riskRewardRatio,
      stopPercent,
      targetPercent,
      notes: signalData?.notes || []
    };
  }

  private calculateResults(
    outcomes: SimulatedOutcome[],
    totalTrades: number,
    skipped: number
  ): SimulationResults {
    const tpHits = outcomes.filter(o => o.exitReason === 'take_profit');
    const slHits = outcomes.filter(o => o.exitReason === 'stop_loss');
    const timeouts = outcomes.filter(o => o.exitReason === 'timeout');

    const profitableTrades = outcomes.filter(o => o.pnl > 0);
    const losingTrades = outcomes.filter(o => o.pnl <= 0);

    const totalPnl = outcomes.reduce((sum, o) => sum + o.pnl, 0);
    const grossWinPnl = profitableTrades.reduce((sum, o) => sum + o.pnl, 0);
    const grossLossPnl = Math.abs(losingTrades.reduce((sum, o) => sum + o.pnl, 0));

    const patternBreakdown: Record<string, { count: number; tpHits: number; slHits: number; timeouts: number; profitable: number; tpRate: number; avgPnl: number }> = {};
    
    for (const outcome of outcomes) {
      const pattern = outcome.patternName;
      if (!patternBreakdown[pattern]) {
        patternBreakdown[pattern] = { count: 0, tpHits: 0, slHits: 0, timeouts: 0, profitable: 0, tpRate: 0, avgPnl: 0 };
      }
      patternBreakdown[pattern].count++;
      if (outcome.exitReason === 'take_profit') {
        patternBreakdown[pattern].tpHits++;
      } else if (outcome.exitReason === 'stop_loss') {
        patternBreakdown[pattern].slHits++;
      } else {
        patternBreakdown[pattern].timeouts++;
      }
      if (outcome.pnl > 0) {
        patternBreakdown[pattern].profitable++;
      }
      patternBreakdown[pattern].avgPnl += outcome.pnl;
    }

    for (const pattern of Object.keys(patternBreakdown)) {
      const data = patternBreakdown[pattern];
      data.tpRate = data.count > 0 ? (data.tpHits / data.count) * 100 : 0;
      data.avgPnl = data.count > 0 ? data.avgPnl / data.count : 0;
    }

    const trainingData = this.generateTrainingData(outcomes);

    return {
      totalTrades,
      simulatedTrades: outcomes.length,
      skippedTrades: skipped,
      wins: profitableTrades.length,
      losses: losingTrades.length,
      timeouts: timeouts.length,
      winRate: outcomes.length > 0 ? (profitableTrades.length / outcomes.length) * 100 : 0,
      totalPnl,
      averagePnl: outcomes.length > 0 ? totalPnl / outcomes.length : 0,
      averageWin: profitableTrades.length > 0 ? grossWinPnl / profitableTrades.length : 0,
      averageLoss: losingTrades.length > 0 ? grossLossPnl / losingTrades.length : 0,
      profitFactor: grossLossPnl > 0 ? grossWinPnl / grossLossPnl : grossWinPnl > 0 ? Infinity : 0,
      averageDuration: outcomes.length > 0 
        ? outcomes.reduce((sum, o) => sum + o.durationMinutes, 0) / outcomes.length 
        : 0,
      outcomes,
      patternBreakdown,
      trainingData
    };
  }

  private generateTrainingData(outcomes: SimulatedOutcome[]): TrainingDataset {
    const lessons: TradeLesson[] = outcomes.map(outcome => {
      const lesson = this.analyzeTradeLesson(outcome);
      return {
        tradeId: outcome.tradeId,
        features: outcome.features,
        actualOutcome: outcome.exitReason === 'take_profit' ? 'tp_hit' : 
                       outcome.exitReason === 'stop_loss' ? 'sl_hit' : 'timeout',
        excursion: outcome.excursion,
        lesson
      };
    });

    const goodSignals = lessons.filter(l => l.lesson.signalQuality === 'good').length;
    const badSignals = lessons.filter(l => l.lesson.signalQuality === 'bad').length;
    const executionIssues = lessons.filter(l => l.lesson.executionQuality === 'bad').length;
    
    const directionCorrectCount = outcomes.filter(o => o.excursion.directionCorrect).length;
    const directionAccuracy = outcomes.length > 0 ? (directionCorrectCount / outcomes.length) * 100 : 0;
    
    const avgMfe = outcomes.length > 0 
      ? outcomes.reduce((sum, o) => sum + o.excursion.mfePercent, 0) / outcomes.length 
      : 0;
    const avgMae = outcomes.length > 0 
      ? outcomes.reduce((sum, o) => sum + o.excursion.maePercent, 0) / outcomes.length 
      : 0;

    const optimalStops = outcomes.map(o => o.excursion.optimalStopPercent).filter(s => s > 0);
    const optimalTargets = outcomes.map(o => o.excursion.optimalTargetPercent).filter(t => t > 0);
    
    const optimalStopPercent = optimalStops.length > 0 
      ? optimalStops.reduce((a, b) => a + b, 0) / optimalStops.length 
      : 1.0;
    const optimalTargetPercent = optimalTargets.length > 0 
      ? optimalTargets.reduce((a, b) => a + b, 0) / optimalTargets.length 
      : 2.0;

    const patternStats = new Map<string, { 
      count: number; 
      tpHits: number; 
      mfeSum: number; 
      directionCorrect: number;
    }>();

    for (const outcome of outcomes) {
      const pattern = outcome.patternName;
      if (!patternStats.has(pattern)) {
        patternStats.set(pattern, { count: 0, tpHits: 0, mfeSum: 0, directionCorrect: 0 });
      }
      const stats = patternStats.get(pattern)!;
      stats.count++;
      if (outcome.exitReason === 'take_profit') stats.tpHits++;
      stats.mfeSum += outcome.excursion.mfePercent;
      if (outcome.excursion.directionCorrect) stats.directionCorrect++;
    }

    const patternRankings = Array.from(patternStats.entries())
      .map(([pattern, stats]) => ({
        pattern,
        count: stats.count,
        tpRate: stats.count > 0 ? (stats.tpHits / stats.count) * 100 : 0,
        avgMfe: stats.count > 0 ? stats.mfeSum / stats.count : 0,
        directionAccuracy: stats.count > 0 ? (stats.directionCorrect / stats.count) * 100 : 0,
        recommendation: this.getPatternRecommendation(stats)
      }))
      .sort((a, b) => b.directionAccuracy - a.directionAccuracy);

    const keyInsights = this.generateKeyInsights(outcomes, lessons, patternRankings);

    return {
      lessons,
      summary: {
        totalAnalyzed: outcomes.length,
        goodSignals,
        badSignals,
        executionIssues,
        directionAccuracy,
        averageMfe: avgMfe,
        averageMae: avgMae,
        optimalStopPercent,
        optimalTargetPercent,
        patternRankings,
        keyInsights
      }
    };
  }

  private analyzeTradeLesson(outcome: SimulatedOutcome): TradeLesson['lesson'] {
    const { excursion, exitReason, features } = outcome;
    
    let signalQuality: 'good' | 'bad' | 'neutral' = 'neutral';
    let executionQuality: 'good' | 'bad' | 'neutral' = 'neutral';
    let whatWentWrong: string | undefined;
    let whatCouldImprove: string | undefined;
    let recommendedAction: 'take' | 'skip' | 'modify_sl' | 'modify_tp' = 'take';

    if (excursion.directionCorrect) {
      signalQuality = 'good';
      
      if (exitReason === 'take_profit') {
        executionQuality = 'good';
      } else if (exitReason === 'stop_loss') {
        executionQuality = 'bad';
        whatWentWrong = 'Stop loss too tight - price moved in predicted direction but stopped out first';
        whatCouldImprove = `Use wider stop (${excursion.optimalStopPercent.toFixed(2)}%) or tighter target`;
        recommendedAction = 'modify_sl';
      } else {
        executionQuality = 'neutral';
        if (excursion.reachedOriginalTarget) {
          whatWentWrong = 'Target was reached but trade timed out (execution delay?)';
          whatCouldImprove = 'Check for execution issues';
        } else {
          whatCouldImprove = `Consider tighter target (${excursion.optimalTargetPercent.toFixed(2)}%)`;
          recommendedAction = 'modify_tp';
        }
      }
    } else {
      if (excursion.mfePercent < 0.1) {
        signalQuality = 'bad';
        whatWentWrong = 'Price never moved in predicted direction';
        recommendedAction = 'skip';
      } else {
        signalQuality = 'neutral';
        whatWentWrong = 'Price moved against position more than in favour';
        
        if (excursion.wouldHaveWonWithTighterStop) {
          executionQuality = 'bad';
          whatCouldImprove = 'Use wider stop - target was eventually reached';
          recommendedAction = 'modify_sl';
        } else {
          whatCouldImprove = 'Consider tighter target or skip similar setups';
          recommendedAction = excursion.mfePercent > 0.5 ? 'modify_tp' : 'skip';
        }
      }
    }

    return {
      signalQuality,
      executionQuality,
      whatWentWrong,
      whatCouldImprove,
      recommendedAction,
      suggestedStopPercent: excursion.optimalStopPercent,
      suggestedTargetPercent: excursion.optimalTargetPercent
    };
  }

  private getPatternRecommendation(stats: { count: number; tpHits: number; directionCorrect: number }): 'preferred' | 'acceptable' | 'avoid' {
    if (stats.count < 3) return 'acceptable';
    
    const tpRate = stats.tpHits / stats.count;
    const directionRate = stats.directionCorrect / stats.count;
    
    if (directionRate >= 0.6 && tpRate >= 0.2) return 'preferred';
    if (directionRate >= 0.45) return 'acceptable';
    return 'avoid';
  }

  private generateKeyInsights(
    outcomes: SimulatedOutcome[], 
    lessons: TradeLesson[],
    patternRankings: TrainingDataset['summary']['patternRankings']
  ): string[] {
    const insights: string[] = [];
    
    const directionCorrect = outcomes.filter(o => o.excursion.directionCorrect).length;
    const directionRate = (directionCorrect / outcomes.length) * 100;
    
    if (directionRate >= 55) {
      insights.push(`Direction prediction is solid (${directionRate.toFixed(1)}% correct) - focus on execution improvements`);
    } else if (directionRate >= 45) {
      insights.push(`Direction prediction is near random (${directionRate.toFixed(1)}%) - need better signal filtering`);
    } else {
      insights.push(`Direction prediction is poor (${directionRate.toFixed(1)}%) - consider inverting signals or major strategy change`);
    }

    const slHitsWithTargetReached = outcomes.filter(
      o => o.exitReason === 'stop_loss' && o.excursion.reachedOriginalTarget
    ).length;
    
    if (slHitsWithTargetReached > 0) {
      const pct = ((slHitsWithTargetReached / outcomes.length) * 100).toFixed(1);
      insights.push(`${slHitsWithTargetReached} trades (${pct}%) hit SL but would have won with wider stops - consider increasing stop distance`);
    }

    const avgMfe = outcomes.reduce((sum, o) => sum + o.excursion.mfePercent, 0) / outcomes.length;
    const avgMae = outcomes.reduce((sum, o) => sum + o.excursion.maePercent, 0) / outcomes.length;
    
    if (avgMfe > avgMae) {
      insights.push(`Average MFE (${avgMfe.toFixed(2)}%) > MAE (${avgMae.toFixed(2)}%) - signals have edge, optimise execution`);
    } else {
      insights.push(`Average MAE (${avgMae.toFixed(2)}%) > MFE (${avgMfe.toFixed(2)}%) - signals need filtering improvement`);
    }

    const preferredPatterns = patternRankings.filter(p => p.recommendation === 'preferred').map(p => p.pattern);
    const avoidPatterns = patternRankings.filter(p => p.recommendation === 'avoid').map(p => p.pattern);
    
    if (preferredPatterns.length > 0) {
      insights.push(`Preferred patterns: ${preferredPatterns.join(', ')}`);
    }
    if (avoidPatterns.length > 0) {
      insights.push(`Patterns to avoid: ${avoidPatterns.join(', ')}`);
    }

    const trendAligned = outcomes.filter(o => o.features.trendAligned);
    const counterTrend = outcomes.filter(o => !o.features.trendAligned);
    
    if (trendAligned.length > 5 && counterTrend.length > 5) {
      const alignedDirCorrect = trendAligned.filter(o => o.excursion.directionCorrect).length / trendAligned.length;
      const counterDirCorrect = counterTrend.filter(o => o.excursion.directionCorrect).length / counterTrend.length;
      
      if (alignedDirCorrect > counterDirCorrect + 0.1) {
        insights.push(`Trend-aligned trades perform better (${(alignedDirCorrect * 100).toFixed(1)}% vs ${(counterDirCorrect * 100).toFixed(1)}% direction accuracy)`);
      } else if (counterDirCorrect > alignedDirCorrect + 0.1) {
        insights.push(`Counter-trend (reversal) trades perform better - consider reversal strategy`);
      }
    }

    return insights;
  }

  clearCache(): void {
    this.dataLoader.clearCache();
  }
}
