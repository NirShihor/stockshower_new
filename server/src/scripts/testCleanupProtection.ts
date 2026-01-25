import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import dotenv from 'dotenv';

dotenv.config();

async function testCleanupLogic() {
  console.log('='.repeat(60));
  console.log('CAN SLIM CLEANUP PROTECTION TEST');
  console.log('='.repeat(60));
  console.log('This test shows what WOULD happen during cleanup - no actual changes made.\n');

  // Test 1: Check positions
  console.log('--- POSITIONS ---');
  const positions = await metaApiHandler.getPositions();
  console.log(`Found ${positions.length} positions\n`);

  for (const position of positions) {
    const hasCanSlimComment = position.comment && position.comment.includes('CAN SLIM');
    const hasCanSlimClientId = position.clientId && position.clientId.includes('canslim');
    const isCanSlim = hasCanSlimComment || hasCanSlimClientId;

    console.log(`Position: ${position.symbol}`);
    console.log(`  ID: ${position.id}`);
    console.log(`  Comment: ${position.comment || 'NONE'}`);
    console.log(`  ClientId: ${position.clientId || 'NONE'}`);
    console.log(`  CAN SLIM detected: ${isCanSlim ? 'YES ✓' : 'NO ✗'}`);
    console.log(`  Would be closed by EOD cleanup: ${isCanSlim ? 'NO (protected)' : 'YES (would close!)'}`);
    console.log('');
  }

  // Test 2: Check pending orders
  console.log('--- PENDING ORDERS ---');
  const orders = await metaApiHandler.getOrders();
  console.log(`Found ${orders.length} pending orders\n`);

  for (const order of orders) {
    const hasCanSlimComment = order.comment && order.comment.includes('CAN SLIM');
    const hasCanSlimClientId = order.clientId && order.clientId.includes('canslim');
    const isCanSlim = hasCanSlimComment || hasCanSlimClientId;

    console.log(`Order: ${order.symbol}`);
    console.log(`  ID: ${order.id}`);
    console.log(`  Type: ${order.type}`);
    console.log(`  Comment: ${order.comment || 'NONE'}`);
    console.log(`  ClientId: ${order.clientId || 'NONE'}`);
    console.log(`  CAN SLIM detected: ${isCanSlim ? 'YES ✓' : 'NO ✗'}`);
    console.log(`  15-min cleanup: ${isCanSlim ? 'SKIP (48h expiry)' : 'Would cancel after 15 min'}`);
    console.log('');
  }

  console.log('='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

testCleanupLogic().catch(console.error);
