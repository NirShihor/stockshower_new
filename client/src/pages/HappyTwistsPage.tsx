import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface HappyTwist {
  symbol: string;
  companyName: string;
  newsHeadline: string;
  sourceUrl?: string;
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
          console.log('Restored twists:', parsedData.twists);
          
          // Clean URLs in existing data
          const cleanedTwists = parsedData.twists.map((twist: HappyTwist) => ({
            ...twist,
            sourceUrl: twist.sourceUrl ? cleanUrl(twist.sourceUrl) : twist.sourceUrl
          }));
          
          setHappyTwists(cleanedTwists);
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
- Clean source URL (IMPORTANT: provide ONLY the clean URL without any extra text, dates, or parentheses)
- Why this could cause a 10%+ jump
- Risk factors to consider

Focus on news from the last 48 hours. Prioritize smaller companies ($10M-$10B market cap) as they move more on news.

CRITICAL FORMATTING REQUIREMENTS:
- For source URLs, provide ONLY the clean URL like: https://www.example.com/article
- Do NOT include dates, parentheses, or extra text in the URL
- Make sure each URL is complete and functional

Format your response EXACTLY as:

**Market Scan Summary:**
[Brief overview of current market conditions for positive catalysts]

**Top Happy Twists Found:**

1. **[SYMBOL] - [Company Name]**
   📰 Headline: [News headline]
   🔗 Source: [Clean URL only - no extra text]
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
        console.log('AI Response:', data.analysis);
        console.log('Parsed Twists:', parsedTwists);
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
  
  // Helper function to clean and validate URLs
  const cleanUrl = (rawUrl: string): string | undefined => {
    if (!rawUrl) return undefined;
    
    console.log('Original raw URL:', rawUrl);
    
    // Gentle cleaning - only remove obvious formatting issues
    let cleanedUrl = rawUrl
      .trim()
      .replace(/^["']|["']$/g, '') // Remove outer quotes
      .replace(/\s+\([^)]*\)$/, '') // Remove trailing text in parentheses like " (August 12, 2025)"
      .replace(/\s+$/, ''); // Remove trailing spaces only
    
    // Only split on space if there's clearly extra text after a complete URL
    if (cleanedUrl.includes(' ') && cleanedUrl.match(/https?:\/\/[^\s]+\s+/)) {
      cleanedUrl = cleanedUrl.match(/https?:\/\/[^\s]+/)?.[0] || cleanedUrl;
    }
    
    console.log('After initial cleaning:', cleanedUrl);
    
    // If it doesn't start with http, try to fix it
    if (!cleanedUrl.startsWith('http')) {
      if (cleanedUrl.startsWith('www.')) {
        cleanedUrl = 'https://' + cleanedUrl;
      } else if (cleanedUrl.includes('.') && !cleanedUrl.includes(' ')) {
        cleanedUrl = 'https://' + cleanedUrl;
      } else {
        console.warn('No valid domain found in URL:', cleanedUrl);
        return undefined; // Invalid URL
      }
    }
    
    console.log('Final cleaned URL:', cleanedUrl);
    
    // Basic URL validation
    try {
      new URL(cleanedUrl);
      return cleanedUrl;
    } catch (error) {
      console.warn('Invalid URL after cleaning:', cleanedUrl, error);
      return undefined;
    }
  };

  // Helper function to parse AI response into structured data
  const parseAIResponse = (aiText: string): HappyTwist[] => {
    const twists: HappyTwist[] = [];
    
    // Multiple regex patterns to handle different formatting
    const patterns = [
      // Original pattern with brackets and emojis
      /\*\*\[([A-Z]+)\] - ([^*]+)\*\*[\s\S]*?📰 Headline: ([^\n]+)[\s\S]*?🔗 Source: ([^\n]+)[\s\S]*?🚀 (?:Impact|Potential Impact): ([^\n]+)/g,
      
      // Pattern without brackets
      /\*\*([A-Z]+) - ([^*]+)\*\*[\s\S]*?📰 Headline: ([^\n]+)[\s\S]*?🔗 Source: ([^\n]+)[\s\S]*?🚀 (?:Impact|Potential Impact): ([^\n]+)/g,
      
      // Pattern with different formatting
      /\*\*([A-Z]+)[\s]*-[\s]*([^*]+)\*\*[\s\S]*?Headline:[\s]*([^\n]+)[\s\S]*?Source:[\s]*([^\n]+)[\s\S]*?Impact:[\s]*([^\n]+)/g,
      
      // Simpler pattern for basic extraction
      /([A-Z]{2,5})[\s]*-[\s]*([^:\n]+)[\s\S]*?(?:Headline|News):[\s]*([^:\n]+)[\s\S]*?(?:Source|URL):[\s]*([^:\n]+)[\s\S]*?(?:Impact|Why):[\s]*([^:\n]+)/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(aiText)) !== null) {
        const rawUrl = match[4].trim();
        const cleanedUrl = cleanUrl(rawUrl);
        
        console.log('Raw URL:', rawUrl);
        console.log('Cleaned URL:', cleanedUrl);
        
        twists.push({
          symbol: match[1],
          companyName: match[2].trim(),
          newsHeadline: match[3].trim(),
          sourceUrl: cleanedUrl,
          potentialImpact: match[5].trim(),
          timestamp: new Date().toISOString()
        });
      }
      
      // If we found matches with this pattern, don't try others
      if (twists.length > 0) break;
    }
    
    console.log(`Parsed ${twists.length} twists from AI response`);
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
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                {twist.sourceUrl && (
                  <button 
                    className="analysis-button happy-twists-card-button"
                    onClick={() => window.open(twist.sourceUrl, '_blank')}
                    style={{
                      backgroundColor: '#2196F3',
                      color: 'white',
                      fontSize: '1.2rem',
                      padding: '0.4rem 0.8rem'
                    }}
                  >
                    📰 Read Full Article
                  </button>
                )}
                <button 
                  className="analysis-button happy-twists-card-button"
                  onClick={() => window.location.href = `/charts?symbol=${twist.symbol}`}
                  style={{
                    backgroundColor: '#90EE90',
                    color: 'black',
                    fontSize: '1.2rem',
                    padding: '0.4rem 0.8rem'
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