import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';

const getBaseUrl = (): string => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5002';
  }
  return '';
};

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
  first15MinLow?: string;
  first15MinClose?: string;
  premarketHigh?: string;
  premarketLow?: string;
}

interface GapTradePlan {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  targets: number[];
  positionQty: number;
  riskRewardRatio: string;
  orderType: string;
  strategy: string;
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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');
  const [scanData, setScanData] = useState<GapUpScanData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [volatilityLevel, setVolatilityLevel] = useState<'low' | 'medium' | 'high'>('low');
  const [trackingStocks, setTrackingStocks] = useState<Set<string>>(new Set());
  const [livePrices, setLivePrices] = useState<Map<string, {price: string, change: number, timestamp: number}>>(new Map());
  const [priceIntervals, setPriceIntervals] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [nextUpdateTimes, setNextUpdateTimes] = useState<Map<string, number>>(new Map());
  const [riskAssessments, setRiskAssessments] = useState<Map<string, {assessment: string, timestamp: number}>>(new Map());
  const [loadingRisk, setLoadingRisk] = useState<Set<string>>(new Set());
  const [showRiskModal, setShowRiskModal] = useState<boolean>(false);
  const [currentRiskAssessment, setCurrentRiskAssessment] = useState<{symbol: string, assessment: string, timestamp: number} | null>(null);
  const [hasRealTimeAccess, setHasRealTimeAccess] = useState<boolean>(true); // Assume true initially
  const [showScanningMessage, setShowScanningMessage] = useState<boolean>(false);
  const [placingOrder, setPlacingOrder] = useState<string | null>(null);

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

  const fetchGapScan = async () => {
    // Clear existing results before scanning
    clearScanData();
    setLoading(true);
    try {
      const endpoint = activeTab === 'up' ? API_ENDPOINTS.scanGapUps : API_ENDPOINTS.scanGapDowns;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ volatilityLevel }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Gap ${activeTab === 'up' ? 'Up' : 'Down'} Scan Data:`, data);
      setScanData(data);
    } catch (error) {
      console.error(`Error fetching gap ${activeTab} scan:`, error);
      setScanData(null);
      // Show error message to user
      alert(`Error scanning for gap-${activeTab}s. Please try again.`);
    } finally {
      setLoading(false);
      setShowScanningMessage(false); // Hide message when scan completes
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

  const getLastTradingDay = () => {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const dayOfWeek = easternTime.getDay();
    const currentHour = easternTime.getHours();
    const currentMinute = easternTime.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const marketCloseTime = 16 * 60; // 4:00 PM in minutes
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // If it's a weekday and market has closed, data is from today
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && currentTimeInMinutes >= marketCloseTime) {
      return 'Today';
    }
    
    // If it's a weekday and market is open, data is real-time
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && currentTimeInMinutes >= 9 * 60 + 30 && currentTimeInMinutes < marketCloseTime) {
      return '';  // Empty string means current/live data
    }
    
    // If it's Saturday or Sunday, last trading day was Friday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'Friday';
    }
    
    // If it's Monday before market open, last trading day was Friday
    if (dayOfWeek === 1 && currentTimeInMinutes < 9 * 60 + 30) {
      return 'Friday';
    }
    
    // For any other early morning (before market open), previous day
    if (currentTimeInMinutes < 9 * 60 + 30) {
      return dayNames[dayOfWeek - 1];
    }
    
    return 'Today';
  };

  const fetchLivePrice = async (symbol: string) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.chart(symbol)}/live-price`);
      if (response.ok) {
        const data = await response.json();
        if (data.note) {
          console.log(`${symbol}: ${data.note}`);
          setHasRealTimeAccess(false); // Mark as no real-time access
        }
        return data.livePrice;
      } else if (response.status === 404) {
        console.log(`Live price not available for ${symbol} - subscription may not include real-time data`);
        setHasRealTimeAccess(false); // Mark as no real-time access
      }
    } catch (error) {
      console.error(`Error fetching live price for ${symbol}:`, error);
      setHasRealTimeAccess(false); // Mark as no real-time access
    }
    return null;
  };

  const startTracking = async (symbol: string, currentPriceStr: string) => {
    if (trackingStocks.has(symbol)) return;

    const initialPrice = parseFloat(currentPriceStr.replace('$', ''));
    const now = Date.now();
    
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
        timestamp: now
      });
      return newMap;
    });

    // Set next update time to 60 seconds from now
    setNextUpdateTimes(prev => {
      const newMap = new Map(prev);
      const nextTime = now + 60000;
      newMap.set(symbol, nextTime);
      console.log(`Setting next update time for ${symbol}: ${new Date(nextTime).toLocaleTimeString()}`);
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
          timestamp: now
        });
        return newMap;
      });
    }

    // Set up interval to fetch every 45 seconds
    const interval = setInterval(async () => {
      const updateTime = Date.now();
      
      // Set next update time
      setNextUpdateTimes(prev => {
        const newMap = new Map(prev);
        const nextTime = updateTime + 60000;
        newMap.set(symbol, nextTime);
        console.log(`Updating next update time for ${symbol}: ${new Date(nextTime).toLocaleTimeString()}`);
        return newMap;
      });
      
      const livePrice = await fetchLivePrice(symbol);
      
      setLivePrices(prev => {
        const newMap = new Map(prev);
        const currentData = newMap.get(symbol);
        
        if (livePrice) {
          // Successfully got new price
          const newPrice = parseFloat(livePrice.replace('$', ''));
          const change = ((newPrice - initialPrice) / initialPrice) * 100;
          
          newMap.set(symbol, {
            price: livePrice,
            change: change,
            timestamp: updateTime
          });
        } else if (currentData) {
          // Failed to get new price, but update timestamp
          newMap.set(symbol, {
            ...currentData,
            timestamp: updateTime
          });
        }
        
        return newMap;
      });
    }, 60000); // 60 seconds

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

    setNextUpdateTimes(prev => {
      const newMap = new Map(prev);
      newMap.delete(symbol);
      return newMap;
    });
  };

  // Update current time every second for countdown display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      priceIntervals.forEach(interval => clearInterval(interval));
    };
  }, []);

  const getRiskAssessment = async (stock: GapUpStock) => {
    const symbol = stock.stockSymbol;
    
    if (loadingRisk.has(symbol)) return; // Already loading
    
    setLoadingRisk(prev => {
      const newSet = new Set(prev);
      newSet.add(symbol);
      return newSet;
    });

    try {
      const response = await fetch(API_ENDPOINTS.riskAssessment, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol,
          stockData: {
            companyName: stock.companyName,
            currentPrice: stock.currentPrice,
            livePrice: stock.livePrice,
            openPrice: stock.openPrice,
            highPrice: stock.highPrice,
            lowPrice: stock.lowPrice,
            previousClose: stock.previousClose,
            twentyDayHigh: stock.twentyDayHigh,
            gapPercentage: stock.gapPercentage,
            volume: stock.volume,
            marketCap: stock.marketCap,
            exchange: stock.exchange,
            first15MinHigh: stock.first15MinHigh,
            first15MinClose: stock.first15MinClose,
            isBlueChip: stock.isBlueChip,
            suitable: stock.suitable
          }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const riskData = {
          assessment: data.assessment,
          timestamp: Date.now()
        };
        
        setRiskAssessments(prev => {
          const newMap = new Map(prev);
          newMap.set(symbol, riskData);
          return newMap;
        });
        
        // Show the assessment in modal
        setCurrentRiskAssessment({
          symbol: symbol,
          assessment: data.assessment,
          timestamp: Date.now()
        });
        setShowRiskModal(true);
      } else {
        throw new Error(`Failed to get risk assessment: ${response.status}`);
      }
    } catch (error) {
      console.error('Error getting risk assessment:', error);
      alert('Failed to get risk assessment. Please try again.');
    } finally {
      setLoadingRisk(prev => {
        const newSet = new Set(prev);
        newSet.delete(symbol);
        return newSet;
      });
    }
  };

  const openRiskAssessment = (symbol: string) => {
    const assessment = riskAssessments.get(symbol);
    if (assessment) {
      setCurrentRiskAssessment({
        symbol: symbol,
        assessment: assessment.assessment,
        timestamp: assessment.timestamp
      });
      setShowRiskModal(true);
    }
  };

  const goToChart = (symbol: string) => {
    navigate(`/charts?symbol=${symbol}`);
  };

  // Helper function to determine MT5 order type for gap trades
  const getMT5OrderType = (direction: 'long' | 'short', currentPrice: number, entryPrice: number): string => {
    if (direction === 'long') {
      if (entryPrice > currentPrice) {
        return 'Buy Stop';
      } else {
        return 'Buy Limit';
      }
    } else {
      if (entryPrice < currentPrice) {
        return 'Sell Stop';
      } else {
        return 'Sell Limit';
      }
    }
  };

  // Generate trading plan for gap stocks (Gap & Go Strategy - Warrior Trading style)
  const generateGapTradePlan = (stock: GapUpStock): GapTradePlan => {
    const parsePrice = (priceStr: string | undefined): number => {
      if (!priceStr) return 0;
      const cleaned = priceStr.replace(/[$,]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };

    const currentPrice = parsePrice(stock.livePrice || stock.currentPrice);
    const premarketHigh = parsePrice(stock.premarketHigh || stock.first15MinHigh);
    const premarketLow = parsePrice(stock.premarketLow || stock.first15MinLow);

    if (premarketHigh === 0 || premarketLow === 0) {
      throw new Error('Missing required premarket data for trading plan');
    }

    if (currentPrice === 0) {
      throw new Error('Invalid price data for trading plan');
    }
    
    if (activeTab === 'up') {
      const entry = premarketHigh;
      const stop = premarketLow;
      const risk = entry - stop;
      const target1 = entry + (risk * 2);
      const target2 = entry + (risk * 3);
      
      return {
        direction: 'long',
        entry: Number(entry.toFixed(2)),
        stop: Number(stop.toFixed(2)),
        targets: [Number(target1.toFixed(2)), Number(target2.toFixed(2))],
        positionQty: 1,
        riskRewardRatio: '1:2',
        orderType: getMT5OrderType('long', currentPrice, entry),
        strategy: 'Gap & Go Long'
      };
    } else {
      const entry = premarketLow;
      const stop = premarketHigh;
      const risk = stop - entry;
      const target1 = entry - (risk * 2);
      const target2 = entry - (risk * 3);
      
      return {
        direction: 'short',
        entry: Number(entry.toFixed(2)),
        stop: Number(stop.toFixed(2)),
        targets: [Number(target1.toFixed(2)), Number(target2.toFixed(2))],
        positionQty: 1,
        riskRewardRatio: '1:2',
        orderType: getMT5OrderType('short', currentPrice, entry),
        strategy: 'Gap & Go Short'
      };
    }
  };

  // Handle placing MT5 orders for gap trades
  const handlePlaceGapOrder = async (stock: GapUpStock) => {
    if (placingOrder) return;
    
    if (!stock.premarketHigh && !stock.first15MinHigh || !stock.premarketLow && !stock.first15MinLow) {
      alert('❌ Cannot place order: Missing required premarket data for this stock.');
      return;
    }
    
    setPlacingOrder(stock.stockSymbol);
    
    try {
      const tradePlan = generateGapTradePlan(stock);
      
      // Helper function to safely parse price strings
      const parsePrice = (priceStr: string | undefined): number => {
        if (!priceStr) return 0;
        const cleaned = priceStr.replace(/[$,]/g, '');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };
      
      const currentPrice = parsePrice(stock.livePrice || stock.currentPrice);
      
      // Create a comprehensive signal structure that matches what MT5 handler expects
      const gapSignal = {
        id: `gap-${stock.stockSymbol}-${Date.now()}`,
        symbol: stock.stockSymbol,
        timeframe: '5m',
        time: new Date().toISOString(),
        pattern: {
          name: tradePlan.strategy,
          class: 'single' as const,
          direction: tradePlan.direction === 'long' ? 'bullish' : 'bearish' as const,
          barsInvolved: 1,
          patternHigh: parseFloat(stock.first15MinHigh?.replace('$', '') || '0'),
          patternLow: parseFloat(stock.first15MinLow?.replace('$', '') || '0')
        },
        context: {
          trend: activeTab === 'up' ? 'up' : 'down' as const,
          atSupport: activeTab === 'down',
          atResistance: activeTab === 'up',
          nearestSupport: activeTab === 'down' ? parseFloat(stock.twentyDayHigh?.replace('$', '') || '0') : undefined,
          nearestResistance: activeTab === 'up' ? parseFloat(stock.twentyDayHigh?.replace('$', '') || '0') : undefined,
          atr: Math.abs(tradePlan.entry - tradePlan.stop) / 2, // Rough ATR estimate
          volumeFactor: 1.5, // Default
          isHighVolume: (stock.volume || 0) > 500000,
          isWideRange: true
        },
        confirmation: {
          triggerSide: tradePlan.direction === 'long' ? 'above_high' : 'below_low' as const,
          triggerPrice: tradePlan.direction === 'long' ? 
            parseFloat(stock.first15MinHigh?.replace('$', '') || '0') : 
            parseFloat(stock.first15MinLow?.replace('$', '') || '0'),
          invalidationPrice: tradePlan.stop,
          validForBars: 5
        },
        plan: tradePlan,
        score: 65, // Default score for gap trades
        notes: [`Gap ${activeTab} trade based on ${stock.gapPercentage} gap`],
        currentPrice: currentPrice,
        trapRisk: 'low' as const
      };

      // First call preview to check for price adjustments
      const previewResponse = await fetch(`${getBaseUrl()}/api/candlestick/mt5/preview-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gapSignal)
      });

      if (!previewResponse.ok) {
        throw new Error('Failed to preview order');
      }

      const previewResult = await previewResponse.json();
      
      if (previewResult.priceAdjusted) {
        const confirmMessage = `⚠️ PRICE ADJUSTMENT REQUIRED ⚠️

Original Entry: $${tradePlan.entry}
Adjusted Entry: $${previewResult.adjustedEntry}
Current Market: $${currentPrice}

Reason: ${previewResult.adjustmentReason}

Do you want to proceed with the adjusted price?`;

        if (!window.confirm(confirmMessage)) {
          return;
        }
      }

      // Place the actual order
      const response = await fetch(`${getBaseUrl()}/api/candlestick/mt5/place-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gapSignal)
      });

      if (!response.ok) {
        throw new Error('Failed to place order');
      }

      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Order placed successfully!\n\nOrder ID: ${result.orderId}\nSymbol: ${stock.stockSymbol}\nType: ${tradePlan.orderType}\nEntry: $${result.entryPrice || tradePlan.entry}\nStop: $${tradePlan.stop}\nTarget: $${tradePlan.targets[0]}`);
      } else {
        alert(`❌ Failed to place order:\n\n${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error placing gap order:', error);
      alert('Failed to communicate with MT5 bridge. Please check the connection.');
    } finally {
      setPlacingOrder(null);
    }
  };

  return (
    <div className="gap-scanner-page">
      <div className="page-header">
        <h1>Gap Scanner</h1>
        <p>Find stocks gapping up or down with significant moves</p>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation" style={{
        display: 'flex',
        marginBottom: '1rem',
        borderBottom: '1px solid #ddd'
      }}>
        <button
          onClick={() => {
            if (!loading) {
              setActiveTab('up');
              setScanData(null); // Clear data when switching tabs
              setShowScanningMessage(false); // Hide message if switching successfully
            } else {
              setShowScanningMessage(true); // Show message when clicking during scan
            }
          }}
          className={`tab-button ${activeTab === 'up' ? 'active' : ''}`}
          style={{
            opacity: loading && activeTab !== 'up' ? 0.6 : 1,
            cursor: loading && activeTab !== 'up' ? 'not-allowed' : 'pointer'
          }}
        >
          📈 Gap Ups
        </button>
        <button
          onClick={() => {
            if (!loading) {
              setActiveTab('down');
              setScanData(null); // Clear data when switching tabs
              setShowScanningMessage(false); // Hide message if switching successfully
            } else {
              setShowScanningMessage(true); // Show message when clicking during scan
            }
          }}
          className={`tab-button ${activeTab === 'down' ? 'active' : ''}`}
          style={{
            opacity: loading && activeTab !== 'down' ? 0.6 : 1,
            cursor: loading && activeTab !== 'down' ? 'not-allowed' : 'pointer'
          }}
        >
          📉 Gap Downs
        </button>
      </div>

      {showScanningMessage && loading && (
        <div style={{
          textAlign: 'center',
          marginBottom: '1rem',
          padding: '0.5rem',
          backgroundColor: '#fff3cd',
          color: '#856404',
          border: '1px solid #ffeaa7',
          borderRadius: '4px',
          fontSize: '1.3rem'
        }}>
          ⏳ Please wait until scan is done before switching tabs
        </div>
      )}

      <div className="scanner-controls">
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap'}}>
            <label htmlFor="volatility-select" style={{fontSize: '1.8rem', color: '#333', fontWeight: 'bold'}}>
              Volatility Level:
            </label>
            <select 
              id="volatility-select"
              value={volatilityLevel} 
              onChange={(e) => setVolatilityLevel(e.target.value as 'low' | 'medium' | 'high')}
              style={{
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1.5rem',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="low">Low (Safer)</option>
              <option value="medium">Medium</option>
              <option value="high">High (More Results)</option>
            </select>
          </div>
          <small style={{color: '#666', fontSize: '1.5rem', maxWidth: '300px'}}>
            {volatilityLevel === 'low' && 'Safest: Only stocks with very low volatility scores'}
            {volatilityLevel === 'medium' && 'Balanced: Moderate volatility tolerance'}
            {volatilityLevel === 'high' && 'Aggressive: Higher volatility tolerance'}
          </small>
        </div>
        
        <div style={{display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap'}}>
          <button 
            className={`analysis-button ${loading ? 'scanning' : ''}`}
            onClick={fetchGapScan} 
            disabled={loading}
            style={{marginLeft: '2rem'}}
          >
            {loading ? `Scanning for Gap ${activeTab === 'up' ? 'Ups' : 'Downs'}...` : `Scan for Gap ${activeTab === 'up' ? 'Ups' : 'Downs'}`}
          </button>
          {scanData && (
            <button className="analysis-button" onClick={clearScanData}>
              Clear Results
            </button>
          )}
          {scanData && (
            <div style={{fontSize: '1.2rem', color: '#666', minWidth: 'fit-content'}}>
              Last scanned: {new Date(scanData.timestamp).toLocaleString()}
              {scanData.scanDuration && ` (${scanData.scanDuration})`}
            </div>
          )}
        </div>
      </div>

      {scanData && (
        <div className="scan-container">
          <div className="scan-header">
            <h2>Gap {activeTab === 'up' ? 'Up' : 'Down'} Stocks Found: {scanData.totalFound}</h2>
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
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    <h3>{stock.stockSymbol}</h3>
                    {stock.isBlueChip && (
                      <span className="blue-chip-badge">
                        BLUE CHIP
                      </span>
                    )}
                  </div>
                  {stock.companyName && (
                    <p className="company-name">{stock.companyName}</p>
                  )}
                </div>
                
                <div className="stock-details">
                  <div className="detail-row">
                    <span className="label">{getMarketStatus(stock.exchange).status === 'OPEN' ? 'Current Price:' : `${getLastTradingDay()}'s Closing Price:`}</span>
                    <span className="value" style={{color: '#FF8C00', fontWeight: 'bold'}}>{stock.currentPrice}</span>
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
                                fontSize: '1.3rem',
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
                      fontSize: '1.2rem'
                    }}>
                      {getMarketStatus(stock.exchange).status}
                      <small style={{color: '#666', fontWeight: 'normal', marginLeft: '0.5rem'}}>
                        ({getMarketStatus(stock.exchange).reason})
                      </small>
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">{activeTab === 'up' ? '20-Day High:' : '20-Day Low:'}</span>
                    <span className="value">{stock.twentyDayHigh}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s Gap:` : 'Gap:'}</span>
                    <span className="value gap-percentage">{stock.gapPercentage}</span>
                  </div>
                  
                  {stock.openPrice && (
                    <div className="detail-row">
                      <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s Open:` : 'Open:'}</span>
                      <span className="value" style={{color: '#8A2BE2', fontWeight: 'bold'}}>{stock.openPrice}</span>
                    </div>
                  )}
                  {stock.first15MinHigh && activeTab === 'up' && (
                    <div className="detail-row">
                      <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s First 15min High:` : 'First 15min High:'}</span>
                      <span className="value" style={{color: '#27ae60', fontWeight: 'bold'}}>{stock.first15MinHigh}</span>
                    </div>
                  )}
                  {stock.first15MinLow && (
                    <div className="detail-row">
                      <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s First 15min Low:` : 'First 15min Low:'}</span>
                      <span className="value" style={{color: '#e74c3c', fontWeight: 'bold'}}>{stock.first15MinLow}</span>
                    </div>
                  )}
                  {stock.first15MinClose && (
                    <div className="detail-row">
                      <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s First 15min Close:` : 'First 15min Close:'}</span>
                      <span className="value" style={{color: '#FF8C00', fontWeight: 'bold'}}>{stock.first15MinClose}</span>
                    </div>
                  )}
                  {stock.premarketHigh && (
                    <div className="detail-row">
                      <span className="label">Premarket High:</span>
                      <span className="value" style={{color: '#2e7d32', fontWeight: 'bold'}}>{stock.premarketHigh}</span>
                    </div>
                  )}
                  {stock.premarketLow && (
                    <div className="detail-row">
                      <span className="label">Premarket Low:</span>
                      <span className="value" style={{color: '#c62828', fontWeight: 'bold'}}>{stock.premarketLow}</span>
                    </div>
                  )}
                  {stock.highPrice && (
                    <div className="detail-row">
                      <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s High:` : 'Day High:'}</span>
                      <span className="value">{stock.highPrice}</span>
                    </div>
                  )}
                  {stock.lowPrice && (
                    <div className="detail-row">
                      <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s Low:` : 'Day Low:'}</span>
                      <span className="value">{stock.lowPrice}</span>
                    </div>
                  )}
                  {stock.previousClose && (
                    <div className="detail-row">
                      <span className="label">Previous Close:</span>
                      <span className="value">{stock.previousClose}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="label">{getMarketStatus(stock.exchange).status !== 'OPEN' && getLastTradingDay() !== 'Today' ? `${getLastTradingDay()}'s Volume:` : 'Volume:'}</span>
                    <span className="value">
                      {stock.volume && stock.volume > 0 ? stock.volume.toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Market Cap:</span>
                    <span className="value">
                      {stock.marketCap && stock.marketCap > 0 ? `$${(stock.marketCap / 1000000).toFixed(0)}M` : 'N/A'}
                    </span>
                  </div>
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

                {/* Trading Plan Preview */}
                {stock.suitable && (stock.premarketHigh || stock.first15MinHigh) && (stock.premarketLow || stock.first15MinLow) && (() => {
                  const tradePlan = generateGapTradePlan(stock);
                  
                  // Helper function to safely parse price strings
                  const parsePrice = (priceStr: string | undefined): number => {
                    if (!priceStr) return 0;
                    const cleaned = priceStr.replace(/[$,]/g, '');
                    const parsed = parseFloat(cleaned);
                    return isNaN(parsed) ? 0 : parsed;
                  };
                  
                  // Use live tracked price if available, otherwise fall back to stock data
                  const trackedPrice = trackingStocks.has(stock.stockSymbol) && livePrices.has(stock.stockSymbol) 
                    ? livePrices.get(stock.stockSymbol)?.price 
                    : null;
                  const currentPrice = parsePrice(trackedPrice || stock.livePrice || stock.currentPrice);
                  const isMarketClosed = currentPrice === 0 || isNaN(currentPrice);
                  
                  return (
                    <div className="gap-trade-plan" style={{
                      background: '#f8f9fa',
                      border: '1px solid #e9ecef',
                      borderRadius: '6px',
                      padding: '12px',
                      margin: '12px 0'
                    }}>
                      <div className="plan-header" style={{marginBottom: '8px'}}>
                        <span style={{fontSize: '12px', fontWeight: '600', color: '#495057', textTransform: 'uppercase'}}>
                          {tradePlan.strategy} Setup
                        </span>
                      </div>
                      <div className="plan-details" style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '16px'}}>
                          <span style={{color: '#343a40', fontWeight: '700'}}>Order Type:</span>
                          <span style={{fontWeight: '600', fontSize: '15px', padding: '4px 10px', borderRadius: '4px', backgroundColor: tradePlan.direction === 'long' ? '#d4edda' : '#f8d7da', color: tradePlan.direction === 'long' ? '#155724' : '#721c24'}}>
                            {tradePlan.orderType}
                          </span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '16px', backgroundColor: '#fff3cd', padding: '8px', borderRadius: '4px', border: '1px solid #ffeaa7'}}>
                          <span style={{color: '#343a40', fontWeight: '700'}}>📊 Current Price:</span>
                          <span style={{fontWeight: '600', color: isMarketClosed ? '#dc3545' : '#212529'}}>
                            {isMarketClosed ? 'Market Closed' : `$${currentPrice.toFixed(2)}`}
                          </span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '16px', backgroundColor: '#d1ecf1', padding: '8px', borderRadius: '4px', border: '1px solid #bee5eb'}}>
                          <span style={{color: '#343a40', fontWeight: '700'}}>🎯 Entry Price:</span>
                          <span style={{fontWeight: '600', color: '#0c5460'}}>${tradePlan.entry}</span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '16px', backgroundColor: '#f8d7da', padding: '8px', borderRadius: '4px', border: '1px solid #f5c6cb'}}>
                          <span style={{color: '#343a40', fontWeight: '700'}}>🛑 Stop Loss:</span>
                          <span style={{fontWeight: '600', color: '#721c24'}}>${tradePlan.stop}</span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '16px', backgroundColor: '#d4edda', padding: '8px', borderRadius: '4px', border: '1px solid #c3e6cb'}}>
                          <span style={{color: '#343a40', fontWeight: '700'}}>💰 Take Profit:</span>
                          <span style={{fontWeight: '600', color: '#155724'}}>${tradePlan.targets[0]}</span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '16px'}}>
                          <span style={{color: '#343a40', fontWeight: '700'}}>Risk/Reward:</span>
                          <span style={{fontWeight: '600', color: '#007bff'}}>{tradePlan.riskRewardRatio}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}


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
                  <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center'}}>
                    {!trackingStocks.has(stock.stockSymbol) ? (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center'}}>
                        <button 
                          className="analysis-button"
                          onClick={() => startTracking(stock.stockSymbol, stock.livePrice || stock.currentPrice)}
                          style={{
                            backgroundColor: '#87CEEB',
                            color: 'black',
                            fontSize: '1.4rem',
                            padding: '0.5rem 1rem',
                            fontFamily: 'SchoolPencil-Regular, sans-serif'
                          }}
                        >
                          🔍 Start Price Tracking (60s intervals)
                        </button>
                        <small style={{color: '#666', fontSize: '0.75rem', fontStyle: 'italic', fontFamily: 'SchoolPencil-Regular, sans-serif', textAlign: 'center'}}>
                          Note: Using most recent close price (real-time data requires subscription upgrade)
                        </small>
                      </div>
                    ) : (
                      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'}}>
                        <button 
                          className="analysis-button"
                          onClick={() => stopTracking(stock.stockSymbol)}
                          style={{
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            fontSize: '1.2rem',
                            padding: '0.5rem 1rem'
                          }}
                        >
                          ⏹️ Stop Tracking
                        </button>
                        <small style={{color: '#666', fontFamily: 'SchoolPencil-Regular, sans-serif', textAlign: 'center'}}>
                          {(() => {
                            const nextUpdate = nextUpdateTimes.get(stock.stockSymbol) || 0;
                            const secondsLeft = Math.max(0, Math.floor((nextUpdate - currentTime) / 1000));
                            console.log(`Countdown for ${stock.stockSymbol}: nextUpdate=${nextUpdate}, currentTime=${currentTime}, secondsLeft=${secondsLeft}`);
                            return hasRealTimeAccess 
                              ? `Tracking live prices every 60 seconds • Next update in ~${secondsLeft}s`
                              : `Checking for price updates every 60 seconds • Next check in ~${secondsLeft}s`;
                          })()}
                        </small>
                      </div>
                    )}
                    
                    <button 
                      className="analysis-button"
                      onClick={() => riskAssessments.has(stock.stockSymbol) 
                        ? openRiskAssessment(stock.stockSymbol) 
                        : getRiskAssessment(stock)}
                      disabled={loadingRisk.has(stock.stockSymbol)}
                      style={{
                        backgroundColor: loadingRisk.has(stock.stockSymbol) ? '#6c757d' : riskAssessments.has(stock.stockSymbol) ? '#87CEEB' : '#FFB366',
                        color: loadingRisk.has(stock.stockSymbol) ? 'white' : 'black',
                        fontSize: '1.4rem',
                        padding: '0.5rem 1rem',
                        opacity: loadingRisk.has(stock.stockSymbol) ? 0.6 : 1
                      }}
                    >
                      {loadingRisk.has(stock.stockSymbol) 
                        ? '⏳ Getting AI Analysis...' 
                        : riskAssessments.has(stock.stockSymbol) 
                          ? '📊 View Risk Assessment' 
                          : '🤖 Get Risk Assessment'}
                    </button>
                    
                    {stock.suitable && (
                      <button 
                        className="analysis-button"
                        onClick={() => goToChart(stock.stockSymbol)}
                        style={{
                          backgroundColor: '#90EE90',
                          color: 'black',
                          fontSize: '1.4rem',
                          padding: '0.5rem 1rem'
                        }}
                      >
                        📈 View Chart
                      </button>
                    )}

                    {stock.suitable && (stock.premarketHigh || stock.first15MinHigh) && (stock.premarketLow || stock.first15MinLow) && (
                      <button 
                        className="analysis-button"
                        onClick={() => handlePlaceGapOrder(stock)}
                        disabled={placingOrder === stock.stockSymbol}
                        style={{
                          backgroundColor: placingOrder === stock.stockSymbol ? '#6c757d' : '#2e7d32',
                          color: 'white',
                          fontSize: '1.4rem',
                          padding: '0.5rem 1rem',
                          opacity: placingOrder === stock.stockSymbol ? 0.6 : 1
                        }}
                      >
                        {placingOrder === stock.stockSymbol ? '⏳ Placing Order...' : `🎯 Place ${activeTab === 'up' ? 'Gap Up' : 'Gap Down'} Order`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Assessment Modal */}
      {showRiskModal && currentRiskAssessment && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            position: 'relative',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <button 
              onClick={() => setShowRiskModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                fontSize: '2rem',
                cursor: 'pointer',
                color: '#666'
              }}
            >
              ×
            </button>
            
            <h2 style={{marginTop: 0, marginBottom: '1rem', color: '#333'}}>
              🤖 Risk Assessment for {currentRiskAssessment.symbol}
            </h2>
            
            <div style={{
              fontSize: '1.3rem',
              lineHeight: '1.6',
              color: '#444',
              marginBottom: '1.5rem'
            }}>
              {currentRiskAssessment.assessment.split('\n').map((line, index) => {
                // Remove common markup patterns
                const cleanLine = line
                  .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
                  .replace(/\*(.*?)\*/g, '$1')     // Remove *italic*
                  .replace(/__(.*?)__/g, '$1')     // Remove __underline__
                  .replace(/`(.*?)`/g, '$1')       // Remove `code`
                  .replace(/#{1,6}\s/g, '')        // Remove # headers
                  .replace(/^\s*[\*\-\+]\s/g, '')  // Remove bullet points
                  .replace(/^\s*\d+\.\s/g, '')     // Remove numbered lists
                  .trim();
                
                return cleanLine ? (
                  <p key={index} style={{margin: '0.5rem 0'}}>{cleanLine}</p>
                ) : null;
              }).filter(Boolean)}
            </div>
            
            <div style={{
              borderTop: '1px solid #eee',
              paddingTop: '1rem',
              fontSize: '1.2rem',
              color: '#666'
            }}>
              Generated: {new Date(currentRiskAssessment.timestamp).toLocaleString()}
            </div>
            
            <div style={{marginTop: '1rem', textAlign: 'center'}}>
              <button 
                onClick={() => setShowRiskModal(false)}
                style={{
                  backgroundColor: 'white',
                  color: '#4a4a4a',
                  border: '1px solid #ccc',
                  padding: '0.5rem 1.2rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  fontFamily: 'SchoolPencil-Regular, sans-serif'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GapScannerPage;