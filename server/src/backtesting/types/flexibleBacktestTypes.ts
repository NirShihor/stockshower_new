export type EntryStrategy = 
  | 'drop_from_open'
  | 'drop_from_vwap'
  | 'below_vwap'
  | 'breakout_high'
  | 'breakout_low';

export type EntryTiming =
  | 'immediate'
  | 'candle_close'
  | 'pullback';

export type StopLossStrategy =
  | 'fixed_percent'
  | 'atr_based'
  | 'below_low'
  | 'trailing';

export type TargetStrategy =
  | 'fixed_rr'
  | 'fixed_percent'
  | 'vwap'
  | 'open_price'
  | 'eod_hold';

export type TradeDirection = 'long' | 'short' | 'both';

export interface FlexibleBacktestConfig {
  startDate: string;
  endDate: string;
  
  entryStrategy: EntryStrategy;
  entryThreshold: number;
  entryTiming: EntryTiming;
  confirmationCandles?: number;
  
  stopLossStrategy: StopLossStrategy;
  stopLossValue: number;
  trailingActivation?: number;
  trailingDistance?: number;
  
  targetStrategy: TargetStrategy;
  targetValue: number;
  
  positionSize: number;
  maxDailyTrades: number;
  
  direction: TradeDirection;
  minPrice: number;
  maxPrice: number;
  tradingWindowStart: number;
  tradingWindowEnd: number;
  minVolume?: number;
  useSpyFilter: boolean;
  spyFilterThreshold?: number;
  
  symbols: string[];
  
  commissionPerTrade: number;
  slippageBps: number;
}

export interface FlexibleTrade {
  symbol: string;
  date: string;
  direction: 'long' | 'short';
  
  entryTime: string;
  entryPrice: number;
  entryReason: string;
  
  exitTime?: string;
  exitPrice?: number;
  exitReason?: 'target' | 'stop_loss' | 'trailing_stop' | 'eod' | 'filter';
  
  stopLoss: number;
  target: number;
  riskPercent: number;
  
  pnl?: number;
  pnlPercent?: number;
  commission: number;
  slippage: number;
  
  shares: number;
  positionValue: number;
  
  status: 'pending' | 'filled' | 'closed';
}

export interface FlexibleBacktestResult {
  config: FlexibleBacktestConfig;
  trades: FlexibleTrade[];
  
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    
    totalPnL: number;
    grossProfit: number;
    grossLoss: number;
    
    avgWin: number;
    avgLoss: number;
    avgRR: number;
    
    profitFactor: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    
    bestTrade: number;
    worstTrade: number;
    
    avgHoldTime: number;
    tradesPerDay: number;
  };
  
  byExitReason: {
    target: { count: number; pnl: number };
    stopLoss: { count: number; pnl: number };
    trailingStop: { count: number; pnl: number };
    eod: { count: number; pnl: number };
  };
  
  monthly: Array<{
    month: string;
    trades: number;
    wins: number;
    pnl: number;
    winRate: number;
  }>;
  
  bySymbol: Map<string, {
    trades: number;
    wins: number;
    pnl: number;
    winRate: number;
  }>;
}

export interface GridSearchConfig {
  baseConfig: Partial<FlexibleBacktestConfig>;
  
  entryThresholdRange?: number[];
  stopLossRange?: number[];
  targetRange?: number[];
  tradingWindowStartRange?: number[];
  
  sortBy: 'pnl' | 'winRate' | 'profitFactor' | 'sharpe';
  topN: number;
}

export interface GridSearchResult {
  configs: FlexibleBacktestConfig[];
  results: Array<{
    config: FlexibleBacktestConfig;
    summary: FlexibleBacktestResult['summary'];
    rank: number;
  }>;
  bestConfig: FlexibleBacktestConfig;
  searchTime: number;
}
