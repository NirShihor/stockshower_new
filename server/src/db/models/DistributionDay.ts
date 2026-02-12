import { Schema, model, Document } from 'mongoose';

export interface IDistributionDay extends Document {
  date: string;
  index: 'SPY' | 'QQQ';
  close: number;
  volume: number;
  prevClose: number;
  prevVolume: number;
  avgVolume20: number;
  changePercent: number;
  isDistributionDay: boolean;
  isStallingDay: boolean;
  isFollowThroughDay: boolean;
  isResetDay: boolean;
  distributionCountAtDate: number;
  marketStatusAtDate: string;
  createdAt: Date;
  updatedAt: Date;
}

const DistributionDaySchema: Schema = new Schema({
  date: {
    type: String,
    required: true,
    index: true
  },
  index: {
    type: String,
    enum: ['SPY', 'QQQ'],
    required: true
  },
  close: {
    type: Number,
    required: true
  },
  volume: {
    type: Number,
    required: true
  },
  prevClose: {
    type: Number,
    required: true
  },
  prevVolume: {
    type: Number,
    required: true
  },
  avgVolume20: {
    type: Number,
    required: true
  },
  changePercent: {
    type: Number,
    required: true
  },
  isDistributionDay: {
    type: Boolean,
    default: false
  },
  isStallingDay: {
    type: Boolean,
    default: false
  },
  isFollowThroughDay: {
    type: Boolean,
    default: false
  },
  isResetDay: {
    type: Boolean,
    default: false
  },
  distributionCountAtDate: {
    type: Number,
    default: 0
  },
  marketStatusAtDate: {
    type: String,
    enum: ['CONFIRMED_UPTREND', 'UPTREND_UNDER_PRESSURE', 'MARKET_IN_CORRECTION', 'RALLY_ATTEMPT'],
    default: 'CONFIRMED_UPTREND'
  }
}, {
  timestamps: true
});

// Compound index for efficient queries by date and index
DistributionDaySchema.index({ date: 1, index: 1 }, { unique: true });

// Index for finding distribution days in a date range
DistributionDaySchema.index({ isDistributionDay: 1, date: -1 });
DistributionDaySchema.index({ isStallingDay: 1, date: -1 });

export const DistributionDay = model<IDistributionDay>('DistributionDay', DistributionDaySchema as any);
