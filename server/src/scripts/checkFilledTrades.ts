import mongoose from 'mongoose';
import { Trade } from '../db/models/Trade.js';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');
  
  const filledWithPositionId = await Trade.countDocuments({ 
    status: 'filled', 
    mt5PositionId: { $exists: true, $ne: null } 
  });
  
  const filledWithoutPositionId = await Trade.countDocuments({ 
    status: 'filled', 
    $or: [
      { mt5PositionId: { $exists: false } },
      { mt5PositionId: null }
    ]
  });
  
  const sampleFilled = await Trade.findOne({ 
    status: 'filled'
  }).lean();
  
  console.log('Filled trades WITH mt5PositionId:', filledWithPositionId);
  console.log('Filled trades WITHOUT mt5PositionId:', filledWithoutPositionId);
  console.log('\nSample filled trade:');
  if (sampleFilled) {
    console.log('  symbol:', (sampleFilled as any).symbol);
    console.log('  patternName:', (sampleFilled as any).patternName);
    console.log('  mt5OrderId:', (sampleFilled as any).mt5OrderId);
    console.log('  mt5PositionId:', (sampleFilled as any).mt5PositionId);
    console.log('  actualEntryPrice:', (sampleFilled as any).actualEntryPrice);
    console.log('  exitPrice:', (sampleFilled as any).exitPrice);
    console.log('  filledTime:', (sampleFilled as any).filledTime);
  }
  
  await mongoose.disconnect();
}

check().catch(console.error);
