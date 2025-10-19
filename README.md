# StockShower

A day trading application that identifies "gap up" stocks - stocks that open significantly higher than their previous close, specifically above their 20-day high levels.

## Tech Stack
- **Frontend**: React, TypeScript
- **Backend**: Node.js, Express, TypeScript
- **AI**: Claude API with web search
- **Stock Data**: Alpha Vantage API

## Development Commands

### Running the Application

```bash
# Run both frontend and backend together (recommended for development)
yarn dev

# Run frontend only (React app on port 3000)
yarn dev:client

# Run backend only (Express server on port 5002)
yarn dev:server
```

### Production Commands

```bash
# Start production servers
yarn start:client   # Frontend production build
yarn start:server    # Backend production server

# Build for production
yarn build           # Build frontend
yarn build:server    # Build backend
```

### Individual Workspace Commands

```bash
# Frontend (in /client directory)
cd client
yarn start    # or yarn dev - Development server
yarn build    # Production build
yarn test     # Run tests

# Backend (in /server directory)
cd server
yarn dev      # Development with nodemon
yarn start    # Production server
yarn build    # TypeScript compilation
```

## Environment Setup

1. **Install dependencies**:
   ```bash
   yarn install
   ```

2. **Set up environment variables** in `server/.env`:
   ```
   PORT=5002
   OPENAI_API_KEY=your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ALPHAVANTAGE_API_KEY=your_alphavantage_api_key
   ```

3. **Get API Keys**:
   - [Anthropic Claude API](https://console.anthropic.com/)
   - [Alpha Vantage API](https://www.alphavantage.co/support/#api-key) (free tier: 5 calls/minute, 500 calls/day)

## Features

- **Gap Up Scanner**: Finds stocks gapping above 20-day highs
- **AI Analysis**: Claude provides intelligent trading suitability assessment
- **Real-time Data**: Alpha Vantage API provides accurate market data
- **Enhanced Metrics**: Volume, market cap, OHLC data, company info
- **Responsive UI**: Clean interface for viewing gap up opportunities

## Usage

1. Start the application: `yarn dev`
2. Open http://localhost:3000
3. Click "Scan for Gap Ups" to find trading opportunities
4. View detailed stock information and AI analysis