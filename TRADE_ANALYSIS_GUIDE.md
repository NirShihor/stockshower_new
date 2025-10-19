# Trade Analysis Guide

This guide explains how to export and analyze trading data to improve the algorithms.

## 📊 Viewing Trade Data

### MongoDB Compass (Recommended GUI)
1. Download from: https://www.mongodb.com/products/compass
2. Connect to: `mongodb://localhost:27017` (or your MongoDB Atlas URI)
3. Database: `stocktrading`
4. Collection: `trades`

### Command Line (mongosh)
```bash
# Install MongoDB shell
brew install mongosh  # macOS
npm install -g mongosh  # Alternative

# Connect and view data
mongosh mongodb://localhost:27017/stocktrading

# View all trades
db.trades.find().pretty()

# View recent trades
db.trades.find().sort({signalTime: -1}).limit(5)

# View only closed trades with P&L
db.trades.find({status: "closed"}, {symbol: 1, patternName: 1, pnlAmount: 1, exitReason: 1})
```

### VS Code Extension
- Install "MongoDB for VS Code" extension
- Connect to your MongoDB URI
- Browse collections visually

## 🔍 Trade Status Lifecycle

Trades progress through these statuses:
1. **`pending`** → Signal generated, trade record created
2. **`placed`** → Order sent to MT5 successfully  
3. **`filled`** → Order executed, position opened
4. **`closed`** → Position closed with final P&L

## 📈 Built-in Analytics Endpoints

### Quick Analytics
```bash
# Overall trading statistics
curl http://localhost:5002/api/trades/analytics/overall

# Pattern-specific performance
curl http://localhost:5002/api/trades/analytics/pattern/Bullish%20Engulfing

# Today's trades
curl http://localhost:5002/api/trades/analytics/today

# Recent trades
curl http://localhost:5002/api/trades/recent?limit=50
```

## 🎯 Algorithm Analysis Export

### Primary Method: Algorithm Review Endpoint
```bash
# Get last 7 days of trade data for analysis
curl http://localhost:5002/api/trades/analytics/algorithm-review > algorithm_review.json

# Specify different timeframe
curl http://localhost:5002/api/trades/analytics/algorithm-review?days=3 > recent_trades.json
curl http://localhost:5002/api/trades/analytics/algorithm-review?days=14 > two_week_review.json
```

### Alternative: MongoDB Export
```bash
# Export all trades to JSON
mongoexport --uri="your_mongodb_uri" --collection=trades --out=trades_export.json

# Export specific date range
mongoexport --uri="your_mongodb_uri" --collection=trades --query='{"signalTime":{"$gte":{"$date":"2025-10-17T00:00:00.000Z"}}}' --out=todays_trades.json
```

## 🧠 Getting Algorithm Improvements from Claude

### Step 1: Export Data
After a period of trading (recommended: at least 10-20 trades), run:
```bash
curl http://localhost:5002/api/trades/analytics/algorithm-review > algorithm_review.json
```

### Step 2: Share with Claude
Copy the JSON output and share it with Claude along with your question:

**Example:**
```
Hey Claude, here's my trading data from the last week. I'm having a lot of losing trades - what needs fixing?

[paste JSON output from algorithm-review endpoint]
```

### Step 3: What Claude Will Analyze

**Pattern Performance:**
- Which patterns are consistently losing?
- Are pattern scores correlating with success?
- Should we raise minimum score thresholds?

**Entry/Exit Analysis:**
- Are stop losses too tight or too loose?
- Is the 0.7% entry buffer appropriate?
- Are take profit levels optimal?

**Market Context Issues:**
- Do certain volatility levels perform worse?
- Are volume requirements sufficient?
- Is support/resistance logic working?

**Timing Problems:**
- Time of day performance patterns?
- How long are winning vs losing trades?
- Market condition correlations?

## 📋 Sample Data Structure

The algorithm review endpoint provides:

```json
{
  "period": "Last 7 days",
  "summary": {
    "totalTrades": 15,
    "winningTrades": 6,
    "losingTrades": 9,
    "avgWin": 12.45,
    "avgLoss": -8.23,
    "totalPnL": -15.67,
    "patternPerformance": {
      "Bullish Engulfing": {"wins": 2, "losses": 4, "totalPnL": -12.50},
      "Gap Up Breakout": {"wins": 4, "losses": 3, "totalPnL": 8.75}
    },
    "exitReasons": {
      "stop_loss": 9,
      "take_profit": 5,
      "manual": 1
    }
  },
  "trades": [
    {
      "symbol": "AAPL",
      "patternName": "Bullish Engulfing",
      "patternScore": 85,
      "direction": "long",
      "entryPrice": 175.50,
      "actualEntryPrice": 175.65,
      "exitPrice": 174.20,
      "exitReason": "stop_loss",
      "pnlAmount": -14.50,
      "pnlPercentage": -0.82,
      "marketConditions": {
        "trend": "up",
        "volatility": "medium",
        "atr": 2.15,
        "nearSupport": false,
        "nearResistance": true
      }
    }
  ]
}
```

## 🔧 Common Algorithm Adjustments

Based on analysis, Claude might recommend:

### Pattern Filtering
- Increase minimum pattern scores
- Filter out patterns near resistance levels
- Adjust volatility requirements

### Risk Management
- Tighten or loosen stop losses
- Adjust take profit distances
- Modify position sizing

### Entry Conditions
- Change entry buffer percentages
- Add time-of-day filters
- Improve market condition checks

### Market Context
- Better trend identification
- Volume spike requirements
- Support/resistance validation

## 💾 Data Backup

### Regular Exports
```bash
# Weekly backup
mongoexport --uri="your_mongodb_uri" --collection=trades --out=trades_backup_$(date +%Y%m%d).json

# Export for specific analysis periods
mongoexport --uri="your_mongodb_uri" --collection=trades --query='{"signalTime":{"$gte":{"$date":"2025-10-01T00:00:00.000Z"}}}' --out=october_trades.json
```

### Cloud Database Benefits
If using MongoDB Atlas:
- Automatic backups
- Web interface for viewing data
- Access from anywhere
- No local MongoDB installation needed

## 🚀 Getting Started

1. **Set up MongoDB** (local or Atlas cloud)
2. **Place some trades** (at least 10-20 for meaningful analysis)
3. **Wait for trades to close** (position monitor tracks automatically)
4. **Export data** using algorithm review endpoint
5. **Share with Claude** for analysis and improvements

The system automatically tracks all trade lifecycle events, so you just need to trade normally and export the data when ready for analysis!