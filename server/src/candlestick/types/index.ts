import { ComprehensiveSignal } from './comprehensive.js';

export interface Candle {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  start: string; // ISO timestamp
  end: string;   // ISO timestamp
}

export interface OrderSuggestion {
  type: 'BUY_STOP' | 'SELL_STOP' | 'BUY_LIMIT' | 'SELL_LIMIT';
  price: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: string;
  comment: string;
}

export interface Signal {
  id: string;
  type: string;
  symbol: string;
  timeframe: string;
  at: string; // ISO timestamp
  meta?: Record<string, any>;
  orderSuggestion?: OrderSuggestion;
}

export interface WebSocketMessage {
  type: 'candle' | 'signal';
  payload: Candle | Signal | ComprehensiveSignal | any; // Added any for now to fix build
}

export interface PolygonAggregateMessage {
  ev: string;    // Event type (AM = aggregate minute, A = aggregate second)
  sym: string;   // Symbol
  s: number;     // Start time in milliseconds
  e?: number;    // End time in milliseconds (AM only)
  o: number;     // Open
  h: number;     // High
  l: number;     // Low
  c: number;     // Close
  v: number;     // Volume
  a?: number;    // Volume weighted average
  n?: number;    // Number of trades
}

export interface PolygonHistoricalBar {
  t: number;     // Timestamp in milliseconds
  o: number;     // Open
  h: number;     // High
  l: number;     // Low
  c: number;     // Close
  v: number;     // Volume
  n?: number;    // Number of trades
  vw?: number;   // Volume weighted average
}