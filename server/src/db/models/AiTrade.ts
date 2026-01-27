import { Schema, model } from 'mongoose';

export interface IAiTrade {
  _id?: any;
  symbol: string;
  mt5Symbol: string;
  direction: 'long' | 'short';
  
  entry: number;
  actualEntry?: number;
  stopLoss: number;
  target1: number;
  target2?: number;
  
  confidence: 'high' | 'medium';
  aiReasoning: string;
  riskRewardRatio: number;
  expectedDays: number;
  rank: number;
  
  setup: string;
  trend: string;
  
  marketContext?: {
    regime: string;
    spyChange: number;
    spyTrend: string;
    vix: number;
  };
  
  sectorAnalysis?: {
    sector: string;
    sectorRank: number;
    sectorChange: number;
  };
  
  volume: number;
  orderType: string;
  mt5OrderId?: string;
  mt5PositionId?: string;
  
  status: 'placed' | 'filled' | 'closed' | 'cancelled';
  
  signalTime: Date;
  orderPlacedTime?: Date;
  filledTime?: Date;
  closedTime?: Date;
  
  exitPrice?: number;
  exitReason?: 'stop_loss' | 'take_profit' | 'max_hold_time' | 'manual' | 'cancelled';
  daysHeld?: number;
  
  pnlAmount?: number;
  pnlPercent?: number;
  commission?: number;
  
  notes?: string;
}

const AiTradeSchema = new Schema({
  symbol: { type: String, required: true },
  mt5Symbol: { type: String, required: true },
  direction: { type: String, enum: ['long', 'short'], required: true },
  
  entry: { type: Number, required: true },
  actualEntry: Number,
  stopLoss: { type: Number, required: true },
  target1: { type: Number, required: true },
  target2: Number,
  
  confidence: { type: String, enum: ['high', 'medium'], required: true },
  aiReasoning: { type: String, required: true },
  riskRewardRatio: { type: Number, required: true },
  expectedDays: { type: Number, required: true },
  rank: { type: Number, required: true },
  
  setup: String,
  trend: String,
  
  marketContext: {
    regime: String,
    spyChange: Number,
    spyTrend: String,
    vix: Number
  },
  
  sectorAnalysis: {
    sector: String,
    sectorRank: Number,
    sectorChange: Number
  },
  
  volume: { type: Number, required: true },
  orderType: { type: String, required: true },
  mt5OrderId: String,
  mt5PositionId: String,
  
  status: { 
    type: String, 
    enum: ['placed', 'filled', 'closed', 'cancelled'], 
    default: 'placed' 
  },
  
  signalTime: { type: Date, required: true },
  orderPlacedTime: Date,
  filledTime: Date,
  closedTime: Date,
  
  exitPrice: Number,
  exitReason: { 
    type: String, 
    enum: ['stop_loss', 'take_profit', 'max_hold_time', 'manual', 'cancelled'] 
  },
  daysHeld: Number,
  
  pnlAmount: Number,
  pnlPercent: Number,
  commission: Number,
  
  notes: String
}, { 
  timestamps: true,
  collection: 'ai_trades'
});

AiTradeSchema.index({ status: 1, signalTime: -1 });
AiTradeSchema.index({ symbol: 1, status: 1 });
AiTradeSchema.index({ mt5OrderId: 1 });
AiTradeSchema.index({ mt5PositionId: 1 });

AiTradeSchema.pre('save', function(next) {
  if (this.exitPrice && this.actualEntry) {
    const entryPrice = this.actualEntry;
    const exitPrice = this.exitPrice;
    const isLong = this.direction === 'long';
    
    this.pnlPercent = isLong
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;
    
    this.pnlAmount = (this.pnlPercent / 100) * (this.volume * entryPrice);
  }
  next();
});

export const AiTrade = model('AiTrade', AiTradeSchema);
