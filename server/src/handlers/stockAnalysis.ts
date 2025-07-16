import { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

// Polygon.io interfaces
interface PolygonBar {
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  vw: number; // volume weighted average price
  t: number; // timestamp
  n: number; // number of transactions
}

interface PolygonAggregatesResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonBar[];
  status: string;
  request_id: string;
  count: number;
  next_url?: string;
}

interface PolygonTickerDetails {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  cik?: string;
  composite_figi?: string;
  share_class_figi?: string;
  market_cap?: number;
  phone_number?: string;
  address?: {
    address1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  description?: string;
  sic_code?: string;
  sic_description?: string;
  ticker_root?: string;
  homepage_url?: string;
  total_employees?: number;
  list_date?: string;
  branding?: {
    logo_url?: string;
    icon_url?: string;
  };
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
}

interface PolygonTickerDetailsResponse {
  status: string;
  request_id: string;
  results: PolygonTickerDetails;
}

interface PolygonPreviousCloseResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonBar[];
  status: string;
  request_id: string;
}

interface EnhancedStockData {
  symbol: string;
  currentPrice: number;
  livePrice?: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  previousClose: number;
  volume: number;
  marketCap: number;
  twentyDayHigh: number;
  gapPercentage: number;
  companyName: string;
  exchange: string;
  currency: string;
  first15MinHigh?: number;
  first15MinClose?: number;
}


interface GapUpStock {
	stockSymbol: string;
	currentPrice: string;
	livePrice?: string;
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
	first15MinHigh?: string;
	first15MinClose?: string;
}

interface ScanResult {
	stocks: GapUpStock[];
	totalFound: number;
	timestamp: Date;
	scanDuration?: string;
	status: 'completed' | 'partial' | 'timeout';
	processedCount: number;
	totalCount: number;
}

// Polygon.io helper functions
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// OpenAI configuration
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Blue chip companies (S&P 100 + major companies)
const BLUE_CHIP_STOCKS = new Set([
	// Tech Giants
	'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA', 'ORCL', 'CRM', 'ADBE', 'NFLX', 'CSCO', 'INTC', 'AMD', 'QCOM', 'AVGO', 'TXN',
	
	// Financial Services
	'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'BLK', 'SCHW', 'AXP', 'V', 'MA', 'PYPL',
	
	// Healthcare & Pharma
	'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'DHR', 'CVS', 'MDT', 'BMY', 'AMGN', 'GILD', 'ISRG',
	
	// Consumer Goods
	'WMT', 'HD', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'TJX',
	
	// Industrial
	'BA', 'UPS', 'HON', 'UNP', 'CAT', 'GE', 'MMM', 'LMT', 'RTX', 'DE', 'FDX',
	
	// Energy
	'XOM', 'CVX', 'COP', 'SLB',
	
	// Telecom & Utilities
	'VZ', 'T', 'TMUS', 'NEE', 'DUK', 'SO', 'D',
	
	// Others
	'BRK.A', 'BRK.B', 'SPY', 'QQQ', 'DIS', 'IBM', 'WBA'
]);

// Interface for grouped daily bars response
interface GroupedDailyBar {
	T: string; // ticker symbol
	c: number; // close price
	h: number; // high price
	l: number; // low price
	o: number; // open price
	v: number; // volume
	vw: number; // volume weighted average price
	n?: number; // number of transactions
	otc?: boolean; // OTC flag
}

interface GroupedDailyResponse {
	status: string;
	request_id: string;
	adjusted: boolean;
	queryCount: number;
	resultsCount: number;
	results: GroupedDailyBar[];
}

async function makePolygonRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
	try {
		const url = `${POLYGON_BASE_URL}${endpoint}`;
		const response = await axios.get(url, {
			params: {
				...params,
				apikey: POLYGON_API_KEY
			}
		});

		if (response.data.status === 'ERROR') {
			throw new Error(response.data.error || 'Polygon API error');
		}

		return response.data;
	} catch (error: any) {
		console.error(`Polygon API request failed:`, error.message);
		throw error;
	}
}

async function getPolygonPreviousClose(symbol: string): Promise<PolygonBar | null> {
	const data = await makePolygonRequest(`/v2/aggs/ticker/${symbol}/prev`) as PolygonPreviousCloseResponse;
	return data.results && data.results.length > 0 ? data.results[0] : null;
}

async function getPolygonTickerDetails(symbol: string): Promise<PolygonTickerDetails | null> {
	try {
		const data = await makePolygonRequest(`/v3/reference/tickers/${symbol}`) as PolygonTickerDetailsResponse;
		return data.results || null;
	} catch (error) {
		console.warn(`No ticker details available for ${symbol}`);
		return null;
	}
}

async function getPolygonDailyBars(symbol: string, from: string, to: string): Promise<PolygonBar[]> {
	const data = await makePolygonRequest(`/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`, {
		adjusted: 'true',
		sort: 'asc',
		limit: '50000'
	}) as PolygonAggregatesResponse;
	
	console.log(`Daily bars for ${symbol}: ${data.resultsCount} results`);
	return data.results || [];
}

async function getPolygonIntradayBars(symbol: string, multiplier: number, timespan: string, from: string, to: string): Promise<PolygonBar[]> {
	try {
		console.log(`Making intraday request: /v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`);
		
		const data = await makePolygonRequest(`/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`, {
			adjusted: 'true',
			sort: 'asc',
			limit: '50000'
		}) as PolygonAggregatesResponse;
		
		console.log(`${timespan} bars for ${symbol}: ${data.resultsCount} results`);
		return data.results || [];
	} catch (error) {
		console.error(`Intraday request failed for ${symbol}:`, error);
		throw error;
	}
}

async function getPolygonLivePrice(symbol: string): Promise<number | null> {
	try {
		// Try to get the last trade price
		const data = await makePolygonRequest(`/v2/last/trade/${symbol}`);
		if (data.results && data.results.price) {
			console.log(`Live price for ${symbol}: $${data.results.price}`);
			return data.results.price;
		}
		
		// Fallback to last quote
		const quoteData = await makePolygonRequest(`/v1/last_quote/stocks/${symbol}`);
		if (quoteData.last && quoteData.last.bid && quoteData.last.ask) {
			const midPrice = (quoteData.last.bid + quoteData.last.ask) / 2;
			console.log(`Live price for ${symbol} (from quote): $${midPrice}`);
			return midPrice;
		}
		
		return null;
	} catch (error: any) {
		// Check if it's a 403 authorization error (subscription doesn't include live data)
		if (error.response?.status === 403) {
			console.warn(`Live price not available for ${symbol} - subscription doesn't include real-time data`);
		} else {
			console.warn(`Could not get live price for ${symbol}:`, error.message);
		}
		return null;
	}
}

async function getPolygonGroupedDaily(date: string): Promise<GroupedDailyBar[]> {
	try {
		console.log(`Getting grouped daily bars for ${date}`);
		
		const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
			adjusted: 'true',
			include_otc: 'false'
		}) as GroupedDailyResponse;
		
		console.log(`Market-wide scan: ${data.resultsCount} stocks found for ${date}`);
		return data.results || [];
	} catch (error) {
		console.error(`Grouped daily request failed for ${date}:`, error);
		throw error;
	}
}

function calculate20DayHigh(bars: PolygonBar[]): number {
	console.log('Calculating 20-day high, bars count:', bars.length);
	if (!bars || bars.length === 0) {
		console.log('No bars data available');
		return 0;
	}

	// Sort by timestamp descending (most recent first) and take the most recent 20 bars
	// Since we already excluded today's data from the API call, these are all previous days
	const sortedBars = bars.sort((a, b) => b.t - a.t).slice(0, 20);
	console.log('Number of bars for 20-day calc:', sortedBars.length);
	
	if (sortedBars.length === 0) {
		console.log('No bars found for calculation');
		return 0;
	}
	
	const highs = sortedBars.map(bar => bar.h);
	console.log('Sample highs (previous days):', highs.slice(0, 5));
	
	const maxHigh = Math.max(...highs);
	console.log('20-day high (previous 20 days) calculated:', maxHigh);
	return maxHigh;
}

function calculateGapPercentage(openPrice: number, previousClose: number): number {
	if (previousClose === 0) return 0;
	return ((openPrice - previousClose) / previousClose) * 100;
}

function calculateVolatilityScore(bars: PolygonBar[]): number {
	if (!bars || bars.length < 5) return 100; // High volatility for insufficient data
	
	// Sort by timestamp (most recent first)
	const sortedBars = bars.sort((a, b) => b.t - a.t).slice(0, 10); // Last 10 days
	
	// Calculate daily ranges as percentage of close price
	const dailyRanges = sortedBars.map(bar => {
		const range = bar.h - bar.l;
		const rangePercent = (range / bar.c) * 100;
		return rangePercent;
	});
	
	// Calculate average daily range
	const avgDailyRange = dailyRanges.reduce((sum, range) => sum + range, 0) / dailyRanges.length;
	
	// Calculate volume volatility (coefficient of variation)
	const volumes = sortedBars.map(bar => bar.v);
	const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
	const volumeStdDev = Math.sqrt(
		volumes.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / volumes.length
	);
	const volumeCV = avgVolume > 0 ? (volumeStdDev / avgVolume) * 100 : 0;
	
	// Calculate price volatility (standard deviation of closes)
	const closes = sortedBars.map(bar => bar.c);
	const avgClose = closes.reduce((sum, close) => sum + close, 0) / closes.length;
	const priceStdDev = Math.sqrt(
		closes.reduce((sum, close) => sum + Math.pow(close - avgClose, 2), 0) / closes.length
	);
	const priceCV = avgClose > 0 ? (priceStdDev / avgClose) * 100 : 0;
	
	// Combine factors into volatility score (0-100, lower is better)
	const volatilityScore = (avgDailyRange * 0.5) + (volumeCV * 0.3) + (priceCV * 0.2);
	
	return Math.min(volatilityScore, 100); // Cap at 100
}

function isVolatilityAcceptable(bars: PolygonBar[], currentPrice: number, volatilityLevel: 'low' | 'medium' | 'high' = 'low'): boolean {
	const volatilityScore = calculateVolatilityScore(bars);
	
	// Define thresholds for different volatility levels
	let thresholds: { low: number; medium: number; high: number };
	
	if (currentPrice < 20) {
		// Very strict for lower-priced stocks
		thresholds = { low: 8, medium: 15, high: 25 };
	} else if (currentPrice < 50) {
		// Moderate for mid-priced stocks
		thresholds = { low: 12, medium: 20, high: 35 };
	} else {
		// More lenient for higher-priced stocks
		thresholds = { low: 15, medium: 25, high: 50 };
	}
	
	return volatilityScore < thresholds[volatilityLevel];
}

function calculateBreakoutPercentage(currentPrice: number, twentyDayHigh: number): number {
	if (twentyDayHigh === 0) return 0;
	return ((currentPrice - twentyDayHigh) / twentyDayHigh) * 100;
}

async function testPolygonApiKey(): Promise<boolean> {
	try {
		const response = await getPolygonPreviousClose('AAPL');
		return response !== null;
	} catch (error) {
		return false;
	}
}

async function getEnhancedStockDataFromGrouped(todayBar: GroupedDailyBar, yesterdayBar: GroupedDailyBar | null, twentyDayHigh: number): Promise<EnhancedStockData | null> {
	try {
		if (!yesterdayBar) {
			console.warn(`No previous day data for ${todayBar.T}`);
			return null;
		}

		const symbol = todayBar.T;
		const currentPrice = todayBar.c; // Today's close price
		const openPrice = todayBar.o; // Today's open price
		const highPrice = todayBar.h; // Today's high price
		const lowPrice = todayBar.l; // Today's low price
		const previousClose = yesterdayBar.c; // Yesterday's close
		const volume = todayBar.v; // Today's volume

		// Calculate gap percentage (opening gap)
		const gapPercentage = calculateGapPercentage(openPrice, previousClose);
		
		// Calculate first 15 minutes high and close
		let first15MinHigh = highPrice; // Default to day's high if we can't get intraday data
		let first15MinClose = currentPrice; // Default to current price if we can't get intraday data
		
		try {
			// Get today's intraday data to find first 15 minutes high and close
			const today = new Date().toISOString().split('T')[0];
			const intradayBars = await getPolygonIntradayBars(symbol, 1, 'minute', today, today);
			
			if (intradayBars && intradayBars.length > 0) {
				// Sort by timestamp to get chronological order
				const sortedBars = intradayBars.sort((a, b) => a.t - b.t);
				
				// Find market open time (9:30 AM EST = 14:30 UTC)
				// Take first 15 bars (15 minutes) after market open
				const first15Minutes = sortedBars.slice(0, 15);
				
				if (first15Minutes.length > 0) {
					first15MinHigh = Math.max(...first15Minutes.map(bar => bar.h));
					// The close price of the 15th minute (last bar in the first 15 minutes)
					first15MinClose = first15Minutes[first15Minutes.length - 1].c;
					console.log(`${symbol}: First 15min high: $${first15MinHigh.toFixed(2)}, close: $${first15MinClose.toFixed(2)} from ${first15Minutes.length} bars`);
				}
			}
		} catch (error) {
			console.warn(`Could not get first 15min data for ${symbol}, using defaults: ${error}`);
		}
		
		// Get company details including exchange info
		let companyName = symbol;
		let exchange = 'Unknown';
		let marketCap = 0;
		
		try {
			const tickerDetails = await getPolygonTickerDetails(symbol);
			if (tickerDetails) {
				companyName = tickerDetails.name || symbol;
				exchange = tickerDetails.primary_exchange || 'Unknown';
				marketCap = tickerDetails.market_cap || 0;
			}
		} catch (error) {
			console.warn(`Could not get ticker details for ${symbol}:`, error);
		}
		
		const enhancedData: EnhancedStockData = {
			symbol,
			currentPrice,
			openPrice,
			highPrice,
			lowPrice,
			previousClose,
			volume,
			marketCap,
			twentyDayHigh,
			gapPercentage,
			companyName,
			exchange,
			currency: 'USD',
			first15MinHigh,
			first15MinClose
		};

		return enhancedData;
	} catch (error) {
		console.error(`Failed to get enhanced stock data for ${todayBar.T}:`, error);
		return null;
	}
}

async function getEnhancedStockData(symbol: string): Promise<EnhancedStockData | null> {
	try {
		console.log(`Getting enhanced data for ${symbol} from Polygon...`);
		
		// Get historical data for gap calculation and 20-day high
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
		const toDate = new Date().toISOString().split('T')[0];

		// Skip company details for speed - only get historical data
		const historicalBars = await getPolygonDailyBars(symbol, fromDate, toDate);
		const dailyBars = historicalBars || [];
		
		console.log(`Historical bars count: ${dailyBars.length}`);

		if (dailyBars.length < 2) {
			console.warn(`Not enough historical data for ${symbol}`);
			return null;
		}

		// Sort bars by timestamp (most recent first)
		const sortedBars = dailyBars.sort((a, b) => b.t - a.t);
		
		// Find the most recent trading day (could be Friday if it's weekend)
		const latestBar = sortedBars[0]; // Most recent trading day
		const previousBar = sortedBars[1]; // Previous trading day
		
		const currentPrice = latestBar.c; // Latest close price
		const openPrice = latestBar.o; // Latest open price
		const highPrice = latestBar.h; // Latest high price
		const lowPrice = latestBar.l; // Latest low price
		const previousClose = previousBar.c; // Previous day's close
		const volume = latestBar.v; // Latest volume

		// Convert timestamp to readable date for logging
		const latestDate = new Date(latestBar.t).toDateString();
		const previousDate = new Date(previousBar.t).toDateString();
		console.log(`Analyzing gap for ${symbol}: ${latestDate} open vs ${previousDate} close`);
		console.log(`Raw data - Latest: Open=${openPrice}, Close=${currentPrice}, High=${highPrice}, Low=${lowPrice}, Volume=${volume}`);
		console.log(`Raw data - Previous: Close=${previousClose}`);
		console.log(`Timestamps - Latest: ${latestBar.t}, Previous: ${previousBar.t}`);

		// Calculate multiple types of gaps
		const openingGap = calculateGapPercentage(openPrice, previousClose);        // Open vs prev close
		const closingGap = calculateGapPercentage(currentPrice, previousClose);     // Close vs prev close  
		const intradayGap = calculateGapPercentage(highPrice, openPrice);           // High vs open (intraday momentum)
		
		// Determine the maximum gap (best performance)
		const maxGap = Math.max(Math.abs(openingGap), Math.abs(closingGap), Math.abs(intradayGap));
		const gapType = 
			Math.abs(openingGap) === maxGap ? 'Opening' :
			Math.abs(closingGap) === maxGap ? 'Closing' : 'Intraday';
		
		// Use the actual gap value (preserve sign) for the type with max absolute value
		const gapPercentage = 
			Math.abs(openingGap) === maxGap ? openingGap :
			Math.abs(closingGap) === maxGap ? closingGap : intradayGap;
		
		console.log(`Gap analysis for ${symbol}: Opening: ${openingGap.toFixed(2)}%, Closing: ${closingGap.toFixed(2)}%, Intraday: ${intradayGap.toFixed(2)}% => Best: ${gapType} ${gapPercentage.toFixed(2)}%`);
		
		// Calculate 20-day high and breakout percentage
		const twentyDayHigh = calculate20DayHigh(dailyBars);
		const breakoutPercentage = calculateBreakoutPercentage(currentPrice, twentyDayHigh);

		// Get live price during market hours
		let livePrice: number | undefined;
		try {
			livePrice = await getPolygonLivePrice(symbol) || undefined;
		} catch (error) {
			console.warn(`Could not get live price for ${symbol}:`, error);
		}

		const enhancedData: EnhancedStockData = {
			symbol,
			currentPrice,
			livePrice,
			openPrice,
			highPrice,
			lowPrice,
			previousClose,
			volume,
			marketCap: 0, // Skip market cap lookup for speed
			twentyDayHigh,
			gapPercentage, // This is now the true gap percentage
			companyName: symbol, // Use symbol for speed
			exchange: 'Unknown', // Skip exchange lookup for speed
			currency: 'USD' // Default currency for speed
		};

		console.log(`Enhanced data for ${symbol}:`, {
			openPrice: openPrice.toFixed(2),
			previousClose: previousClose.toFixed(2),
			gapPercentage: gapPercentage.toFixed(2) + '%',
			twentyDayHigh: twentyDayHigh.toFixed(2),
			breakoutPercentage: breakoutPercentage.toFixed(2) + '%'
		});

		return enhancedData;
	} catch (error) {
		console.error(`Failed to get enhanced stock data for ${symbol}:`, error);
		return null;
	}
}


// Create polygonService object
const polygonService = {
	testApiKey: testPolygonApiKey,
	getEnhancedStockData: getEnhancedStockData
};

export const testPolygon = async (req: Request, res: Response) => {
	try {
		console.log('Testing Polygon API...');
		
		// Test API key first
		const isApiWorking = await polygonService.testApiKey();
		if (!isApiWorking) {
			return res.status(200).json({
				polygonStatus: 'API key test failed',
				message: 'Check your Polygon API key or subscription level'
			});
		}

		// Test a simple quote
		const testData = await polygonService.getEnhancedStockData('AAPL');
		
		return res.status(200).json({
			polygonStatus: testData ? 'Working' : 'Failed',
			testData,
			message: testData ? 'Polygon API is working' : 'Polygon API failed to get test data'
		});
	} catch (error) {
		console.error('Polygon test error:', error);
		return res.status(500).json({ 
			polygonStatus: 'Error',
			error: 'Polygon API test failed' 
		});
	}
};

export const scanGapUps = async (req: Request, res: Response) => {
	try {
		console.log('Starting market-wide Polygon gap up scan...');
		
		// Get the most recent trading dates - handle weekends and holidays properly
		const today = new Date();
		const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, 6=Saturday
		
		let mostRecentDay = new Date(today);
		let previousDay = new Date(today);
		
		if (dayOfWeek === 0) { // Sunday
			// Most recent trading day is Friday, previous is Thursday
			mostRecentDay.setDate(today.getDate() - 2); // Friday
			previousDay.setDate(today.getDate() - 3); // Thursday
		} else if (dayOfWeek === 1) { // Monday
			// Most recent trading day is TODAY (Monday), previous is Friday
			mostRecentDay = new Date(today); // Today (Monday)
			previousDay.setDate(today.getDate() - 3); // Friday
		} else if (dayOfWeek === 6) { // Saturday
			// Most recent trading day is Friday, previous is Thursday
			mostRecentDay.setDate(today.getDate() - 1); // Friday
			previousDay.setDate(today.getDate() - 2); // Thursday
		} else { // Tuesday-Friday
			// Most recent trading day is TODAY, previous is yesterday
			mostRecentDay = new Date(today); // Today
			previousDay.setDate(today.getDate() - 1); // Yesterday
		}
		
		let todayStr = mostRecentDay.toISOString().split('T')[0];
		let yesterdayStr = previousDay.toISOString().split('T')[0];
		
		console.log(`Scanning market data: Most Recent Trading Day=${todayStr}, Previous Trading Day=${yesterdayStr}`);

		const startTime = Date.now();
		const maxProcessingTime = 20000; // 20 seconds max to avoid Heroku timeout

		// Get market-wide data for today and yesterday
		let [todayData, yesterdayData] = await Promise.all([
			getPolygonGroupedDaily(todayStr),
			getPolygonGroupedDaily(yesterdayStr)
		]);

		if (!todayData || todayData.length === 0) {
			console.log(`No market data for ${todayStr}. Falling back to previous day analysis.`);
			// If today's data isn't available, shift back to the most recent available trading day
			const fallbackToday = new Date(mostRecentDay);
			fallbackToday.setDate(fallbackToday.getDate() - 1);
			
			// For fallback yesterday, we need to skip weekends properly
			const fallbackYesterday = new Date(fallbackToday);
			const fallbackDayOfWeek = fallbackToday.getDay();
			
			if (fallbackDayOfWeek === 1) { // Monday
				fallbackYesterday.setDate(fallbackToday.getDate() - 3); // Friday
			} else {
				fallbackYesterday.setDate(fallbackToday.getDate() - 1); // Previous day
			}
			
			const fallbackTodayStr = fallbackToday.toISOString().split('T')[0];
			const fallbackYesterdayStr = fallbackYesterday.toISOString().split('T')[0];
			
			console.log(`Trying fallback dates: ${fallbackTodayStr} vs ${fallbackYesterdayStr}`);
			
			const [fallbackTodayData, fallbackYesterdayData] = await Promise.all([
				getPolygonGroupedDaily(fallbackTodayStr),
				getPolygonGroupedDaily(fallbackYesterdayStr)
			]);
			
			if (!fallbackTodayData || fallbackTodayData.length === 0) {
				return res.status(404).json({ 
					error: `No market data available for ${todayStr} or ${fallbackTodayStr}. Markets may be closed.` 
				});
			}
			
			// Use fallback data and update the date strings for logging
			console.log(`Using fallback data: ${fallbackTodayData.length} stocks for ${fallbackTodayStr}`);
			todayData = fallbackTodayData;
			yesterdayData = fallbackYesterdayData;
			
			// Update the date strings for subsequent logging
			todayStr = fallbackTodayStr;
			yesterdayStr = fallbackYesterdayStr;
		}

		if (!yesterdayData || yesterdayData.length === 0) {
			console.log(`No market data for ${yesterdayStr}. Response:`, yesterdayData);
			return res.status(404).json({ 
				error: `No previous day market data available for ${yesterdayStr}.` 
			});
		}

		// Create lookup map for yesterday's data
		const yesterdayMap = new Map<string, GroupedDailyBar>();
		yesterdayData.forEach(bar => yesterdayMap.set(bar.T, bar));

		console.log(`Processing ${todayData.length} stocks from market-wide scan...`);

		const gapUpStocks: GapUpStock[] = [];
		let processedCount = 0;

		// Filter and process stocks in batches
		for (let i = 0; i < todayData.length; i += 100) {
			// Check timeout
			if (Date.now() - startTime > maxProcessingTime) {
				console.log(`Stopping scan due to time limit (${maxProcessingTime/1000}s)`);
				break;
			}

			const batch = todayData.slice(i, i + 100);
			
			for (const todayBar of batch) {
				try {
					const symbol = todayBar.T;
					const yesterdayBar = yesterdayMap.get(symbol);
					
					if (!yesterdayBar) continue;

					// Calculate gap percentage
					const gapPercentage = calculateGapPercentage(todayBar.o, yesterdayBar.c);
					
					// Get volatility level from request body, default to 'low'
					const volatilityLevel: 'low' | 'medium' | 'high' = req.body?.volatilityLevel || 'low';
					
					// Set gap limits based on volatility level
					const gapLimits = {
						low: { min: 2.5, max: 8 },
						medium: { min: 2.0, max: 12 },
						high: { min: 1.5, max: 20 }
					};
					
					// Pre-filter: Only check stocks with significant gaps and decent volume/price
					if (gapPercentage >= gapLimits[volatilityLevel].min && // Minimum gap based on volatility level
						gapPercentage <= gapLimits[volatilityLevel].max && // Maximum gap based on volatility level
						todayBar.v > 100000 && // Minimum volume (increased for quality)
						todayBar.o >= 5 && // No penny stocks (>= $5)
						todayBar.o < 1000) { // Reasonable price range
						
						// Skip 20-day high calculation during initial scan for speed
						// We'll calculate it for the top results later
						const twentyDayHigh = 0;
						
						const stockData = await getEnhancedStockDataFromGrouped(todayBar, yesterdayBar, twentyDayHigh);
						
						if (stockData) {
							// Get recent historical data for volatility analysis
							const thirtyDaysAgo = new Date();
							thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
							const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
							const toDate = new Date().toISOString().split('T')[0];
							
							let volatilityAcceptable = true;
							try {
								const historicalBars = await getPolygonDailyBars(symbol, fromDate, toDate);
								// Get volatility level from request body, default to 'low'
								const volatilityLevel = req.body?.volatilityLevel || 'low';
								volatilityAcceptable = isVolatilityAcceptable(historicalBars, stockData.currentPrice, volatilityLevel);
								
								if (!volatilityAcceptable) {
									console.log(`Filtered out ${symbol} due to high volatility (${calculateVolatilityScore(historicalBars).toFixed(1)}) for ${volatilityLevel} level`);
								}
							} catch (error) {
								console.warn(`Could not calculate volatility for ${symbol}, allowing through:`, error);
							}
							
							// Enhanced suitable criteria for gap trading based on volatility level
							const suitable = stockData.volume > 100000 && 
								stockData.gapPercentage >= gapLimits[volatilityLevel as keyof typeof gapLimits].min && 
								stockData.gapPercentage <= gapLimits[volatilityLevel as keyof typeof gapLimits].max && 
								stockData.currentPrice >= 5 && // No penny stocks
								stockData.currentPrice <= 300 && // Avoid extremely high-priced stocks
								volatilityAcceptable; // Add volatility filter
							
							// ONLY show stocks that meet ALL criteria
							if (suitable) {
								const isBlueChip = BLUE_CHIP_STOCKS.has(symbol);
								const blueChipLabel = isBlueChip ? ' [BLUE CHIP]' : '';
								
								console.log(`Found suitable gap up: ${symbol}${blueChipLabel} +${gapPercentage.toFixed(2)}% (Open: $${todayBar.o.toFixed(2)}, Prev Close: $${yesterdayBar.c.toFixed(2)}, Volume: ${todayBar.v.toLocaleString()})`);
								
								const analysis = `${symbol} gapped up ${stockData.gapPercentage.toFixed(1)}% on ${todayStr}. Open: $${stockData.openPrice.toFixed(2)}, Previous close: $${stockData.previousClose.toFixed(2)}, Current: $${stockData.currentPrice.toFixed(2)}. Volume: ${stockData.volume.toLocaleString()}. SUITABLE for gap trading.${isBlueChip ? ' This is a blue chip company.' : ''}`;

								const gapUpStock: GapUpStock = {
									stockSymbol: symbol,
									currentPrice: `$${stockData.currentPrice.toFixed(2)}`,
									livePrice: stockData.livePrice ? `$${stockData.livePrice.toFixed(2)}` : undefined,
									twentyDayHigh: `$${stockData.twentyDayHigh.toFixed(2)}`,
									gapPercentage: `${stockData.gapPercentage.toFixed(2)}%`,
									openPrice: `$${stockData.openPrice.toFixed(2)}`,
									highPrice: `$${stockData.highPrice.toFixed(2)}`,
									lowPrice: `$${stockData.lowPrice.toFixed(2)}`,
									previousClose: `$${stockData.previousClose.toFixed(2)}`,
									volume: stockData.volume,
									marketCap: stockData.marketCap,
									companyName: stockData.companyName,
									exchange: stockData.exchange,
									analysis: analysis,
									suitable: true, // All displayed stocks are suitable
									isBlueChip: isBlueChip,
									first15MinHigh: stockData.first15MinHigh ? `$${stockData.first15MinHigh.toFixed(2)}` : undefined,
									first15MinClose: stockData.first15MinClose ? `$${stockData.first15MinClose.toFixed(2)}` : undefined
								};
								
								gapUpStocks.push(gapUpStock);
							} else {
								console.log(`Filtered out ${symbol} +${gapPercentage.toFixed(2)}% - doesn't meet criteria (Price: $${stockData.currentPrice.toFixed(2)}, Volume: ${stockData.volume.toLocaleString()})`);
							}
						}
					}
				} catch (error: any) {
					console.error(`Error processing ${todayBar.T}:`, error.message || error);
				}
				processedCount++;
			}
			
			if (i % 500 === 0) {
				console.log(`Processed ${processedCount}/${todayData.length} stocks, found ${gapUpStocks.length} gap-ups`);
			}
		}

		// Sort by gap percentage (highest first)
		gapUpStocks.sort((a, b) => parseFloat(b.gapPercentage) - parseFloat(a.gapPercentage));

		// Phase 2: Calculate 20-day highs for ALL gap-up stocks that meet criteria
		console.log(`Phase 2: Calculating 20-day highs for all ${gapUpStocks.length} qualifying stocks...`);
		const topStocks = gapUpStocks; // Calculate for ALL results
		
		for (let i = 0; i < topStocks.length; i++) {
			const stock = topStocks[i];
			try {
				// Get historical data EXCLUDING the most recent trading day
				// We want 20-day high from BEFORE today's gap, not including today
				// Use 40 days to ensure we get at least 20 trading days (accounting for weekends/holidays)
				const fortyDaysAgo = new Date();
				fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);
				const fromDate = fortyDaysAgo.toISOString().split('T')[0];
				
				// Use previousDay as the end date to EXCLUDE today's data
				const toDate = previousDay.toISOString().split('T')[0];
				
				console.log(`Getting historical data for ${stock.stockSymbol}: ${fromDate} to ${toDate} (excluding most recent day)`);
				
				const historicalBars = await getPolygonDailyBars(stock.stockSymbol, fromDate, toDate);
				
				if (historicalBars && historicalBars.length >= 20) {
					console.log(`${stock.stockSymbol}: Processing ${historicalBars.length} historical bars`);
					
					// Debug: show the date range of the data we got
					const sortedBars = historicalBars.sort((a, b) => b.t - a.t);
					const latestBarDate = new Date(sortedBars[0].t).toISOString().split('T')[0];
					const oldestBarDate = new Date(sortedBars[sortedBars.length - 1].t).toISOString().split('T')[0];
					console.log(`${stock.stockSymbol}: Historical data range: ${oldestBarDate} to ${latestBarDate}`);
					
					// Debug: show current price vs what we're about to calculate
					const currentPrice = parseFloat(stock.currentPrice.replace('$', ''));
					console.log(`${stock.stockSymbol}: Current price: $${currentPrice.toFixed(2)}`);
					
					const twentyDayHigh = calculate20DayHigh(historicalBars);
					stock.twentyDayHigh = `$${twentyDayHigh.toFixed(2)}`;
					
					console.log(`${stock.stockSymbol}: 20-day high: $${twentyDayHigh.toFixed(2)}, Current: $${currentPrice.toFixed(2)}, Equal? ${Math.abs(twentyDayHigh - currentPrice) < 0.01}`);
				} else {
					console.log(`${stock.stockSymbol}: Not enough historical data (${historicalBars?.length || 0} bars)`);
					// Use today's high as fallback
					const currentPrice = parseFloat(stock.currentPrice.replace('$', ''));
					stock.twentyDayHigh = `$${currentPrice.toFixed(2)}`;
					console.log(`${stock.stockSymbol}: Using current price as 20-day high fallback`);
				}
			} catch (error) {
				console.warn(`Could not calculate 20-day high for ${stock.stockSymbol}:`, error);
				// Keep the $0.00 value to indicate calculation failed
			}
		}

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		console.log(`Market-wide scan complete: Found ${gapUpStocks.length} gap-up stocks`);
		console.log(`Processed ${processedCount}/${todayData.length} stocks in ${duration.toFixed(2)} seconds`);

		const result: ScanResult = {
			stocks: gapUpStocks.slice(0, 50), // Limit to top 50 results
			totalFound: gapUpStocks.length,
			timestamp: new Date(),
			scanDuration: `${duration.toFixed(2)}s`,
			status: processedCount === todayData.length ? 'completed' : 'timeout',
			processedCount,
			totalCount: todayData.length
		};

		return res.status(200).json(result);
	} catch (error) {
		console.error('Error scanning for gap ups:', error);
		return res.status(500).json({ error: 'Failed to scan for gap ups' });
	}
};

// Function to get all available stocks for charting
export const getAvailableStocks = async (req: Request, res: Response) => {
	try {
		// Get all stocks from market-wide data instead of static list
		const today = new Date();
		const dayOfWeek = today.getDay();
		
		let mostRecentDay = new Date(today);
		
		if (dayOfWeek === 0) { // Sunday
			mostRecentDay.setDate(today.getDate() - 2); // Friday
		} else if (dayOfWeek === 1) { // Monday
			mostRecentDay.setDate(today.getDate() - 3); // Friday
		} else if (dayOfWeek === 6) { // Saturday
			mostRecentDay.setDate(today.getDate() - 1); // Friday
		} else { // Tuesday-Friday
			mostRecentDay.setDate(today.getDate() - 1); // Yesterday
		}
		
		const todayStr = mostRecentDay.toISOString().split('T')[0];
		
		console.log(`Getting available stocks from market data for ${todayStr}`);
		
		// Get market-wide data to get all available symbols
		const marketData = await getPolygonGroupedDaily(todayStr);
		
		if (!marketData || marketData.length === 0) {
			return res.status(404).json({ 
				error: `No market data available for ${todayStr}` 
			});
		}
		
		// Filter and format stocks for dropdown
		const availableStocks = marketData
			.filter(stock => 
				stock.v > 10000 && // Minimum volume
				stock.c > 1 && // Minimum price
				stock.c < 1000 && // Maximum price
				stock.T.length <= 5 && // Filter out complex symbols
				!stock.T.includes('.') // No warrants/special symbols
			)
			.map(stock => ({
				symbol: stock.T,
				name: stock.T, // We'll use symbol as name for now
				price: stock.c,
				volume: stock.v
			}))
			.sort((a, b) => a.symbol.localeCompare(b.symbol));
		
		console.log(`Found ${availableStocks.length} available stocks for charting`);
		
		return res.status(200).json({
			stocks: availableStocks,
			count: availableStocks.length,
			date: todayStr
		});
		
	} catch (error) {
		console.error('Error getting available stocks:', error);
		return res.status(500).json({ error: 'Failed to get available stocks' });
	}
};

export const getChartData = async (req: Request, res: Response) => {
	try {
		const { symbol } = req.params;
		const { days = '30' } = req.query;
		
		if (!symbol) {
			return res.status(400).json({ error: 'Stock symbol is required' });
		}

		console.log(`Getting chart data for ${symbol.toUpperCase()} for ${days} days`);
		console.log(`System time: ${new Date().toISOString()}`);
		console.log(`System timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

		const daysBack = parseFloat(days as string);
		console.log(`Parsed daysBack value: ${daysBack}, type: ${typeof daysBack}`);
		
		let bars: PolygonBar[];
		let timeFormat = 'YYYY-MM-DD';
		let fromDateStr: string;
		let toDateStr: string;

		if (daysBack < 1) {
			// Intraday data
			const hoursBack = daysBack * 24;
			const minutesBack = hoursBack * 60;
			
			const toDate = new Date();
			const fromDate = new Date();
			
			// Check if it's weekend
			const dayOfWeek = toDate.getDay(); // 0 = Sunday, 6 = Saturday
			const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
			
			console.log(`Intraday request: minutesBack=${minutesBack}, hoursBack=${hoursBack}`);
			console.log(`Day of week: ${dayOfWeek}, isWeekend: ${isWeekend}`);
			
			if (minutesBack <= 15) {
				// 15 minutes - use 1 minute bars for today only
				const today = new Date().toISOString().split('T')[0];
				fromDateStr = today;
				toDateStr = today;
				console.log(`15min: From ${fromDateStr} to ${toDateStr}`);
				bars = await getPolygonIntradayBars(symbol.toUpperCase(), 1, 'minute', fromDateStr, toDateStr);
				console.log(`15min bars received: ${bars.length} bars`);
				if (bars.length > 0) {
					const firstBar = new Date(bars[0].t);
					const lastBar = new Date(bars[bars.length - 1].t);
					console.log(`15min data range: ${firstBar.toLocaleString()} to ${lastBar.toLocaleString()}`);
				}
				timeFormat = 'HH:mm';
			} else if (hoursBack <= 1) {
				// 1 hour - use 1 minute bars for today only
				const today = new Date().toISOString().split('T')[0];
				fromDateStr = today;
				toDateStr = today;
				console.log(`1hour: From ${fromDateStr} to ${toDateStr}`);
				bars = await getPolygonIntradayBars(symbol.toUpperCase(), 1, 'minute', fromDateStr, toDateStr);
				timeFormat = 'HH:mm';
			} else {
				// 1 day - use 5 minute bars
				fromDate.setDate(fromDate.getDate() - 1);
				fromDateStr = fromDate.toISOString().split('T')[0];
				toDateStr = toDate.toISOString().split('T')[0];
				console.log(`1day: From ${fromDateStr} to ${toDateStr}`);
				bars = await getPolygonIntradayBars(symbol.toUpperCase(), 5, 'minute', fromDateStr, toDateStr);
				timeFormat = 'HH:mm';
			}
		} else {
			// Daily data
			const toDate = new Date();
			const fromDate = new Date();
			fromDate.setDate(fromDate.getDate() - Math.ceil(daysBack));

			fromDateStr = fromDate.toISOString().split('T')[0];
			toDateStr = toDate.toISOString().split('T')[0];

			// Get historical bars
			bars = await getPolygonDailyBars(symbol.toUpperCase(), fromDateStr, toDateStr);
		}

		if (!bars || bars.length === 0) {
			if (daysBack < 1) {
				return res.status(404).json({ 
					error: `No intraday data available for ${symbol.toUpperCase()}. Markets may be closed or your Polygon subscription may not include real-time minute data.` 
				});
			} else {
				return res.status(404).json({ error: `No chart data found for ${symbol.toUpperCase()}` });
			}
		}

		// Format data for candlestick chart
		const chartData = bars
			.sort((a, b) => a.t - b.t) // Sort by timestamp ascending
			.map(bar => {
				const date = new Date(bar.t);
				let timeLabel;
				
				if (daysBack < 1) {
					// Intraday - show time
					timeLabel = date.toLocaleTimeString('en-US', { 
						hour: '2-digit', 
						minute: '2-digit',
						hour12: false 
					});
				} else {
					// Daily - show date
					timeLabel = date.toISOString().split('T')[0];
				}
				
				return {
					time: timeLabel,
					timestamp: bar.t, // Keep original timestamp for chart
					open: bar.o,
					high: bar.h,
					low: bar.l,
					close: bar.c,
					volume: bar.v
				};
			});

		console.log(`Chart data formatted: ${chartData.length} points`);
		if (chartData.length > 0) {
			console.log(`First chart point: ${chartData[0].time} (${new Date(chartData[0].timestamp).toLocaleString()})`);
			console.log(`Last chart point: ${chartData[chartData.length - 1].time} (${new Date(chartData[chartData.length - 1].timestamp).toLocaleString()})`);
		}

		// Get company details for chart title
		const companyDetails = await getPolygonTickerDetails(symbol.toUpperCase());

		return res.status(200).json({
			symbol: symbol.toUpperCase(),
			companyName: companyDetails?.name || symbol.toUpperCase(),
			data: chartData,
			dataPoints: chartData.length,
			dateRange: {
				from: fromDateStr,
				to: toDateStr
			}
		});

	} catch (error) {
		console.error('Error getting chart data:', error);
		return res.status(500).json({ error: 'Failed to get chart data' });
	}
};

export const getLivePrice = async (req: Request, res: Response) => {
	try {
		const { symbol } = req.params;
		
		if (!symbol) {
			return res.status(400).json({ error: 'Stock symbol is required' });
		}

		console.log(`Getting live price for ${symbol.toUpperCase()}`);
		
		const livePrice = await getPolygonLivePrice(symbol.toUpperCase());
		
		if (livePrice !== null) {
			return res.status(200).json({
				symbol: symbol.toUpperCase(),
				livePrice: `$${livePrice.toFixed(2)}`,
				timestamp: new Date().toISOString()
			});
		} else {
			// Fallback: get the most recent close price if live data isn't available
			console.log(`Live price not available for ${symbol.toUpperCase()}, falling back to most recent close`);
			
			try {
				const previousClose = await getPolygonPreviousClose(symbol.toUpperCase());
				if (previousClose) {
					return res.status(200).json({
						symbol: symbol.toUpperCase(),
						livePrice: `$${previousClose.c.toFixed(2)}`,
						timestamp: new Date().toISOString(),
						note: 'Using most recent close price (live data not available)'
					});
				}
			} catch (fallbackError) {
				console.warn(`Fallback also failed for ${symbol.toUpperCase()}:`, fallbackError);
			}
			
			return res.status(404).json({ 
				error: `Price data not available for ${symbol.toUpperCase()}`,
				reason: 'Live data requires subscription upgrade and historical data unavailable'
			});
		}

	} catch (error) {
		console.error('Error getting live price:', error);
		return res.status(500).json({ error: 'Failed to get live price' });
	}
};

export const getRiskAssessment = async (req: Request, res: Response) => {
	try {
		const { symbol, stockData } = req.body;
		
		if (!symbol || !stockData) {
			return res.status(400).json({ error: 'Symbol and stock data are required' });
		}

		console.log(`Getting ChatGPT risk assessment for ${symbol}`);
		
		// Create a comprehensive prompt for ChatGPT
		const prompt = `You are a stock investment expoert. Please provide a comprehensive risk assessment for investing in ${symbol} (${stockData.companyName || symbol}) based on the following current market data, with view of using it for a day trade today:

Stock: ${symbol} ${stockData.companyName ? `(${stockData.companyName})` : ''}
Current/Closing Price: ${stockData.currentPrice}
${stockData.livePrice ? `Live Price: ${stockData.livePrice}` : ''}
Today's Open: ${stockData.openPrice}
Today's High: ${stockData.highPrice}  
Today's Low: ${stockData.lowPrice}
Previous Close: ${stockData.previousClose}
20-Day High: ${stockData.twentyDayHigh}
Gap Percentage: ${stockData.gapPercentage}
Volume: ${stockData.volume?.toLocaleString() || 'N/A'}
Market Cap: ${stockData.marketCap ? `$${(stockData.marketCap / 1000000).toFixed(0)}M` : 'N/A'}
Exchange: ${stockData.exchange}
${stockData.first15MinHigh ? `First 15min High: ${stockData.first15MinHigh}` : ''}
${stockData.first15MinClose ? `First 15min Close: ${stockData.first15MinClose}` : ''}
Blue Chip: ${stockData.isBlueChip ? 'Yes' : 'No'}
Gap Trading Suitable: ${stockData.suitable ? 'Yes' : 'No'}

Please analyze:
1. Gap trading risk level (High/Medium/Low)
2. Key risk factors to consider
3. Potential upside/downside scenarios
4. Recommended position sizing
5. Stop-loss suggestions
6. Overall investment recommendation

Keep the response concise but comprehensive, suitable for day trading decisions.`;

		// Call OpenAI API for real risk assessment
		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini", // Using the more cost-effective model
			messages: [
				{
					role: "system",
					content: "You are an expert stock market analyst specializing in gap trading and risk assessment. Provide concise, actionable analysis suitable for day trading decisions. Focus on risk management and practical recommendations."
				},
				{
					role: "user",
					content: prompt
				}
			],
			max_tokens: 500,
			temperature: 0.7,
		});

		const assessment = completion.choices[0]?.message?.content || 'Unable to generate assessment';

		return res.status(200).json({
			symbol: symbol.toUpperCase(),
			assessment: assessment,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error getting risk assessment:', error);
		return res.status(500).json({ error: 'Failed to get risk assessment' });
	}
};

// End of file
