#!/usr/bin/env node

// Test script to validate entry trigger adjustments using today's actual signals
// This simulates the new buffer calculations vs old ones

const trades = [
  {
    symbol: "GOOGL",
    patternName: "Tweezer Bottom",
    entryPrice: 319.12,
    currentPrice: 317.93,
    patternHigh: 318.96,
    atr: 0.6545054814814496,
    direction: "long"
  },
  {
    symbol: "AAPL", 
    patternName: "Three Inside Down",
    entryPrice: 276.03,
    currentPrice: 276.191,
    patternLow: 276.17,
    atr: 0.38595023407405843,
    direction: "short"
  },
  {
    symbol: "TSLA",
    patternName: "Evening Star", 
    entryPrice: 429.94,
    currentPrice: 430.315,
    patternLow: 430.16,
    atr: 0.9713438597530999,
    direction: "short"
  },
  {
    symbol: "NVDA",
    patternName: "Bearish Marubozu",
    entryPrice: 177.08,
    currentPrice: 177.18,
    patternLow: 177.17,
    atr: 0.315647138765428,
    direction: "short"
  },
  {
    symbol: "MSFT",
    patternName: "Evening Star",
    entryPrice: 491.49,
    currentPrice: 491.91,
    patternLow: 491.74,
    atr: 0.4415629629629626,
    direction: "short"
  }
];

function calculateOldEntryBuffer(triggerPrice, atr) {
  const tickSize = 0.01;
  const priceBasedBuffer = triggerPrice * 0.0005; // 0.05% of price  
  const atrBasedBuffer = atr * 0.1; // 10% of ATR
  const entryBuffer = Math.max(priceBasedBuffer, atrBasedBuffer, tickSize * 5); // At least 5 ticks
  return entryBuffer;
}

function calculateNewEntryBuffer(triggerPrice, atr) {
  const tickSize = 0.01;
  const priceBasedBuffer = triggerPrice * 0.0001; // 0.01% of price - very small
  const atrBasedBuffer = atr * 0.02; // 2% of ATR - much smaller  
  const entryBuffer = Math.max(priceBasedBuffer, atrBasedBuffer, tickSize * 1); // Just 1 tick minimum
  return entryBuffer;
}

function calculateOldMetaAPIAdjustment(entryPrice, currentPrice) {
  const minDistancePercent = 0.007; // 0.7% minimum distance
  const priceDiff = Math.abs((entryPrice - currentPrice) / currentPrice);
  
  if (priceDiff < minDistancePercent) {
    // Would be adjusted further away from market
    if (entryPrice > currentPrice) {
      return currentPrice + (currentPrice * minDistancePercent);
    } else {
      return currentPrice - (currentPrice * minDistancePercent);
    }
  }
  return entryPrice;
}

function calculateNewMetaAPIAdjustment(entryPrice, currentPrice) {
  const minDistancePercent = 0.002; // 0.2% minimum distance 
  const priceDiff = Math.abs((entryPrice - currentPrice) / currentPrice);
  
  if (priceDiff < minDistancePercent) {
    // Would be adjusted further away from market
    if (entryPrice > currentPrice) {
      return currentPrice + (currentPrice * minDistancePercent);
    } else {
      return currentPrice - (currentPrice * minDistancePercent);
    }
  }
  return entryPrice;
}

console.log("=".repeat(80));
console.log("ENTRY TRIGGER ADJUSTMENT TEST - TODAY'S SIGNALS");
console.log("=".repeat(80));
console.log();

trades.forEach((trade, index) => {
  console.log(`${index + 1}. ${trade.symbol} - ${trade.patternName} (${trade.direction})`);
  console.log("-".repeat(50));
  
  const triggerPrice = trade.direction === "long" ? trade.patternHigh : trade.patternLow;
  
  // Calculate old system
  const oldEntryBuffer = calculateOldEntryBuffer(triggerPrice, trade.atr);
  const oldCalculatedEntry = trade.direction === "long" 
    ? triggerPrice + oldEntryBuffer 
    : triggerPrice - oldEntryBuffer;
  const oldFinalEntry = calculateOldMetaAPIAdjustment(oldCalculatedEntry, trade.currentPrice);
  
  // Calculate new system  
  const newEntryBuffer = calculateNewEntryBuffer(triggerPrice, trade.atr);
  const newCalculatedEntry = trade.direction === "long"
    ? triggerPrice + newEntryBuffer
    : triggerPrice - newEntryBuffer;
  const newFinalEntry = calculateNewMetaAPIAdjustment(newCalculatedEntry, trade.currentPrice);
  
  // Calculate distances from current price
  const oldDistance = Math.abs(oldFinalEntry - trade.currentPrice);
  const newDistance = Math.abs(newFinalEntry - trade.currentPrice);
  const oldDistancePercent = (oldDistance / trade.currentPrice) * 100;
  const newDistancePercent = (newDistance / trade.currentPrice) * 100;
  
  console.log(`Pattern Trigger:     $${triggerPrice.toFixed(2)}`);
  console.log(`Current Price:       $${trade.currentPrice.toFixed(2)}`);
  console.log(`Actual Entry Used:   $${trade.entryPrice.toFixed(2)}`);
  console.log();
  console.log(`OLD SYSTEM:`);
  console.log(`  Entry Buffer:      $${oldEntryBuffer.toFixed(4)}`);
  console.log(`  Calculated Entry:  $${oldCalculatedEntry.toFixed(2)}`);
  console.log(`  Final Entry:       $${oldFinalEntry.toFixed(2)}`);
  console.log(`  Distance from Now: $${oldDistance.toFixed(2)} (${oldDistancePercent.toFixed(2)}%)`);
  console.log();
  console.log(`NEW SYSTEM:`);
  console.log(`  Entry Buffer:      $${newEntryBuffer.toFixed(4)}`);
  console.log(`  Calculated Entry:  $${newCalculatedEntry.toFixed(2)}`);
  console.log(`  Final Entry:       $${newFinalEntry.toFixed(2)}`);
  console.log(`  Distance from Now: $${newDistance.toFixed(2)} (${newDistancePercent.toFixed(2)}%)`);
  console.log();
  
  const improvement = oldDistance - newDistance;
  const improvementPercent = ((oldDistancePercent - newDistancePercent) / oldDistancePercent) * 100;
  
  console.log(`🎯 IMPROVEMENT: $${improvement.toFixed(2)} closer (${improvementPercent.toFixed(1)}% reduction in distance)`);
  
  // Simulate execution likelihood
  const oldWouldExecute = oldDistance <= 0.50; // Assume 50 cent moves happened
  const newWouldExecute = newDistance <= 0.50;
  
  console.log(`📊 EXECUTION TEST (assume 50¢ move occurred):`);
  console.log(`   Old system would execute: ${oldWouldExecute ? '✅ YES' : '❌ NO'}`);
  console.log(`   New system would execute: ${newWouldExecute ? '✅ YES' : '❌ NO'}`);
  
  console.log();
  console.log("=".repeat(80));
  console.log();
});

// Summary
const totalTrades = trades.length;
let oldExecutions = 0;
let newExecutions = 0;

trades.forEach(trade => {
  const triggerPrice = trade.direction === "long" ? trade.patternHigh : trade.patternLow;
  
  const oldEntryBuffer = calculateOldEntryBuffer(triggerPrice, trade.atr);
  const oldCalculatedEntry = trade.direction === "long" ? triggerPrice + oldEntryBuffer : triggerPrice - oldEntryBuffer;
  const oldFinalEntry = calculateOldMetaAPIAdjustment(oldCalculatedEntry, trade.currentPrice);
  
  const newEntryBuffer = calculateNewEntryBuffer(triggerPrice, trade.atr);
  const newCalculatedEntry = trade.direction === "long" ? triggerPrice + newEntryBuffer : triggerPrice - newEntryBuffer;
  const newFinalEntry = calculateNewMetaAPIAdjustment(newCalculatedEntry, trade.currentPrice);
  
  const oldDistance = Math.abs(oldFinalEntry - trade.currentPrice);
  const newDistance = Math.abs(newFinalEntry - trade.currentPrice);
  
  if (oldDistance <= 0.50) oldExecutions++;
  if (newDistance <= 0.50) newExecutions++;
});

console.log("📈 SUMMARY RESULTS:");
console.log(`Total Signals Tested: ${totalTrades}`);
console.log(`Old System Executions: ${oldExecutions}/${totalTrades} (${((oldExecutions/totalTrades)*100).toFixed(1)}%)`);
console.log(`New System Executions: ${newExecutions}/${totalTrades} (${((newExecutions/totalTrades)*100).toFixed(1)}%)`);
console.log(`Improvement: +${newExecutions - oldExecutions} executions (${(((newExecutions - oldExecutions)/totalTrades)*100).toFixed(1)}% better)`);