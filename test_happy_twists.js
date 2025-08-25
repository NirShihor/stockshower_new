const axios = require('axios');

async function testHappyTwists() {
  try {
    console.log('Testing Happy Twists endpoint...\n');
    
    const response = await axios.post('http://localhost:5001/api/analysis/happy-twists', {
      prompt: 'Find recent positive catalysts'
    });
    
    console.log('Response status:', response.status);
    console.log('\nFull response data:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.companies) {
      console.log('\nCompanies found:', response.data.companies.length);
      console.log('Total found:', response.data.totalFound);
    }
    
    if (response.data.analysis) {
      console.log('\nAnalysis field present:', response.data.analysis.substring(0, 100) + '...');
    }
    
  } catch (error) {
    console.error('Error testing Happy Twists:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testHappyTwists();