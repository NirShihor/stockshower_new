# Trade Analysis API Guide

This guide explains how to use the comprehensive trade analysis tools to identify patterns and characteristics that correlate with winning trades.

## 🔗 API Endpoints

All endpoints are available at `http://localhost:5002/api/trade-analysis/`

### 1. Comprehensive Analysis
**Endpoint:** `POST /api/trade-analysis/comprehensive`

Returns complete analysis including patterns, market conditions, score ranges, symbol performance, and timing analysis.

```bash
# Full analysis for last 30 days
curl -X POST http://localhost:5002/api/trade-analysis/comprehensive \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-11-01",
    "endDate": "2025-11-25",
    "minTrades": 3
  }'

# Quick analysis for last 7 days
curl -X POST http://localhost:5002/api/trade-analysis/comprehensive \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-11-18"}'
```

**Parameters:**
- `startDate` (optional): Start date (YYYY-MM-DD)
- `endDate` (optional): End date (YYYY-MM-DD)
- `includeAll` (optional): Include non-closed trades (default: false)
- `minTrades` (optional): Minimum trades for pattern analysis (default: 3)

### 2. Quick Insights
**Endpoint:** `GET /api/trade-analysis/insights`

Returns summary with key findings and actionable recommendations.

```bash
# Last 7 days insights
curl http://localhost:5002/api/trade-analysis/insights

# Last 14 days insights
curl http://localhost:5002/api/trade-analysis/insights?days=14
```

### 3. Pattern Deep Dive
**Endpoint:** `GET /api/trade-analysis/pattern/:patternName`

Analyzes a specific pattern in detail.

```bash
# Analyze Bullish Engulfing pattern
curl http://localhost:5002/api/trade-analysis/pattern/Bullish%20Engulfing

# Analyze Gap Up Breakout pattern for last 60 days
curl http://localhost:5002/api/trade-analysis/pattern/Gap%20Up%20Breakout?days=60
```

### 4. Symbol Performance
**Endpoint:** `GET /api/trade-analysis/symbol/:symbol`

Analyzes trading performance for a specific symbol.

```bash
# Analyze AAPL performance
curl http://localhost:5002/api/trade-analysis/symbol/AAPL

# Analyze TSLA for last 30 days
curl http://localhost:5002/api/trade-analysis/symbol/TSLA?days=30
```

### 5. Score Range Analysis
**Endpoint:** `GET /api/trade-analysis/score-analysis`

Shows which pattern score ranges produce the best results.

```bash
# Score analysis for last 30 days
curl http://localhost:5002/api/trade-analysis/score-analysis?days=30
```

### 6. Market Conditions Correlation
**Endpoint:** `GET /api/trade-analysis/market-conditions`

Analyzes which market conditions correlate with winning trades.

```bash
# Market conditions analysis
curl http://localhost:5002/api/trade-analysis/market-conditions?days=30
```

### 7. Time-Based Analysis
**Endpoint:** `GET /api/trade-analysis/time-analysis`

Shows performance patterns by time of day, day of week, and trading session.

```bash
# Time-based analysis
curl http://localhost:5002/api/trade-analysis/time-analysis?days=30
```

## 📊 Key Metrics Explained

### Pattern Metrics
- **Win Rate**: Percentage of profitable trades
- **Profit Factor**: (Average Win × Number of Wins) ÷ (Average Loss × Number of Losses)
- **Sharpe Ratio**: Risk-adjusted return measure
- **At Support/Resistance Rate**: Percentage of trades at key levels
- **Trend Aligned Rate**: Percentage where pattern direction matches trend

### Score Analysis
- **Optimal Score Ranges**: Score ranges with highest win rates
- **Score Distribution**: How trades perform across different score thresholds

### Market Conditions
- **High Volume**: Trades with volume factor > 1.5
- **Trend Alignment**: Pattern direction matching market trend
- **Support/Resistance Context**: Proximity to key price levels
- **Volatility Impact**: Performance across different volatility environments

## 🎯 Finding Winning Characteristics

### 1. Pattern Performance Analysis
```bash
# Get comprehensive analysis
curl -X POST http://localhost:5002/api/trade-analysis/comprehensive \
  -H "Content-Type: application/json" \
  -d '{"minTrades": 5}' | jq '.analysis.patternAnalysis'
```

Look for:
- Patterns with **win rate > 60%** and **positive total P&L**
- **High trend alignment rates** (>70%)
- **Low resistance rates** (<30% for long patterns)
- **Optimal score ranges** for each pattern

### 2. Score Threshold Optimization
```bash
curl http://localhost:5002/api/trade-analysis/score-analysis?days=30
```

Identify:
- Score ranges with **highest win rates**
- **Minimum score thresholds** that filter out losers
- **Score ceiling effects** (if very high scores underperform)

### 3. Market Context Filtering
```bash
curl http://localhost:5002/api/trade-analysis/market-conditions?days=30
```

Find conditions that improve performance:
- **High volume** requirements
- **Trend alignment** filters
- **Support/resistance** proximity rules
- **Volatility** preferences

### 4. Timing Optimization
```bash
curl http://localhost:5002/api/trade-analysis/time-analysis?days=30
```

Discover:
- **Best trading hours** (e.g., market open vs afternoon)
- **Day-of-week effects** 
- **Session preferences** (pre-market vs regular hours)

## 🔧 CLI Analysis Tool

For detailed local analysis, use the CLI tool:

```bash
# Navigate to server directory
cd server

# Run comprehensive analysis
npx tsx src/analysis/runAnalysis.ts --days 14 --summary

# Analyze specific pattern
npx tsx src/analysis/runAnalysis.ts --pattern "Bullish Engulfing"

# Export results to file
npx tsx src/analysis/runAnalysis.ts --days 30 --export analysis.json

# Focus on specific symbol
npx tsx src/analysis/runAnalysis.ts --symbol AAPL --days 60
```

## 📈 Sample Winning Filter Criteria

Based on typical analysis results, here are common winning characteristics:

### High-Probability Pattern Filters
```javascript
// Example winning criteria discovered through analysis
const winningCriteria = {
  minScore: 75,                    // From score analysis
  maxAtResistance: 0.3,           // Avoid resistance for longs
  minTrendAlignment: 0.7,          // Require trend confirmation
  minVolumeMultiplier: 1.5,       // High volume requirement
  maxStopDistance: 1.5,           // Risk management
  minRiskReward: 2.0,             // Reward/risk ratio
  preferredHours: [9, 10, 14, 15], // Market open + afternoon
  avoidDays: ['Friday'],          // If Friday shows poor performance
};
```

### Pattern-Specific Findings
- **Bullish Engulfing**: Best at support with trend alignment
- **Gap Breakouts**: Require high volume and early morning timing
- **Bounce Patterns**: Must be at actual support levels (not resistance)
- **Breakout Patterns**: Avoid late-day entries, prefer trend alignment

## 🚀 Integration with Backtesting

Use analysis results to improve your trading algorithms:

1. **Identify top-performing patterns** and their optimal conditions
2. **Set minimum score thresholds** based on score analysis  
3. **Add market context filters** (volume, support/resistance, trend)
4. **Implement time-based filters** for optimal entry timing
5. **Adjust risk management** based on stop distance analysis

## 💾 Data Export

All endpoints return JSON that can be easily processed:

```bash
# Export comprehensive analysis to file
curl -X POST http://localhost:5002/api/trade-analysis/comprehensive \
  -H "Content-Type: application/json" \
  -d '{"days": 30}' > trade_analysis.json

# Process with jq for specific insights
curl http://localhost:5002/api/trade-analysis/insights | jq '.insights.recommendedFilters'
```

This analysis system helps you systematically identify the specific characteristics that correlate with winning trades, enabling you to refine your algorithms for better performance.