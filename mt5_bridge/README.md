# MT5 Bridge - Automatic Trading Integration

This bridge automatically connects your pattern scanner to MetaTrader 5 for automated trade execution.

## Features

- 🔄 **Real-time Integration**: Fetches high-quality signals from your scanner
- 🛡️ **Risk Management**: Position sizing based on account balance and risk percentage
- 🎯 **Smart Filtering**: Only processes actionable signals (score ≥70 by default)
- 🔒 **Safety Features**: Dry-run mode, daily trade limits, signal validation
- 📊 **MT5 Integration**: Direct order placement with proper stop-loss and take-profit
- ⚡ **Two Modes**: Automatic continuous trading or manual command-line control

## Setup

### 1. Install Dependencies

```bash
cd mt5_bridge
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# MetaTrader 5 Configuration
MT5_LOGIN=12345
MT5_PASSWORD=your_password
MT5_SERVER=your_broker_server

# Scanner Configuration  
SCANNER_BASE_URL=http://localhost:5002
MINIMUM_SIGNAL_SCORE=70
MAX_TRADES_PER_DAY=10
RISK_PERCENTAGE=2.0
ACCOUNT_BALANCE=10000

# Safety Settings
AUTO_TRADE_ENABLED=false
DRY_RUN_MODE=true
```

### 3. Test Configuration

Start in manual mode first:

```bash
python main.py
```

Use commands:
- `status` - Check all connections
- `signals` - View pending signals
- `process` - Test signal processing

## Usage Modes

### Manual Mode (Recommended for testing)
```env
AUTO_TRADE_ENABLED=false
DRY_RUN_MODE=true
```

Interactive commands to test everything before going live.

### Automatic Mode (Production)
```env
AUTO_TRADE_ENABLED=true
DRY_RUN_MODE=false
```

Continuously monitors scanner and places trades automatically.

## Safety Features

### Risk Management
- **Position Sizing**: Calculates lot size based on account balance and risk percentage
- **Stop Loss**: Automatically sets stops based on pattern invalidation levels
- **Daily Limits**: Maximum trades per day to prevent overtrading

### Validation
- **Signal Age**: Rejects signals older than 30 minutes
- **Symbol Availability**: Verifies symbol exists in MT5
- **Market Hours**: Checks if trading is enabled
- **Duplicate Prevention**: Tracks processed signals

### Testing
- **Dry Run Mode**: Test everything without placing real trades
- **Connection Monitoring**: Continuous health checks
- **Comprehensive Logging**: Full audit trail

## Signal Processing Flow

1. **Fetch Signals**: Gets pending signals with score ≥70 from scanner
2. **Validate**: Checks signal age, symbol availability, plan completeness
3. **Filter**: Removes duplicates and applies trading rules
4. **Calculate Size**: Determines position size based on risk management
5. **Place Order**: Creates pending order in MT5 with stop/target levels
6. **Track**: Monitors order status and maintains records

## Order Types

The bridge creates **pending orders** based on signal direction:
- **Bullish signals**: BUY_LIMIT at pattern breakout level
- **Bearish signals**: SELL_LIMIT at pattern breakdown level

Each order includes:
- **Entry**: Pattern trigger price
- **Stop Loss**: Pattern invalidation level
- **Take Profit**: First target from signal plan
- **Comment**: Pattern name and score for tracking

## Monitoring

### Log Files
- `mt5_bridge.log`: Complete operational log
- Real-time console output for immediate feedback

### Status Checks
- MT5 connection status
- Scanner API connectivity
- Account balance and equity
- Open positions and pending orders
- Daily trade count vs limits

## Troubleshooting

### Common Issues

**"Failed to connect to MT5"**
- Check MT5 is running and logged in
- Verify login credentials in .env
- Ensure MT5 allows API connections

**"Symbol not available in MT5"**
- Check symbol format (e.g., AAPL vs AAPL.US)
- Configure `SYMBOL_SUFFIX` in .env if needed
- Verify symbol exists in Market Watch

**"No actionable signals found"**
- Check scanner is running and generating signals
- Verify `MINIMUM_SIGNAL_SCORE` threshold
- Ensure signals aren't too old (>30 min)

### Configuration Tips

- Start with `DRY_RUN_MODE=true` for testing
- Use low `RISK_PERCENTAGE` (1-2%) initially
- Set conservative `MAX_TRADES_PER_DAY` limits
- Monitor for several days before enabling auto-trade

## Example Workflow

1. **Setup**: Configure .env with your MT5 credentials
2. **Test Scanner**: Verify scanner is generating signals
3. **Dry Run**: Test bridge in dry-run mode
4. **Manual Mode**: Process signals manually to verify
5. **Automatic**: Enable auto-trade for live trading

The bridge provides a safe, automated way to execute your pattern scanner's high-quality signals directly in MT5!