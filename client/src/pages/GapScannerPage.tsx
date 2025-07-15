import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface GapUpStock {
  stockSymbol: string;
  currentPrice: string;
  livePrice?: string;
  twentyDayHigh: string;
  gapPercentage: string;
  analysis: string;
  suitable: boolean;
  isBlueChip?: boolean;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  previousClose?: string;
  volume?: number;
  marketCap?: number;
  companyName?: string;
  exchange?: string;
  first15MinHigh?: string;
  first15MinClose?: string;
}

interface GapUpScanData {
  stocks: GapUpStock[];
  totalFound: number;
  timestamp: string;
  scanDuration?: string;
  status?: 'completed' | 'partial' | 'timeout';
  processedCount?: number;
  totalCount?: number;
}

const GapScannerPage: React.FC = () => {
  const [scanData, setScanData] = useState<GapUpScanData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [trackingStocks, setTrackingStocks] = useState<Set<string>>(new Set());
  const [livePrices, setLivePrices] = useState<Map<string, {price: string, change: number, timestamp: number}>>(new Map());
  const [priceIntervals, setPriceIntervals] = useState<Map<string, NodeJS.Timeout>>(new Map());

  // Load persisted scan data on component mount
  useEffect(() => {
    const savedScanData = localStorage.getItem('gapScannerData');
    if (savedScanData) {
      try {
        const parsedData = JSON.parse(savedScanData);
        // Check if data is from today (don't show old scans)
        const savedDate = new Date(parsedData.timestamp);
        const today = new Date();
        const isToday = savedDate.toDateString() === today.toDateString();
        
        if (isToday) {
          console.log('Restored previous scan data from localStorage');
          setScanData(parsedData);
        } else {
          console.log('Cleared old scan data from localStorage');
          localStorage.removeItem('gapScannerData');
        }
      } catch (error) {
        console.error('Error parsing saved scan data:', error);
        localStorage.removeItem('gapScannerData');
      }
    }
  }, []);

  // Save scan data to localStorage whenever it changes
  useEffect(() => {
    if (scanData) {
      localStorage.setItem('gapScannerData', JSON.stringify(scanData));
      console.log('Saved scan data to localStorage');
    }
  }, [scanData]);

  const fetchGapUpScan = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.scanGapUps, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Gap Up Scan Data:", data);
      setScanData(data);
    } catch (error) {
      console.error('Error fetching gap up scan:', error);
      setScanData(null);
      // Show error message to user
      alert('Error scanning for gap-ups. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearScanData = () => {
    setScanData(null);
    localStorage.removeItem('gapScannerData');
    console.log('Cleared scan data');
  };

  const getMarketStatus = (exchange?: string) => {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const currentHour = easternTime.getHours();
    const currentMinute = easternTime.getMinutes();
    const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Check if it's a weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { status: 'CLOSED', reason: 'Weekend', color: '#e74c3c' };
    }
    
    // US markets (NYSE, NASDAQ) are typically open 9:30 AM - 4:00 PM ET
    const marketOpenTime = 9 * 60 + 30; // 9:30 AM in minutes
    const marketCloseTime = 16 * 60; // 4:00 PM in minutes
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    
    if (currentTimeInMinutes >= marketOpenTime && currentTimeInMinutes < marketCloseTime) {
      return { status: 'OPEN', reason: 'Regular Hours', color: '#27ae60' };
    } else if (currentTimeInMinutes >= 16 * 60 && currentTimeInMinutes < 20 * 60) {
      return { status: 'AFTER HOURS', reason: 'Extended Trading', color: '#f39c12' };
    } else if (currentTimeInMinutes >= 4 * 60 && currentTimeInMinutes < marketOpenTime) {
      return { status: 'PRE-MARKET', reason: 'Extended Trading', color: '#f39c12' };
    } else {
      return { status: 'CLOSED', reason: 'After Hours', color: '#e74c3c' };
    }
  };

  const fetchLivePrice = async (symbol: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.chart(symbol)}/live-price`);
      if (response.ok) {
        const data = await response.json();
        return data.livePrice;
      }
    } catch (error) {
      console.error(`Error fetching live price for ${symbol}:`, error);
    }
    return null;
  };

  const startTracking = async (symbol: string, currentPriceStr: string) => {
    if (trackingStocks.has(symbol)) return;

    const initialPrice = parseFloat(currentPriceStr.replace('$', ''));
    
    setTrackingStocks(prev => {
      const newSet = new Set(prev);
      newSet.add(symbol);
      return newSet;
    });
    
    setLivePrices(prev => {
      const newMap = new Map(prev);
      newMap.set(symbol, {
        price: currentPriceStr,
        change: 0,
        timestamp: Date.now()
      });
      return newMap;
    });

    // Fetch initial live price
    const livePrice = await fetchLivePrice(symbol);
    if (livePrice) {
      const newPrice = parseFloat(livePrice.replace('$', ''));
      const change = ((newPrice - initialPrice) / initialPrice) * 100;
      
      setLivePrices(prev => {
        const newMap = new Map(prev);
        newMap.set(symbol, {
          price: livePrice,
          change: change,
          timestamp: Date.now()
        });
        return newMap;
      });
    }

    // Set up interval to fetch every 45 seconds
    const interval = setInterval(async () => {
      const livePrice = await fetchLivePrice(symbol);
      if (livePrice) {
        const newPrice = parseFloat(livePrice.replace('$', ''));
        const change = ((newPrice - initialPrice) / initialPrice) * 100;
        
        setLivePrices(prev => {
          const newMap = new Map(prev);
          newMap.set(symbol, {
            price: livePrice,
            change: change,
            timestamp: Date.now()
          });
          return newMap;
        });
      }
    }, 45000); // 45 seconds

    setPriceIntervals(prev => {
      const newMap = new Map(prev);
      newMap.set(symbol, interval);
      return newMap;
    });
  };

  const stopTracking = (symbol: string) => {
    const interval = priceIntervals.get(symbol);
    if (interval) {
      clearInterval(interval);
      setPriceIntervals(prev => {
        const newMap = new Map(prev);
        newMap.delete(symbol);
        return newMap;
      });
    }

    setTrackingStocks(prev => {
      const newSet = new Set(prev);
      newSet.delete(symbol);
      return newSet;
    });

    setLivePrices(prev => {
      const newMap = new Map(prev);
      newMap.delete(symbol);
      return newMap;
    });
  };

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      priceIntervals.forEach(interval => clearInterval(interval));
    };
  }, [priceIntervals]);

  return (
    <div className="gap-scanner-page">
      <div className="page-header">
        <h1>Gap Up Scanner</h1>
        <p>Find stocks gapping up above their 20-day highs with real-time Polygon data</p>
      </div>

      <div className="scanner-controls">
        <button className="analysis-button" onClick={fetchGapUpScan} disabled={loading}>
          {loading ? 'Scanning for Gap Ups...' : 'Scan for Gap Ups'}
        </button>
        {scanData && (
          <button className="analysis-button" onClick={clearScanData} style={{marginLeft: '1rem', backgroundColor: '#e74c3c'}}>
            Clear Results
          </button>
        )}
        {scanData && (
          <div style={{marginLeft: '1rem', fontSize: '0.9rem', color: '#666'}}>
            Last scanned: {new Date(scanData.timestamp).toLocaleString()}
            {scanData.scanDuration && ` (${scanData.scanDuration})`}
          </div>
        )}
      </div>

      {scanData && (
        <div className="scan-container">
          <div className="scan-header">
            <h2>Gap Up Stocks Found: {scanData.totalFound}</h2>
            <small>Last updated: {new Date(scanData.timestamp).toLocaleString()}</small>
            {scanData.scanDuration && <small> • Duration: {scanData.scanDuration}</small>}
            {scanData.status && scanData.status !== 'completed' && (
              <div className="scan-status">
                <small>Status: {scanData.status === 'timeout' ? 'Partial scan (timeout)' : 'Partial scan'} - 
                Processed {scanData.processedCount}/{scanData.totalCount} stocks</small>
              </div>
            )}
          </div>
          
          <div className="stocks-grid">
            {scanData.stocks.map((stock, index) => (
              <div key={index} className={`stock-card ${stock.suitable ? 'suitable' : 'not-suitable'}`} style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div className="stock-header">
                  <h3>{stock.stockSymbol}</h3>
                  {stock.companyName && (
                    <p className="company-name">{stock.companyName}</p>
                  )}
                  <div className="badges">
                    <span className={`suitability-badge ${stock.suitable ? 'suitable' : 'not-suitable'}`}>
                      {stock.suitable ? 'SUITABLE' : 'NOT SUITABLE'}
                    </span>
                    {stock.isBlueChip && (
                      <span className="blue-chip-badge">
                        BLUE CHIP
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="stock-details">
                  <div className="detail-row">
                    <span className="label">Most Recent Closing Price:</span>
                    <span className="value">{stock.currentPrice}</span>
                  </div>
                  {stock.livePrice && !trackingStocks.has(stock.stockSymbol) && (
                    <div className="detail-row">
                      <span className="label">Today's Current Price:</span>
                      <span className="value" style={{color: '#e74c3c', fontWeight: 'bold'}}>{stock.livePrice}</span>
                    </div>
                  )}
                  
                  {trackingStocks.has(stock.stockSymbol) && livePrices.has(stock.stockSymbol) && (
                    <div className="detail-row">
                      <span className="label">Live Price (Tracking):</span>
                      <div className="live-price-container">
                        <span className="value" style={{color: '#e74c3c', fontWeight: 'bold'}}>
                          {livePrices.get(stock.stockSymbol)?.price}
                        </span>
                        <span className={`price-change ${livePrices.get(stock.stockSymbol)!.change >= 0 ? 'positive' : 'negative'}`}
                              style={{
                                color: livePrices.get(stock.stockSymbol)!.change >= 0 ? '#27ae60' : '#e74c3c',
                                fontSize: '0.9rem',
                                marginLeft: '0.5rem',
                                fontWeight: 'bold'
                              }}>
                          {livePrices.get(stock.stockSymbol)!.change >= 0 ? '↗' : '↘'} 
                          {livePrices.get(stock.stockSymbol)!.change.toFixed(2)}%
                        </span>
                        <small style={{color: '#666', fontSize: '0.8rem', marginLeft: '0.5rem'}}>
                          Updated: {new Date(livePrices.get(stock.stockSymbol)!.timestamp).toLocaleTimeString()}
                        </small>
                      </div>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="label">Market Status:</span>
                    <span className="value" style={{
                      color: getMarketStatus(stock.exchange).color, 
                      fontWeight: 'bold',
                      fontSize: '0.9rem'
                    }}>
                      {getMarketStatus(stock.exchange).status}
                      <small style={{color: '#666', fontWeight: 'normal', marginLeft: '0.5rem'}}>
                        ({getMarketStatus(stock.exchange).reason})
                      </small>
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">20-Day High:</span>
                    <span className="value">{stock.twentyDayHigh}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Gap:</span>
                    <span className="value gap-percentage">{stock.gapPercentage}</span>
                  </div>
                  
                  {stock.openPrice && (
                    <div className="detail-row">
                      <span className="label">Open:</span>
                      <span className="value">{stock.openPrice}</span>
                    </div>
                  )}
                  {stock.first15MinHigh && (
                    <div className="detail-row">
                      <span className="label">First 15min High:</span>
                      <span className="value" style={{color: '#27ae60', fontWeight: 'bold'}}>{stock.first15MinHigh}</span>
                    </div>
                  )}
                  {stock.first15MinClose && (
                    <div className="detail-row">
                      <span className="label">First 15min Close:</span>
                      <span className="value" style={{color: '#2980b9', fontWeight: 'bold'}}>{stock.first15MinClose}</span>
                    </div>
                  )}
                  {stock.highPrice && (
                    <div className="detail-row">
                      <span className="label">Day High:</span>
                      <span className="value">{stock.highPrice}</span>
                    </div>
                  )}
                  {stock.lowPrice && (
                    <div className="detail-row">
                      <span className="label">Day Low:</span>
                      <span className="value">{stock.lowPrice}</span>
                    </div>
                  )}
                  {stock.previousClose && (
                    <div className="detail-row">
                      <span className="label">Previous Close:</span>
                      <span className="value">{stock.previousClose}</span>
                    </div>
                  )}
                  {stock.volume && (
                    <div className="detail-row">
                      <span className="label">Volume:</span>
                      <span className="value">{stock.volume.toLocaleString()}</span>
                    </div>
                  )}
                  {stock.marketCap && stock.marketCap > 0 && (
                    <div className="detail-row">
                      <span className="label">Market Cap:</span>
                      <span className="value">${(stock.marketCap / 1000000).toFixed(0)}M</span>
                    </div>
                  )}
                  {stock.exchange && (
                    <div className="detail-row">
                      <span className="label">Exchange:</span>
                      <span className="value">{stock.exchange}</span>
                    </div>
                  )}
                </div>
                
                <div className="stock-analysis">
                  <p>{stock.analysis}</p>
                </div>

                <div className="live-tracking-controls" style={{
                  position: 'relative',
                  bottom: '0',
                  marginTop: '1rem',
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '4px', 
                  borderTop: '1px solid #e9ecef'
                }}>
                  {!trackingStocks.has(stock.stockSymbol) ? (
                    <button 
                      className="analysis-button"
                      onClick={() => startTracking(stock.stockSymbol, stock.livePrice || stock.currentPrice)}
                      style={{
                        backgroundColor: '#2980b9',
                        color: 'white',
                        fontSize: '0.9rem',
                        padding: '0.5rem 1rem'
                      }}
                    >
                      📈 Start Live Tracking (45s intervals)
                    </button>
                  ) : (
                    <div>
                      <button 
                        className="analysis-button"
                        onClick={() => stopTracking(stock.stockSymbol)}
                        style={{
                          backgroundColor: '#e74c3c',
                          color: 'white',
                          fontSize: '0.9rem',
                          padding: '0.5rem 1rem'
                        }}
                      >
                        ⏹️ Stop Tracking
                      </button>
                      <small style={{marginLeft: '1rem', color: '#666'}}>
                        Tracking every 45 seconds • Next update in ~{45 - Math.floor((Date.now() - (livePrices.get(stock.stockSymbol)?.timestamp || 0)) / 1000)}s
                      </small>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GapScannerPage;