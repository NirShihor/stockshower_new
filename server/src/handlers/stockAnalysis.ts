import claude from '../config/claude.js';  
import { Request, Response } from 'express';
import axios from 'axios';

interface AlphaVantageGlobalQuote {
  '01. symbol': string;
  '02. open': string;
  '03. high': string;
  '04. low': string;
  '05. price': string;
  '06. volume': string;
  '07. latest trading day': string;
  '08. previous close': string;
  '09. change': string;
  '10. change percent': string;
}

interface AlphaVantageGlobalQuoteResponse {
  'Global Quote': AlphaVantageGlobalQuote;
}

interface AlphaVantageDailyData {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
  '5. adjusted close': string;
  '6. volume': string;
  '7. dividend amount': string;
  '8. split coefficient': string;
}

interface AlphaVantageDailyResponse {
  'Meta Data': {
    '1. Information': string;
    '2. Symbol': string;
    '3. Last Refreshed': string;
    '4. Output Size': string;
    '5. Time Zone': string;
  };
  'Time Series (Daily)': {
    [date: string]: AlphaVantageDailyData;
  };
}

interface AlphaVantageCompanyOverview {
  Symbol: string;
  AssetType: string;
  Name: string;
  Description: string;
  CIK: string;
  Exchange: string;
  Currency: string;
  Country: string;
  Sector: string;
  Industry: string;
  Address: string;
  MarketCapitalization: string;
  EBITDA: string;
  PERatio: string;
  PEGRatio: string;
  BookValue: string;
  DividendPerShare: string;
  DividendYield: string;
  EPS: string;
  RevenuePerShareTTM: string;
  ProfitMargin: string;
  OperatingMarginTTM: string;
  ReturnOnAssetsTTM: string;
  ReturnOnEquityTTM: string;
  RevenueTTM: string;
  GrossProfitTTM: string;
  DilutedEPSTTM: string;
  QuarterlyEarningsGrowthYOY: string;
  QuarterlyRevenueGrowthYOY: string;
  AnalystTargetPrice: string;
  TrailingPE: string;
  ForwardPE: string;
  PriceToSalesRatioTTM: string;
  PriceToBookRatio: string;
  EVToRevenue: string;
  EVToEBITDA: string;
  Beta: string;
  '52WeekHigh': string;
  '52WeekLow': string;
  '50DayMovingAverage': string;
  '200DayMovingAverage': string;
  SharesOutstanding: string;
  DividendDate: string;
  ExDividendDate: string;
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
	volume?: number;
	marketCap?: number;
	companyName?: string;
	exchange?: string;
}

// Alpha Vantage helper functions
const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY || '';
const ALPHAVANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

async function makeAlphaVantageRequest(params: Record<string, string>): Promise<any> {
	try {
		const response = await axios.get(ALPHAVANTAGE_BASE_URL, {
			params: {
				...params,
				apikey: ALPHAVANTAGE_API_KEY
			}
		});

		if (response.data['Error Message']) {
			throw new Error(response.data['Error Message']);
		}

		if (response.data['Note']) {
			throw new Error('API call frequency limit reached. Please try again later.');
		}

		return response.data;
	} catch (error: any) {
		console.error(`Alpha Vantage API request failed:`, error.message);
		throw error;
	}
}

async function getAlphaVantageQuote(symbol: string): Promise<AlphaVantageGlobalQuote> {
	const data = await makeAlphaVantageRequest({
		function: 'GLOBAL_QUOTE',
		symbol: symbol
	}) as AlphaVantageGlobalQuoteResponse;

	return data['Global Quote'];
}

async function getAlphaVantageCompanyOverview(symbol: string): Promise<AlphaVantageCompanyOverview> {
	const data = await makeAlphaVantageRequest({
		function: 'OVERVIEW',
		symbol: symbol
	});
	return data as AlphaVantageCompanyOverview;
}

async function getAlphaVantageDailyData(symbol: string, outputsize: 'compact' | 'full' = 'compact'): Promise<AlphaVantageDailyResponse> {
	const data = await makeAlphaVantageRequest({
		function: 'TIME_SERIES_DAILY_ADJUSTED',
		symbol: symbol,
		outputsize: outputsize
	});
	return data as AlphaVantageDailyResponse;
}

function calculate20DayHigh(dailyData: AlphaVantageDailyResponse): number {
	const timeSeries = dailyData['Time Series (Daily)'];
	if (!timeSeries) return 0;

	const dates = Object.keys(timeSeries).sort().reverse().slice(0, 20);
	const highs = dates.map(date => parseFloat(timeSeries[date]['2. high']));
	
	return Math.max(...highs);
}

function calculateGapPercentage(currentPrice: number, twentyDayHigh: number): number {
	if (twentyDayHigh === 0) return 0;
	return ((currentPrice - twentyDayHigh) / twentyDayHigh) * 100;
}

async function testAlphaVantageApiKey(): Promise<boolean> {
	try {
		const response = await makeAlphaVantageRequest({
			function: 'GLOBAL_QUOTE',
			symbol: 'AAPL'
		});
		return response && response['Global Quote'] && response['Global Quote']['01. symbol'];
	} catch (error) {
		return false;
	}
}

async function getEnhancedStockData(symbol: string): Promise<EnhancedStockData | null> {
	try {
		const quote = await getAlphaVantageQuote(symbol).catch(() => null);
		
		if (!quote || !quote['05. price']) {
			console.warn(`No quote data available for ${symbol}`);
			return null;
		}

		const [overview, dailyData] = await Promise.allSettled([
			getAlphaVantageCompanyOverview(symbol),
			getAlphaVantageDailyData(symbol, 'compact')
		]);

		const overviewData = overview.status === 'fulfilled' ? overview.value : null;
		const historicalData = dailyData.status === 'fulfilled' ? dailyData.value : null;

		const currentPrice = parseFloat(quote['05. price']);
		const openPrice = parseFloat(quote['02. open']);
		const highPrice = parseFloat(quote['03. high']);
		const lowPrice = parseFloat(quote['04. low']);
		const previousClose = parseFloat(quote['08. previous close']);
		const volume = parseInt(quote['06. volume']);

		const twentyDayHigh = historicalData ? calculate20DayHigh(historicalData) : previousClose;
		const gapPercentage = calculateGapPercentage(currentPrice, twentyDayHigh);

		const enhancedData: EnhancedStockData = {
			symbol,
			currentPrice,
			openPrice,
			highPrice,
			lowPrice,
			previousClose,
			volume,
			marketCap: overviewData?.MarketCapitalization ? parseFloat(overviewData.MarketCapitalization) : 0,
			twentyDayHigh,
			gapPercentage,
			companyName: overviewData?.Name || symbol,
			exchange: overviewData?.Exchange || 'Unknown',
			currency: overviewData?.Currency || 'USD'
		};

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

export const testAlphaVantage = async (req: Request, res: Response) => {
	try {
		console.log('Testing Alpha Vantage API...');
		
		// Test API key first
		const isApiWorking = await alphaVantageService.testApiKey();
		if (!isApiWorking) {
			return res.status(200).json({
				alphaVantageStatus: 'API key test failed',
				message: 'Check your Alpha Vantage API key or subscription level'
			});
		}

		// Test a simple quote
		const testData = await alphaVantageService.getEnhancedStockData('AAPL');
		
		return res.status(200).json({
			alphaVantageStatus: testData ? 'Working' : 'Failed',
			testData,
			message: testData ? 'Alpha Vantage API is working' : 'Alpha Vantage API failed to get test data'
		});
	} catch (error) {
		console.error('Alpha Vantage test error:', error);
		return res.status(500).json({ 
			alphaVantageStatus: 'Error',
			error: 'Alpha Vantage API test failed' 
		});
	}
};

export const scanGapUps = async (req: Request, res: Response) => {
	try {
		console.log('Starting gap up scan...');
		
		// Call Claude API with web search to find stocks gapping up
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
					content: createGapUpScanPrompt()
				}
			],
		});

		console.log('Claude message received for gap up scan');

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

		console.log('Gap Up Scan Response:', analysis);

		// Parse the response to extract stock information
		const stocks = parseGapUpStocks(analysis);

		// Enhance stock data with Alpha Vantage API
		const enhancedStocks = await enhanceStocksWithAlphaVantage(stocks);

		return res.status(200).json({
			stocks: enhancedStocks,
			totalFound: enhancedStocks.length,
			timestamp: new Date()
		});
	} catch (error) {
		console.error('Error scanning for gap ups:', error);
		return res.status(500).json({ error: 'Failed to scan for gap ups' });
	}
};

async function enhanceStocksWithAlphaVantage(claudeStocks: GapUpStock[]): Promise<GapUpStock[]> {
	const enhancedStocks: GapUpStock[] = [];
	
	for (const stock of claudeStocks) {
		try {
			console.log(`Enhancing ${stock.stockSymbol} with Alpha Vantage data...`);
			const alphaVantageData = await alphaVantageService.getEnhancedStockData(stock.stockSymbol);
			
			if (alphaVantageData) {
				// Merge Claude analysis with Alpha Vantage data
				const enhancedStock: GapUpStock = {
					...stock,
					currentPrice: `$${alphaVantageData.currentPrice.toFixed(2)}`,
					twentyDayHigh: `$${alphaVantageData.twentyDayHigh.toFixed(2)}`,
					gapPercentage: `${alphaVantageData.gapPercentage.toFixed(2)}%`,
					openPrice: `$${alphaVantageData.openPrice.toFixed(2)}`,
					highPrice: `$${alphaVantageData.highPrice.toFixed(2)}`,
					lowPrice: `$${alphaVantageData.lowPrice.toFixed(2)}`,
					volume: alphaVantageData.volume,
					marketCap: alphaVantageData.marketCap,
					companyName: alphaVantageData.companyName,
					exchange: alphaVantageData.exchange,
					// Keep Claude's analysis and suitability assessment
					analysis: stock.analysis,
					suitable: stock.suitable
				};
				
				enhancedStocks.push(enhancedStock);
			} else {
				// If Alpha Vantage data fails, keep Claude's original data
				console.warn(`No Alpha Vantage data for ${stock.stockSymbol}, using Claude data only`);
				enhancedStocks.push(stock);
			}
		} catch (error) {
			console.error(`Error enhancing ${stock.stockSymbol} with Alpha Vantage:`, error);
			// Keep original Claude data if Alpha Vantage fails
			enhancedStocks.push(stock);
		}
	}
	
	return enhancedStocks;
}

function createGapUpScanPrompt() {
	return `You are a stock trading assistant with web search capabilities. I need you to find stocks that are currently gapping up above their 20-day highs.

**CRITICAL: Use your web search tool to find:**
- Stocks that are gapping up significantly in pre-market or opening today
- Current stock prices and 20-day high levels
- Stocks that have broken above their 20-day high resistance
- At least 10 stocks meeting these criteria

**Search for stocks with:**
1. Current price above the highest high of the last 20 trading days
2. Significant gap up (ideally 3%+ above previous close)
3. Strong volume and momentum
4. Clear catalysts or news driving the move

**Your Response Must Include:**
For each stock found, provide:
- Stock Symbol
- Current Price
- 20-Day High Level
- Gap Percentage
- Brief analysis of why it's gapping up
- SUITABLE or NOT SUITABLE for day trading

Format your response as a clear list with each stock's details. Focus on finding stocks that are actually gapping up TODAY, not just stocks that have been performing well.

DO NOT include stocks that are not currently gapping up above their 20-day highs. Only include stocks that meet this specific criteria.`;
}

function parseGapUpStocks(analysis: string): GapUpStock[] {
	const stocks: GapUpStock[] = [];
	
	// Split by lines and look for stock patterns
	const lines = analysis.split('\n');
	let currentStock: Partial<GapUpStock> = {};
	
	lines.forEach(line => {
		const trimmedLine = line.trim();
		
		// Look for stock symbols (3-5 letter codes)
		const symbolMatch = trimmedLine.match(/\b([A-Z]{3,5})\b/);
		if (symbolMatch && !currentStock.stockSymbol) {
			currentStock.stockSymbol = symbolMatch[1];
		}
		
		// Look for price patterns
		if (trimmedLine.includes('$') && !currentStock.currentPrice) {
			const priceMatch = trimmedLine.match(/\$(\d+\.?\d*)/);
			if (priceMatch) {
				currentStock.currentPrice = `$${priceMatch[1]}`;
			}
		}
		
		// Look for 20-day high
		if (trimmedLine.toLowerCase().includes('20-day') && !currentStock.twentyDayHigh) {
			const highMatch = trimmedLine.match(/\$(\d+\.?\d*)/);
			if (highMatch) {
				currentStock.twentyDayHigh = `$${highMatch[1]}`;
			}
		}
		
		// Look for gap percentage
		if (trimmedLine.includes('%') && !currentStock.gapPercentage) {
			const gapMatch = trimmedLine.match(/(\d+\.?\d*)%/);
			if (gapMatch) {
				currentStock.gapPercentage = `${gapMatch[1]}%`;
			}
		}
		
		// Look for SUITABLE/NOT SUITABLE
		if (trimmedLine.includes('SUITABLE') || trimmedLine.includes('NOT SUITABLE')) {
			currentStock.suitable = trimmedLine.includes('SUITABLE') && !trimmedLine.includes('NOT');
			currentStock.analysis = trimmedLine;
			
			// If we have a complete stock, add it to the list
			if (currentStock.stockSymbol && currentStock.currentPrice) {
				stocks.push(currentStock as GapUpStock);
				currentStock = {};
			}
		}
	});
	
	// Add any remaining stock that might not have SUITABLE marker
	if (currentStock.stockSymbol && currentStock.currentPrice && stocks.length < 10) {
		currentStock.suitable = true; // Default to suitable if we can't determine
		currentStock.analysis = currentStock.analysis || 'Gap up analysis';
		stocks.push(currentStock as GapUpStock);
	}
	
	return stocks.slice(0, 10); // Return max 10 stocks
}
