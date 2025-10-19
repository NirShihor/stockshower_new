# Circuit Breaker System

## Overview
The circuit breaker system protects your trading account by automatically stopping trading when certain risk conditions are met.

## Features

### 1. Daily Loss Protection
- Stops trading if daily loss exceeds percentage limit (default: 3%)
- Stops trading if daily loss exceeds dollar amount (default: $1000)

### 2. Consecutive Loss Protection
- Stops trading after N consecutive losing trades (default: 5)
- Tracks losses per symbol and blacklists symbols after 3 consecutive losses

### 3. Position & Exposure Limits
- Maximum concurrent positions (default: 10)
- Maximum total exposure as % of account (default: 20%)
- Maximum exposure per symbol (default: 5%)

### 4. Account Protection
- Minimum balance required to trade (default: $1000)
- Emergency stop button for manual intervention

## Configuration

Set environment variables to customize limits:
```bash
CB_MAX_DAILY_LOSS_PERCENT=3
CB_MAX_DAILY_LOSS_AMOUNT=1000
CB_MAX_CONSECUTIVE_LOSSES=5
CB_MAX_POSITIONS_OPEN=10
CB_MAX_EXPOSURE_PERCENT=20
CB_MAX_SYMBOL_EXPOSURE=5
CB_MIN_ACCOUNT_BALANCE=1000
CB_EMERGENCY_STOP_ENABLED=true
```

## API Endpoints

### Check Circuit Breaker Status
```bash
GET /api/mt5/circuit-breaker/status
```

### Emergency Stop
```bash
POST /api/mt5/circuit-breaker/emergency-stop
{
  "reason": "Market crash detected"
}
```

### Reset Circuit Breaker
```bash
POST /api/mt5/circuit-breaker/reset
{
  "force": false  // Set to true to force reset
}
```

## How It Works

1. **Before Each Trade**: The system validates against all circuit breaker rules
2. **After Each Trade**: Updates risk metrics and checks for trigger conditions
3. **Daily Reset**: Circuit breakers reset at market open (9:30 AM ET)

## Integration with MT5

The circuit breaker runs entirely in TypeScript/Node.js:
- No changes needed to Python MT5 bridge
- Works with Heroku deployment
- Stores all state in MongoDB

## Database Schema

### RiskState Collection
Tracks daily risk metrics:
- Daily P&L and percentage
- Win/loss counts
- Consecutive losses
- Per-symbol metrics
- Circuit breaker triggers

## Next Steps

To get actual account balance from MT5:
1. Update `/api/mt5/place-order` endpoint
2. Call account-info before validating trades
3. Pass real balance to circuit breaker

## Testing

Test circuit breakers without real trades:
1. Use the validate-signal endpoint
2. Monitor circuit breaker status
3. Simulate losses by manually updating RiskState in MongoDB