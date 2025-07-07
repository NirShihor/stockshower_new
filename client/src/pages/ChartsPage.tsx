import React, { useState } from 'react';
import StockChart from '../StockChart';

const ChartsPage: React.FC = () => {
  const [selectedStock, setSelectedStock] = useState<string>('AAPL');
  const [chartDays, setChartDays] = useState<number>(30);

  // Popular stocks for chart selection
  const popularStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'DDOG'];

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
            {popularStocks.map((stock) => (
              <label key={stock}>
                <input
                  type="radio"
                  name="stock"
                  value={stock}
                  checked={selectedStock === stock}
                  onChange={(e) => setSelectedStock(e.target.value)}
                />
                {stock}
              </label>
            ))}
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
        </div>
        <StockChart symbol={selectedStock} days={chartDays} />
      </div>
    </div>
  );
};

export default ChartsPage;