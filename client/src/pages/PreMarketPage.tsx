import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';

const PreMarketPage: React.FC = () => {
  const [preMarketAnalysis, setPreMarketAnalysis] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [analysisTimestamp, setAnalysisTimestamp] = useState<Date | null>(null);
  
  // Load persisted analysis on component mount
  useEffect(() => {
    const savedAnalysis = localStorage.getItem('preMarketAnalysis');
    if (savedAnalysis) {
      try {
        const parsedData = JSON.parse(savedAnalysis);
        // Check if data is from today
        const savedDate = new Date(parsedData.timestamp);
        const today = new Date();
        const isToday = savedDate.toDateString() === today.toDateString();
        
        if (isToday) {
          console.log('Restored previous pre-market analysis from localStorage');
          setPreMarketAnalysis(parsedData.analysis);
          setAnalysisTimestamp(new Date(parsedData.timestamp));
        } else {
          console.log('Cleared old pre-market analysis from localStorage');
          localStorage.removeItem('preMarketAnalysis');
        }
      } catch (error) {
        console.error('Error parsing saved analysis:', error);
        localStorage.removeItem('preMarketAnalysis');
      }
    }
  }, []);
  
  // Save analysis to localStorage whenever it changes
  useEffect(() => {
    if (preMarketAnalysis && analysisTimestamp) {
      const dataToSave = {
        analysis: preMarketAnalysis,
        timestamp: analysisTimestamp.toISOString()
      };
      localStorage.setItem('preMarketAnalysis', JSON.stringify(dataToSave));
      console.log('Saved pre-market analysis to localStorage');
    }
  }, [preMarketAnalysis, analysisTimestamp]);
  
  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);
  
  // Calculate Eastern Time (EDT/EST automatically handled by America/New_York)
  const estTimeString = currentTime.toLocaleTimeString('en-US', { 
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true 
  });
  
  // Get Eastern Time hours and minutes for logic checks
  const estHours = parseInt(currentTime.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false
  }));
  const estMinutes = parseInt(currentTime.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    minute: 'numeric'
  }));
  
  // Check if we're in the optimal pre-market analysis window (8:45 AM - 9:15 AM EST)
  const isOptimalTime = estHours === 8 && estMinutes >= 45 || estHours === 9 && estMinutes <= 15;
  const isPreMarket = (estHours >= 4 && estHours < 9) || (estHours === 9 && estMinutes < 30);
  const isMarketClosed = estHours >= 16 || estHours < 4;
  
  const runPreMarketAnalysis = async () => {
    setLoading(true);
    try {
      // Get the latest gap scanner data from localStorage if available
      const savedScanData = localStorage.getItem('gapScannerData');
      let recentGapData = null;
      
      if (savedScanData) {
        try {
          const gapScanData = JSON.parse(savedScanData);
          const savedDate = new Date(gapScanData.timestamp);
          const today = new Date();
          const isToday = savedDate.toDateString() === today.toDateString();
          
          if (isToday && gapScanData.stocks) {
            recentGapData = {
              gapUps: gapScanData.stocks.filter((s: any) => parseFloat(s.gapPercentage) > 0).length,
              gapDowns: gapScanData.stocks.filter((s: any) => parseFloat(s.gapPercentage) < 0).length,
              topGapUps: gapScanData.stocks
                .filter((s: any) => parseFloat(s.gapPercentage) > 0)
                .slice(0, 5)
                .map((s: any) => `${s.stockSymbol} (${s.gapPercentage})`),
              topGapDowns: gapScanData.stocks
                .filter((s: any) => parseFloat(s.gapPercentage) < 0)
                .slice(0, 5)
                .map((s: any) => `${s.stockSymbol} (${s.gapPercentage})`)
            };
          }
        } catch (error) {
          console.error('Error parsing gap scan data:', error);
        }
      }
      
      const response = await fetch(API_ENDPOINTS.preMarketAnalysis, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentTime: estTimeString,
          isOptimalTime,
          recentGapData,
          prompt: `You are a pre-market analysis expert. Analyze current market conditions and provide guidance on whether to focus on gap-ups or gap-downs today.

Current time (EST): ${estTimeString}
${isOptimalTime ? 'This is within the optimal pre-market analysis window (8:45-9:15 AM EST).' : ''}

${recentGapData ? `Recent gap scanner data:
- Total gap-ups found: ${recentGapData.gapUps}
- Total gap-downs found: ${recentGapData.gapDowns}
- Top gap-ups: ${recentGapData.topGapUps.join(', ')}
- Top gap-downs: ${recentGapData.topGapDowns.join(', ')}` : 'No recent gap scanner data available.'}

Please provide:

1. **Market Futures Analysis** - Check and report on S&P 500, NASDAQ, DOW futures (green/red)
2. **VIX Analysis** - Current VIX level and what it suggests
3. **Gap Score** - Rate gap-ups vs gap-downs on a scale of 0-10
4. **Today's Recommendation** - Should I focus on gap-ups, gap-downs, or monitor both?
5. **Key Reasoning** - List 3-5 bullet points explaining your recommendation
6. **Top Factors to Watch** - What should I monitor throughout the pre-market session
7. **Risk Considerations** - Any specific risks or market conditions to be aware of

Format your response with clear sections and use emojis (✅ for bullish, ❌ for bearish, ⚖️ for neutral) to make it easy to scan.

Remember the key principles:
- If futures are green, gap-ups tend to follow through
- If futures are red or VIX is elevated, gap-downs often provide better opportunities
- Volume and clear catalysts are critical for both
- The 8:45-9:15 AM window is optimal for analysis`
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setPreMarketAnalysis(data.analysis);
        setAnalysisTimestamp(new Date());
      } else {
        throw new Error(`Failed to get pre-market analysis: ${response.status}`);
      }
    } catch (error) {
      console.error('Error getting pre-market analysis:', error);
      alert('Failed to get pre-market analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const clearAnalysis = () => {
    setPreMarketAnalysis('');
    setAnalysisTimestamp(null);
    localStorage.removeItem('preMarketAnalysis');
  };
  
  return (
    <div className="pre-market-page">
      <div className="page-header">
        <h1>Pre-Market Analysis</h1>
        <p>AI-powered market sentiment analysis to guide your gap trading strategy</p>
      </div>
      
      {/* Time Status */}
      <div className="time-status" style={{
        textAlign: 'center',
        marginBottom: '2rem',
        padding: '1rem',
        backgroundColor: isOptimalTime ? '#d4edda' : isPreMarket ? '#fff3cd' : '#f8d7da',
        borderRadius: '8px',
        border: `1px solid ${isOptimalTime ? '#c3e6cb' : isPreMarket ? '#ffeaa7' : '#f5c6cb'}`
      }}>
        <h3 style={{margin: '0 0 0.5rem 0', fontSize: '1.8rem'}}>
          Current Time (EST): {estTimeString}
        </h3>
        {isOptimalTime && (
          <p style={{margin: 0, color: '#155724', fontSize: '1.4rem'}}>
            ✅ Optimal pre-market analysis window (8:45 AM - 9:15 AM EST)
          </p>
        )}
        {isPreMarket && !isOptimalTime && (
          <p style={{margin: 0, color: '#856404', fontSize: '1.4rem'}}>
            ⏰ Pre-market is open. Best analysis window: 8:45 AM - 9:15 AM EST
          </p>
        )}
        {isMarketClosed && (
          <p style={{margin: 0, color: '#721c24', fontSize: '1.4rem'}}>
            🔒 Market is closed. Pre-market opens at 4:00 AM EST
          </p>
        )}
      </div>
      
      {/* Run Analysis Button */}
      <div style={{textAlign: 'center', marginBottom: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap'}}>
        <button 
          className="analysis-button"
          onClick={runPreMarketAnalysis}
          disabled={loading}
          style={{
            backgroundColor: isOptimalTime ? '#27ae60' : '#3498db',
            color: 'white',
            fontSize: '1.6rem',
            padding: '0.75rem 2rem'
          }}
        >
          {loading ? '🤖 Analyzing Market Conditions...' : '🚀 Run Pre-Market Analysis'}
        </button>
        {preMarketAnalysis && (
          <button 
            className="analysis-button"
            onClick={clearAnalysis}
            style={{
              backgroundColor: '#e74c3c',
              color: 'white',
              fontSize: '1.6rem',
              padding: '0.75rem 2rem'
            }}
          >
            Clear Analysis
          </button>
        )}
      </div>
      
      {/* Analysis Results */}
      {preMarketAnalysis && (
        <div className="analysis-results" style={{
          backgroundColor: '#f8f9fa',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '1px solid #e9ecef'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <h2 style={{margin: 0}}>🤖 AI Pre-Market Analysis</h2>
            {analysisTimestamp && (
              <small style={{color: '#666', fontSize: '1.2rem'}}>
                Generated: {analysisTimestamp.toLocaleString()}
              </small>
            )}
          </div>
          
          <div style={{
            fontSize: '1.3rem',
            lineHeight: '1.8',
            color: '#333',
            whiteSpace: 'pre-wrap'
          }}>
            {preMarketAnalysis.split('\n').map((line, index) => {
              // Remove common markup patterns (same as risk assessment)
              const cleanLine = line
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/__(.*?)__/g, '$1')
                .replace(/`(.*?)`/g, '$1')
                .replace(/#{1,6}\s/g, '')
                .trim();
              
              return cleanLine ? (
                <p key={index} style={{margin: '0.5rem 0'}}>{cleanLine}</p>
              ) : null;
            }).filter(Boolean)}
          </div>
        </div>
      )}
      
      {/* Pre-Market Trading Guide */}
      <div className="pre-market-guide" style={{
        backgroundColor: '#f8f9fa',
        padding: '2rem',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <h2 style={{marginTop: 0, marginBottom: '1.5rem'}}>📚 Pre-Market Trading Guide</h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <h3 style={{marginTop: 0, marginBottom: '1rem', color: '#2c3e50'}}>
              🕐 Optimal Timing
            </h3>
            <ul style={{margin: 0, paddingLeft: '1.5rem', fontSize: '1.2rem', lineHeight: '1.8'}}>
              <li><strong>4:00-8:45 AM:</strong> Initial pre-market activity</li>
              <li><strong>8:45-9:15 AM:</strong> Run analysis & identify leaders</li>
              <li><strong>9:15-9:25 AM:</strong> Narrow watchlist to 2-4 stocks</li>
              <li><strong>9:25-9:30 AM:</strong> Set entry/exit plans</li>
            </ul>
          </div>
          
          <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <h3 style={{marginTop: 0, marginBottom: '1rem', color: '#2c3e50'}}>
              📊 Key Indicators
            </h3>
            <ul style={{margin: 0, paddingLeft: '1.5rem', fontSize: '1.2rem', lineHeight: '1.8'}}>
              <li><strong>Gap Size:</strong> 3-15% (large/mid), 10-30% (small)</li>
              <li><strong>Volume:</strong> High RVOL = real interest</li>
              <li><strong>Price Action:</strong> Clean trends, not choppy</li>
              <li><strong>Catalyst:</strong> Clear news or earnings</li>
            </ul>
          </div>
          
          <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <h3 style={{marginTop: 0, marginBottom: '1rem', color: '#2c3e50'}}>
              ⚠️ Risk Management
            </h3>
            <ul style={{margin: 0, paddingLeft: '1.5rem', fontSize: '1.2rem', lineHeight: '1.8'}}>
              <li>Set stop-loss before open</li>
              <li>Size positions by volatility</li>
              <li>Have profit targets ready</li>
              <li>Plan for gap fill scenarios</li>
            </ul>
          </div>
        </div>
        
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#e3f2fd',
          borderRadius: '6px',
          border: '1px solid #90caf9'
        }}>
          <p style={{margin: 0, fontSize: '1.3rem', lineHeight: '1.6'}}>
            <strong>💡 Pro Tip:</strong> Run the analysis between 8:45-9:15 AM EST for the most accurate market read. 
            The AI will analyze futures, volatility, and recent gap activity to recommend whether gap-ups or gap-downs 
            offer better opportunities for the day.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PreMarketPage;