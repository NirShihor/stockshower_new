import Anthropic from '@anthropic-ai/sdk';
import { GapAndGoCandidate } from '../momentum/gapAndGoStrategy.js';

const client = new Anthropic();

export interface AIGapScore {
  score: number;
  take: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an aggressive momentum day trader specializing in Gap and Go plays. You take MORE trades, not fewer. Your job is to find reasons TO trade, not reasons to skip.

REMEMBER: Gap stocks are VOLATILE by nature. Wide premarket ranges and big gaps are NORMAL and EXPECTED. Don't penalize setups for being volatile - that's where the profit comes from!

WHAT MAKES A GOOD GAP AND GO:
1. LOW FLOAT (<30M) - This is the most important factor. Low float = explosive moves
2. STRONG VOLUME - Premarket volume >100K shows interest, >500K is excellent
3. GAP SIZE 5-50% - Bigger gaps can work if float is low enough
4. PRICE $1-$20 - Wide range is fine, momentum works at all levels

POSITIVE SIGNALS (score higher):
- Float under 10M = very bullish
- Float under 20M = bullish
- Premarket volume over 500K = strong conviction
- Gap 10-30% = ideal range
- Opening in upper half of premarket range = momentum intact

NEGATIVE SIGNALS (score lower, but don't auto-reject):
- Float over 50M with weak volume
- Premarket volume under 50K
- Warrants (.WS, W suffix) or units
- Leveraged ETFs (TQQQ, SQQQ, etc.)

SCORING GUIDE - BE GENEROUS:
- 8-10: Strong setup, definitely take it
- 6-7: Decent setup, lean towards taking it
- 5: Neutral, could go either way
- 3-4: Weak setup, probably skip
- 1-2: Clear avoid (ETFs, warrants, no volume)

Your goal is to approve roughly 30-50% of candidates, not 2%. When in doubt, score HIGHER.

Respond with ONLY a JSON object:
{
  "score": <1-10>,
  "take": <true if score >= 6, false otherwise>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<1 sentence>"
}`;

export async function scoreGapCandidate(
  candidate: GapAndGoCandidate,
  additionalContext?: string
): Promise<AIGapScore> {
  const prompt = buildPrompt(candidate, additionalContext);
  
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
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
      reasoning: parsed.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error(`AI scoring failed for ${candidate.symbol}:`, error);
    return {
      score: 5,
      take: false,
      confidence: 'low',
      reasoning: 'AI evaluation failed, defaulting to skip'
    };
  }
}

function buildPrompt(candidate: GapAndGoCandidate, additionalContext?: string): string {
  const floatStr = candidate.float 
    ? `${(candidate.float / 1000000).toFixed(1)}M shares`
    : 'Unknown';
  
  const premarketRange = candidate.premarketHigh - candidate.premarketLow;
  const premarketRangePercent = (premarketRange / candidate.premarketLow * 100).toFixed(1);
  
  const openVsPremarketHigh = ((candidate.openPrice - candidate.premarketLow) / premarketRange * 100).toFixed(0);

  let prompt = `EVALUATE THIS GAP AND GO CANDIDATE:

Symbol: ${candidate.symbol}
Date: ${candidate.date}
Gap: +${candidate.gapPercent.toFixed(1)}%
Previous Close: $${candidate.previousClose.toFixed(2)}
Open Price: $${candidate.openPrice.toFixed(2)}

PREMARKET DATA:
- High: $${candidate.premarketHigh.toFixed(2)}
- Low: $${candidate.premarketLow.toFixed(2)}
- Range: ${premarketRangePercent}%
- Open is at ${openVsPremarketHigh}% of premarket range (100% = at high)
- Volume: ${formatVolume(candidate.premarketVolume)}

STOCK INFO:
- Float: ${floatStr}
- Rule-based score: ${candidate.score}/100
- Reasons: ${candidate.reasons.join(', ')}`;

  if (additionalContext) {
    prompt += `\n\nADDITIONAL CONTEXT:\n${additionalContext}`;
  }

  prompt += '\n\nScore this setup 1-10 and decide if we should take the trade:';
  
  return prompt;
}

function formatVolume(vol: number): string {
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
  return vol.toString();
}

export async function batchScoreGapCandidates(
  candidates: GapAndGoCandidate[],
  delayMs: number = 500
): Promise<Map<string, AIGapScore>> {
  const scores = new Map<string, AIGapScore>();
  
  for (const candidate of candidates) {
    const score = await scoreGapCandidate(candidate);
    scores.set(candidate.symbol, score);
    
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return scores;
}
