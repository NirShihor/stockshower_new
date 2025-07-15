import React, { useState, useEffect } from 'react';
import StockChart from '../StockChart';
import { API_ENDPOINTS } from '../config/api';

interface AvailableStock {
  symbol: string;
  name: string;
  price: number;
  volume: number;
}

const ChartsPage: React.FC = () => {
  const [selectedStock, setSelectedStock] = useState<string>('AAPL');
  const [chartDays, setChartDays] = useState<number>(0.01);
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const [availableStocks, setAvailableStocks] = useState<AvailableStock[]>([]);
  const [filteredStocks, setFilteredStocks] = useState<AvailableStock[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  // Load available stocks on component mount
  useEffect(() => {
    const loadAvailableStocks = async () => {
      try {
        setIsLoading(true);
        console.log('Fetching available stocks...');
        
        // First, try to load gap-up stocks from localStorage
        const savedGapScanData = localStorage.getItem('gapScannerData');
        let gapUpStocks: AvailableStock[] = [];
        
        if (savedGapScanData) {
          try {
            const gapScanData = JSON.parse(savedGapScanData);
            // Check if data is from today
            const savedDate = new Date(gapScanData.timestamp);
            const today = new Date();
            const isToday = savedDate.toDateString() === today.toDateString();
            
            if (isToday && gapScanData.stocks) {
              gapUpStocks = gapScanData.stocks.map((stock: any) => ({
                symbol: stock.stockSymbol,
                name: stock.companyName || stock.stockSymbol,
                price: parseFloat(stock.currentPrice.replace('$', '')),
                volume: stock.volume || 0
              }));
              console.log(`Loaded ${gapUpStocks.length} gap-up stocks from local storage`);
            }
          } catch (error) {
            console.error('Error parsing gap scan data:', error);
          }
        }
        
        // Then, try to fetch market-wide data
        const response = await fetch(API_ENDPOINTS.availableStocks);
        const data = await response.json();
        
        if (response.ok) {
          console.log(`Loaded ${data.stocks.length} market-wide stocks`);
          
          // Combine gap-up stocks (prioritized) with market data
          const combinedStocks = [...gapUpStocks];
          
          // Add market stocks that aren't already in gap-up stocks
          const gapUpSymbols = new Set(gapUpStocks.map(s => s.symbol));
          const additionalStocks = data.stocks.filter((stock: AvailableStock) => 
            !gapUpSymbols.has(stock.symbol)
          );
          
          combinedStocks.push(...additionalStocks);
          
          setAvailableStocks(combinedStocks);
          // Show gap-up stocks first, then popular ones
          const initialDisplay = gapUpStocks.length > 0 ? 
            [...gapUpStocks, ...additionalStocks.slice(0, 50 - gapUpStocks.length)] :
            combinedStocks.slice(0, 50);
          setFilteredStocks(initialDisplay);
          
          console.log(`Combined total: ${combinedStocks.length} stocks (${gapUpStocks.length} gap-ups + ${additionalStocks.length} market)`);
        } else {
          console.error('Failed to load market stocks:', data.error);
          
          if (gapUpStocks.length > 0) {
            // Use gap-up stocks if available
            setAvailableStocks(gapUpStocks);
            setFilteredStocks(gapUpStocks);
          } else {
            // Fallback to popular stocks
            const fallbackStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'DDOG']
              .map(symbol => ({ symbol, name: symbol, price: 0, volume: 0 }));
            setAvailableStocks(fallbackStocks);
            setFilteredStocks(fallbackStocks);
          }
        }
      } catch (error) {
        console.error('Error loading available stocks:', error);
        
        // Try to use gap-up stocks from localStorage as fallback
        const savedGapScanData = localStorage.getItem('gapScannerData');
        if (savedGapScanData) {
          try {
            const gapScanData = JSON.parse(savedGapScanData);
            const gapUpStocks = gapScanData.stocks?.map((stock: any) => ({
              symbol: stock.stockSymbol,
              name: stock.companyName || stock.stockSymbol,
              price: parseFloat(stock.currentPrice.replace('$', '')),
              volume: stock.volume || 0
            })) || [];
            
            if (gapUpStocks.length > 0) {
              setAvailableStocks(gapUpStocks);
              setFilteredStocks(gapUpStocks);
              console.log('Using gap-up stocks as fallback');
              return;
            }
          } catch (error) {
            console.error('Error using gap scan fallback:', error);
          }
        }
        
        // Final fallback to popular stocks
        const fallbackStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'DDOG']
          .map(symbol => ({ symbol, name: symbol, price: 0, volume: 0 }));
        setAvailableStocks(fallbackStocks);
        setFilteredStocks(fallbackStocks);
      } finally {
        setIsLoading(false);
      }
    };

    loadAvailableStocks();
  }, []);

  // Filter stocks based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredStocks(availableStocks.slice(0, 50)); // Show first 50 by default
    } else {
      const filtered = availableStocks
        .filter(stock => 
          stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
          stock.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .slice(0, 20); // Limit to 20 results for performance
      setFilteredStocks(filtered);
    }
  }, [searchTerm, availableStocks]);

  const handleStockSelect = (symbol: string) => {
    setSelectedStock(symbol);
    setSearchTerm(symbol);
    setShowDropdown(false);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setShowDropdown(true);
  };

  return (
    <div className="charts-page">
      <div className="page-header">
        <h1>Stock Charts</h1>
        <p>Interactive candlestick charts with real-time data from Polygon</p>
      </div>

      <div className="chart-section">
        <div className="chart-controls">
          <div className="chart-symbol-selector">
            <strong>Select Stock:</strong>
            <div className="stock-search-container">
              <input
                type="text"
                placeholder="Type to search stocks (e.g., AAPL, TSLA)..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                className="stock-search-input"
              />
              
              {isLoading && (
                <div className="search-loading">Loading stocks...</div>
              )}
              
              {showDropdown && !isLoading && (
                <div className="stock-dropdown">
                  <div className="dropdown-header">
                    {searchTerm 
                      ? `Search results for "${searchTerm}"` 
                      : (localStorage.getItem('gapScannerData') ? 'Gap-up stocks (prioritized)' : 'Popular stocks')
                    }
                    <button 
                      className="close-dropdown"
                      onClick={() => setShowDropdown(false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="stock-list">
                    {filteredStocks.length > 0 ? (
                      filteredStocks.map((stock) => (
                        <div
                          key={stock.symbol}
                          className={`stock-option ${selectedStock === stock.symbol ? 'selected' : ''}`}
                          onClick={() => handleStockSelect(stock.symbol)}
                        >
                          <div className="stock-symbol">{stock.symbol}</div>
                          <div className="stock-details">
                            ${stock.price.toFixed(2)} • Vol: {stock.volume.toLocaleString()}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-results">No stocks found for "{searchTerm}"</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="chart-days-selector">
            <strong>Time Range:</strong>
            <select 
              value={chartDays} 
              onChange={(e) => setChartDays(parseFloat(e.target.value))}
            >
              <option value={0.01}>15 minutes</option>
              <option value={0.042}>1 hour</option>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
            </select>
          </div>
          <div className="chart-type-selector">
            <strong>Chart Type:</strong>
            <select 
              value={chartType} 
              onChange={(e) => setChartType(e.target.value as 'candlestick' | 'line')}
            >
              <option value="candlestick">Candlestick</option>
              <option value="line">Line</option>
            </select>
          </div>
        </div>
        <StockChart symbol={selectedStock} days={chartDays} chartType={chartType} />
      </div>
    </div>
  );
};

export default ChartsPage;