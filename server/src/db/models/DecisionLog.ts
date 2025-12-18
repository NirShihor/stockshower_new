import { Schema, model } from 'mongoose';

export interface IDecisionLog {
  symbol: string;
  patternName: string;
  patternScore: number;
  signalTime: Date;
  decisionTime: Date;
  
  originalDirection: 'long' | 'short';
  originalEntry: number;
  originalStop: number;
  originalTarget: number;
  
  decision: 'invert' | 'skip' | 'pass';
  decisionReason: string;
  
  wasInverted: boolean;
  invertedDirection?: 'long' | 'short';
  invertedEntry?: number;
  invertedStop?: number;
  invertedTarget?: number;
  
  trend: string;
  isTrendAligned: boolean;
  timeOfDay: string;
  priceAtDecision: number;
  
  hypotheticalOutcome?: {
    checkedAt: Date;
    priceAfter1h?: number;
    priceAfter2h?: number;
    priceAfter4h?: number;
    wouldHitStop: boolean;
    wouldHitTarget: boolean;
    timeToExit?: number;
    hypotheticalPnlPercent?: number;
    outcome: 'win' | 'loss' | 'pending' | 'unknown';
  };
  
  actualTradeId?: string;
  actualOutcome?: {
    wasExecuted: boolean;
    actualPnlPercent?: number;
    exitReason?: string;
  };
}

const DecisionLogSchema = new Schema<IDecisionLog>({
  symbol: { type: String, required: true, index: true },
  patternName: { type: String, required: true },
  patternScore: { type: Number, required: true },
  signalTime: { type: Date, required: true, index: true },
  decisionTime: { type: Date, required: true },
  
  originalDirection: { type: String, required: true, enum: ['long', 'short'] },
  originalEntry: { type: Number, required: true },
  originalStop: { type: Number, required: true },
  originalTarget: { type: Number, required: true },
  
  decision: { type: String, required: true, enum: ['invert', 'skip', 'pass'], index: true },
  decisionReason: { type: String, required: true },
  
  wasInverted: { type: Boolean, required: true },
  invertedDirection: { type: String, enum: ['long', 'short'] },
  invertedEntry: { type: Number },
  invertedStop: { type: Number },
  invertedTarget: { type: Number },
  
  trend: { type: String, required: true },
  isTrendAligned: { type: Boolean, required: true },
  timeOfDay: { type: String, required: true },
  priceAtDecision: { type: Number, required: true },
  
  hypotheticalOutcome: {
    checkedAt: Date,
    priceAfter1h: Number,
    priceAfter2h: Number,
    priceAfter4h: Number,
    wouldHitStop: Boolean,
    wouldHitTarget: Boolean,
    timeToExit: Number,
    hypotheticalPnlPercent: Number,
    outcome: { type: String, enum: ['win', 'loss', 'pending', 'unknown'] }
  },
  
  actualTradeId: { type: String },
  actualOutcome: {
    wasExecuted: Boolean,
    actualPnlPercent: Number,
    exitReason: String
  }
}, { timestamps: true });

DecisionLogSchema.index({ symbol: 1, signalTime: -1 });
DecisionLogSchema.index({ decision: 1, signalTime: -1 });
DecisionLogSchema.index({ 'hypotheticalOutcome.outcome': 1 });

export const DecisionLog = model<IDecisionLog>('DecisionLog', DecisionLogSchema);
