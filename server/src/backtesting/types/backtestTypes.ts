import { ComprehensiveSignal } from '../../candlestick/types/comprehensive.js';
import { Trade } from '../../db/models/Trade.js';

export interface BacktestConfig {
  symbols: string[];
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  positionSizeGBP: number;
  maxConcurrentPositions: number;
  enableAutoExecution: boolean;
  autoExecutionThreshold: number;
  enableCircuitBreaker?: boolean;
  enableTrapFades: boolean;
  slippageModel: 'fixed' | 'dynamic';
  slippageBps?: number; // basis points
  commissionPerTrade: number;
  source?: 'polygon' | 'local';
}

export interface BacktestCandle {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface BacktestPosition {
  id: string;
  symbol: string;
  signal: ComprehensiveSignal;
  entryTime: Date;
  entryPrice: number;
  plannedEntryPrice: number;
  slippage: number;
  size: number;
  direction: 'long' | 'short';
  stopLoss: number;
  takeProfit: number;
  status: 'pending' | 'filled' | 'closed';
  exitTime?: Date;
  exitPrice?: number;
  exitReason?: 'stop_loss' | 'take_profit' | 'signal' | 'end_of_data';
  pnl?: number;
  pnlPercent?: number;
  commission: number;
}

export interface BacktestTick {
  timestamp: Date;
  bid: number;
  ask: number;
  spread: number;
}

export interface BacktestResults {
  config: BacktestConfig;
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    totalPnLPercent: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    profitFactor: number;
    averageWin: number;
    averageLoss: number;
    largestWin: number;
    largestLoss: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    timeInMarket: number; // percentage
  };
  trades: BacktestPosition[];
  equityCurve: Array<{
    timestamp: Date;
    balance: number;
    drawdown: number;
    openPositions: number;
  }>;
  patternPerformance: Map<string, {
    count: number;
    winRate: number;
    avgPnL: number;
    totalPnL: number;
  }>;
  dailyStats: Array<{
    date: Date;
    trades: number;
    pnl: number;
    winRate: number;
  }>;
}

export interface BacktestState {
  currentBalance: number;
  openPositions: Map<string, BacktestPosition>;
  closedPositions: BacktestPosition[];
  pendingSignals: Map<string, ComprehensiveSignal>;
  lastSignalTime: Map<string, Date>;
  consecutiveLosses: number;
  dailyStats: {
    trades: number;
    pnl: number;
    wins: number;
    losses: number;
  };
  equityCurve: Array<{
    timestamp: Date;
    balance: number;
    drawdown: number;
    openPositions: number;
  }>;
  maxBalance: number;
  maxDrawdown: number;
}

export interface SimulatedFill {
  fillPrice: number;
  slippage: number;
  commission: number;
  fillTime: Date;
}