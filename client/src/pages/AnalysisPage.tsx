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

  // CAN SLIM Trading State
  const [canslimLoading, setCanslimLoading] = useState<boolean>(false);
  const [canslimResult, setCanslimResult] = useState<any>(null);
  const [canslimDryRun, setCanslimDryRun] = useState<boolean>(true);

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

  const runCanslimScan = async () => {
    setCanslimLoading(true);
    setCanslimResult(null);
    try {
      const response = await fetch('/api/canslim/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: canslimDryRun,
          force: false,
          margin: 25,
          maxTrades: 10,
          minScore: 4
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setCanslimResult(data);
    } catch (error) {
      console.error('Error running CAN SLIM scan:', error);
      alert('Error running CAN SLIM scan. Please try again.');
    } finally {
      setCanslimLoading(false);
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

      {/* CAN SLIM Trading Section */}
      <div className="canslim-trading-section" style={{ marginBottom: '40px' }}>
        <h2 style={{ borderBottom: '2px solid #28a745', paddingBottom: '10px' }}>CAN SLIM Trading</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>Scan for CAN SLIM breakout opportunities and execute trades</p>

        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={canslimDryRun}
              onChange={(e) => setCanslimDryRun(e.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
            <span>Dry Run (no real trades)</span>
          </label>

          <button
            className={`analysis-button ${canslimLoading ? 'scanning' : ''}`}
            onClick={runCanslimScan}
            disabled={canslimLoading}
            style={{
              background: canslimDryRun ? '#007bff' : '#28a745',
              color: 'white',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {canslimLoading ? 'Scanning...' : canslimDryRun ? 'Run Test Scan' : 'Run LIVE Scan'}
          </button>

          {!canslimDryRun && (
            <span style={{ color: '#dc3545', fontWeight: 'bold' }}>
              LIVE MODE - Real trades will be placed!
            </span>
          )}
        </div>

        {canslimResult && (
          <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #dee2e6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Scan Results</h3>
              <span style={{
                background: canslimResult.mode === 'LIVE' ? '#28a745' : '#007bff',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '14px'
              }}>
                {canslimResult.mode}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <div style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{canslimResult.result?.scanned || 0}</div>
                <div style={{ color: '#666', fontSize: '14px' }}>Stocks Scanned</div>
              </div>
              <div style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>{canslimResult.result?.executed || 0}</div>
                <div style={{ color: '#666', fontSize: '14px' }}>Trades Executed</div>
              </div>
              <div style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{canslimResult.broker?.positions || 0}</div>
                <div style={{ color: '#666', fontSize: '14px' }}>Open Positions</div>
              </div>
              <div style={{ background: 'white', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{canslimResult.broker?.orders || 0}</div>
                <div style={{ color: '#666', fontSize: '14px' }}>Pending Orders</div>
              </div>
            </div>

            {canslimResult.result?.skipped && (
              <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
                <strong>Skipped:</strong> {canslimResult.result.skipped}
              </div>
            )}

            {canslimResult.broker?.positionDetails?.length > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <h4>Open Positions:</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: '#e9ecef' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Symbol</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Entry</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Current</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>P&L</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>SL</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>TP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canslimResult.broker.positionDetails.map((pos: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                          <td style={{ padding: '8px' }}>{pos.symbol}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${pos.openPrice?.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${pos.currentPrice?.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: pos.profit >= 0 ? '#28a745' : '#dc3545' }}>
                            ${pos.profit?.toFixed(2)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${pos.stopLoss?.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${pos.takeProfit?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {canslimResult.broker?.orderDetails?.length > 0 && (
              <div>
                <h4>Pending Orders:</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: '#e9ecef' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Symbol</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Type</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Entry</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>SL</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>TP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canslimResult.broker.orderDetails.map((ord: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                          <td style={{ padding: '8px' }}>{ord.symbol}</td>
                          <td style={{ padding: '8px' }}>{ord.type}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${ord.openPrice?.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${ord.stopLoss?.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>${ord.takeProfit?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ fontSize: '12px', color: '#666', marginTop: '15px', textAlign: 'right' }}>
              {canslimResult.marketOpen ? 'Market Open' : 'Market Closed'} | {new Date(canslimResult.timestamp).toLocaleString()}
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
