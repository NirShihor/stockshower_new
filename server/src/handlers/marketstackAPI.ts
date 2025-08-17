import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Marketstack API configuration
const MARKETSTACK_API_KEY = process.env.MARKETSTACK_API_KEY || '';
const MARKETSTACK_BASE_URL = 'http://api.marketstack.com/v1';

// Debug: Check if API key is loaded
if (!MARKETSTACK_API_KEY || MARKETSTACK_API_KEY === '') {
  console.error('MARKETSTACK_API_KEY is not set or empty!');
} else {
  console.log('Marketstack API Key loaded:', MARKETSTACK_API_KEY.substring(0, 8) + '...');
}

// Marketstack interfaces
interface MarketstackEODData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adj_high: number | null;
  adj_low: number | null;
  adj_close: number;
  adj_open: number | null;
  adj_volume: number | null;
  split_factor: number;
  dividend: number;
  symbol: string;
  exchange: string;
  date: string;
}

interface MarketstackIntradayData {
  open: number;
  high: number;
  low: number;
  last: number;
  close: number | null;
  volume: number;
  date: string;
  symbol: string;
  exchange: string;
}

interface MarketstackTickerData {
  name: string;
  symbol: string;
  stock_exchange: {
    name: string;
    acronym: string;
    mic: string;
    country: string;
    country_code: string;
    city: string;
    website: string;
  };
  has_eod: boolean;
  has_intraday: boolean;
}

interface MarketstackEODResponse {
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
  };
  data: MarketstackEODData[];
}

interface MarketstackIntradayResponse {
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
  };
  data: MarketstackIntradayData[];
}

interface MarketstackTickersResponse {
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
  };
  data: MarketstackTickerData[];
}

// Helper function to make Marketstack API requests
async function makeMarketstackRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
  try {
    const url = `${MARKETSTACK_BASE_URL}${endpoint}`;
    const response = await axios.get(url, {
      params: {
        access_key: MARKETSTACK_API_KEY,
        ...params
      }
    });
    
    if (response.data.error) {
      console.error('Marketstack API Error:', JSON.stringify(response.data.error, null, 2));
      throw new Error(response.data.error.message || 'Marketstack API error');
    }
    
    return response.data;
  } catch (error: any) {
    console.error(`Marketstack API request failed:`, error.message);
    throw error;
  }
}

// Get previous trading day's data
export async function getMarketstackPreviousClose(symbol: string): Promise<MarketstackEODData | null> {
  try {
    const data = await makeMarketstackRequest('/eod/latest', {
      symbols: symbol,
      limit: 1
    }) as MarketstackEODResponse;
    
    return data.data.length > 0 ? data.data[0] : null;
  } catch (error) {
    console.error(`Failed to get previous close for ${symbol}:`, error);
    return null;
  }
}

// Get ticker details
export async function getMarketstackTickerDetails(symbol: string): Promise<MarketstackTickerData | null> {
  try {
    const data = await makeMarketstackRequest('/tickers', {
      symbols: symbol,
      limit: 1
    }) as MarketstackTickersResponse;
    
    return data.data.length > 0 ? data.data[0] : null;
  } catch (error) {
    console.error(`Failed to get ticker details for ${symbol}:`, error);
    return null;
  }
}

// Get historical data
export async function getMarketstackHistoricalData(
  symbol: string,
  dateFrom: string,
  dateTo: string
): Promise<MarketstackEODData[]> {
  try {
    const data = await makeMarketstackRequest('/eod', {
      symbols: symbol,
      date_from: dateFrom,
      date_to: dateTo,
      limit: 1000,
      sort: 'ASC'
    }) as MarketstackEODResponse;
    
    return data.data || [];
  } catch (error) {
    console.error(`Failed to get historical data for ${symbol}:`, error);
    return [];
  }
}

// Get intraday data (15-minute intervals)
export async function getMarketstackIntradayData(
  symbol: string,
  dateFrom: string,
  dateTo: string,
  interval: string = '15min'
): Promise<MarketstackIntradayData[]> {
  try {
    const data = await makeMarketstackRequest('/intraday', {
      symbols: symbol,
      date_from: dateFrom,
      date_to: dateTo,
      interval: interval,
      limit: 1000,
      sort: 'ASC'
    }) as MarketstackIntradayResponse;
    
    return data.data || [];
  } catch (error) {
    console.error(`Failed to get intraday data for ${symbol}:`, error);
    return [];
  }
}

// Get real-time data
export async function getMarketstackRealTimePrice(symbol: string): Promise<number | null> {
  try {
    // First try intraday/latest endpoint for real-time data
    const data = await makeMarketstackRequest('/intraday/latest', {
      symbols: symbol,
      limit: 1
    }) as MarketstackIntradayResponse;
    
    if (data.data.length > 0) {
      const latestData = data.data[0];
      // Return the 'last' price or 'close' if available
      return latestData.last || latestData.close || null;
    }
    
    return null;
  } catch (error: any) {
    console.warn(`Could not get real-time price for ${symbol}:`, error.message);
    return null;
  }
}

// Get multiple symbols EOD data for gap scanning
export async function getMarketstackBulkEOD(date: string): Promise<MarketstackEODData[]> {
  try {
    console.log(`Fetching marketstack data for ${date}...`);
    
    // First try without exchange filtering to test basic functionality
    const data = await makeMarketstackRequest('/eod', {
      date_from: date,
      date_to: date,
      limit: 1000,  // Professional plan supports higher limits
      sort: 'DESC'  // Sort by volume descending to get most active stocks first
    }) as MarketstackEODResponse;
    
    if (data.data && data.data.length > 0) {
      console.log(`Found ${data.data.length} stocks from marketstack for ${date}`);
      // Filter to only US exchanges after fetching
      const usStocks = data.data.filter(stock => 
        stock.exchange && (
          stock.exchange.includes('NASDAQ') || 
          stock.exchange.includes('NYSE') ||
          stock.exchange === 'XNAS' ||
          stock.exchange === 'XNYS'
        )
      );
      console.log(`Filtered to ${usStocks.length} US stocks`);
      return usStocks;
    } else {
      console.log(`No data found for ${date}`);
      return [];
    }
  } catch (error) {
    console.error(`Failed to get bulk EOD data for ${date}:`, error);
    if (error.response && error.response.data) {
      console.error('Marketstack error details:', JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
}

// Convert Marketstack data to match existing format
export function convertMarketstackToPolygonFormat(data: MarketstackEODData): any {
  return {
    c: data.close,
    h: data.high,
    l: data.low,
    o: data.open,
    v: data.volume,
    t: new Date(data.date).getTime(),
    n: 1 // Marketstack doesn't provide transaction count
  };
}

// Convert intraday data to match existing format
export function convertMarketstackIntradayToPolygonFormat(data: MarketstackIntradayData): any {
  return {
    c: data.close || data.last,
    h: data.high,
    l: data.low,
    o: data.open,
    v: data.volume,
    t: new Date(data.date).getTime(),
    n: 1
  };
}