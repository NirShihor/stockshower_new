import claude from '../config/claude.js';  
import { Request, Response } from 'express';

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

		return res.status(200).json({
			stocks,
			totalFound: stocks.length,
			timestamp: new Date()
		});
	} catch (error) {
		console.error('Error scanning for gap ups:', error);
		return res.status(500).json({ error: 'Failed to scan for gap ups' });
	}
};

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
