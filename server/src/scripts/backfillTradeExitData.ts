// @ts-nocheck
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Trade } from '../db/models/Trade.js';

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const DELAY_BETWEEN_REQUESTS_MS = 500;

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

let cachedDeals: any[] | null = null;

async function fetchAllDeals(): Promise<any[]> {
  if (cachedDeals) return cachedDeals;
  
  const token = process.env.METAAPI_TOKEN;
  const accountId = process.env.METAAPI_ACCOUNT_ID;
  
  if (!token || !accountId) {
    console.error('[BACKFILL] Missing METAAPI_TOKEN or METAAPI_ACCOUNT_ID');
    return [];
  }
  
  const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';
  const endTime = new Date().toISOString();
  const startTime = new Date('2025-10-01').toISOString();
  
  console.log(`[BACKFILL] Fetching deals from ${startTime} to ${endTime}...`);
  
  try {
    const response = await axiosInstance.get(
      `${londonClientUrl}/users/current/accounts/${accountId}/history-deals/time/${startTime}/${endTime}`,
      { headers: { 'auth-token': token, 'Content-Type': 'application/json' } }
    );
    
    cachedDeals = response.data || [];
    console.log(`[BACKFILL] Fetched ${cachedDeals.length} deals from MT5 history`);
    return cachedDeals;
  } catch (error: any) {
    console.error('[BACKFILL] Failed to fetch deals:', error.response?.data || error.message);
    return [];
  }
}

async function getClosedPosition(positionId: string): Promise<any | null> {
  const deals = await fetchAllDeals();
  
  const closingDeal = deals.find((deal: any) => 
    String(deal.positionId) === String(positionId) && 
    deal.entryType === 'DEAL_ENTRY_OUT'
  );
  
  if (closingDeal) {
    return {
      closePrice: closingDeal.price,
      closeTime: closingDeal.time,
      commission: closingDeal.commission || 0,
      profit: closingDeal.profit || 0,
      swap: closingDeal.swap || 0
    };
  }
  
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillTradeExitData(): Promise<void> {
  console.log('[BACKFILL] Starting trade exit data backfill...');
  console.log(`[BACKFILL] Using account: ${process.env.METAAPI_ACCOUNT_ID?.slice(0, 8)}...`);
  
  await mongoose.connect(process.env.MONGODB_URI || '');
  console.log('[BACKFILL] Connected to MongoDB');
  
  const filledTrades = await Trade.find({
    status: 'filled',
    mt5PositionId: { $exists: true, $ne: null },
    exitPrice: { $exists: false }
  }).sort({ filledTime: -1 });
  
  console.log(`[BACKFILL] Found ${filledTrades.length} filled trades without exit data`);
  
  if (filledTrades.length === 0) {
    console.log('[BACKFILL] No trades to backfill');
    await mongoose.disconnect();
    return;
  }
  
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  
  for (let i = 0; i < filledTrades.length; i += BATCH_SIZE) {
    const batch = filledTrades.slice(i, i + BATCH_SIZE);
    console.log(`[BACKFILL] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(filledTrades.length / BATCH_SIZE)}`);
    
    for (const trade of batch) {
      try {
        const positionId = trade.mt5PositionId;
        if (!positionId) continue;
        
        const historicalData = await getClosedPosition(positionId);
        
        if (historicalData && historicalData.closePrice) {
          const entryPrice = trade.actualEntryPrice || trade.entryPrice;
          const exitPrice = historicalData.closePrice;
          const isLong = trade.direction === 'long';
          
          let pnlPercentage = 0;
          if (entryPrice) {
            pnlPercentage = isLong
              ? ((exitPrice - entryPrice) / entryPrice) * 100
              : ((entryPrice - exitPrice) / entryPrice) * 100;
          }
          
          let exitReason: string = 'end_of_day';
          if (trade.stopLoss && trade.takeProfit) {
            if (isLong) {
              if (exitPrice <= trade.stopLoss + 0.10) exitReason = 'stop_loss';
              else if (exitPrice >= trade.takeProfit - 0.10) exitReason = 'take_profit';
            } else {
              if (exitPrice >= trade.stopLoss - 0.10) exitReason = 'stop_loss';
              else if (exitPrice <= trade.takeProfit + 0.10) exitReason = 'take_profit';
            }
          }
          
          await Trade.findByIdAndUpdate(trade._id, {
            status: 'closed',
            exitPrice: exitPrice,
            closedTime: historicalData.closeTime ? new Date(historicalData.closeTime) : new Date(),
            exitReason: exitReason,
            pnlPercentage: pnlPercentage,
            pnlAmount: historicalData.profit || 0,
            commission: historicalData.commission || 0
          });
          
          updated++;
          console.log(`[BACKFILL] ✅ Updated ${trade.symbol} (${trade.patternName}): exit=${exitPrice}, P&L=${pnlPercentage.toFixed(2)}%, reason=${exitReason}`);
        } else {
          notFound++;
          console.log(`[BACKFILL] ⚠️ No historical data for ${trade.symbol} (positionId: ${positionId})`);
        }
        
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      } catch (error) {
        errors++;
        console.error(`[BACKFILL] ❌ Error processing trade ${trade._id}:`, error);
      }
    }
    
    if (i + BATCH_SIZE < filledTrades.length) {
      console.log(`[BACKFILL] Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }
  
  console.log('\n[BACKFILL] ========== SUMMARY ==========');
  console.log(`[BACKFILL] Total processed: ${filledTrades.length}`);
  console.log(`[BACKFILL] Successfully updated: ${updated}`);
  console.log(`[BACKFILL] No historical data: ${notFound}`);
  console.log(`[BACKFILL] Errors: ${errors}`);
  console.log('[BACKFILL] ================================\n');
  
  await mongoose.disconnect();
  console.log('[BACKFILL] Done');
}

backfillTradeExitData().catch(console.error);
