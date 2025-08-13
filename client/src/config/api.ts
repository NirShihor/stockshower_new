// API configuration for different environments
const getApiBaseUrl = (): string => {
  // In development, use local server
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5001/api/analysis';
  }
  // In production (Heroku), use relative URL to same domain
  return '/api/analysis';
};

export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
  scanGapUps: `${API_BASE_URL}/scan-gap-ups`,
  scanGapDowns: `${API_BASE_URL}/scan-gap-downs`,
  testPolygon: `${API_BASE_URL}/test-polygon`,
  chart: (symbol: string) => `${API_BASE_URL}/chart/${symbol}`,
  availableStocks: `${API_BASE_URL}/available-stocks`,
  riskAssessment: `${API_BASE_URL}/risk-assessment`,
  preMarketAnalysis: `${API_BASE_URL}/pre-market-analysis`,
  happyTwists: `${API_BASE_URL}/happy-twists`,
};