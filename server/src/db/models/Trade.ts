import { Schema, model, Types } from 'mongoose';

// Define the document interface with all required and optional fields
export interface ITrade {
  _id?: any;
  symbol: string;
  mt5Symbol: string;
  patternName: string;
  patternScore: number;
  patternClass?: string;
  
  entryPrice: number;
  actualEntryPrice?: number;
  stopLoss: number;
  takeProfit: number;
  
  direction: string;
  orderType: string;
  volume: number;
  
  signalTime: Date;
  orderPlacedTime?: Date;
  filledTime?: Date;
  closedTime?: Date;
  
  exitPrice?: number;
  exitReason?: string;
  
  cancelReason?: string;
  cancelTime?: Date;
  
  pnlAmount?: number;
  pnlPercentage?: number;
  commission?: number;
  
  marketConditions?: any;
  
  mt5OrderId?: string;
  mt5PositionId?: string;
  mt5Error?: string;
  
  status: string;
  
  timeframe: string;
  scannerType?: string;
  notes?: string;
  
  signalData?: any;
}

const TradeSchema: any = new Schema({}, { timestamps: true, strict: false });

// Indexes for common queries
TradeSchema.index({ status: 1, signalTime: -1 });
TradeSchema.index({ symbol: 1, status: 1 });
TradeSchema.index({ patternName: 1, status: 1 });
TradeSchema.index({ mt5OrderId: 1 });
TradeSchema.index({ mt5PositionId: 1 });

// Calculate P&L before saving if we have exit price
(TradeSchema as any).pre('save', function(this: any, next: any) {
  if (this.exitPrice && this.actualEntryPrice) {
    const multiplier = this.direction === 'long' ? 1 : -1;
    const priceDiff = (this.exitPrice - this.actualEntryPrice) * multiplier;
    this.pnlAmount = priceDiff * this.volume * 100; // Assuming standard lot size
    this.pnlPercentage = (priceDiff / this.actualEntryPrice) * 100 * multiplier;
  }
  next();
});

export const Trade = model('Trade', TradeSchema);