const axios = require('axios');

// Test both gap up and gap down scanning to compare
async function testBothScans() {
  try {
    console.log('Testing gap UP scanning...');
    
    const gapUpResponse = await axios.post('http://localhost:5002/api/analysis/scan-gap-ups', {
      volatilityLevel: 'high'
    });
    
    console.log('Gap UP Results:');
    console.log('- Total found:', gapUpResponse.data.totalFound);
    console.log('- Pre-filtered count:', gapUpResponse.data.batchInfo?.preFilteredCount);
    console.log('- Batches processed:', gapUpResponse.data.batchInfo?.batchesProcessed);
    console.log('- Total batches:', gapUpResponse.data.batchInfo?.totalBatches);
    console.log('- Status:', gapUpResponse.data.status);
    console.log('- Duration:', gapUpResponse.data.scanDuration);
    
    console.log('\n---\n');
    
    console.log('Testing gap DOWN scanning...');
    
    const gapDownResponse = await axios.post('http://localhost:5002/api/analysis/scan-gap-downs', {
      volatilityLevel: 'high'
    });
    
    console.log('Gap DOWN Results:');
    console.log('- Total found:', gapDownResponse.data.totalFound);
    console.log('- Pre-filtered count:', gapDownResponse.data.batchInfo?.preFilteredCount);
    console.log('- Batches processed:', gapDownResponse.data.batchInfo?.batchesProcessed);
    console.log('- Total batches:', gapDownResponse.data.batchInfo?.totalBatches);
    console.log('- Status:', gapDownResponse.data.status);
    console.log('- Duration:', gapDownResponse.data.scanDuration);
    
  } catch (error) {
    console.error('Error testing scans:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testBothScans();