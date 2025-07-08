// API configuration for different environments
const getApiBaseUrl = (): string => {
  // In development, use local server
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5001/api/analysis';
  }
  // In production (Heroku), use your Heroku app domain
  return 'https://stockshower-4f7d4c36c3d7.herokuapp.com/api/analysis';
};

export const API_BASE_URL = getApiBaseUrl();

export const API_ENDPOINTS = {
  scanGapUps: `${API_BASE_URL}/scan-gap-ups`,
  testPolygon: `${API_BASE_URL}/test-polygon`,
  chart: (symbol: string) => `${API_BASE_URL}/chart/${symbol}`,
};