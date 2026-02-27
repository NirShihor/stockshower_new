import { Schema, model, Document } from 'mongoose';

export type MarketStatus =
  | 'CONFIRMED_UPTREND'       // 0-3 distribution days, normal trading
  | 'UPTREND_UNDER_PRESSURE'  // 4 distribution days, reduce exposure
  | 'MARKET_IN_CORRECTION'    // 5+ distribution days, defensive mode
  | 'RALLY_ATTEMPT';          // After correction, attempting to rally

export interface IMarketStatusHistory extends Document {
  date: string;
  distributionCount: number;
  marketStatus: MarketStatus;
  positionSizingMultiplier: number;
  distributionDates: string[];
  stallingDates: string[];
  rallyAttemptDay: number;
  rallyStartDate: string | null;
  lastFollowThroughDate: string | null;
  notes: string;
  spyClose: number;
  spyChangePercent: number;
  spyVolume: number;
  createdAt: Date;
  updatedAt: Date;
}

const MarketStatusHistorySchema: Schema = new Schema({
  date: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  distributionCount: {
    type: Number,
    required: true,
    default: 0
  },
  marketStatus: {
    type: String,
    enum: ['CONFIRMED_UPTREND', 'UPTREND_UNDER_PRESSURE', 'MARKET_IN_CORRECTION', 'RALLY_ATTEMPT'],
    required: true,
    default: 'CONFIRMED_UPTREND'
  },
  positionSizingMultiplier: {
    type: Number,
    required: true,
    default: 1.0
  },
  distributionDates: {
    type: [String],
    default: []
  },
  stallingDates: {
    type: [String],
    default: []
  },
  rallyAttemptDay: {
    type: Number,
    default: 0
  },
  rallyStartDate: {
    type: String,
    default: null
  },
  lastFollowThroughDate: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  spyClose: {
    type: Number
  },
  spyChangePercent: {
    type: Number
  },
  spyVolume: {
    type: Number
  }
}, {
  timestamps: true
});

// Index for finding recent status history
MarketStatusHistorySchema.index({ date: -1 });
MarketStatusHistorySchema.index({ marketStatus: 1, date: -1 });

export const MarketStatusHistory = model<IMarketStatusHistory>('MarketStatusHistory', MarketStatusHistorySchema as any);
