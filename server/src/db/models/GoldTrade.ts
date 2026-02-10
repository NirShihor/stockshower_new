import { Schema, model } from 'mongoose';

export interface IGoldTrade {
  _id?: any;
  symbol: string;

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
  exitReason?: 'stop_loss' | 'target' | 'trailing_stop' | 'manual' | 'expired';
  holdingDays?: number;

  pnlAmount?: number;
  pnlPercentage?: number;
  commission?: number;

  equityMarketRegime: string;
  equityMarketReason: string;

  goldEma20: number;
  goldTrend: 'bullish' | 'bearish';
  consolidationHigh: number;
  consolidationLow: number;
  consolidationDays: number;
  breakoutLevel: number;

  vixLevel?: number;
  vixElevated?: boolean;

  mt5OrderId?: string;
  mt5PositionId?: string;
  mt5Error?: string;

  status: 'pending' | 'placed' | 'filled' | 'closed' | 'cancelled' | 'failed';

  dryRun: boolean;
}

const GoldTradeSchema = new Schema({
  symbol: { type: String, required: true, default: 'GOLD' },

  entryPrice: { type: Number, required: true },
  actualEntryPrice: { type: Number },
  stopLoss: { type: Number, required: true },
  takeProfit: { type: Number, required: true },
  stopPercent: { type: Number, required: true },

  direction: { type: String, default: 'long' },
  orderType: { type: String },
  volume: { type: Number },

  score: { type: Number, required: true },
  maxScore: { type: Number, default: 3 },

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

  equityMarketRegime: { type: String, required: true },
  equityMarketReason: { type: String },

  goldEma20: { type: Number },
  goldTrend: { type: String },
  consolidationHigh: { type: Number },
  consolidationLow: { type: Number },
  consolidationDays: { type: Number },
  breakoutLevel: { type: Number },

  vixLevel: { type: Number },
  vixElevated: { type: Boolean },

  mt5OrderId: { type: String, index: true },
  mt5PositionId: { type: String, index: true },
  mt5Error: { type: String },

  status: { type: String, required: true, default: 'pending', index: true },

  dryRun: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'gold_trades'
});

GoldTradeSchema.index({ status: 1, signalTime: -1 });
GoldTradeSchema.index({ signalDate: 1, status: 1 });

GoldTradeSchema.pre('save', function(next) {
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

export const GoldTrade = model<IGoldTrade>('GoldTrade', GoldTradeSchema as any);
