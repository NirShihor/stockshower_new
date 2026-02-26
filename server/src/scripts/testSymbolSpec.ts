import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

const accountId = process.env.METAAPI_ACCOUNT_ID;
const token = process.env.METAAPI_TOKEN;

async function testSpec(symbol: string) {
  const url = `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${accountId}/symbols/${symbol}/specification`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'auth-token': token,
        'Content-Type': 'application/json'
      }
    });
    console.log(`\n=== Specification for ${symbol} ===`);
    const spec = response.data;
    console.log(`  minVolume: ${spec.minVolume}`);
    console.log(`  maxVolume: ${spec.maxVolume}`);
    console.log(`  volumeStep: ${spec.volumeStep}`);
    console.log(`  contractSize: ${spec.contractSize}`);
    console.log(`  tickSize: ${spec.tickSize}`);
  } catch (error: any) {
    console.error(`\nError for ${symbol}:`, error.response?.data || error.message);
  }
}

async function main() {
  console.log('Testing MetaAPI Symbol Specifications\n');
  
  // Test a few symbols
  await testSpec('CNX.N');   // Cheap stock that failed
  await testSpec('NVDA.O');  // Expensive stock that worked  
  await testSpec('GOOGL.O'); // Another working stock
  await testSpec('ARGX.N');  // Stock not available
}

main();
