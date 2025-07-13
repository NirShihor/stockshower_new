import React, { useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface GapUpStock {
  stockSymbol: string;
  currentPrice: string;
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
              <div key={index} className={`stock-card ${stock.suitable ? 'suitable' : 'not-suitable'}`}>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GapScannerPage;