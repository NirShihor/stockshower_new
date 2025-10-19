import { Schema, model } from 'mongoose';

export interface IRiskState {
  _id?: any;
  date: string; // YYYY-MM-DD format for daily tracking
  dailyPnL: number;
  dailyPnLPercent: number;
  tradesCount: number;
  winCount: number;
  lossCount: number;
  consecutiveLosses: number;
  maxDrawdown: number;
  totalExposure: number;
  circuitBreakerActive: boolean;
  circuitBreakerReason?: string;
  circuitBreakerTriggeredAt?: Date;
  symbolMetrics: any;
  triggers: Array<{
    type: string;
    value: number;
    threshold: number;
    triggeredAt: Date;
    message: string;
  }>;
  accountBalance: number;
  lastUpdateTime: Date;
}

const RiskStateSchema = new Schema({
  date: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  dailyPnL: { type: Number, default: 0 },
  dailyPnLPercent: { type: Number, default: 0 },
  tradesCount: { type: Number, default: 0 },
  winCount: { type: Number, default: 0 },
  lossCount: { type: Number, default: 0 },
  consecutiveLosses: { type: Number, default: 0 },
  maxDrawdown: { type: Number, default: 0 },
  totalExposure: { type: Number, default: 0 },
  circuitBreakerActive: { type: Boolean, default: false },
  circuitBreakerReason: { type: String },
  circuitBreakerTriggeredAt: { type: Date },
  symbolMetrics: {
    type: Object,
    default: {}
  },
  triggers: [{
    type: String,
    value: Number,
    threshold: Number,
    triggeredAt: Date,
    message: String
  }],
  accountBalance: { type: Number, required: true },
  lastUpdateTime: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for performance
RiskStateSchema.index({ date: -1 });
RiskStateSchema.index({ circuitBreakerActive: 1 });

export const RiskState = model<IRiskState>('RiskState', RiskStateSchema);