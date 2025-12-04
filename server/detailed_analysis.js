import { Trade } from './src/db/models/Trade.js';
import { connectDatabase } from './src/db/connection.js';

async function detailedAnalysis() {
  try {
    await connectDatabase();

    // Get detailed breakdown of all trade statuses and P&L data
    const statusBreakdown = await Trade.aggregate([
      {
        $group: {
          _id: {
            status: '$status',
            hasPnL: { $ne: ['$pnlAmount', null] }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.status': 1, '_id.hasPnL': 1 } }
    ]);

    console.log('=== DETAILED STATUS BREAKDOWN ===');
    statusBreakdown.forEach(item => {
      console.log(`Status: ${item._id.status}, Has P&L: ${item._id.hasPnL}, Count: ${item.count}`);
    });

    // Look for any trades with negative P&L
    const negativeTradeCount = await Trade.countDocuments({ pnlAmount: { $lt: 0 } });
    console.log(`\nNegative P&L trades: ${negativeTradeCount}`);

    // Positive P&L trades
    const positiveTradeCount = await Trade.countDocuments({ pnlAmount: { $gt: 0 } });
    console.log(`Positive P&L trades: ${positiveTradeCount}`);

    // Zero P&L trades
    const zeroTradeCount = await Trade.countDocuments({ pnlAmount: 0 });
    console.log(`Zero P&L trades: ${zeroTradeCount}`);

    // Check different exit reasons
    const exitReasons = await Trade.aggregate([
      { $match: { exitReason: { $exists: true } } },
      { $group: { _id: '$exitReason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n=== EXIT REASONS ===');
    exitReasons.forEach(reason => {
      console.log(`${reason._id}: ${reason.count}`);
    });

    // Look at all different statuses
    const allStatuses = await Trade.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n=== ALL STATUSES ===');
    allStatuses.forEach(status => {
      console.log(`${status._id}: ${status.count}`);
    });

    // Sample of different types of trades
    console.log('\n=== SAMPLE TRADES BY STATUS ===');

    for (const statusItem of allStatuses) {
      console.log(`\n--- ${statusItem._id.toUpperCase()} SAMPLES ---`);
      const samples = await Trade.find({ status: statusItem._id })
        .sort({ signalTime: -1 })
        .limit(3)
        .select('symbol status pnlAmount exitReason signalTime patternName');

      samples.forEach(trade => {
        console.log(`${trade.symbol} | ${trade.patternName} | P&L: ${trade.pnlAmount || 'None'} | Exit: ${trade.exitReason || 'None'}`);
      });
    }

    // Check for trades with pnlAmount that aren't 'closed'
    const pnlButNotClosed = await Trade.countDocuments({
      pnlAmount: { $exists: true, $ne: null },
      status: { $ne: 'closed' }
    });
    console.log(`\nTrades with P&L but not 'closed' status: ${pnlButNotClosed}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

detailedAnalysis();