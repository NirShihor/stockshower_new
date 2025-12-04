import { connectDatabase } from './src/db/connection.js';

async function forceConnection() {
  try {
    console.log('🔧 FORCING POLYGON CONNECTION TEST');
    
    // Test connection with explicit delay
    console.log('1. Connecting to Polygon...');
    let response = await fetch('http://localhost:5002/api/candlestick/connect', {
      method: 'POST'
    });
    let result = await response.json();
    console.log('Connect result:', result);
    
    // Wait for connection to establish
    console.log('2. Waiting 5 seconds for connection...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Try to subscribe
    console.log('3. Attempting subscription...');
    response = await fetch('http://localhost:5002/api/candlestick/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symbols: ['AAPL', 'MSFT', 'GOOGL'],
        granularity: 'AM'
      })
    });
    result = await response.json();
    console.log('Subscribe result:', result);
    
    // Check status
    console.log('4. Checking status...');
    response = await fetch('http://localhost:5002/api/candlestick/status');
    result = await response.json();
    console.log('Status result:', result);
    
    // Wait a bit then check for signals
    console.log('5. Waiting 30 seconds then checking for signals...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    response = await fetch('http://localhost:5002/api/signals?limit=5');
    result = await response.json();
    console.log('Signals result:', result);
    
    // Check recent candle activity
    console.log('6. Checking candle debug log...');
    const fs = await import('fs');
    try {
      const logContent = fs.readFileSync('candle-debug.log', 'utf-8');
      const lines = logContent.split('\n');
      const recentLines = lines.slice(-10);
      console.log('Recent candle activity:');
      recentLines.forEach(line => {
        if (line.trim()) console.log(line);
      });
    } catch (error) {
      console.log('No debug log found or error reading:', error.message);
    }
    
    console.log('✅ Connection test complete');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error);
  }
}

forceConnection();