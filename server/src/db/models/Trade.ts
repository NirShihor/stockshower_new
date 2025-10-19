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

const TradeSchema = new Schema({
  symbol: { type: String, required: true, index: true },
  mt5Symbol: { type: String, required: true },
  patternName: { type: String, required: true, index: true },
  patternScore: { type: Number, required: true },
  patternClass: String,
  
  entryPrice: { type: Number, required: true },
  actualEntryPrice: Number,
  stopLoss: { type: Number, required: true },
  takeProfit: { type: Number, required: true },
  
  direction: { type: String, required: true },
  orderType: { type: String, required: true },
  volume: { type: Number, required: true },
  
  signalTime: { type: Date, required: true, index: true },
  orderPlacedTime: Date,
  filledTime: Date,
  closedTime: Date,
  
  exitPrice: Number,
  exitReason: String,
  
  cancelReason: String,
  cancelTime: Date,
  
  pnlAmount: Number,
  pnlPercentage: Number,
  commission: Number,
  
  marketConditions: Schema.Types.Mixed,
  
  mt5OrderId: String,
  mt5PositionId: String,
  mt5Error: String,
  
  status: { type: String, required: true, default: 'pending', index: true },
  
  // Additional data
  timeframe: { type: String, default: '5m' },
  scannerType: String,
  notes: String,
  signalData: Schema.Types.Mixed
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
});

// Indexes for common queries
TradeSchema.index({ status: 1, signalTime: -1 });
TradeSchema.index({ symbol: 1, status: 1 });
TradeSchema.index({ patternName: 1, status: 1 });
TradeSchema.index({ mt5OrderId: 1 });
TradeSchema.index({ mt5PositionId: 1 });

// Calculate P&L before saving if we have exit price
TradeSchema.pre('save', function(next) {
  if (this.exitPrice && this.actualEntryPrice) {
    const multiplier = this.direction === 'long' ? 1 : -1;
    const priceDiff = (this.exitPrice - this.actualEntryPrice) * multiplier;
    this.pnlAmount = priceDiff * this.volume * 100; // Assuming standard lot size
    this.pnlPercentage = (priceDiff / this.actualEntryPrice) * 100 * multiplier;
  }
  next();
});

export const Trade = model('Trade', TradeSchema);