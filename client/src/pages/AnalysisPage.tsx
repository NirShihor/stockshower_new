import React, { useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

interface Sector {
  name: string;
  companies: Company[];
}

interface Company {
  symbol: string;
  name: string;
}

interface AnalysisResult {
  globalAnalysis: string;
  sectorAnalysis: string;
  companyAnalysis: string;
  sentiment: string;
  recommendation: string;
  timestamp: string;
}

interface MarketData {
  symbol: string;
  current: number;
  dayChange: string;
  weekChange: string;
  monthChange: string;
  aboveEma20: boolean;
  ema20: string;
}

interface MarketOverviewResult {
  marketData: {
    spy: MarketData | null;
    qqq: MarketData | null;
    vix: MarketData | null;
  };
  regime: string;
  regimeReason: string;
  analysis: {
    currentConditions: string;
    recentTrends: string;
    nextDay: string;
    next7Days: string;
    next30Days: string;
    next180Days: string;
    canSlimOutlook: string;
  };
  timestamp: string;
}

const sectors: Sector[] = [
  {
    name: 'Technology',
    companies: [
      { symbol: 'AAPL', name: 'Apple Inc.' },
      { symbol: 'MSFT', name: 'Microsoft Corporation' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.' },
      { symbol: 'AMZN', name: 'Amazon.com Inc.' },
      { symbol: 'META', name: 'Meta Platforms Inc.' },
      { symbol: 'TSLA', name: 'Tesla Inc.' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation' },
      { symbol: 'CRM', name: 'Salesforce Inc.' },
      { symbol: 'ORCL', name: 'Oracle Corporation' },
      { symbol: 'AMD', name: 'Advanced Micro Devices' }
    ]
  },
  {
    name: 'Automotive',
    companies: [
      { symbol: 'TSLA', name: 'Tesla Inc.' },
      { symbol: 'F', name: 'Ford Motor Company' },
      { symbol: 'GM', name: 'General Motors Company' },
      { symbol: 'TM', name: 'Toyota Motor Corporation' },
      { symbol: 'HMC', name: 'Honda Motor Co.' },
      { symbol: 'VWAGY', name: 'Volkswagen AG' },
      { symbol: 'BMWYY', name: 'BMW Group' },
      { symbol: 'STLA', name: 'Stellantis N.V.' },
      { symbol: 'NIO', name: 'NIO Inc.' },
      { symbol: 'RIVN', name: 'Rivian Automotive' }
    ]
  },
  {
    name: 'Pharmaceuticals',
    companies: [
      { symbol: 'JNJ', name: 'Johnson & Johnson' },
      { symbol: 'PFE', name: 'Pfizer Inc.' },
      { symbol: 'ABBV', name: 'AbbVie Inc.' },
      { symbol: 'MRK', name: 'Merck & Co.' },
      { symbol: 'LLY', name: 'Eli Lilly and Company' },
      { symbol: 'BMY', name: 'Bristol Myers Squibb' },
      { symbol: 'AMGN', name: 'Amgen Inc.' },
      { symbol: 'GILD', name: 'Gilead Sciences' },
      { symbol: 'BIIB', name: 'Biogen Inc.' },
      { symbol: 'REGN', name: 'Regeneron Pharmaceuticals' }
    ]
  },
  {
    name: 'Finance',
    companies: [
      { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
      { symbol: 'BAC', name: 'Bank of America Corporation' },
      { symbol: 'WFC', name: 'Wells Fargo & Company' },
      { symbol: 'GS', name: 'Goldman Sachs Group' },
      { symbol: 'MS', name: 'Morgan Stanley' },
      { symbol: 'C', name: 'Citigroup Inc.' },
      { symbol: 'AXP', name: 'American Express Company' },
      { symbol: 'BLK', name: 'BlackRock Inc.' },
      { symbol: 'SCHW', name: 'Charles Schwab Corporation' },
      { symbol: 'USB', name: 'U.S. Bancorp' }
    ]
  },
  {
    name: 'Energy',
    companies: [
      { symbol: 'XOM', name: 'Exxon Mobil Corporation' },
      { symbol: 'CVX', name: 'Chevron Corporation' },
      { symbol: 'COP', name: 'ConocoPhillips' },
      { symbol: 'EOG', name: 'EOG Resources Inc.' },
      { symbol: 'SLB', name: 'Schlumberger Limited' },
      { symbol: 'PXD', name: 'Pioneer Natural Resources' },
      { symbol: 'KMI', name: 'Kinder Morgan Inc.' },
      { symbol: 'WMB', name: 'Williams Companies' },
      { symbol: 'OKE', name: 'ONEOK Inc.' },
      { symbol: 'MPC', name: 'Marathon Petroleum Corporation' }
    ]
  }
];

const AnalysisPage: React.FC = () => {
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  
  const [marketOverviewLoading, setMarketOverviewLoading] = useState<boolean>(false);
  const [marketOverview, setMarketOverview] = useState<MarketOverviewResult | null>(null);

  const handleSectorChange = (sector: string) => {
    setSelectedSector(sector);
    setSelectedCompany('');
    setAnalysisResult(null);
  };

  const handleCompanyChange = (company: string) => {
    setSelectedCompany(company);
  };

  const runAnalysis = async () => {
    if (!selectedSector || !selectedCompany) {
      alert('Please select both a sector and a company');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.fundamentalAnalysis, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sector: selectedSector,
          symbol: selectedCompany
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setAnalysisResult({
        globalAnalysis: data.globalAnalysis,
        sectorAnalysis: data.sectorAnalysis,
        companyAnalysis: data.companyAnalysis,
        sentiment: data.sentiment,
        recommendation: data.recommendation,
        timestamp: new Date().toLocaleString()
      });
      setLoading(false);
    } catch (error) {
      console.error('Error running analysis:', error);
      alert('Error running analysis. Please try again.');
      setLoading(false);
    }
  };

  const fetchMarketOverview = async () => {
    setMarketOverview(null);
    setMarketOverviewLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.marketOverview);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setMarketOverview(data);
      setMarketOverviewLoading(false);
    } catch (error) {
      console.error('Error fetching market overview:', error);
      alert('Error fetching market overview. Please try again.');
      setMarketOverviewLoading(false);
    }
  };

  const getCompaniesForSector = (): Company[] => {
    const sector = sectors.find(s => s.name === selectedSector);
    return sector ? sector.companies : [];
  };

  const getRegimeColor = (regime: string): string => {
    switch (regime) {
      case 'risk-on': return '#28a745';
      case 'risk-off': return '#dc3545';
      default: return '#ffc107';
    }
  };

  const formatChange = (change: string): React.ReactElement => {
    const numChange = parseFloat(change);
    const color = numChange >= 0 ? '#28a745' : '#dc3545';
    const prefix = numChange >= 0 ? '+' : '';
    return <span style={{ color }}>{prefix}{change}%</span>;
  };

  return (
    <div className="analysis-page">
      <div className="page-header">
        <h1>Market Analysis</h1>
        <p>Comprehensive market overview and company analysis for informed trading decisions</p>
      </div>

      <div className="market-overview-section" style={{ marginBottom: '40px' }}>
        <h2 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>Market Overview</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>General market conditions, trends, and predictions</p>
        
        <button
          className={`analysis-button ${marketOverviewLoading ? 'scanning' : ''}`}
          onClick={fetchMarketOverview}
          disabled={marketOverviewLoading}
          style={{ marginBottom: '20px' }}
        >
          {marketOverviewLoading ? 'Loading Market Data...' : 'Get Market Overview'}
        </button>

        {marketOverview && (
          <div className="market-overview-results">
            <div className="market-data-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '15px',
              marginBottom: '20px'
            }}>
              {marketOverview.marketData.spy && (
                <div className="market-card" style={{ 
                  background: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px',
                  border: '1px solid #dee2e6'
                }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>SPY (S&P 500)</h4>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${marketOverview.marketData.spy.current.toFixed(2)}</div>
                  <div style={{ fontSize: '14px', marginTop: '5px' }}>
                    Day: {formatChange(marketOverview.marketData.spy.dayChange)} | 
                    Week: {formatChange(marketOverview.marketData.spy.weekChange)} | 
                    Month: {formatChange(marketOverview.marketData.spy.monthChange)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    {marketOverview.marketData.spy.aboveEma20 ? 'Above' : 'Below'} 20 EMA (${marketOverview.marketData.spy.ema20})
                  </div>
                </div>
              )}
              
              {marketOverview.marketData.qqq && (
                <div className="market-card" style={{ 
                  background: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px',
                  border: '1px solid #dee2e6'
                }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>QQQ (Nasdaq 100)</h4>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${marketOverview.marketData.qqq.current.toFixed(2)}</div>
                  <div style={{ fontSize: '14px', marginTop: '5px' }}>
                    Day: {formatChange(marketOverview.marketData.qqq.dayChange)} | 
                    Week: {formatChange(marketOverview.marketData.qqq.weekChange)} | 
                    Month: {formatChange(marketOverview.marketData.qqq.monthChange)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    {marketOverview.marketData.qqq.aboveEma20 ? 'Above' : 'Below'} 20 EMA (${marketOverview.marketData.qqq.ema20})
                  </div>
                </div>
              )}
              
              {marketOverview.marketData.vix && (
                <div className="market-card" style={{ 
                  background: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px',
                  border: '1px solid #dee2e6'
                }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>VIX (Volatility)</h4>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${marketOverview.marketData.vix.current.toFixed(2)}</div>
                  <div style={{ fontSize: '14px', marginTop: '5px' }}>
                    Week: {formatChange(marketOverview.marketData.vix.weekChange)}
                  </div>
                </div>
              )}
              
              <div className="market-card" style={{ 
                background: getRegimeColor(marketOverview.regime),
                color: 'white',
                padding: '15px', 
                borderRadius: '8px'
              }}>
                <h4 style={{ margin: '0 0 10px 0' }}>Market Regime</h4>
                <div style={{ fontSize: '24px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {marketOverview.regime}
                </div>
                <div style={{ fontSize: '12px', marginTop: '5px', opacity: 0.9 }}>
                  {marketOverview.regimeReason}
                </div>
              </div>
            </div>

            <div className="analysis-sections">
              <div className="analysis-card">
                <h3>Current Conditions</h3>
                <p>{marketOverview.analysis.currentConditions}</p>
              </div>

              <div className="analysis-card">
                <h3>Recent Trends</h3>
                <p>{marketOverview.analysis.recentTrends}</p>
              </div>

              <div className="predictions-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '15px',
                marginTop: '20px'
              }}>
                <div className="analysis-card" style={{ background: '#e7f3ff', border: '1px solid #b3d7ff' }}>
                  <h3>Next Day Outlook</h3>
                  <p>{marketOverview.analysis.nextDay}</p>
                </div>

                <div className="analysis-card" style={{ background: '#e7f3ff', border: '1px solid #b3d7ff' }}>
                  <h3>Next 7 Days Outlook</h3>
                  <p>{marketOverview.analysis.next7Days}</p>
                </div>

                <div className="analysis-card" style={{ background: '#fff3cd', border: '1px solid #ffc107' }}>
                  <h3>Next 30 Days Outlook</h3>
                  <p>{marketOverview.analysis.next30Days}</p>
                </div>

                <div className="analysis-card" style={{ background: '#fff3cd', border: '1px solid #ffc107' }}>
                  <h3>Next 180 Days Outlook</h3>
                  <p>{marketOverview.analysis.next180Days}</p>
                </div>
              </div>

              <div className="analysis-card" style={{ 
                background: '#d4edda', 
                border: '2px solid #28a745',
                marginTop: '20px',
                padding: '20px'
              }}>
                <h3 style={{ color: '#155724', marginBottom: '10px' }}>CAN SLIM Trading Outlook</h3>
                <p style={{ color: '#155724' }}>{marketOverview.analysis.canSlimOutlook}</p>
              </div>

              <div style={{ fontSize: '12px', color: '#666', marginTop: '15px', textAlign: 'right' }}>
                Generated: {new Date(marketOverview.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fundamental-analysis-section">
        <h2 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>Company Analysis</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>Sector and company-specific fundamental analysis</p>

        <div className="analysis-controls">
          <div className="control-section">
            <div className="sector-selection">
              <label htmlFor="sector-select">
                <strong>Select Sector:</strong>
              </label>
              <select
                id="sector-select"
                value={selectedSector}
                onChange={(e) => handleSectorChange(e.target.value)}
                className="sector-dropdown"
              >
                <option value="">Choose a sector...</option>
                {sectors.map((sector) => (
                  <option key={sector.name} value={sector.name}>
                    {sector.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedSector && (
              <div className="company-selection">
                <label htmlFor="company-select">
                  <strong>Select Company:</strong>
                </label>
                <select
                  id="company-select"
                  value={selectedCompany}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="company-dropdown"
                >
                  <option value="">Choose a company...</option>
                  {getCompaniesForSector().map((company) => (
                    <option key={company.symbol} value={company.symbol}>
                      {company.symbol} - {company.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              className={`analysis-button ${loading ? 'scanning' : ''}`}
              onClick={runAnalysis}
              disabled={loading || !selectedSector || !selectedCompany}
            >
              {loading ? 'Running Analysis...' : 'Run Fundamental Analysis'}
            </button>
          </div>
        </div>

        {analysisResult && (
          <div className="analysis-results">
            <div className="analysis-header">
              <h2>Analysis Results for {selectedCompany}</h2>
              <small>Generated: {analysisResult.timestamp}</small>
            </div>

            <div className="analysis-sections">
              <div className="analysis-card">
                <h3>Global Analysis</h3>
                <p>{analysisResult.globalAnalysis}</p>
              </div>

              <div className="analysis-card">
                <h3>Sector Analysis</h3>
                <p>{analysisResult.sectorAnalysis}</p>
              </div>

              <div className="analysis-card">
                <h3>Company Analysis</h3>
                <p>{analysisResult.companyAnalysis}</p>
              </div>

              <div className="analysis-card">
                <h3>Market Sentiment</h3>
                <p>{analysisResult.sentiment}</p>
              </div>

              <div className="analysis-card recommendation">
                <h3>Trading Recommendation</h3>
                <p><strong>{analysisResult.recommendation}</strong></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisPage;
