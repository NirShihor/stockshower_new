# Trading System Manual

A complete guide to how this automated trading system works, written for everyday understanding.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [The Two Trading Strategies](#2-the-two-trading-strategies)
3. [CAN SLIM Strategy Explained](#3-can-slim-strategy-explained)
4. [How the System Detects Good Stocks](#4-how-the-system-detects-good-stocks)
5. [Market Protection: Distribution Days](#5-market-protection-distribution-days)
6. [Gold Trading Strategy](#6-gold-trading-strategy)
7. [Stop Losses: Protecting Your Money](#7-stop-losses-protecting-your-money)
8. [Trailing Stops: Locking In Profits](#8-trailing-stops-locking-in-profits)
9. [How Trades Are Executed](#9-how-trades-are-executed)
10. [Key Numbers and Thresholds](#10-key-numbers-and-thresholds)
11. [Daily Operations](#11-daily-operations)
12. [Glossary of Terms](#12-glossary-of-terms)

---

## 1. What This System Does

This is an automated trading system that:

1. **Scans the market** - Looks at over 1,000 US stocks and 250 UK stocks every day
2. **Finds trading opportunities** - Identifies stocks that meet specific quality criteria
3. **Places trades automatically** - When it finds a good opportunity, it places orders through your broker
4. **Manages positions** - Adjusts stop losses to protect profits as prices move
5. **Protects during bad markets** - Stops trading when market conditions are dangerous

Think of it as a tireless assistant that watches the market 24/7, following a strict rulebook to find and manage trades.

---

## 2. The Two Trading Strategies

The system uses two different strategies depending on market conditions:

### Strategy 1: CAN SLIM (For Strong Markets)

When the stock market is healthy and rising, the system looks for high-quality growth stocks that are about to "break out" (rise sharply in price).

**When it's used:** During confirmed uptrends when big investors are buying

### Strategy 2: Gold Trading (For Weak Markets)

When the stock market is falling or uncertain, the system switches to trading gold, which often rises when stocks fall.

**When it's used:** During market corrections or when fear is high

**The logic:** If stocks are dangerous, don't trade them - trade gold instead as a "safe haven."

---

## 3. CAN SLIM Strategy Explained

CAN SLIM is a famous stock-picking method created by William O'Neil, founder of Investor's Business Daily. Each letter stands for a criterion that winning stocks share:

### C - Current Earnings
Strong companies have strong recent earnings. The system uses "relative strength" (explained below) as a proxy for this.

### A - Annual Earnings Growth
Companies should show consistent growth year over year. Again, relative strength serves as a quality indicator.

### N - New Products, Management, or Highs
Stocks making new highs are often doing so because of something new and exciting. The system requires stocks to be near their 52-week high (highest price in the past year).

### S - Supply and Demand
When a stock breaks out, it should do so on high volume (lots of shares traded). This shows strong demand from big buyers. The system requires volume to be at least 1.4x (40% higher than) the average.

### L - Leader or Laggard
Only buy the leaders, not the laggards. The system measures this with a "Relative Strength Rating" (RS Rating) - a score from 0-100 showing how well a stock has performed compared to all other stocks. Minimum requirement: 70.

### I - Institutional Sponsorship
Big institutions (mutual funds, pension funds) drive stock prices. The system checks if the stock's industry sector is among the top performers.

### M - Market Direction
This is the most important factor. Never fight the market. If the overall market is falling, even the best stocks will struggle. The system tracks "distribution days" (explained later) to know when to stop trading.

---

## 4. How the System Detects Good Stocks

The system runs several analyses on each stock:

### 4.1 Relative Strength Rating (RS Rating)

**What it is:** A score from 0 to 100 measuring how well a stock has performed over the past 12 months compared to all other stocks.

**How it works:**
- The system calculates the 12-month return for every stock in its universe (over 1,000 stocks)
- It ranks them from best to worst
- It converts the rank to a score: top 1% gets RS 99, bottom 1% gets RS 1

**Example:**
- Stock ABC returned +45% over 12 months
- The average stock returned +12%
- ABC ranks in the top 10% of all stocks
- RS Rating = 90

**Minimum requirement:** 70 (stock must be in the top 30% of performers)

### 4.2 Near 52-Week High

**What it is:** How close the stock is to its highest price in the past year.

**Why it matters:** Stocks making new highs are often the ones with the most momentum. They've already proven they can overcome resistance.

**Calculation:**
```
Distance from high = (Current Price - 52-Week High) / 52-Week High x 100
```

**Example:**
- 52-week high: $100
- Current price: $92
- Distance: -8% (8% below the high)

**Requirement:** Must be within 15% of the high (not more than 15% below)

### 4.3 Base Pattern Detection

**What it is:** The system looks for specific chart patterns that often precede big price moves.

**What is a "base"?**

A base is a period where a stock stops going up and moves sideways for several weeks. Think of it as the stock "resting" before making its next move. During this time:
- Weak investors sell their shares
- Strong investors quietly accumulate (buy)
- The price stabilizes in a range

**Three types of bases the system looks for:**

**1. Flat Base (Most Reliable)**
- Price moves sideways in a tight range
- Depth: 15% or less (price doesn't drop much)
- Duration: At least 5 weeks
- Shows the stock is very strong - it won't drop even when the market is choppy

**2. Cup with Handle**
- Price drops, forms a rounded bottom (like a cup), then rises back up
- A small dip follows (the "handle") before the breakout
- Depth: 12-35%
- Duration: At least 7 weeks
- Classic pattern seen in many big winners before their major runs

**3. Consolidation**
- General sideways movement
- Depth: up to 35%
- Duration: At least 5 weeks
- Less defined than flat base or cup, but still valid

**The "Pivot Point":**

The pivot point is the price at which the stock "breaks out" of its base. It's calculated as the highest point of the base plus a tiny buffer (0.1%). When the stock crosses above this level, it signals the start of a new upward move.

**Example:**
- Stock XYZ has been trading between $95 and $100 for 6 weeks
- Highest point of base: $100
- Pivot point: $100.10
- When price crosses $100.10, the system triggers a buy

### 4.4 Prior Uptrend Check

**What it is:** Before forming a base, the stock should have already been in an uptrend.

**Why it matters:** A good base forms after a significant advance. If a stock is forming a base after a long decline, it's probably a "recovery" pattern - much less reliable.

**Requirements:**
- US stocks: Must have risen at least 30% before forming the base
- UK stocks: Must have risen at least 20% (UK market is less volatile)

### 4.5 Overhead Supply Check

**What it is:** The system checks if there's resistance above the current price from shareholders who bought higher and want to sell.

**The problem:** If a stock dropped from $150 to $80 and is now recovering to $100, many people who bought at $120-$150 are waiting to sell at breakeven. This creates "overhead supply" - selling pressure that can prevent the stock from advancing.

**The rule:** If the pivot point is more than 15% below a prior high AND the stock previously declined more than 40%, the pattern is rejected.

### 4.6 Volume Breakout

**What it is:** When the stock breaks above its pivot, volume should be significantly higher than normal.

**Why it matters:** High volume on a breakout means big institutional buyers are participating. Without their support, the breakout may fail.

**Requirement:** Volume must be at least 1.4x (40% higher than) the 50-day average volume.

### 4.7 Sector Strength

**What it is:** Stocks don't move alone - they move with their sector (industry group). Technology stocks tend to move together, as do financial stocks, energy stocks, etc.

**How it works:**
- The system ranks all 11 market sectors from strongest to weakest
- It checks which sector the stock belongs to
- The stock's sector must be in the top 7 (not in the bottom 4)

**Sectors tracked:**
1. Technology
2. Financials
3. Energy
4. Healthcare
5. Industrials
6. Consumer Discretionary (luxury goods, entertainment)
7. Consumer Staples (necessities like food and household items)
8. Utilities
9. Materials
10. Real Estate
11. Communications

**Why this matters:** Even a great stock will struggle if its entire sector is out of favour with investors.

### 4.8 The Extended Check

**What it is:** The system checks if a stock has already risen too much above its pivot point.

**The rule:** If a stock is more than 5% above its pivot point, it's "extended" and the system won't buy it.

**Why:** Buying a stock that's already jumped means you're "chasing" it. The risk is much higher because:
- You've missed the ideal entry point
- The stock may pull back to the pivot, causing an immediate loss
- Your stop loss will be further away, increasing risk

**Example:**
- Pivot point: $100
- Maximum buy zone: $105 (5% above pivot)
- Current price: $108 (8% above pivot)
- Result: EXTENDED - no buy

---

## 5. Market Protection: Distribution Days

This is the most important safety feature in the system. It's based on William O'Neil's research showing that markets don't crash suddenly - they show warning signs first.

### What is a Distribution Day?

A distribution day occurs when:
1. The market index (like the S&P 500) closes DOWN by more than 0.2%
2. AND trading volume is HIGHER than the previous day

**What it means:** Big institutions are selling. When volume is high on a down day, it means large players are liquidating positions.

### What is a Stalling Day?

A stalling day occurs when:
1. The market closes UP, but barely (less than 0.2% gain)
2. AND volume is 10%+ higher than the 20-day average

**What it means:** Despite high volume, the market couldn't make progress. This is "churning" - institutions are selling into strength.

### The Counting System

The system tracks distribution and stalling days over a rolling 25-day window (about 5 weeks):

| Distribution Days | Market Status | What the System Does |
|------------------|---------------|---------------------|
| 0-3 days | CONFIRMED UPTREND | Normal trading (100% position size) |
| 4 days | UPTREND UNDER PRESSURE | Reduced trading (50% position size) |
| 5+ days | MARKET IN CORRECTION | NO new trades; close existing positions |

### Rally Attempts and Follow-Through Days

When the market is in correction, the system watches for recovery:

**Rally Attempt:**
- After a correction, the first up day starts a "rally attempt"
- The system counts the days: Day 1, Day 2, Day 3...

**Follow-Through Day:**
- Must occur on Day 4, 5, 6, or 7 of the rally attempt
- Requirements: Index up 1.5%+ AND volume higher than previous day
- When this happens, the market returns to "CONFIRMED UPTREND"

**Why Day 4-7?**
- Days 1-3 are often just short-covering (temporary bounces)
- Days 4-7 show that the rally has "legs"
- Days 8+ are too late - the first thrust should happen earlier

### Why This Matters

Historical research shows that most market tops are preceded by distribution days. By counting them, the system avoids:
- Buying at market tops
- Holding through market crashes
- Fighting the prevailing trend

**Example scenario:**
- Monday: S&P 500 down 0.3% on higher volume = Distribution Day 1
- Wednesday: S&P 500 down 0.4% on higher volume = Distribution Day 2
- Next Monday: S&P 500 down 0.5% on higher volume = Distribution Day 3
- Next Wednesday: S&P 500 down 0.2% on higher volume = Distribution Day 4

Now the system is at "UPTREND UNDER PRESSURE" and reduces position sizes by 50%.

- If another distribution day occurs: MARKET IN CORRECTION - no new trades

---

## 6. Gold Trading Strategy

Gold is the system's defensive strategy. When stocks are too dangerous to trade, gold often performs well.

### When Gold Trading Activates

The system trades gold when:
1. The stock market is NOT in a confirmed uptrend
2. OR when market regime is "risk-off" (fear is high)

The logic: Don't fight weak markets with stock trades - switch to gold instead.

### Gold Analysis (3 Factors)

**Factor 1: Trend**
- Calculate the 20-day moving average (EMA) of gold
- If gold price is ABOVE this average: Bullish (+1 point)
- If gold price is BELOW: Bearish (0 points)

**Factor 2: Consolidation**
- Is gold building a base pattern (tight range)?
- Range within 5% over 5-20 days = Consolidation (+1 point)
- No consolidation = 0 points

**Factor 3: VIX (Fear Gauge)**
- VIX is a measure of market fear
- VIX > 18 = Elevated fear (+1 point)
- VIX < 18 = Normal (0 points)

**Trading Decision:**
- Score 2-3: Place buy-stop order at consolidation breakout level
- Score 1: Wait for better setup
- Score 0: Don't trade gold

### Extended Move Protection

The system also checks if gold has made an "extended" move recently:
- If gold moved more than 2.5% in the last 3 days
- OR if the last day had an unusually large range (>1.5%)

If either is true, the system WAITS. Chasing a spike often leads to buying at the top.

### Gold Position Limits

- Maximum 1 gold position at any time
- Closes automatically when stock market turns bullish again
- Uses tighter stops than stocks (3% instead of 7%)

---

## 7. Stop Losses: Protecting Your Money

A stop loss is an automatic order to sell if the price drops to a certain level. It limits your losses on any single trade.

### Initial Stop Loss Placement

The system uses "structure-based" stops, meaning it places the stop just below a support level (a price where the stock previously found buyers).

**For CAN SLIM (Stocks):**

The system calculates two possible stop levels and uses the TIGHTER one (the one closer to the entry price):

1. **Structure Stop:**
   - Looks at the lowest point of the base pattern ("base low")
   - Looks at the lowest point of the last 5 days ("recent low")
   - Takes whichever is HIGHER (tighter)
   - Subtracts a 0.2% buffer

2. **Maximum Cap Stop:**
   - Entry price minus 7%
   - This is the absolute maximum loss allowed

The system uses whichever stop is CLOSER to the entry price.

**Example:**
- Entry price: $100 (pivot point)
- Base low: $94
- Recent 5-day low: $97
- Structure stop: $97 × 0.998 = $96.81 (higher of the two lows, minus buffer)
- Maximum cap stop: $100 × 0.93 = $93

The system would use $96.81 (the tighter stop).

**For Gold:**

Same logic, but with different parameters:
- Recent 3-day low (instead of 5-day)
- Maximum cap of 3% (instead of 7%)

### Why This Approach?

1. **Respects market structure:** Stops are placed just below where buyers previously stepped in
2. **Tighter risk:** Using the higher of base low vs recent low means smaller losses
3. **Maximum cap:** Even if the base is deep, you never risk more than 7% (stocks) or 3% (gold)

---

## 8. Trailing Stops: Locking In Profits

Once a trade is profitable, the system moves the stop loss higher to protect those gains. This is called a "trailing stop."

### When Trailing Starts

**For Stocks:** After 2% profit
**For Gold:** After 1% profit

Before these thresholds, the stop stays at its initial level.

### Spike-Aware Trailing

The system uses different trailing percentages depending on how much profit exists:

**For Stocks:**

| Profit Level | Trailing Distance | Mode |
|--------------|------------------|------|
| 2-5% | 8% below current price | NORMAL |
| 5-10% | 4% below current price | SPIKE |
| 10%+ | 2.5% below current price | SPIKE-TIGHT |

**For Gold:**

| Profit Level | Trailing Distance | Mode |
|--------------|------------------|------|
| 1-2% | 3% below current price | NORMAL |
| 2-4% | 1.5% below current price | SPIKE |
| 4%+ | 1% below current price | SPIKE-TIGHT |

### Why "Spike-Aware"?

When a stock or gold makes a big sudden move (spike), it often pulls back. Without tightening the stop, you could give back most of your gains.

**Example:**
- Bought stock at $100
- Initial stop: $93 (7% risk)
- Price rises to $112 (12% profit)
- Now in SPIKE-TIGHT mode
- New stop: $112 × 0.975 = $109.20
- If price drops to $109.20, you exit with 9.2% profit instead of waiting for $93

### The Ratchet Mechanism

The trailing stop only moves UP, never down:
- If the new calculated stop is lower than the current stop, nothing happens
- The stop only moves when there's a higher level to move to
- This locks in profits as the price rises

---

## 9. How Trades Are Executed

### The Scanning Process

1. **Check Market Conditions**
   - Get current distribution day count
   - Determine market status (CONFIRMED UPTREND, UNDER PRESSURE, or CORRECTION)
   - If in CORRECTION: Stop here, no scanning

2. **Check Broker Connection**
   - Verify the system can communicate with the trading platform
   - Check for existing positions to avoid duplicates

3. **Scan All Stocks**
   - For each of the 1,000+ stocks:
     - Calculate RS Rating
     - Check distance from 52-week high
     - Detect base pattern
     - Check sector strength
     - Check volume
     - Calculate overall score

4. **Filter Results**
   - Remove stocks that don't pass all criteria
   - Remove stocks that are "extended" (too far above pivot)
   - Sort remaining candidates by score

5. **Execute Trades**
   - For the top candidates (up to daily limit):
     - Check for earnings announcements (skip if too close)
     - Calculate position size based on market status
     - Place buy-stop order at pivot point
     - Set stop loss and take profit levels

### Order Types

**Buy-Stop Order:**
The system doesn't buy immediately. Instead, it places a "buy-stop" order at the pivot point. This means:
- The order sits waiting
- If price rises and hits the pivot, the order executes
- If price never reaches the pivot, no trade happens

This prevents buying stocks that never actually break out.

### Position Sizing

Position size is adjusted based on market conditions:
- CONFIRMED UPTREND: 100% of target margin
- UPTREND UNDER PRESSURE: 50% of target margin
- MARKET IN CORRECTION: 0% (no trades)

### Take Profit Target

The system sets a take profit level based on risk/reward:
- Risk = Entry price - Stop loss
- Target = Entry price + (Risk × 2)

This gives a 2:1 reward-to-risk ratio. If you risk $3 per share, the target gain is $6 per share.

---

## 10. Key Numbers and Thresholds

Here's a quick reference of all the important numbers in the system:

### CAN SLIM Requirements

| Criterion | Requirement | Notes |
|-----------|-------------|-------|
| RS Rating | Minimum 70 | 0-100 scale, higher is better |
| Distance from 52-week high | Within 15% | Not more than 15% below |
| Base pattern depth | Maximum 35% | Shallower is better |
| Base length | Minimum 5 weeks | 25 trading days |
| Prior uptrend (US) | Minimum 30% | Before the base formed |
| Prior uptrend (UK) | Minimum 20% | UK market is less volatile |
| Volume on breakout | Minimum 1.4x | Compared to 50-day average |
| Sector rank | Top 7 | Out of 11 sectors |
| Extended zone | Maximum 5% | Above pivot point |

### Stop Loss Limits

| Asset | Maximum Stop | Typical Stop |
|-------|--------------|--------------|
| US/UK Stocks | 7% | 3-5% (structure-based) |
| Gold | 3% | 1.5-2.5% (structure-based) |

### Trailing Stop Levels

| Asset | Normal Trail | Spike Trail | Tight Trail |
|-------|-------------|-------------|-------------|
| Stocks | 8% | 4% (>5% profit) | 2.5% (>10% profit) |
| Gold | 3% | 1.5% (>2% profit) | 1% (>4% profit) |

### Distribution Day Thresholds

| Count | Status | Action |
|-------|--------|--------|
| 0-3 | CONFIRMED UPTREND | Normal trading |
| 4 | UPTREND UNDER PRESSURE | Half position sizes |
| 5+ | MARKET IN CORRECTION | No new trades, close positions |

### Gold Analysis Thresholds

| Factor | Threshold | Points |
|--------|-----------|--------|
| Above 20 EMA | Price > 20-day average | +1 |
| Consolidation | Range < 5% over 5-20 days | +1 |
| VIX elevated | VIX > 18 | +1 |
| Extended | >2.5% move in 3 days | Skip trade |

---

## 11. Daily Operations

### Before Market Open

1. **Check Distribution Day Status**
   - How many distribution days in the last 25 days?
   - What's the current market status?

2. **Review Overnight Positions**
   - Did any stops trigger overnight?
   - Any significant gaps in holdings?

3. **Check Gold Conditions**
   - Is the stock market status allowing CAN SLIM trades?
   - If not, is gold showing a good setup?

### During Market Hours

**Typical Scan Times:**
- US Market: 9:30 AM - 4:00 PM Eastern Time
- UK Market: 8:00 AM - 4:30 PM London Time

The system typically scans every few hours or on demand.

### End of Day

1. **Update Distribution Day Count**
   - Did today qualify as a distribution day?
   - Update the rolling 25-day count

2. **Sync Position Status**
   - Update database with any closed trades
   - Record profit/loss

3. **Review Scan Results**
   - How many candidates were found?
   - How many trades executed?
   - Why were candidates rejected?

---

## 12. Glossary of Terms

**Base:** A period where a stock's price moves sideways, consolidating before potentially moving higher.

**Breakout:** When a stock's price moves above a resistance level (like the top of a base), often signalling the start of a new uptrend.

**Buy-Stop Order:** An order to buy that only executes when the price rises to a specified level.

**Distribution Day:** A day when the market index falls on higher-than-average volume, indicating institutional selling.

**EMA (Exponential Moving Average):** An average of prices that gives more weight to recent prices. The 20 EMA is the average of roughly the last 20 days' prices.

**Extended:** When a stock has risen too far above its pivot point (more than 5%), making it too risky to buy.

**Follow-Through Day:** A strong up day (1.5%+) on higher volume that confirms a rally attempt is genuine.

**Pivot Point:** The price level at which a stock breaks out of its base pattern. This is the ideal entry point.

**Relative Strength (RS) Rating:** A score from 0-100 measuring how well a stock has performed compared to all other stocks over the past 12 months.

**Risk-Off:** Market conditions where investors are fearful and moving money to safe assets like gold and bonds.

**Risk-On:** Market conditions where investors are confident and buying growth stocks.

**Sector:** A group of related industries (e.g., Technology, Healthcare, Energy).

**Stalling Day:** A day when the market makes minimal progress despite high volume, suggesting resistance.

**Stop Loss:** A predetermined price at which you'll sell to limit your loss.

**Trailing Stop:** A stop loss that moves higher as the price increases, locking in profits.

**VIX:** The "fear index" - a measure of expected market volatility. Higher VIX = more fear.

**Volume:** The number of shares traded. High volume means lots of activity and interest.

**52-Week High:** The highest price a stock has reached in the past year.

---

## Final Notes

This system is designed to follow disciplined rules, removing emotion from trading decisions. It won't catch every winner, but it aims to:

1. **Only trade in favourable conditions** (when the market supports it)
2. **Buy quality stocks** (leaders with momentum)
3. **Enter at the right time** (at the breakout, not after)
4. **Cut losses quickly** (structure-based stops)
5. **Let winners run** (trailing stops lock in profits)

The combination of these principles, applied consistently, forms the basis of successful growth investing as pioneered by William O'Neil.

---

*Document generated: February 2026*
*System version: Feature branch - distribution_day_counting_protection*
