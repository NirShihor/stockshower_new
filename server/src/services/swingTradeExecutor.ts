// @ts-nocheck
import { analyzeSwingTrades } from './swingTradeService.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { Trade } from '../db/models/Trade.js';
import { AiTrade } from '../db/models/AiTrade.js';

interface SwingExecutorStatus {
  enabled: boolean;
  lastScan: string | null;
  nextScan: string | null;
  activeTrades: number;
  todaysTrades: number;
}

let executorEnabled = false;
let lastScanTime: Date | null = null;
let dailyCheckTimeout: NodeJS.Timeout | null = null;

const MAX_CONCURRENT_SWING_TRADES = 30;
const MAX_DAILY_SWING_TRADES = 30;

export function getSwingExecutorStatus(): SwingExecutorStatus {
  return {
    enabled: executorEnabled,
    lastScan: lastScanTime?.toISOString() || null,
    nextScan: getNextScanTime()?.toISOString() || null,
    activeTrades: 0,
    todaysTrades: 0
  };
}

function getNextScanTime(): Date | null {
  if (!executorEnabled) return null;
  
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(20, 30, 0, 0);
  
  if (now.getUTCHours() >= 21) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }
  
  return tomorrow;
}

function isSwingTradingTime(): boolean {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay();
  
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  
  const totalMinutes = utcHours * 60 + utcMinutes;
  const targetTime = 20 * 60 + 30;
  
  return Math.abs(totalMinutes - targetTime) < 15;
}

async function getActiveSwingTrades(): Promise<number> {
  const activeTrades = await Trade.countDocuments({
    status: { $in: ['placed', 'filled'] },
    tradeType: 'swing'
  });
  return activeTrades;
}

async function getTodaysSwingTradeCount(): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  const count = await Trade.countDocuments({
    tradeType: 'swing',
    signalTime: { $gte: today }
  });
  return count;
}

export async function executeSwingTrades(): Promise<{
  success: boolean;
  tradesPlaced: number;
  errors: string[];
}> {
  console.log('[SWING EXECUTOR] Starting swing trade analysis and execution...');
  
  const errors: string[] = [];
  let tradesPlaced = 0;
  
  try {
    const activeTradeCount = await getActiveSwingTrades();
    if (activeTradeCount >= MAX_CONCURRENT_SWING_TRADES) {
      console.log(`[SWING EXECUTOR] Max concurrent trades reached (${activeTradeCount}/${MAX_CONCURRENT_SWING_TRADES}), skipping`);
      return { success: true, tradesPlaced: 0, errors: [] };
    }
    
    const todaysCount = await getTodaysSwingTradeCount();
    if (todaysCount >= MAX_DAILY_SWING_TRADES) {
      console.log(`[SWING EXECUTOR] Max daily trades reached (${todaysCount}/${MAX_DAILY_SWING_TRADES}), skipping`);
      return { success: true, tradesPlaced: 0, errors: [] };
    }
    
    const availableSlots = Math.min(
      MAX_CONCURRENT_SWING_TRADES - activeTradeCount,
      MAX_DAILY_SWING_TRADES - todaysCount
    );
    
    console.log(`[SWING EXECUTOR] Available slots: ${availableSlots}`);
    
    const today = new Date().toISOString().split('T')[0];
    const analysis = await analyzeSwingTrades(today);
    
    if (!analysis.recommendations || analysis.recommendations.length === 0) {
      console.log('[SWING EXECUTOR] No swing trade recommendations today');
      lastScanTime = new Date();
      return { success: true, tradesPlaced: 0, errors: [] };
    }
    
    console.log(`[SWING EXECUTOR] AI recommended ${analysis.recommendations.length} trades`);
    
    const tradesToExecute = analysis.recommendations
      .filter(r => r.confidence === 'high')
      .slice(0, availableSlots);
    
    if (tradesToExecute.length === 0) {
      console.log('[SWING EXECUTOR] No high-confidence trades to execute');
      lastScanTime = new Date();
      return { success: true, tradesPlaced: 0, errors: [] };
    }
    
    for (const rec of tradesToExecute) {
      try {
        console.log(`[SWING EXECUTOR] Executing ${rec.direction.toUpperCase()} on ${rec.symbol}`);
        
        const signal = {
          symbol: rec.symbol,
          direction: rec.direction,
          currentPrice: rec.entry,
          plan: {
            direction: rec.direction,
            entry: rec.entry,
            stop: rec.stopLoss,
            targets: [rec.target1, rec.target2]
          },
          pattern: {
            name: `swing_${rec.direction}`,
            confidence: rec.confidence === 'high' ? 85 : 70,
            direction: rec.direction
          },
          context: {
            atr: Math.abs(rec.entry - rec.stopLoss) / 1.5
          },
          score: rec.confidence === 'high' ? 85 : 70,
          reasoning: rec.reasoning,
          tradeType: 'swing',
          expectedDays: rec.expectedDays
        };
        
        const result = await metaApiHandler.placeOrder(signal);
        
        if (result.success) {
          await Trade.findOneAndUpdate(
            { mt5OrderId: result.data?.orderId },
            { 
              tradeType: 'swing',
              expectedHoldDays: rec.expectedDays,
              swingTarget2: rec.target2
            }
          );
          
          const candidate = analysis.candidates.find(c => c.symbol === rec.symbol);
          
          const aiTrade = new AiTrade({
            symbol: rec.symbol,
            mt5Symbol: signal.symbol,
            direction: rec.direction,
            entry: rec.entry,
            stopLoss: rec.stopLoss,
            target1: rec.target1,
            target2: rec.target2,
            confidence: rec.confidence,
            aiReasoning: rec.reasoning,
            riskRewardRatio: rec.riskRewardRatio,
            expectedDays: rec.expectedDays,
            rank: rec.rank,
            setup: candidate?.setup || '',
            trend: candidate?.trend || '',
            marketContext: analysis.marketContext ? {
              regime: analysis.marketContext.regime,
              spyChange: analysis.marketContext.spy.changePercent,
              spyTrend: analysis.marketContext.spy.trend,
              vix: analysis.marketContext.vix.current
            } : undefined,
            sectorAnalysis: candidate ? {
              sector: candidate.sector,
              sectorRank: analysis.sectorAnalysis?.sectors.find(s => s.name === candidate.sector)?.rank || 0,
              sectorChange: analysis.sectorAnalysis?.sectors.find(s => s.name === candidate.sector)?.changePercent || 0
            } : undefined,
            volume: 0.01,
            orderType: 'swing',
            mt5OrderId: result.data?.orderId,
            mt5PositionId: result.data?.positionId,
            status: 'placed',
            signalTime: new Date(),
            orderPlacedTime: new Date()
          });
          
          await aiTrade.save();
          console.log(`[SWING EXECUTOR] ✅ ${rec.symbol} saved to ai_trades collection`);
          
          tradesPlaced++;
          console.log(`[SWING EXECUTOR] ✅ ${rec.symbol} order placed successfully`);
        } else {
          errors.push(`${rec.symbol}: ${result.error}`);
          console.log(`[SWING EXECUTOR] ❌ ${rec.symbol} failed: ${result.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        errors.push(`${rec.symbol}: ${error.message}`);
        console.error(`[SWING EXECUTOR] Error executing ${rec.symbol}:`, error);
      }
    }
    
    lastScanTime = new Date();
    
    console.log(`[SWING EXECUTOR] Complete. Placed ${tradesPlaced} trades, ${errors.length} errors`);
    
    return { success: true, tradesPlaced, errors };
    
  } catch (error: any) {
    console.error('[SWING EXECUTOR] Error:', error);
    return { success: false, tradesPlaced, errors: [error.message] };
  }
}

async function scheduledCheck() {
  if (!executorEnabled) return;
  
  try {
    if (isSwingTradingTime()) {
      console.log('[SWING EXECUTOR] Trading window detected, running analysis...');
      await executeSwingTrades();
    }
  } catch (error) {
    console.error('[SWING EXECUTOR] Scheduled check error:', error);
  }
  
  if (executorEnabled) {
    dailyCheckTimeout = setTimeout(scheduledCheck, 5 * 60 * 1000);
  }
}

export function startSwingExecutor(): void {
  if (executorEnabled) {
    console.log('[SWING EXECUTOR] Already running');
    return;
  }
  
  executorEnabled = true;
  console.log('[SWING EXECUTOR] Started - will scan daily at 20:30 UTC (3:30 PM EST)');
  
  scheduledCheck();
}

export function stopSwingExecutor(): void {
  executorEnabled = false;
  
  if (dailyCheckTimeout) {
    clearTimeout(dailyCheckTimeout);
    dailyCheckTimeout = null;
  }
  
  console.log('[SWING EXECUTOR] Stopped');
}

export async function triggerSwingTradeNow(): Promise<{
  success: boolean;
  tradesPlaced: number;
  errors: string[];
}> {
  console.log('[SWING EXECUTOR] Manual trigger requested');
  return executeSwingTrades();
}
