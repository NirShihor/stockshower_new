const axios = require('axios');

// Test gap down scanning with debug output
async function testGapDownDebug() {
  try {
    console.log('Testing gap DOWN scanning with debug...');
    
    const response = await axios.post('http://localhost:5002/api/analysis/scan-gap-downs', {
      volatilityLevel: 'high'
    });
    
    console.log('Response status:', response.status);
    console.log('Total found:', response.data.totalFound);
    console.log('Pre-filtered:', response.data.batchInfo?.preFilteredCount);
    console.log('Batches processed:', response.data.batchInfo?.batchesProcessed);
    
  } catch (error) {
    console.error('Error testing gap down scanning:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testGapDownDebug();