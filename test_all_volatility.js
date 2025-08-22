const axios = require('axios');

// Test all volatility levels
async function testAllLevels() {
  const levels = ['low', 'medium', 'high'];
  
  console.log('=== GAP UP SCANNING ===\n');
  for (const level of levels) {
    try {
      console.log(`Testing ${level.toUpperCase()} volatility...`);
      
      const response = await axios.post('http://localhost:5001/api/analysis/scan-gap-ups', {
        volatilityLevel: level
      });
      
      console.log(`- Total found: ${response.data.totalFound}`);
      console.log(`- Pre-filtered: ${response.data.batchInfo?.preFilteredCount}`);
      console.log(`- Batches: ${response.data.batchInfo?.batchesProcessed}/${response.data.batchInfo?.totalBatches}`);
      console.log(`- Status: ${response.data.status}`);
      console.log(`- Duration: ${response.data.scanDuration}\n`);
      
    } catch (error) {
      console.error(`Error with ${level}:`, error.message);
    }
  }
  
  console.log('\n=== GAP DOWN SCANNING ===\n');
  for (const level of levels) {
    try {
      console.log(`Testing ${level.toUpperCase()} volatility...`);
      
      const response = await axios.post('http://localhost:5001/api/analysis/scan-gap-downs', {
        volatilityLevel: level
      });
      
      console.log(`- Total found: ${response.data.totalFound}`);
      console.log(`- Pre-filtered: ${response.data.batchInfo?.preFilteredCount}`);
      console.log(`- Batches: ${response.data.batchInfo?.batchesProcessed}/${response.data.batchInfo?.totalBatches}`);
      console.log(`- Status: ${response.data.status}`);
      console.log(`- Duration: ${response.data.scanDuration}\n`);
      
    } catch (error) {
      console.error(`Error with ${level}:`, error.message);
    }
  }
}

testAllLevels();