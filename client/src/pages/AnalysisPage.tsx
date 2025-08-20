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

  const getCompaniesForSector = (): Company[] => {
    const sector = sectors.find(s => s.name === selectedSector);
    return sector ? sector.companies : [];
  };

  return (
    <div className="analysis-page">
      <div className="page-header">
        <h1>Fundamental Analysis</h1>
        <p>Comprehensive sector and company analysis for informed trading decisions</p>
      </div>

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
              <h3>🌍 Global Analysis</h3>
              <p>{analysisResult.globalAnalysis}</p>
            </div>

            <div className="analysis-card">
              <h3>🏭 Sector Analysis</h3>
              <p>{analysisResult.sectorAnalysis}</p>
            </div>

            <div className="analysis-card">
              <h3>🏢 Company Analysis</h3>
              <p>{analysisResult.companyAnalysis}</p>
            </div>

            <div className="analysis-card">
              <h3>📊 Market Sentiment</h3>
              <p>{analysisResult.sentiment}</p>
            </div>

            <div className="analysis-card recommendation">
              <h3>💡 Trading Recommendation</h3>
              <p><strong>{analysisResult.recommendation}</strong></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisPage;