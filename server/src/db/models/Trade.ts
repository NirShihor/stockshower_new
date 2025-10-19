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
  // Basic trade info
  symbol: { type: String, required: true, index: true },
  mt5Symbol: { type: String, required: true },
  patternName: { type: String, required: true, index: true },
  patternScore: { type: Number, required: true },
  patternClass: { type: String, enum: ['single', 'double', 'triple'] },
  
  // Price levels
  entryPrice: { type: Number, required: true },
  actualEntryPrice: Number,
  stopLoss: { type: Number, required: true },
  takeProfit: { type: Number, required: true },
  
  // Trade details
  direction: { type: String, required: true, enum: ['long', 'short'] },
  orderType: { 
    type: String, 
    required: true, 
    enum: ['BUY_STOP', 'BUY_LIMIT', 'SELL_STOP', 'SELL_LIMIT', 'BUY', 'SELL'] 
  },
  volume: { type: Number, required: true },
  
  // Timing
  signalTime: { type: Date, required: true, index: true },
  orderPlacedTime: { type: Date, index: true },
  filledTime: Date,
  closedTime: Date,
  
  // Exit details
  exitPrice: Number,
  exitReason: { 
    type: String, 
    enum: ['stop_loss', 'take_profit', 'manual', 'system', 'timeout'] 
  },
  
  // Cancellation details
  cancelReason: {
    type: String,
    enum: ['price_never_reached', 'manual_cancel', 'end_of_day', 'timeout', 'system']
  },
  cancelTime: Date,
  
  // P&L
  pnlAmount: Number,
  pnlPercentage: Number,
  commission: Number,
  
  // Market conditions
  marketConditions: {
    trend: { type: String, enum: ['up', 'down', 'sideways'] },
    volatility: { type: String, enum: ['low', 'medium', 'high'] },
    volume: Number,
    atr: Number,
    nearSupport: Boolean,
    nearResistance: Boolean
  },
  
  // MT5 details
  mt5OrderId: String,
  mt5PositionId: String,
  mt5Error: String,
  
  // Status
  status: { 
    type: String, 
    required: true,
    default: 'pending',
    enum: ['pending', 'placed', 'filled', 'partial', 'closed', 'cancelled', 'rejected'],
    index: true
  },
  
  // Additional data
  timeframe: { type: String, default: '5m' },
  scannerType: { 
    type: String, 
    enum: ['pattern', 'gap', 'premarket', 'manual'] 
  },
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