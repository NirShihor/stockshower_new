import { Schema, model } from 'mongoose';

export interface ICanslimTrade {
  _id?: any;
  symbol: string;
  mt5Symbol: string;
  market: 'US' | 'UK';
  exchange?: string;
  currency: 'USD' | 'GBP';

  entryPrice: number;
  actualEntryPrice?: number;
  stopLoss: number;
  takeProfit: number;
  stopPercent: number;
  
  direction: 'long';
  orderType: string;
  volume: number;
  
  score: number;
  maxScore: number;
  
  signalDate: string;
  signalTime: Date;
  orderPlacedTime?: Date;
  filledTime?: Date;
  closedTime?: Date;
  
  exitPrice?: number;
  exitReason?: 'stop_loss' | 'target' | 'trailing_stop' | 'max_hold' | 'manual' | 'end_of_day';
  holdingDays?: number;
  
  pnlAmount?: number;
  pnlPercentage?: number;
  commission?: number;
  
  marketRegime: string;
  marketRegimeReason: string;
  forceOverride: boolean;
  
  rsRating?: number;
  rs12MonthReturn?: number;
  percentFromHigh?: number;
  basePatternType?: string;
  basePatternDepth?: number;
  basePatternWeeks?: number;
  sectorRank?: number;
  sectorMomentum?: string;
  volumeRatio?: number;
  
  floatShares?: number;
  outstandingShares?: number;
  
  earningsCheckPassed?: boolean;
  earningsCheckReason?: string;
  quarterlyEpsGrowth?: string;
  annualEarningsTrend?: string;
  institutionalOwnership?: string;
  
  mt5OrderId?: string;
  mt5PositionId?: string;
  mt5Error?: string;
  
  status: 'pending' | 'placed' | 'filled' | 'closed' | 'cancelled' | 'failed';
  
  dryRun: boolean;
  
  signalData?: any;
}

const CanslimTradeSchema = new Schema({
  symbol: { type: String, required: true, index: true },
  mt5Symbol: { type: String, required: true },
  market: { type: String, enum: ['US', 'UK'], default: 'US', index: true },
  exchange: { type: String },
  currency: { type: String, enum: ['USD', 'GBP'], default: 'USD' },

  entryPrice: { type: Number, required: true },
  actualEntryPrice: { type: Number },
  stopLoss: { type: Number, required: true },
  takeProfit: { type: Number, required: true },
  stopPercent: { type: Number, required: true },
  
  direction: { type: String, default: 'long' },
  orderType: { type: String },
  volume: { type: Number },
  
  score: { type: Number, required: true },
  maxScore: { type: Number, default: 6 },
  
  signalDate: { type: String, required: true, index: true },
  signalTime: { type: Date, required: true },
  orderPlacedTime: { type: Date },
  filledTime: { type: Date },
  closedTime: { type: Date },
  
  exitPrice: { type: Number },
  exitReason: { type: String },
  holdingDays: { type: Number },
  
  pnlAmount: { type: Number },
  pnlPercentage: { type: Number },
  commission: { type: Number },
  
  marketRegime: { type: String, required: true },
  marketRegimeReason: { type: String },
  forceOverride: { type: Boolean, default: false },
  
  rsRating: { type: Number },
  rs12MonthReturn: { type: Number },
  percentFromHigh: { type: Number },
  basePatternType: { type: String },
  basePatternDepth: { type: Number },
  basePatternWeeks: { type: Number },
  sectorRank: { type: Number },
  sectorMomentum: { type: String },
  volumeRatio: { type: Number },
  
  floatShares: { type: Number },
  outstandingShares: { type: Number },
  
  earningsCheckPassed: { type: Boolean },
  earningsCheckReason: { type: String },
  quarterlyEpsGrowth: { type: String },
  annualEarningsTrend: { type: String },
  institutionalOwnership: { type: String },
  
  mt5OrderId: { type: String, index: true },
  mt5PositionId: { type: String, index: true },
  mt5Error: { type: String },
  
  status: { type: String, required: true, default: 'pending', index: true },
  
  dryRun: { type: Boolean, default: true },
  
  signalData: { type: Schema.Types.Mixed }
}, { 
  timestamps: true,
  collection: 'can_slim'
});

CanslimTradeSchema.index({ status: 1, signalTime: -1 });
CanslimTradeSchema.index({ signalDate: 1, status: 1 });

CanslimTradeSchema.pre('save', function(next) {
  if (this.exitPrice && this.actualEntryPrice) {
    const priceDiff = this.exitPrice - this.actualEntryPrice;
    this.pnlAmount = priceDiff * (this.volume || 1);
    this.pnlPercentage = (priceDiff / this.actualEntryPrice) * 100;
    
    if (this.filledTime && this.closedTime) {
      const diffTime = this.closedTime.getTime() - this.filledTime.getTime();
      this.holdingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }
  next();
});

export const CanslimTrade = model<ICanslimTrade>('CanslimTrade', CanslimTradeSchema as any);
