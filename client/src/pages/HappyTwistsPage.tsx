import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface HappyTwist {
  symbol: string;
  companyName: string;
  newsHeadline: string;
  potentialImpact: string;
  currentPrice?: string;
  marketCap?: string;
  timestamp: string;
}

const HappyTwistsPage: React.FC = () => {
  const [happyTwists, setHappyTwists] = useState<HappyTwist[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  
  // Load persisted data on component mount
  useEffect(() => {
    const savedData = localStorage.getItem('happyTwistsData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        // Check if data is from today
        const savedDate = new Date(parsedData.timestamp);
        const today = new Date();
        const isToday = savedDate.toDateString() === today.toDateString();
        
        if (isToday) {
          console.log('Restored previous happy twists data from localStorage');
          setHappyTwists(parsedData.twists);
          setAnalysis(parsedData.analysis);
          setLastUpdated(new Date(parsedData.timestamp));
        } else {
          console.log('Cleared old happy twists data from localStorage');
          localStorage.removeItem('happyTwistsData');
        }
      } catch (error) {
        console.error('Error parsing saved data:', error);
        localStorage.removeItem('happyTwistsData');
      }
    }
  }, []);
  
  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (happyTwists.length > 0 && lastUpdated) {
      const dataToSave = {
        twists: happyTwists,
        analysis: analysis,
        timestamp: lastUpdated.toISOString()
      };
      localStorage.setItem('happyTwistsData', JSON.stringify(dataToSave));
      console.log('Saved happy twists data to localStorage');
    }
  }, [happyTwists, analysis, lastUpdated]);
  
  const scanForHappyTwists = async () => {
    // Clear previous results first
    setHappyTwists([]);
    setAnalysis('');
    setLastUpdated(null);
    
    setLoading(true);
    
    try {
      const response = await fetch(API_ENDPOINTS.happyTwists, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `You are a financial news analyst specializing in identifying extreme positive catalysts that could cause stocks to jump significantly (10%+ moves).

Search for and analyze recent news about:

1. **FDA Approvals** - Biotech/pharma companies getting drug approvals
2. **Major Contract Wins** - Companies winning billion-dollar contracts
3. **Breakthrough Discoveries** - Tech companies with revolutionary innovations
4. **Acquisition Targets** - Companies being acquired at huge premiums
5. **Earnings Surprises** - Companies crushing earnings by 50%+
6. **Legal Victories** - Companies winning major lawsuits or patents
7. **Regulatory Approvals** - Getting licenses for new markets
8. **Partnership Announcements** - Game-changing partnerships with major companies

For each opportunity found, provide:
- Stock Symbol
- Company Name
- News Headline
- Why this could cause a 10%+ jump
- Risk factors to consider

Focus on news from the last 48 hours. Prioritize smaller companies ($10M-$10B market cap) as they move more on news.

Format your response as:

**Market Scan Summary:**
[Brief overview of current market conditions for positive catalysts]

**Top Happy Twists Found:**

1. **[SYMBOL] - [Company Name]**
   📰 Headline: [News headline]
   🚀 Potential Impact: [Why this could cause 10%+ move]
   ⚠️ Risk: [Key risk to consider]

[Continue for each opportunity...]

**Trading Strategy:**
[Brief guidance on how to trade these opportunities]`
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Parse the AI response to extract structured data
        const parsedTwists = parseAIResponse(data.analysis);
        setHappyTwists(parsedTwists);
        setAnalysis(data.analysis);
        setLastUpdated(new Date());
      } else {
        throw new Error(`Failed to get happy twists analysis: ${response.status}`);
      }
    } catch (error) {
      console.error('Error getting happy twists:', error);
      alert('Failed to get happy twists analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to parse AI response into structured data
  const parseAIResponse = (aiText: string): HappyTwist[] => {
    const twists: HappyTwist[] = [];
    
    // Simple regex pattern to extract stock entries
    const pattern = /\*\*\[([A-Z]+)\] - ([^*]+)\*\*[\s\S]*?📰 Headline: ([^\n]+)[\s\S]*?🚀 Potential Impact: ([^\n]+)/g;
    
    let match;
    while ((match = pattern.exec(aiText)) !== null) {
      twists.push({
        symbol: match[1],
        companyName: match[2].trim(),
        newsHeadline: match[3].trim(),
        potentialImpact: match[4].trim(),
        timestamp: new Date().toISOString()
      });
    }
    
    return twists;
  };
  
  const clearData = () => {
    setHappyTwists([]);
    setAnalysis('');
    setLastUpdated(null);
    localStorage.removeItem('happyTwistsData');
  };
  
  return (
    <div className="happy-twists-page">
      <div className="page-header">
        <h1>Happy Twists</h1>
        <p>AI-powered scanner for extreme success stories that could send stocks soaring</p>
      </div>
      
      {/* Scan Controls */}
      <div style={{textAlign: 'center', marginBottom: '2rem'}}>
        <button 
          className="analysis-button happy-twists-scan-button"
          onClick={scanForHappyTwists}
          disabled={loading}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            fontSize: '1.6rem',
            padding: '0.75rem 2rem'
          }}
        >
          {loading ? '🔍 Scanning for Happy Twists...' : '🎯 Find Happy Twists'}
        </button>
      </div>
      
      {/* Last Updated */}
      {lastUpdated && (
        <div style={{textAlign: 'center', marginBottom: '1rem', color: '#666'}}>
          Last updated: {lastUpdated.toLocaleString()}
        </div>
      )}
      
      {/* Results Grid */}
      {happyTwists.length > 0 && (
        <div className="stocks-grid" style={{marginBottom: '2rem'}}>
          {happyTwists.map((twist, index) => (
            <div key={index} className="stock-card" style={{
              borderLeftColor: '#4CAF50',
              borderLeftWidth: '4px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div className="stock-header">
                  <h3>{twist.symbol}</h3>
                  <p className="company-name">{twist.companyName}</p>
                </div>
                
                <div className="stock-details">
                  <div style={{marginBottom: '1rem'}}>
                    <strong style={{display: 'block', marginBottom: '0.5rem', color: '#2c3e50'}}>
                      📰 News:
                    </strong>
                    <p style={{fontSize: '1.2rem', lineHeight: '1.5', fontStyle: 'italic'}}>
                      {twist.newsHeadline}
                    </p>
                  </div>
                  
                  <div style={{marginBottom: '1rem'}}>
                    <strong style={{display: 'block', marginBottom: '0.5rem', color: '#2c3e50'}}>
                      🚀 Potential Impact:
                    </strong>
                    <p style={{fontSize: '1.2rem', lineHeight: '1.5'}}>
                      {twist.potentialImpact}
                    </p>
                  </div>
                </div>
              </div>
              
              <div style={{
                marginTop: '1rem',
                textAlign: 'center'
              }}>
                <button 
                  className="analysis-button"
                  onClick={() => window.location.href = `/charts?symbol=${twist.symbol}`}
                  style={{
                    backgroundColor: '#90EE90',
                    color: 'black',
                    fontSize: '1.4rem',
                    padding: '0.5rem 1rem'
                  }}
                >
                  📈 View Chart
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Full Analysis */}
      {analysis && (
        <div className="analysis-results" style={{
          backgroundColor: '#f8f9fa',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '1px solid #e9ecef'
        }}>
          <h2 style={{marginTop: 0, marginBottom: '1.5rem'}}>📊 Full Analysis</h2>
          
          <div style={{
            fontSize: '1.3rem',
            lineHeight: '1.8',
            color: '#333',
            whiteSpace: 'pre-wrap'
          }}>
            {analysis.split('\n').map((line, index) => {
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
      
      {/* Information Box */}
      <div style={{
        backgroundColor: '#e3f2fd',
        padding: '1.5rem',
        borderRadius: '8px',
        border: '1px solid #90caf9',
        marginTop: '2rem'
      }}>
        <h3 style={{marginTop: 0, marginBottom: '1rem', color: '#1976d2'}}>
          💡 About Happy Twists
        </h3>
        <p style={{margin: '0.5rem 0', fontSize: '1.3rem', lineHeight: '1.6'}}>
          Happy Twists are recent (last 48 hours) extreme positive catalysts that can cause stocks to jump 10%+ in a single day. 
          These include FDA approvals, major contract wins, breakthrough discoveries, and acquisition announcements.
        </p>
        <p style={{margin: '0.5rem 0', fontSize: '1.3rem', lineHeight: '1.6'}}>
          <strong>Trading Tips:</strong> These opportunities are high-risk, high-reward. Always use stop losses, 
          size positions appropriately, and be prepared for volatility. Best traded during regular market hours 
          with tight risk management.
        </p>
      </div>
    </div>
  );
};

export default HappyTwistsPage;