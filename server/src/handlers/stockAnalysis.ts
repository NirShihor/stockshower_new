import claude from '../config/claude.js';  
import { Request, Response } from 'express';
import axios from 'axios';

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
}

interface StockAnalysisRequest {
	stockSymbol: string;
	criteria: {
		volatility?: string;
		volume?: string;
		priceRange?: string;
		technicalIndicators?: string[];
		fundamentals?: string[];
		[key: string]: any;
	};
}

interface GapUpStock {
	stockSymbol: string;
	currentPrice: string;
	twentyDayHigh: string;
	gapPercentage: string;
	analysis: string;
	suitable: boolean;
	openPrice?: string;
	highPrice?: string;
	lowPrice?: string;
	previousClose?: string;
	volume?: number;
	marketCap?: number;
	companyName?: string;
	exchange?: string;
}

// Polygon.io helper functions
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

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

function calculate20DayHigh(bars: PolygonBar[]): number {
	console.log('Calculating 20-day high, bars count:', bars.length);
	if (!bars || bars.length === 0) {
		console.log('No bars data available');
		return 0;
	}

	// Sort by timestamp descending (most recent first) and take last 20
	const sortedBars = bars.sort((a, b) => b.t - a.t).slice(0, 20);
	console.log('Number of bars for 20-day calc:', sortedBars.length);
	
	if (sortedBars.length === 0) {
		console.log('No bars found for calculation');
		return 0;
	}
	
	const highs = sortedBars.map(bar => bar.h);
	console.log('Sample highs:', highs.slice(0, 5));
	
	const maxHigh = Math.max(...highs);
	console.log('20-day high calculated:', maxHigh);
	return maxHigh;
}

function calculateGapPercentage(openPrice: number, previousClose: number): number {
	if (previousClose === 0) return 0;
	return ((openPrice - previousClose) / previousClose) * 100;
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

async function getEnhancedStockData(symbol: string): Promise<EnhancedStockData | null> {
	try {
		console.log(`Getting enhanced data for ${symbol} from Polygon...`);
		
		// Get historical data for gap calculation and 20-day high
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
		const toDate = new Date().toISOString().split('T')[0];

		const [tickerDetails, historicalBars] = await Promise.allSettled([
			getPolygonTickerDetails(symbol),
			getPolygonDailyBars(symbol, fromDate, toDate)
		]);

		const companyData = tickerDetails.status === 'fulfilled' ? tickerDetails.value : null;
		const dailyBars = historicalBars.status === 'fulfilled' ? historicalBars.value : [];
		
		console.log(`Historical bars status: ${historicalBars.status}, count: ${dailyBars.length}`);

		if (dailyBars.length < 2) {
			console.warn(`Not enough historical data for ${symbol}`);
			return null;
		}

		// Sort bars by timestamp (most recent first)
		const sortedBars = dailyBars.sort((a, b) => b.t - a.t);
		
		// Find the most recent trading day (could be Friday if it's weekend)
		const latestBar = sortedBars[0]; // Most recent trading day
		const previousBar = sortedBars[1]; // Previous trading day
		
		// Convert timestamp to readable date for logging
		const latestDate = new Date(latestBar.t).toDateString();
		const previousDate = new Date(previousBar.t).toDateString();
		console.log(`Analyzing gap for ${symbol}: ${latestDate} open vs ${previousDate} close`);

		const currentPrice = latestBar.c; // Latest close price
		const openPrice = latestBar.o; // Latest open price
		const highPrice = latestBar.h; // Latest high price
		const lowPrice = latestBar.l; // Latest low price
		const previousClose = previousBar.c; // Previous day's close
		const volume = latestBar.v; // Latest volume

		// Calculate gap: (today's open - yesterday's close) / yesterday's close * 100
		const gapPercentage = calculateGapPercentage(openPrice, previousClose);
		
		// Calculate 20-day high and breakout percentage
		const twentyDayHigh = calculate20DayHigh(dailyBars);
		const breakoutPercentage = calculateBreakoutPercentage(currentPrice, twentyDayHigh);

		const enhancedData: EnhancedStockData = {
			symbol,
			currentPrice,
			openPrice,
			highPrice,
			lowPrice,
			previousClose,
			volume,
			marketCap: companyData?.market_cap || 0,
			twentyDayHigh,
			gapPercentage, // This is now the true gap percentage
			companyName: companyData?.name || symbol,
			exchange: companyData?.primary_exchange || 'Unknown',
			currency: companyData?.currency_name || 'USD'
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

export const analyzeStock = async (req: Request, res: Response) => {
	try {
		const { stockSymbol, criteria }: StockAnalysisRequest = req.body;

		if (!stockSymbol) {
			return res.status(400).json({ error: 'Stock symbol is required' });
		}

		// Create a prompt based on the criteria
		const prompt = createAnalysisPrompt(stockSymbol, criteria);

		// Call Claude API with web search
		console.log('Sending request to Claude with web search...');
		const message = await claude.messages.create({
			model: "claude-3-5-sonnet-20241022",
			max_tokens: 4000,
			tools: [
				{
					type: "web_search_20250305",
					name: "web_search"
				}
			],
			messages: [
				{ 
					role: "user", 
					content: prompt
				}
			],
		});

		console.log('Claude message received:', message);
		console.log('Message content length:', message.content.length);
		console.log('First content block type:', message.content[0]?.type);

		// Extract all text content from all blocks
		let analysis = '';
		message.content.forEach((block: any, index: number) => {
			if (block.type === 'text') {
				analysis += block.text;
			}
		});

		if (!analysis) {
			analysis = 'No text content available';
		}

		console.log('Claude Response:', analysis);
		console.log('Analysis includes SUITABLE:', analysis?.includes('SUITABLE'));

		return res.status(200).json({
			stockSymbol,
			analysis,
			suitable: analysis?.includes('SUITABLE') || false,
			timestamp: new Date()
		});
	} catch (error) {
		console.error('Error analyzing stock:', error);
		return res.status(500).json({ error: 'Failed to analyze stock' });
	}
};

function createAnalysisPrompt(symbol: string, criteria: StockAnalysisRequest['criteria']) {
	// Fixed template string syntax
	let additionalCriteria = '';

	// Process additional criteria
	Object.entries(criteria)
		.filter(([key]) => !['volatility', 'volume', 'priceRange', 'technicalIndicators', 'fundamentals'].includes(key))
		.forEach(([key, value]) => {
			additionalCriteria += `- ${key}: ${value}\n`;
		});

	return `You are a stock trading assistant with web search capabilities. I need you to search the web for REAL-TIME data about ${symbol} and provide an actual analysis.

**CRITICAL: Use your web search tool to find current information about ${symbol} including:**
- Current stock price (as of today)
- Today's pre-market or opening price
- The highest high of the last 20 trading days
- Whether the stock is gapping up above this level
- Current trading volume and news
- Recent price movements

**Gap Up Day Trading Analysis:**
Based on the real-time data you find, determine if ${symbol} meets these criteria:
1. Is the stock gapping up above the highest high of the last 20 trading days?
2. Is the gap up due to strong demand (news, volume, etc.)?
3. Does it show sufficient volatility for day trading?

**Your Response Must Include:**
- Current stock price (from web search)
- 20-day high level (from web search)
- Gap analysis (actual numbers, not just framework)
- Specific news or catalysts (if any)
- SUITABLE or NOT SUITABLE determination with real data

DO NOT provide a framework or checklist. Provide actual analysis based on current market data you find through web search.`;
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
		console.log('Starting direct Polygon gap up scan...');
		
		// Expanded list of popular stocks to scan for gap-ups
		// Includes S&P 500 top stocks, popular tech stocks, and high-volume traders
		const popularStocks = [
			// Tech Giants
			'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC', 'ORCL',
			'CRM', 'ADBE', 'NFLX', 'CSCO', 'AVGO', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX',
			
			// Financial
			'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC', 'BLK', 'SCHW',
			'AXP', 'BX', 'KKR', 'APO', 'COF', 'DFS', 'SYF', 'AIG', 'PRU', 'MET',
			
			// Healthcare & Pharma
			'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'DHR', 'CVS',
			'MDT', 'BMY', 'AMGN', 'GILD', 'ISRG', 'SYK', 'BSX', 'ELV', 'CI', 'HUM',
			
			// Consumer & Retail
			'WMT', 'HD', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT',
			'LOW', 'CVX', 'XOM', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'COP', 'SLB',
			
			// Industrial & Transport
			'BA', 'UPS', 'HON', 'UNP', 'CAT', 'GE', 'MMM', 'LMT', 'RTX', 'DE',
			'FDX', 'NSC', 'CSX', 'DAL', 'UAL', 'AAL', 'LUV', 'UBER', 'LYFT', 'ABNB',
			
			// Popular Trading Stocks
			'SPY', 'QQQ', 'IWM', 'DIA', 'ARKK', 'GME', 'AMC', 'BB', 'PLTR', 'SOFI',
			'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'F', 'GM', 'PLUG', 'FCEL', 'SPCE',
			
			// High Growth Tech
			'SHOP', 'SQ', 'ROKU', 'SNAP', 'PINS', 'TWLO', 'DOCU', 'ZM', 'CRWD', 'DDOG',
			'SNOW', 'NET', 'COIN', 'HOOD', 'RBLX', 'U', 'DASH', 'ABNB', 'SE', 'MELI',
			
			// Semiconductors
			'TSM', 'ASML', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'ON', 'MCHP', 'ADI', 'NXPI',
			
			// Energy & Materials
			'OXY', 'DVN', 'MRO', 'HAL', 'BKR', 'APA', 'EOG', 'PXD', 'FCX', 'NEM',
			
			// Others
			'V', 'MA', 'PYPL', 'ACN', 'INTU', 'NOW', 'SPGI', 'MMC', 'AON', 'MSI'
		];

		console.log(`Scanning ${popularStocks.length} stocks for gap-ups using Polygon data...`);

		const gapUpStocks: GapUpStock[] = [];
		
		// Process stocks in larger batches for paid subscription
		const batchSize = 10; // Increased batch size for paid tier
		for (let i = 0; i < popularStocks.length; i += batchSize) {
			const batch = popularStocks.slice(i, i + batchSize);
			
			const batchPromises = batch.map(async (symbol) => {
				try {
					const stockData = await polygonService.getEnhancedStockData(symbol);
					
					// Check for gap up AND trading above 20-day high
					if (stockData && stockData.gapPercentage > 2 && stockData.currentPrice > stockData.twentyDayHigh) {
						console.log(`Found gap up above 20-day high: ${symbol} +${stockData.gapPercentage.toFixed(2)}% (current $${stockData.currentPrice.toFixed(2)} > 20-day high $${stockData.twentyDayHigh.toFixed(2)})`);
						
						// Gap and Go strategy criteria - must be above 20-day high
						const suitable = stockData.volume > 500000 && // High volume indicates news/interest
							stockData.gapPercentage > 2 && // Minimum 2% gap
							stockData.gapPercentage < 15 && // Max 15% gap (avoid too volatile)
							stockData.currentPrice > 5 && // Avoid penny stocks
							stockData.currentPrice > stockData.twentyDayHigh; // Must be above 20-day high
						
						// Get trading dates for clearer analysis
						const openDate = new Date(Date.now()).toDateString(); // This will show the most recent trading day
						const analysis = `${symbol} gapped up ${stockData.gapPercentage.toFixed(1)}% and is trading above its 20-day high of $${stockData.twentyDayHigh.toFixed(2)}. Open: $${stockData.openPrice.toFixed(2)}, Previous close: $${stockData.previousClose.toFixed(2)}, Current: $${stockData.currentPrice.toFixed(2)}. Volume: ${stockData.volume.toLocaleString()}. ${suitable ? 'SUITABLE' : 'NOT SUITABLE'} for gap-and-go strategy.`;

						const gapUpStock: GapUpStock = {
							stockSymbol: symbol,
							currentPrice: `$${stockData.currentPrice.toFixed(2)}`,
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
							suitable: suitable
						};
						
						return gapUpStock;
					}
				} catch (error) {
					console.error(`Error checking ${symbol}:`, error);
				}
				return null;
			});

			const batchResults = await Promise.all(batchPromises);
			const validResults = batchResults.filter(result => result !== null) as GapUpStock[];
			gapUpStocks.push(...validResults);

			// Rate limiting: reduced wait time for paid subscription
			if (i + batchSize < popularStocks.length) {
				console.log('Processing next batch...');
				await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay for paid tier
			}
		}

		console.log(`Found ${gapUpStocks.length} stocks gapping up AND trading above their 20-day highs`);

		return res.status(200).json({
			stocks: gapUpStocks,
			totalFound: gapUpStocks.length,
			timestamp: new Date()
		});
	} catch (error) {
		console.error('Error scanning for gap ups:', error);
		return res.status(500).json({ error: 'Failed to scan for gap ups' });
	}
};

// This function is no longer needed since we're using direct Polygon scanning

// Old prompt function - no longer needed since we're using direct Polygon scanning

// Old parsing function - no longer needed since we're using direct Polygon scanning
