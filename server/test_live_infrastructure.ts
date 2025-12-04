import { connectDatabase } from './src/db/connection.js';
import { metaApiHandler } from './src/handlers/metaApiRestHandler.js';

async function testLiveInfrastructure() {
  try {
    await connectDatabase();
    console.log('🧪 === LIVE INFRASTRUCTURE TEST ===\n');

    console.log('This will place ONE tiny test order to verify the system works.');
    console.log('Risk: ~£1-2 maximum');
    console.log('');

    // Create a minimal test signal
    const testSignal = {
      symbol: 'AAPL',
      currentPrice: 279.50,
      plan: {
        direction: 'long' as const,
        entry: 279.60,
        stop: 272.62,   // 2.5% stop  
        targets: [286.59] // 2.5% target
      },
      pattern: { name: '🧪 Infrastructure Test' },
      patternScore: 85
    };

    console.log('📊 TEST ORDER PREVIEW:');
    console.log(`Symbol: ${testSignal.symbol}`);
    console.log(`Entry: $${testSignal.plan.entry}`);
    console.log(`Stop: $${testSignal.plan.stop}`);
    console.log(`Target: $${testSignal.plan.targets[0]}`);
    
    const stopDistance = Math.abs(testSignal.plan.entry - testSignal.plan.stop) / testSignal.plan.entry * 100;
    console.log(`Stop Distance: ${stopDistance.toFixed(2)}%`);
    console.log('');

    // Get order preview (doesn't place real order)
    console.log('🔍 GETTING ORDER PREVIEW...');
    const preview = await metaApiHandler.previewOrder(testSignal);
    
    if (!preview.success) {
      console.log(`❌ Preview failed: ${preview.error}`);
      process.exit(1);
    }

    console.log('📋 ORDER PREVIEW RESULTS:');
    console.log(`Adjusted Entry: $${preview.data!.adjusted.entry}`);
    console.log(`Adjusted Stop: $${preview.data!.adjusted.stop}`);
    console.log(`Order Type: ${preview.data!.adjusted.orderType}`);
    
    if (preview.data!.adjustmentReason) {
      console.log(`Adjustment: ${preview.data!.adjustmentReason}`);
    }

    const adjustedStopDistance = Math.abs(preview.data!.adjusted.entry - preview.data!.adjusted.stop) / preview.data!.adjusted.entry * 100;
    console.log(`Final Stop Distance: ${adjustedStopDistance.toFixed(2)}%`);
    console.log('');

    // Ask for confirmation
    console.log('⚠️  DO YOU WANT TO PLACE THIS TEST ORDER?');
    console.log('This will be a REAL order with REAL money (small amount)');
    console.log('');
    console.log('To place the order:');
    console.log('  1. Make sure you have at least £10 in your account');
    console.log('  2. Make sure markets are open');
    console.log('  3. Run this command:');
    console.log('');
    console.log('yarn tsx place_test_order.ts');
    console.log('');
    console.log('This will:');
    console.log('  • Place the order with MetaAPI');
    console.log('  • Monitor it with our 10-second system');
    console.log('  • Test if it closes automatically');
    console.log('  • Validate the entire infrastructure');

    // Create the actual order placement script
    const orderScript = `
import { connectDatabase } from './src/db/connection.js';
import { metaApiHandler } from './src/handlers/metaApiRestHandler.js';

async function placeTestOrder() {
  await connectDatabase();
  
  const testSignal = ${JSON.stringify(testSignal, null, 2)};
  
  console.log('🚀 PLACING LIVE TEST ORDER...');
  console.log('Risk: ~£1-2 maximum');
  
  const result = await metaApiHandler.placeOrder(testSignal);
  
  if (result.success) {
    console.log('✅ ORDER PLACED SUCCESSFULLY!');
    console.log(\`Order ID: \${result.data?.orderId}\`);
    console.log('');
    console.log('📊 Monitor with:');
    console.log('curl http://localhost:5002/api/position-management/monitor-status');
    console.log('');
    console.log('Watch server logs for 10-second monitoring updates');
  } else {
    console.log(\`❌ ORDER FAILED: \${result.error}\`);
  }
}

placeTestOrder();
`;

    require('fs').writeFileSync('./place_test_order.ts', orderScript);
    console.log('✅ Created place_test_order.ts script');

    process.exit(0);

  } catch (error) {
    console.error('❌ Test preparation failed:', error);
    process.exit(1);
  }
}

testLiveInfrastructure();