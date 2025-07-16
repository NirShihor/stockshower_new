import React, { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from './config/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  CandlestickController,
  CandlestickElement,
  Title,
  Tooltip,
  Legend
);

interface ChartDataPoint {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartData {
  symbol: string;
  companyName: string;
  data: ChartDataPoint[];
  dataPoints: number;
  dateRange: {
    from: string;
    to: string;
  };
}

interface StockChartProps {
  symbol: string;
  days?: number;
  chartType?: 'candlestick' | 'line';
}

const getTimeframeLabel = (days: number): string => {
  if (days === 0.01) return '15 Minutes';
  if (days === 0.042) return '1 Hour';
  if (days === 1) return '1 Day';
  if (days === 7) return '7 Days';
  if (days === 30) return '30 Days';
  if (days === 90) return '90 Days';
  if (days === 180) return '6 Months';
  if (days === 365) return '1 Year';
  return `${days} Day${days !== 1 ? 's' : ''}`;
};

const StockChart: React.FC<StockChartProps> = ({ symbol, days = 30, chartType = 'candlestick' }) => {
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChartData = async () => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_ENDPOINTS.chart(symbol)}?days=${days}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch chart data: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Chart data received:', data);
      console.log('First data point:', data.data?.[0]);
      console.log('Chart data length:', data.data?.length);
      console.log('Sample formatted data:', data.data?.slice(0, 3));
      setChartData(data);
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch chart data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChartData();
  }, [symbol, days]);

  if (loading) {
    return <div className="chart-loading">Loading chart for {symbol}...</div>;
  }

  if (error) {
    return <div className="chart-error">Error: {error}</div>;
  }

  if (!chartData || !chartData.data.length) {
    return <div className="chart-no-data">No chart data available for {symbol}</div>;
  }

  // Create chart data based on chart type
  const formattedData = chartType === 'candlestick' 
    ? chartData.data.map((d) => ({
        x: d.timestamp,
        o: d.open,
        h: d.high,
        l: d.low,
        c: d.close
      }))
    : chartData.data.map((d) => ({
        x: d.timestamp,
        y: d.close // Use close price for line chart
      }));

  console.log('Formatted chart data for Chart.js:', formattedData.length, 'points');
  console.log('Sample formatted data:', formattedData.slice(0, 3));

  const chartDataConfig = chartType === 'candlestick' 
    ? {
        datasets: [
          {
            label: `${chartData.symbol} Price`,
            data: formattedData,
            borderColor: '#26a69a',
            backgroundColor: 'rgba(38, 166, 154, 0.1)',
            color: {
              up: '#26a69a',   // Green for up candles
              down: '#ef5350', // Red for down candles  
              unchanged: '#999' // Gray for unchanged
            }
          }
        ]
      }
    : {
        datasets: [
          {
            label: `${chartData.symbol} Close Price`,
            data: formattedData,
            borderColor: '#26a69a',
            backgroundColor: 'rgba(38, 166, 154, 0.1)',
            fill: false,
            tension: 0.1,
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 0
          }
        ]
      };

  const options: any = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `${chartData.companyName} (${chartData.symbol}) - ${getTimeframeLabel(days)} ${chartType === 'candlestick' ? 'Candlestick' : 'Line'} Chart`,
      },
      tooltip: {
        callbacks: {
          title: (context: any) => {
            return new Date(context[0].label).toLocaleDateString();
          },
          label: (context: any) => {
            const dataPoint = chartData.data[context.dataIndex];
            if (chartType === 'candlestick') {
              return [
                `Open: $${dataPoint.open.toFixed(2)}`,
                `High: $${dataPoint.high.toFixed(2)}`,
                `Low: $${dataPoint.low.toFixed(2)}`,
                `Close: $${dataPoint.close.toFixed(2)}`,
                `Volume: ${dataPoint.volume.toLocaleString()}`
              ];
            } else {
              return [
                `Close: $${dataPoint.close.toFixed(2)}`,
                `Volume: ${dataPoint.volume.toLocaleString()}`
              ];
            }
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: days < 1 ? ('minute' as const) : ('day' as const),
          displayFormats: {
            minute: 'HH:mm',
            day: 'MM-dd'
          }
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        type: 'linear' as const,
        title: {
          display: true,
          text: 'Price ($)'
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
    maintainAspectRatio: false
  };

  return (
    <div className="stock-chart">
      <div className="chart-container">
        <Chart 
          type={chartType === 'candlestick' ? "candlestick" : "line"} 
          data={chartDataConfig} 
          options={options} 
        />
      </div>
      <div className="chart-info">
        <small>
          Data points: {chartData.dataPoints} | 
          Range: {chartData.dateRange.from} to {chartData.dateRange.to}
        </small>
      </div>
    </div>
  );
};

export default StockChart;