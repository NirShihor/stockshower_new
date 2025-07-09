import { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

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
		
		// Comprehensive list of stocks to scan for gap-ups
		// Includes large cap, mid cap, growth stocks, and volatile trading stocks
		const popularStocks = [
			// Tech Giants & FAANG
			'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC', 'ORCL',
			'CRM', 'ADBE', 'NFLX', 'CSCO', 'AVGO', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX',
			
			// Financial Services
			'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC', 'BLK', 'SCHW',
			'AXP', 'BX', 'KKR', 'APO', 'COF', 'DFS', 'SYF', 'AIG', 'PRU', 'MET',
			'TFC', 'FITB', 'RF', 'KEY', 'ZION', 'HBAN', 'CFG', 'CMA', 'WAL', 'PBCT',
			
			// Healthcare & Biotech
			'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'DHR', 'CVS',
			'MDT', 'BMY', 'AMGN', 'GILD', 'ISRG', 'SYK', 'BSX', 'ELV', 'CI', 'HUM',
			'BIIB', 'REGN', 'VRTX', 'MRNA', 'BNTX', 'JNJ', 'RGEN', 'ALNY', 'BMRN', 'SGEN',
			
			// Consumer & Retail
			'WMT', 'HD', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT',
			'LOW', 'TJX', 'WBA', 'KR', 'DLTR', 'DG', 'ROST', 'ULTA', 'BBY', 'GPS',
			
			// Energy & Commodities
			'XOM', 'CVX', 'COP', 'SLB', 'OXY', 'DVN', 'MRO', 'HAL', 'BKR', 'APA', 
			'EOG', 'PXD', 'FCX', 'NEM', 'GOLD', 'ABX', 'KGC', 'AUY', 'EQT', 'AR',
			
			// Industrial & Transport
			'BA', 'UPS', 'HON', 'UNP', 'CAT', 'GE', 'MMM', 'LMT', 'RTX', 'DE',
			'FDX', 'NSC', 'CSX', 'DAL', 'UAL', 'AAL', 'LUV', 'UBER', 'LYFT', 'ABNB',
			'WM', 'RSG', 'PCAR', 'CMI', 'ITW', 'EMR', 'ETN', 'PH', 'ROK', 'DOV',
			
			// High-Volume Trading Stocks (Meme & Growth)
			'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VEA', 'VWO', 'ARKK', 'ARKW', 'ARKG',
			'GME', 'AMC', 'BB', 'BBBY', 'PLTR', 'SOFI', 'WISH', 'CLOV', 'SPRT', 'IRNT',
			'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'BYDDY', 'F', 'GM', 'TSLA', 'GOEV',
			
			// High Growth Tech & Software
			'SHOP', 'SQ', 'BLOC', 'ROKU', 'SNAP', 'PINS', 'TWTR', 'TWLO', 'DOCU', 'ZM',
			'CRWD', 'DDOG', 'SNOW', 'NET', 'COIN', 'HOOD', 'RBLX', 'U', 'DASH', 'SE',
			'MELI', 'SPOT', 'NFLX', 'DIS', 'CMCSA', 'CHTR', 'T', 'VZ', 'TMUS', 'DISH',
			
			// Semiconductors & Hardware
			'TSM', 'ASML', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'ON', 'MCHP', 'ADI', 'NXPI',
			'QRVO', 'SWKS', 'MXIM', 'XLNX', 'LSCC', 'SLAB', 'MPWR', 'CRUS', 'SITM', 'FORM',
			
			// Cloud & Enterprise Software
			'V', 'MA', 'PYPL', 'ACN', 'INTU', 'NOW', 'SPGI', 'MMC', 'AON', 'MSI',
			'ORCL', 'SAP', 'ADSK', 'CTXS', 'TEAM', 'WDAY', 'VEEV', 'SPLK', 'OKTA', 'ZS',
			
			// Biotech & Small Cap Growth
			'SPCE', 'PTON', 'BYND', 'TDOC', 'MRTX', 'SAGE', 'BLUE', 'EDIT', 'CRSP', 'NTLA',
			'FOLD', 'BEAM', 'VERV', 'PACB', 'ILMN', 'TMO', 'A', 'LIFE', 'QGEN', 'CDNA',
			
			// REITs & Utilities (for diversification)
			'SPG', 'PLD', 'CCI', 'AMT', 'EQIX', 'DLR', 'PSA', 'O', 'WELL', 'AVB',
			'NEE', 'DUK', 'SO', 'D', 'EXC', 'XEL', 'WEC', 'ES', 'AEP', 'SRE',
			
			// Chinese & International ADRs
			'BABA', 'JD', 'PDD', 'BIDU', 'NTES', 'TME', 'WB', 'BILI', 'IQ', 'HUYA',
			'ASHR', 'FXI', 'MCHI', 'KWEB', 'CQQQ', 'GXC', 'INDA', 'EPI', 'VWO', 'EEM',
			
			// Crypto-Related & Fintech
			'COIN', 'HOOD', 'SQ', 'PYPL', 'SOFI', 'AFRM', 'UPST', 'LC', 'BTBT', 'RIOT',
			'MARA', 'HUT', 'BITF', 'ARBKF', 'GBTC', 'ETHE', 'MSTR', 'TSLA', 'NVDA', 'AMD',
			
			// British Stocks (Major UK Companies - ADRs and direct listings)
			'BP', 'SHEL', 'RIO', 'BHP', 'VOD', 'AZN', 'GSK', 'ULVR', 'ASML', 'NVO',
			'BTI', 'DEO', 'UL', 'TTE', 'RHHBY', 'NESN', 'NOVN', 'ROG', 'SAP', 'SSNGY',
			
			// UK Banks & Financial (ADRs)
			'HSBC', 'LYG', 'BBVA', 'SAN', 'ING', 'DB', 'CS', 'UBS', 'BCS', 'RBS',
			
			// UK Mining & Energy
			'RIO', 'BHP', 'VALE', 'FCX', 'SCCO', 'TECK', 'NEM', 'GOLD', 'ABX', 'KGC',
			
			// UK Retail & Consumer
			'UNLY', 'DEO', 'BTAFF', 'SBRY', 'TSCDY', 'MARKS', 'NEXT', 'BURBY', 'DGEAF', 'PSON'
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
					
					// Check for gap up AND trading at or above 20-day high (enhanced criteria)
					if (stockData && stockData.gapPercentage > 0.5 && stockData.currentPrice >= stockData.twentyDayHigh) {
						console.log(`Found gap up above 20-day high: ${symbol} +${stockData.gapPercentage.toFixed(2)}% (current $${stockData.currentPrice.toFixed(2)} > 20-day high $${stockData.twentyDayHigh.toFixed(2)})`);
						
						// Gap and Go strategy criteria - must be above 20-day high
						const suitable = stockData.volume > 100000 && // Lower volume threshold for broader coverage
							stockData.gapPercentage > 0.5 && // Minimum 0.5% gap for testing (temporary)
							stockData.gapPercentage < 20 && // Max 20% gap (avoid too volatile)
							stockData.currentPrice > 3 && // Avoid penny stocks
							stockData.currentPrice >= stockData.twentyDayHigh; // Must be at or above 20-day high
						
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

// Old parsing function - no longer needed since we're using direct Polygon scanning
