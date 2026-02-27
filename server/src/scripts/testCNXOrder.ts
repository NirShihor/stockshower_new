/**
 * Test CNX volume calculation and symbol spec
 * Run with: yarn tsx src/scripts/testCNXOrder.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const accountId = process.env.METAAPI_ACCOUNT_ID;
const token = process.env.METAAPI_TOKEN;
const londonClientUrl = 'https://mt-client-api-v1.london.agiliumtrade.ai';

async function test() {
  const symbol = 'CNX.N';
  const entryPrice = 42.17;
  const targetMarginGBP = 12.5; // Reduced due to UPTREND_UNDER_PRESSURE

  console.log('=== CNX Order Test ===\n');

  // Step 1: Calculate volume (same as metaApiRestHandler)
  const gbpToUsd = 1.30;
  const targetMarginUSD = targetMarginGBP * gbpToUsd;
  const estimatedMarginPercent = 0.033; // 1:30 leverage
  const notionalValueUSD = targetMarginUSD / estimatedMarginPercent;
  const sharesNeeded = notionalValueUSD / entryPrice;

  let volume = Math.round(sharesNeeded * 100) / 100;
  volume = Math.max(volume, 0.01);
  volume = Math.min(volume, 2.0); // Max cap

  console.log('Volume Calculation:');
  console.log(`  targetMarginGBP: £${targetMarginGBP}`);
  console.log(`  targetMarginUSD: $${targetMarginUSD.toFixed(2)}`);
  console.log(`  notionalValueUSD: $${notionalValueUSD.toFixed(2)}`);
  console.log(`  sharesNeeded: ${sharesNeeded.toFixed(2)}`);
  console.log(`  volume after cap: ${volume}`);

  // Step 2: Get symbol specification
  console.log('\nFetching Symbol Specification...');
  try {
    const response = await axios.get(
      `${londonClientUrl}/users/current/accounts/${accountId}/symbols/${symbol}/specification`,
      { headers: { 'auth-token': token } }
    );

    const spec = response.data;
    console.log(`  minVolume: ${spec.minVolume}`);
    console.log(`  maxVolume: ${spec.maxVolume}`);
    console.log(`  volumeStep: ${spec.volumeStep}`);

    // Step 3: Adjust volume
    const originalVolume = volume;

    if (volume < spec.minVolume) {
      volume = spec.minVolume;
      console.log(`\n  Volume ${originalVolume} < min ${spec.minVolume}, adjusted to ${volume}`);
    }

    if (volume > spec.maxVolume) {
      volume = spec.maxVolume;
    }

    // Round to step
    const roundedVolume = Math.round(volume / spec.volumeStep) * spec.volumeStep;
    volume = Math.max(roundedVolume, spec.minVolume);
    volume = Math.round(volume * 100) / 100;

    console.log(`\nFinal volume: ${volume}`);
    console.log(`Notional value: $${(volume * entryPrice).toFixed(2)}`);
    console.log(`Estimated margin: $${(volume * entryPrice * estimatedMarginPercent).toFixed(2)}`);

  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
