/**
 * Distribution Day Service
 *
 * Implements William O'Neil's distribution day counting methodology for market protection.
 * Tracks institutional selling (distribution) over a rolling 25-day window.
 *
 * Key Rules from "How to Make Money in Stocks":
 * - Distribution Day: Index down > 0.2% on volume higher than previous day
 * - Stalling Day: Up < 0.2% on volume 10%+ above 20-day average (heavy volume without price progress)
 * - Rolling Window: 25 trading days
 * - Reset: A strong up day (2%+) can remove one distribution day
 * - Follow-Through Day: Day 4-7 of rally attempt, up 1.5%+ on higher volume
 */

import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { DistributionDay, IDistributionDay } from '../db/models/DistributionDay.js';
import { MarketStatusHistory, IMarketStatusHistory, MarketStatus } from '../db/models/MarketStatusHistory.js';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

// In-memory state (loaded from DB on startup)
interface DistributionDayState {
  distributionCount: number;
  distributionDays: string[];  // Dates of distribution days in last 25 trading days
  stallingDays: string[];      // Dates of stalling days
  marketStatus: MarketStatus;
  positionSizingMultiplier: number;
  rallyAttemptDay: number;
  rallyStartDate: string | null;
  lastFollowThroughDate: string | null;
  lastUpdated: string;
  initialized: boolean;
}

let state: DistributionDayState = {
  distributionCount: 0,
  distributionDays: [],
  stallingDays: [],
  marketStatus: 'CONFIRMED_UPTREND',
  positionSizingMultiplier: 1.0,
  rallyAttemptDay: 0,
  rallyStartDate: null,
  lastFollowThroughDate: null,
  lastUpdated: '',
  initialized: false
};

// Constants
const ROLLING_WINDOW_DAYS = 25;  // O'Neil's 4-5 week window
const DISTRIBUTION_THRESHOLD = -0.2;  // Down more than 0.2%
const STALLING_THRESHOLD = 0.2;  // Up less than 0.2%
const STALLING_VOLUME_MULTIPLIER = 1.1;  // Volume 10% above 20-day average
const FOLLOW_THROUGH_MIN_GAIN = 1.5;  // Up at least 1.5%
const RESET_DAY_MIN_GAIN = 2.0;  // Strong up day that removes a distribution day
const RALLY_MIN_DAY = 4;  // Follow-through valid from day 4
const RALLY_MAX_DAY = 10;  // Follow-through must occur by day 10

/**
 * Check if a day is a distribution day
 * Rule: Index closes down > 0.2% on volume higher than previous day
 */
function isDistributionDay(
  changePercent: number,
  volume: number,
  prevVolume: number
): boolean {
  const downEnough = changePercent <= DISTRIBUTION_THRESHOLD;
  const higherVolume = volume > prevVolume;
  return downEnough && higherVolume;
}

/**
 * Check if a day is a stalling day
 * Rule: Up less than 0.2% on volume 10%+ above 20-day average
 * "Heavy volume without further price progress up"
 */
function isStallingDay(
  changePercent: number,
  volume: number,
  avgVolume20: number
): boolean {
  const barelyUp = changePercent >= 0 && changePercent < STALLING_THRESHOLD;
  const heavyVolume = volume > avgVolume20 * STALLING_VOLUME_MULTIPLIER;
  return barelyUp && heavyVolume;
}

/**
 * Check if a day is a follow-through day
 * Rule: Day 4-7 of rally attempt, up 1.5%+ on higher volume
 */
function isFollowThroughDay(
  changePercent: number,
  volume: number,
  prevVolume: number,
  rallyDay: number
): boolean {
  if (rallyDay < RALLY_MIN_DAY || rallyDay > RALLY_MAX_DAY) return false;
  const strongUp = changePercent >= FOLLOW_THROUGH_MIN_GAIN;
  const higherVolume = volume > prevVolume;
  return strongUp && higherVolume;
}

/**
 * Check if a day is a reset day
 * Rule: Strong up day (2%+) can remove one distribution day from count
 */
function isResetDay(changePercent: number): boolean {
  return changePercent >= RESET_DAY_MIN_GAIN;
}

/**
 * Calculate 20-day average volume
 */
function calculateAvgVolume20(candles: Array<{ volume?: number }>): number {
  if (candles.length < 20) {
    return candles.reduce((sum, c) => sum + (c.volume ?? 0), 0) / candles.length;
  }
  const last20 = candles.slice(-20);
  return last20.reduce((sum, c) => sum + (c.volume ?? 0), 0) / 20;
}

/**
 * Determine market status based on distribution count and rally attempt state
 */
function determineMarketStatus(
  distributionCount: number,
  rallyAttemptDay: number,
  lastFollowThroughDate: string | null
): MarketStatus {
  // If we had a follow-through day recently, we're in confirmed uptrend
  if (lastFollowThroughDate) {
    const ftDate = new Date(lastFollowThroughDate);
    const daysSinceFollowThrough = Math.floor((Date.now() - ftDate.getTime()) / (1000 * 60 * 60 * 24));
    // Follow-through confirmation lasts until distribution count rises again
    if (daysSinceFollowThrough < 5 && distributionCount < 4) {
      return 'CONFIRMED_UPTREND';
    }
  }

  // Check if we're in a rally attempt
  if (rallyAttemptDay > 0) {
    return 'RALLY_ATTEMPT';
  }

  // Normal status based on distribution count
  if (distributionCount >= 5) return 'MARKET_IN_CORRECTION';
  if (distributionCount === 4) return 'UPTREND_UNDER_PRESSURE';
  return 'CONFIRMED_UPTREND';
}

/**
 * Get position sizing multiplier based on market status
 */
function calculatePositionSizingMultiplier(status: MarketStatus): number {
  switch (status) {
    case 'CONFIRMED_UPTREND': return 1.0;      // 100% normal sizing
    case 'UPTREND_UNDER_PRESSURE': return 0.5; // 50% sizing
    case 'MARKET_IN_CORRECTION': return 0;     // No new positions
    case 'RALLY_ATTEMPT': return 0;            // No new positions until follow-through
    default: return 0;
  }
}

/**
 * Generate human-readable explanation of current market status
 */
export function generateStatusExplanation(s: DistributionDayState): string {
  const lines: string[] = [];

  lines.push(`Market Status: ${s.marketStatus.replace(/_/g, ' ')}`);
  lines.push(`Distribution Days (last 25): ${s.distributionCount}`);

  if (s.distributionDays.length > 0) {
    lines.push(`Distribution dates: ${s.distributionDays.slice(-5).join(', ')}`);
  }

  if (s.stallingDays.length > 0) {
    lines.push(`Stalling dates: ${s.stallingDays.slice(-3).join(', ')}`);
  }

  switch (s.marketStatus) {
    case 'CONFIRMED_UPTREND':
      lines.push('Action: Normal trading, full position sizing allowed');
      break;
    case 'UPTREND_UNDER_PRESSURE':
      lines.push('Action: Reduce position sizing to 50%, tighten stops');
      break;
    case 'MARKET_IN_CORRECTION':
      lines.push('Action: No new positions, defensive mode');
      break;
    case 'RALLY_ATTEMPT':
      lines.push(`Rally Attempt: Day ${s.rallyAttemptDay} (waiting for follow-through on day 4-7)`);
      lines.push('Action: No new positions until follow-through day confirmed');
      break;
  }

  return lines.join('\n');
}

/**
 * Get past N trading days (excluding today)
 */
function getPastTradingDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days - 10);  // Extra buffer for weekends/holidays
  return date.toISOString().split('T')[0];
}

/**
 * Initialize state from database
 */
export async function initializeDistributionDayService(): Promise<void> {
  if (state.initialized) return;

  console.log('[DIST-DAY] Initializing distribution day service...');

  try {
    // Get latest status from database
    const latestStatus = await MarketStatusHistory.findOne().sort({ date: -1 });

    if (latestStatus) {
      state.distributionCount = latestStatus.distributionCount;
      state.distributionDays = latestStatus.distributionDates;
      state.stallingDays = latestStatus.stallingDates;
      state.marketStatus = latestStatus.marketStatus as MarketStatus;
      state.positionSizingMultiplier = latestStatus.positionSizingMultiplier;
      state.rallyAttemptDay = latestStatus.rallyAttemptDay;
      state.rallyStartDate = latestStatus.rallyStartDate;
      state.lastFollowThroughDate = latestStatus.lastFollowThroughDate;
      state.lastUpdated = latestStatus.date;
      console.log(`[DIST-DAY] Loaded state from ${latestStatus.date}: ${state.distributionCount} dist days, status: ${state.marketStatus}`);
    } else {
      console.log('[DIST-DAY] No previous state found, will initialize on first update');
    }

    state.initialized = true;
  } catch (error) {
    console.error('[DIST-DAY] Error initializing from database:', error);
    state.initialized = true;  // Mark as initialized to prevent repeated attempts
  }
}

/**
 * Update distribution day count for a given date
 * This should be called after market close each day
 */
export async function updateDistributionDayCount(date: string): Promise<DistributionDayState> {
  console.log(`[DIST-DAY] Updating distribution day count for ${date}...`);

  if (!state.initialized) {
    await initializeDistributionDayService();
  }

  try {
    // Fetch 60 days of SPY data to have enough history
    const fromDate = getPastTradingDays(60);
    const candles = await fetchHistoricalBars(
      POLYGON_API_KEY,
      'SPY',
      fromDate,
      date,
      'day',
      1
    );

    if (candles.length < 25) {
      console.error(`[DIST-DAY] Insufficient data: only ${candles.length} candles`);
      return state;
    }

    // Filter to get only the last 26 days (need yesterday for comparison)
    const recentCandles = candles.slice(-26);

    // Calculate 20-day average volume using data before the recent window
    const volumeCalcCandles = candles.slice(-40, -20);
    const avgVolume20 = calculateAvgVolume20(volumeCalcCandles);

    // Analyze the last 25 trading days
    const distributionDays: string[] = [];
    const stallingDays: string[] = [];
    let rallyAttemptDay = state.rallyAttemptDay;
    let rallyStartDate = state.rallyStartDate;
    let lastFollowThroughDate = state.lastFollowThroughDate;

    // Process each day
    for (let i = 1; i < recentCandles.length; i++) {
      const today = recentCandles[i];
      const yesterday = recentCandles[i - 1];

      const todayDate = today.start.split('T')[0];
      const changePercent = ((today.close - yesterday.close) / yesterday.close) * 100;
      const volume = today.volume || 0;
      const prevVolume = yesterday.volume || 0;

      // Check for distribution day
      if (isDistributionDay(changePercent, volume, prevVolume)) {
        distributionDays.push(todayDate);

        // Save to database
        await DistributionDay.findOneAndUpdate(
          { date: todayDate, index: 'SPY' },
          {
            date: todayDate,
            index: 'SPY',
            close: today.close,
            volume,
            prevClose: yesterday.close,
            prevVolume,
            avgVolume20,
            changePercent,
            isDistributionDay: true,
            isStallingDay: false,
            isFollowThroughDay: false,
            isResetDay: false
          },
          { upsert: true, new: true }
        );
      }

      // Check for stalling day
      if (isStallingDay(changePercent, volume, avgVolume20)) {
        stallingDays.push(todayDate);

        await DistributionDay.findOneAndUpdate(
          { date: todayDate, index: 'SPY' },
          {
            date: todayDate,
            index: 'SPY',
            close: today.close,
            volume,
            prevClose: yesterday.close,
            prevVolume,
            avgVolume20,
            changePercent,
            isDistributionDay: false,
            isStallingDay: true,
            isFollowThroughDay: false,
            isResetDay: false
          },
          { upsert: true, new: true }
        );
      }

      // Check for reset day (strong up day that removes one distribution day)
      if (isResetDay(changePercent) && distributionDays.length > 0) {
        console.log(`[DIST-DAY] Reset day detected on ${todayDate} (+${changePercent.toFixed(2)}%)`);
        distributionDays.shift();  // Remove oldest distribution day

        await DistributionDay.findOneAndUpdate(
          { date: todayDate, index: 'SPY' },
          {
            date: todayDate,
            index: 'SPY',
            close: today.close,
            volume,
            prevClose: yesterday.close,
            prevVolume,
            avgVolume20,
            changePercent,
            isDistributionDay: false,
            isStallingDay: false,
            isFollowThroughDay: false,
            isResetDay: true
          },
          { upsert: true, new: true }
        );
      }

      // Track rally attempts
      if (state.marketStatus === 'MARKET_IN_CORRECTION' || state.marketStatus === 'RALLY_ATTEMPT') {
        // Check if we're starting or continuing a rally attempt
        if (changePercent > 0) {
          if (rallyAttemptDay === 0) {
            rallyAttemptDay = 1;
            rallyStartDate = todayDate;
            console.log(`[DIST-DAY] Rally attempt started on ${todayDate}`);
          } else {
            rallyAttemptDay++;
          }

          // Check for follow-through day
          if (isFollowThroughDay(changePercent, volume, prevVolume, rallyAttemptDay)) {
            lastFollowThroughDate = todayDate;
            console.log(`[DIST-DAY] FOLLOW-THROUGH DAY on ${todayDate}! Rally day ${rallyAttemptDay}, +${changePercent.toFixed(2)}%`);

            await DistributionDay.findOneAndUpdate(
              { date: todayDate, index: 'SPY' },
              {
                date: todayDate,
                index: 'SPY',
                close: today.close,
                volume,
                prevClose: yesterday.close,
                prevVolume,
                avgVolume20,
                changePercent,
                isDistributionDay: false,
                isStallingDay: false,
                isFollowThroughDay: true,
                isResetDay: false
              },
              { upsert: true, new: true }
            );
          }
        } else if (changePercent < -1) {
          // Rally attempt failed if down more than 1%
          console.log(`[DIST-DAY] Rally attempt failed on ${todayDate} (${changePercent.toFixed(2)}%)`);
          rallyAttemptDay = 0;
          rallyStartDate = null;
        }
      }
    }

    // Only count distribution days in the rolling window
    const windowStartDate = new Date();
    windowStartDate.setDate(windowStartDate.getDate() - ROLLING_WINDOW_DAYS);
    const windowStartStr = windowStartDate.toISOString().split('T')[0];

    const activeDistributionDays = distributionDays.filter(d => d >= windowStartStr);
    const activeStallingDays = stallingDays.filter(d => d >= windowStartStr);

    // Total distribution count includes both distribution and stalling days
    const totalCount = activeDistributionDays.length + activeStallingDays.length;

    // Determine market status
    const marketStatus = determineMarketStatus(totalCount, rallyAttemptDay, lastFollowThroughDate);
    const positionSizingMultiplier = calculatePositionSizingMultiplier(marketStatus);

    // Update state
    state = {
      distributionCount: totalCount,
      distributionDays: activeDistributionDays,
      stallingDays: activeStallingDays,
      marketStatus,
      positionSizingMultiplier,
      rallyAttemptDay,
      rallyStartDate,
      lastFollowThroughDate,
      lastUpdated: date,
      initialized: true
    };

    // Get latest SPY data for the status history
    const latestCandle = recentCandles[recentCandles.length - 1];
    const latestChange = ((latestCandle.close - recentCandles[recentCandles.length - 2].close) / recentCandles[recentCandles.length - 2].close) * 100;

    // Save to database
    await MarketStatusHistory.findOneAndUpdate(
      { date },
      {
        date,
        distributionCount: totalCount,
        marketStatus,
        positionSizingMultiplier,
        distributionDates: activeDistributionDays,
        stallingDates: activeStallingDays,
        rallyAttemptDay,
        rallyStartDate,
        lastFollowThroughDate,
        notes: generateStatusExplanation(state),
        spyClose: latestCandle.close,
        spyChangePercent: latestChange,
        spyVolume: latestCandle.volume
      },
      { upsert: true, new: true }
    );

    console.log(`[DIST-DAY] Updated: ${totalCount} distribution days (${activeDistributionDays.length} dist + ${activeStallingDays.length} stalling)`);
    console.log(`[DIST-DAY] Market status: ${marketStatus}, Position sizing: ${positionSizingMultiplier * 100}%`);

    return state;
  } catch (error) {
    console.error('[DIST-DAY] Error updating distribution day count:', error);
    return state;
  }
}

/**
 * Get current distribution day state
 */
export function getDistributionDayState(): DistributionDayState {
  return { ...state };
}

/**
 * Get current market status
 */
export function getMarketStatus(): MarketStatus {
  return state.marketStatus;
}

/**
 * Get position sizing multiplier (0 to 1)
 */
export function getPositionSizingMultiplier(): number {
  return state.positionSizingMultiplier;
}

/**
 * Check if trading is allowed based on current market status
 */
export function isTradingAllowed(): boolean {
  return state.marketStatus === 'CONFIRMED_UPTREND' || state.marketStatus === 'UPTREND_UNDER_PRESSURE';
}

/**
 * Get distribution day history from database
 */
export async function getDistributionDayHistory(days: number = 60): Promise<any[]> {
  const results = await (MarketStatusHistory as any).find()
    .sort({ date: -1 })
    .limit(days)
    .lean();
  return results;
}

/**
 * Get list of distribution days in a date range
 */
export async function getDistributionDaysInRange(
  fromDate: string,
  toDate: string
): Promise<any[]> {
  const results = await (DistributionDay as any).find({
    date: { $gte: fromDate, $lte: toDate },
    $or: [{ isDistributionDay: true }, { isStallingDay: true }]
  })
    .sort({ date: -1 })
    .lean();
  return results;
}

/**
 * Force recalculation of distribution day count
 * Useful for backtesting or after data correction
 */
export async function recalculateDistributionDays(): Promise<DistributionDayState> {
  state.initialized = false;
  const today = new Date().toISOString().split('T')[0];
  return updateDistributionDayCount(today);
}

/**
 * Clear all distribution day data (for testing)
 */
export async function clearDistributionDayData(): Promise<void> {
  await DistributionDay.deleteMany({});
  await MarketStatusHistory.deleteMany({});
  state = {
    distributionCount: 0,
    distributionDays: [],
    stallingDays: [],
    marketStatus: 'CONFIRMED_UPTREND',
    positionSizingMultiplier: 1.0,
    rallyAttemptDay: 0,
    rallyStartDate: null,
    lastFollowThroughDate: null,
    lastUpdated: '',
    initialized: false
  };
  console.log('[DIST-DAY] Cleared all distribution day data');
}
