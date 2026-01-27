# Backtesting Integration Guide

## Steps to integrate the backtesting module into your server:

### 1. Import the backtest routes in server.ts

Add this import at the top of your server.ts file (around line 21, after the other route imports):

```typescript
import backtestRoutes from './src/backtesting/routes/backtestRoutes.js';
```

### 2. Add the backtest routes to Express

Add this line after the other route definitions (around line 57, after the test routes):

```typescript
app.use('/api/backtest', backtestRoutes);
```

### 3. Update the comprehensive scanner import

In `backtesting/engine/backtestEngine.ts`, update the import path on line 7:

```typescript
import { ComprehensiveScanner } from '../../candlestick/comprehensiveScanner.js';
```

## That's it! The backtesting system is now integrated.

## API Endpoints Available:

- `POST /api/backtest/run` - Start a new backtest
- `GET /api/backtest/status/:backtestId` - Check backtest status
- `GET /api/backtest/results/:backtestId` - Get full results
- `GET /api/backtest/report/:backtestId` - Get text report
- `GET /api/backtest/metrics/:backtestId` - Get performance metrics
- `GET /api/backtest/export/:backtestId` - Export trades as CSV
- `GET /api/backtest/list` - List all backtests
- `POST /api/backtest/cleanup` - Clean up old backtests

## Example API Call:

```bash
curl -X POST http://localhost:5002/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "MSFT", "GOOGL"],
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "initialBalance": 10000,
    "positionSizeGBP": 5,
    "enableAutoExecution": true,
    "autoExecutionThreshold": 60,
    "enableTrapFades": true
  }'
```

## Next Steps:

1. Build a frontend UI to visualize backtest results
2. Add database persistence for backtest results
3. Implement walk-forward testing
4. Add parameter optimization capabilities