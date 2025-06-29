import React, { useState, useEffect } from 'react';
import './App.css';

interface GapUpStock {
  stockSymbol: string;
  currentPrice: string;
  twentyDayHigh: string;
  gapPercentage: string;
  analysis: string;
  suitable: boolean;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  volume?: number;
  marketCap?: number;
  companyName?: string;
  exchange?: string;
}

interface GapUpScanData {
  stocks: GapUpStock[];
  totalFound: number;
  timestamp: string;
}

function App() {
  const [scanData, setScanData] = useState<GapUpScanData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchGapUpScan = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5001/api/analysis/scan-gap-ups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      const data = await response.json();
      console.log("Gap Up Scan Data:", data);
      setScanData(data);
    } catch (error) {
      console.error('Error fetching gap up scan:', error);
      setScanData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <div className="app-header">
        <img src="/logo-2.png" alt="StockShower Logo" className="app-logo" />
        <h1>StockShower</h1>
      </div>
      <button className="analysis-button" onClick={fetchGapUpScan} disabled={loading}>
        {loading ? 'Scanning for Gap Ups...' : 'Scan for Gap Ups'}
      </button>
      
      {scanData && (
        <div className="scan-container">
          <div className="scan-header">
            <h2>Gap Up Stocks Found: {scanData.totalFound}</h2>
            <small>Last updated: {new Date(scanData.timestamp).toLocaleString()}</small>
          </div>
          
          <div className="stocks-grid">
            {scanData.stocks.map((stock, index) => (
              <div key={index} className={`stock-card ${stock.suitable ? 'suitable' : 'not-suitable'}`}>
                <div className="stock-header">
                  <h3>{stock.stockSymbol}</h3>
                  {stock.companyName && (
                    <p className="company-name">{stock.companyName}</p>
                  )}
                  <span className={`suitability-badge ${stock.suitable ? 'suitable' : 'not-suitable'}`}>
                    {stock.suitable ? 'SUITABLE' : 'NOT SUITABLE'}
                  </span>
                </div>
                
                <div className="stock-details">
                  <div className="detail-row">
                    <span className="label">Current Price:</span>
                    <span className="value">{stock.currentPrice}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">20-Day High:</span>
                    <span className="value">{stock.twentyDayHigh}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Gap:</span>
                    <span className="value gap-percentage">{stock.gapPercentage}</span>
                  </div>
                  
                  {/* Enhanced data from Finnhub */}
                  {stock.openPrice && (
                    <div className="detail-row">
                      <span className="label">Open:</span>
                      <span className="value">{stock.openPrice}</span>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
