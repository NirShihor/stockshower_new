import { Schema, model } from 'mongoose';

export interface IScanLog {
  _id?: any;

  // Scan identification
  scanType: 'canslim';
  market: 'US' | 'UK';
  scanDate: string;
  scanTime: Date;

  // Duration
  durationSeconds: number;

  // Universe
  universeSize: number;

  // Market conditions
  marketRegime: string;
  distributionDayStatus?: string;
  distributionDayCount?: number;
  positionSizingMultiplier?: number;
  canTrade: boolean;
  marketRegimeReason?: string;

  // Results
  candidatesFound: number;
  tradesExecuted: number;

  // Skipped breakdown
  skippedEarnings: number;
  skippedDuplicate: number;
  skippedMarketRegime: boolean;
  skippedReason?: string;

  // Candidate details (top candidates for reference)
  topCandidates?: Array<{
    symbol: string;
    score: number;
    rsRating?: number;
    percentFromHigh?: number;
    basePatternType?: string;
    executed: boolean;
    skipReason?: string;
  }>;

  // Configuration used
  config?: {
    minScore: number;
    maxDailyTrades: number;
    targetMarginGBP: number;
    dryRun: boolean;
    ignoreMarketRegime: boolean;
    useEarningsFilter: boolean;
  };

  // Errors encountered
  errors?: string[];

  // Mode
  dryRun: boolean;
}

const ScanLogSchema = new Schema({
  scanType: { type: String, required: true, default: 'canslim', index: true },
  market: { type: String, enum: ['US', 'UK'], required: true, index: true },
  scanDate: { type: String, required: true, index: true },
  scanTime: { type: Date, required: true, index: true },

  durationSeconds: { type: Number },

  universeSize: { type: Number },

  marketRegime: { type: String },
  distributionDayStatus: { type: String },
  distributionDayCount: { type: Number },
  positionSizingMultiplier: { type: Number },
  canTrade: { type: Boolean },
  marketRegimeReason: { type: String },

  candidatesFound: { type: Number, default: 0 },
  tradesExecuted: { type: Number, default: 0 },

  skippedEarnings: { type: Number, default: 0 },
  skippedDuplicate: { type: Number, default: 0 },
  skippedMarketRegime: { type: Boolean, default: false },
  skippedReason: { type: String },

  topCandidates: [{
    symbol: String,
    score: Number,
    rsRating: Number,
    percentFromHigh: Number,
    basePatternType: String,
    executed: Boolean,
    skipReason: String
  }],

  config: {
    minScore: Number,
    maxDailyTrades: Number,
    targetMarginGBP: Number,
    dryRun: Boolean,
    ignoreMarketRegime: Boolean,
    useEarningsFilter: Boolean
  },

  errors: [String],

  dryRun: { type: Boolean, default: true }
}, {
  timestamps: true,
  collection: 'scan_logs'
});

// Compound indexes for common queries
ScanLogSchema.index({ scanDate: 1, market: 1 });
ScanLogSchema.index({ scanTime: -1 });

export const ScanLog = model<IScanLog>('ScanLog', ScanLogSchema as any);
