import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { runTrainingNow } from '../services/trainingScheduler.js';
import { getTrainingInsights } from '../services/aiSignalFilter.js';

dotenv.config();

async function connectToDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not set in environment');
  }
  
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
}

async function main(): Promise<void> {
  try {
    await connectToDatabase();
    
    console.log('\nRegenerating training insights...');
    await runTrainingNow();
    
    const insights = getTrainingInsights();
    
    if (!insights) {
      console.log('No insights generated. Check if there are closed trades.');
      process.exit(1);
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`   Total Trades Analyzed: ${insights.totalTradesAnalyzed || 0}`);
    console.log(`   Direction Accuracy: ${insights.directionAccuracy.toFixed(1)}%`);
    console.log(`   Average MFE: ${insights.averageMfe.toFixed(2)}%`);
    console.log(`   Average MAE: ${insights.averageMae.toFixed(2)}%`);
    console.log(`   Optimal Stop: ${insights.optimalStopPercent.toFixed(2)}%`);
    console.log(`   Optimal Target: ${insights.optimalTargetPercent.toFixed(2)}%`);
    console.log(`\n   Patterns to Prefer: ${insights.patternsToPrefer.join(', ') || 'None'}`);
    console.log(`   Patterns to Avoid: ${insights.patternsToAvoid.join(', ') || 'None'}`);
    console.log(`   Patterns to Invert: ${insights.patternsToInvert.join(', ') || 'None'}`);
    
    if (insights.dataDateRange) {
      console.log(`\n   Data Range: ${insights.dataDateRange.from} to ${insights.dataDateRange.to}`);
    }
    
    if (insights.timeOfDayPerformance && insights.timeOfDayPerformance.length > 0) {
      console.log('\n   Time of Day Performance:');
      insights.timeOfDayPerformance.forEach((t: any) => 
        console.log(`   - ${t.period}: ${t.winRate.toFixed(1)}% win rate (${t.count} trades)`)
      );
    }
    
    if (insights.volumePerformance) {
      console.log('\n   Volume Analysis:');
      console.log(`   - High Volume: ${insights.volumePerformance.highVolume.winRate.toFixed(1)}% win (${insights.volumePerformance.highVolume.count} trades)`);
      console.log(`   - Low Volume: ${insights.volumePerformance.lowVolume.winRate.toFixed(1)}% win (${insights.volumePerformance.lowVolume.count} trades)`);
    }
    
    if (insights.trendAlignmentPerformance) {
      console.log('\n   Trend Alignment:');
      console.log(`   - Aligned: ${insights.trendAlignmentPerformance.aligned.winRate.toFixed(1)}% win (${insights.trendAlignmentPerformance.aligned.count} trades)`);
      console.log(`   - Counter: ${insights.trendAlignmentPerformance.counter.winRate.toFixed(1)}% win (${insights.trendAlignmentPerformance.counter.count} trades)`);
    }
    
    if (insights.scoreCorrelation && insights.scoreCorrelation.ranges.length > 0) {
      console.log('\n   Score Correlation:');
      insights.scoreCorrelation.ranges.forEach((r: any) => 
        console.log(`   - Score ${r.min}-${r.max}: ${r.winRate.toFixed(1)}% win (${r.count} trades)`)
      );
    }
    
    if (insights.avgHoldMinutes) {
      console.log('\n   Hold Time:');
      console.log(`   - Winners: ${insights.avgHoldMinutes.winners.toFixed(0)} minutes avg`);
      console.log(`   - Losers: ${insights.avgHoldMinutes.losers.toFixed(0)} minutes avg`);
    }
    
    if (insights.warningCorrelations && insights.warningCorrelations.length > 0) {
      console.log('\n   Warning Correlations:');
      insights.warningCorrelations.slice(0, 5).forEach((w: any) => 
        console.log(`   - "${w.warning.slice(0, 40)}...": ${w.winRate.toFixed(1)}% win (${w.occurrences} times)`)
      );
    }
    
    console.log('\n   Key Insights:');
    insights.keyInsights.forEach((insight: string) => console.log(`   - ${insight}`));
    
    console.log('\n✅ Training insights saved to training_insights.json');
    
  } catch (error) {
    console.error('Error generating training insights:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

main();
