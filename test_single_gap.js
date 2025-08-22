const axios = require('axios');

// Test gap up scanning only with high volatility
async function testGapUp() {
  try {
    console.log('Testing gap UP scanning with HIGH volatility...');
    
    const response = await axios.post('http://localhost:5001/api/analysis/scan-gap-ups', {
      volatilityLevel: 'high'
    });
    
    console.log('Response status:', response.status);
    console.log('Total found:', response.data.totalFound);
    console.log('Status:', response.data.status);
    console.log('Processed:', response.data.processedCount);
    console.log('Total:', response.data.totalCount);
    
    if (response.data.stocks && response.data.stocks.length > 0) {
      console.log('\nFirst stock found:');
      console.log(JSON.stringify(response.data.stocks[0], null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testGapUp();