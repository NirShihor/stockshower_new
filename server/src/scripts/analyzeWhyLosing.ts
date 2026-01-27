import mongoose from 'mongoose';
import { Trade } from '../db/models/Trade.js';
import dotenv from 'dotenv';
dotenv.config();

async function analyze() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const trades = await Trade.find({
    status: 'closed',
    pnlPercentage: { $exists: true, $ne: null },
    actualEntryPrice: { $exists: true },
    exitPrice: { $exists: true }
  }).lean() as any[];
  
  console.log('=== WHY ARE WE LOSING? ===');
  console.log('Total trades with full data:', trades.length);
  
  // 1. ENTRY TIMING ANALYSIS
  let entryAfterMove = 0;
  let entryBeforeMove = 0;
  let totalSlippage = 0;
  let worseEntryLosses = 0;
  let worseEntryWins = 0;
  let betterEntryLosses = 0;
  let betterEntryWins = 0;
  
  // 2. STOP LOSS ANALYSIS
  let stoppedOut = 0;
  let tpHit = 0;
  let eodClose = 0;
  let stopTooTight = 0;
  
  // 3. MFE/MAE ANALYSIS
  let totalMfe = 0;
  let totalMae = 0;
  let mfeBeforeReversal = 0;
  
  for (const t of trades) {
    const signalEntry = t.signalData?.plan?.entry || t.entryPrice;
    const actualEntry = t.actualEntryPrice;
    const exitPrice = t.exitPrice;
    const direction = t.direction;
    const pnl = t.pnlPercentage || 0;
    const stopLoss = t.signalData?.plan?.stop || t.stopLoss;
    const takeProfit = t.signalData?.plan?.targets?.[0] || t.takeProfit;
    const exitReason = t.exitReason || '';
    const mfe = t.mfe || 0;
    const mae = t.mae || 0;
    
    // Entry timing
    if (signalEntry && actualEntry) {
      const slippage = ((actualEntry - signalEntry) / signalEntry) * 100;
      totalSlippage += Math.abs(slippage);
      
      const enteredWorse = (direction === 'long' && actualEntry > signalEntry) || 
                           (direction === 'short' && actualEntry < signalEntry);
      
      if (enteredWorse) {
        entryAfterMove++;
        if (pnl > 0) worseEntryWins++;
        else worseEntryLosses++;
      } else {
        entryBeforeMove++;
        if (pnl > 0) betterEntryWins++;
        else betterEntryLosses++;
      }
    }
    
    // Exit reason
    if (exitReason.toLowerCase().includes('stop')) stoppedOut++;
    else if (exitReason.toLowerCase().includes('target') || exitReason.toLowerCase().includes('tp')) tpHit++;
    else if (exitReason.toLowerCase().includes('eod') || exitReason.toLowerCase().includes('end') || exitReason.toLowerCase().includes('cleanup')) eodClose++;
    
    // Stop tightness
    if (stopLoss && actualEntry) {
      const stopDistance = Math.abs(actualEntry - stopLoss) / actualEntry * 100;
      if (stopDistance < 0.5) stopTooTight++;
    }
    
    // MFE/MAE
    totalMfe += mfe;
    totalMae += mae;
  }
  
  const count = trades.length;
  const wins = trades.filter(t => t.pnlPercentage > 0).length;
  const losses = trades.filter(t => t.pnlPercentage < 0).length;
  
  console.log('\n=== 1. ENTRY TIMING ===');
  console.log('Entered WORSE (after move started):', entryAfterMove, `(${((entryAfterMove/count)*100).toFixed(1)}%)`);
  console.log('  - Of these, wins:', worseEntryWins, 'losses:', worseEntryLosses);
  console.log('Entered BETTER (before move):', entryBeforeMove, `(${((entryBeforeMove/count)*100).toFixed(1)}%)`);
  console.log('  - Of these, wins:', betterEntryWins, 'losses:', betterEntryLosses);
  console.log('Avg slippage:', (totalSlippage/count).toFixed(3) + '%');
  
  console.log('\n=== 2. EXIT REASONS ===');
  console.log('Stop loss hit:', stoppedOut, `(${((stoppedOut/count)*100).toFixed(1)}%)`);
  console.log('Take profit hit:', tpHit, `(${((tpHit/count)*100).toFixed(1)}%)`);
  console.log('EOD cleanup:', eodClose, `(${((eodClose/count)*100).toFixed(1)}%)`);
  console.log('Stops < 0.5%:', stopTooTight, `(${((stopTooTight/count)*100).toFixed(1)}%)`);
  
  console.log('\n=== 3. MFE/MAE (Max Favorable/Adverse Excursion) ===');
  console.log('Avg MFE:', (totalMfe/count).toFixed(3) + '%');
  console.log('Avg MAE:', (totalMae/count).toFixed(3) + '%');
  
  console.log('\n=== 4. WIN/LOSS BREAKDOWN ===');
  console.log('Wins:', wins, 'Losses:', losses, 'Win Rate:', ((wins/(wins+losses))*100).toFixed(1) + '%');
  
  // 5. Check if losers go in our favor first
  console.log('\n=== 5. DID LOSERS GO IN OUR FAVOR FIRST? ===');
  const losersWithMfe = trades.filter(t => t.pnlPercentage < 0 && t.mfe > 0);
  console.log('Losers that went in our favor first:', losersWithMfe.length, 'of', losses);
  if (losersWithMfe.length > 0) {
    const avgLoserMfe = losersWithMfe.reduce((sum, t) => sum + t.mfe, 0) / losersWithMfe.length;
    console.log('Avg MFE of losers:', avgLoserMfe.toFixed(3) + '%');
  }
  
  // 6. Time from signal to fill
  console.log('\n=== 6. TIME FROM SIGNAL TO FILL ===');
  let totalDelayMs = 0;
  let delayCount = 0;
  for (const t of trades) {
    const signalTime = t.signalTime ? new Date(t.signalTime).getTime() : null;
    const fillTime = t.filledTime ? new Date(t.filledTime).getTime() : null;
    if (signalTime && fillTime) {
      totalDelayMs += (fillTime - signalTime);
      delayCount++;
    }
  }
  if (delayCount > 0) {
    console.log('Avg delay from signal to fill:', (totalDelayMs / delayCount / 1000).toFixed(1) + ' seconds');
    console.log('Avg delay in minutes:', (totalDelayMs / delayCount / 60000).toFixed(1) + ' minutes');
  }
  
  await mongoose.disconnect();
}
analyze();
