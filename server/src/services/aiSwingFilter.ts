import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import { MarketContext, formatMarketContextForAI } from './marketContextService.js';
import { SectorAnalysis, formatSectorAnalysisForAI, getSectorStrength } from './sectorAnalysisService.js';
import { StockProfile, formatStockProfileForAI } from './stockProfileService.js';

dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface SwingSetup {
  symbol: string;
  date: string;
  price: number;
  sma20: number;
  sma50: number;
  rsi: number;
  swingLow: number;
  swingHigh?: number;
  direction: 'long' | 'short';
  reason: string;
}

export interface AISwingScore {
  score: number;
  take: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  keyFactors: string[];
}

const SYSTEM_PROMPT = `You are a professional swing trader evaluating potential LONG trades. You use CONTEXT to make decisions, not just technical patterns.

YOUR JOB: Score swing trade setups based on the confluence of:
1. MARKET REGIME - Is the overall market favorable for long positions?
2. SECTOR STRENGTH - Is this stock's sector leading or lagging?
3. STOCK QUALITY - Is this a quality company or speculative junk?
4. TECHNICAL SETUP - Is the pullback to support valid?

SCORING FRAMEWORK:

STRONG BUY (8-10): All factors align
- Market is risk-on (SPY uptrend, VIX low/normal)
- Sector is leading or neutral
- Quality company (large cap, profitable, growing)
- Clean technical setup

MODERATE BUY (6-7): Most factors align
- Market neutral to bullish
- Sector not lagging badly
- Decent company fundamentals
- Valid technical setup

SKIP (4-5): Mixed signals
- Some negative factors present
- Not enough conviction

AVOID (1-3): Negative factors dominate
- Market risk-off
- Sector lagging
- Poor fundamentals
- Weak technical setup

KEY RULES:
1. NEVER buy in a risk-off market regime (VIX > 25, SPY bearish)
2. AVOID lagging sectors - money flows to leaders
3. NEVER buy a sector that is LOSING momentum (rank dropping) - this is sector rotation happening
4. PREFER profitable companies over speculative names
5. BETTER to miss a trade than take a bad one

CRITICAL: Sector momentum is MORE important than current rank. A sector ranked #1 but LOSING momentum is WORSE than a sector ranked #4 but GAINING momentum. Rotation kills trades.

Respond with ONLY a JSON object:
{
  "score": <1-10>,
  "take": <true if score >= 7>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<2-3 sentences explaining decision>",
  "keyFactors": ["<factor1>", "<factor2>", "<factor3>"]
}`;

export async function scoreSwingSetup(
  setup: SwingSetup,
  market: MarketContext | null,
  sector: SectorAnalysis | null,
  profile: StockProfile | null
): Promise<AISwingScore> {
  const prompt = buildPrompt(setup, market, sector, profile);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      score: parsed.score || 5,
      take: parsed.take ?? parsed.score >= 7,
      confidence: parsed.confidence || 'medium',
      reasoning: parsed.reasoning || 'No reasoning provided',
      keyFactors: parsed.keyFactors || []
    };
  } catch (error) {
    console.error(`AI scoring failed for ${setup.symbol}:`, error);
    return {
      score: 5,
      take: false,
      confidence: 'low',
      reasoning: 'AI evaluation failed, defaulting to skip',
      keyFactors: ['evaluation_error']
    };
  }
}

function buildPrompt(
  setup: SwingSetup,
  market: MarketContext | null,
  sector: SectorAnalysis | null,
  profile: StockProfile | null
): string {
  let prompt = `EVALUATE THIS SWING TRADE SETUP:\n\n`;

  prompt += `=== TECHNICAL SETUP ===\n`;
  prompt += `Symbol: ${setup.symbol}\n`;
  prompt += `Date: ${setup.date}\n`;
  prompt += `Current Price: $${setup.price.toFixed(2)}\n`;
  prompt += `20 SMA: $${setup.sma20.toFixed(2)} (${setup.price > setup.sma20 ? 'above' : 'below'})\n`;
  prompt += `50 SMA: $${setup.sma50.toFixed(2)} (${setup.price > setup.sma50 ? 'above' : 'below'})\n`;
  prompt += `RSI: ${setup.rsi.toFixed(1)}\n`;
  prompt += `Swing Low (stop): $${setup.swingLow.toFixed(2)} (${((setup.price - setup.swingLow) / setup.price * 100).toFixed(1)}% risk)\n`;
  prompt += `Setup Reason: ${setup.reason}\n\n`;

  if (market) {
    prompt += `=== MARKET CONTEXT ===\n`;
    prompt += formatMarketContextForAI(market);
    prompt += `\n`;
  } else {
    prompt += `=== MARKET CONTEXT ===\nNo market data available.\n\n`;
  }

  if (sector && profile) {
    const sectorStrength = getSectorStrength(sector, setup.symbol);
    prompt += `=== SECTOR CONTEXT ===\n`;
    if (sectorStrength) {
      prompt += `Stock's Sector: ${sectorStrength.sectorName}\n`;
      prompt += `Sector Rank: #${sectorStrength.rank} of 11\n`;
      prompt += `Relative Strength: ${sectorStrength.relativeStrength >= 0 ? '+' : ''}${sectorStrength.relativeStrength.toFixed(2)}%\n`;
      prompt += `Status: ${sectorStrength.isLeading ? 'LEADING' : sectorStrength.isLagging ? 'LAGGING' : 'NEUTRAL'}\n`;
      prompt += `Momentum: ${sectorStrength.momentum.toUpperCase()} (rank change: ${sectorStrength.rankChange > 0 ? '+' : ''}${sectorStrength.rankChange})\n`;
      if (sectorStrength.momentum === 'losing') {
        prompt += `⚠️ WARNING: This sector is LOSING momentum - rotation may be happening!\n`;
      }
      if (sector.rotationWarning) {
        prompt += `⚠️ ROTATION WARNING: Multiple sectors losing momentum today\n`;
      }
      prompt += `\n`;
    } else {
      prompt += `Sector data not available for ${setup.symbol}\n\n`;
    }
  }

  if (profile) {
    prompt += `=== STOCK PROFILE ===\n`;
    prompt += formatStockProfileForAI(profile);
    prompt += `\n`;
  } else {
    prompt += `=== STOCK PROFILE ===\nNo profile data available.\n\n`;
  }

  prompt += `Based on ALL the above context, score this trade 1-10 and decide if we should take it:`;

  return prompt;
}

export async function batchScoreSwingSetups(
  setups: SwingSetup[],
  market: MarketContext | null,
  sector: SectorAnalysis | null,
  profileMap: Map<string, StockProfile>,
  delayMs: number = 500
): Promise<Map<string, AISwingScore>> {
  const scores = new Map<string, AISwingScore>();

  for (const setup of setups) {
    const profile = profileMap.get(setup.symbol) || null;
    const score = await scoreSwingSetup(setup, market, sector, profile);
    scores.set(`${setup.symbol}-${setup.date}`, score);

    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return scores;
}
