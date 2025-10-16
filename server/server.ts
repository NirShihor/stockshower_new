import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import analysisRoutes from './src/routes/analysis.js';
import candlestickRoutes from './src/routes/candlestick.js';
import { setupWebSocketServer, handleCandle, handleSignal, getSignals } from './src/websocket/server.js';
import { connectPolygon, shutdownPolygon } from './src/handlers/polygonWebSocket.js';
import { stopMockDataFeed } from './src/handlers/mockDataGenerator.js';
import { stopMockSignalFeed } from './src/handlers/mockSignalGenerator.js';
import { detectEngulfingPatterns } from './src/candlestick/patterns/engulfing.js';
import { aggregate1MinTo5Min, clearAggregator } from './src/candlestick/aggregator.js';
import { metaApiHandler } from './src/handlers/metaApiRestHandler.js';

  // Load environment variables
  dotenv.config();

  // Initialize Express app
  const app = express();
  const PORT = process.env.PORT || 5001;

  // Middleware
  app.use(cors({
    origin: [
      'http://localhost:3000', 
      'http://127.0.0.1:3000',
      'https://stockshower-98ce8cd75cf3.herokuapp.com',
      'https://stockshower-4f7d4c36c3d7.herokuapp.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

app.use('/api/analysis', analysisRoutes);
app.use('/api/candlestick', candlestickRoutes);

// Signals endpoint
app.get('/api/signals', (req: Request, res: Response) => {
  const { symbol, limit = '50' } = req.query;
  const signals = getSignals(symbol as string | undefined, parseInt(limit as string));
  res.json(signals);
});

// Serve static React build files ONLY in production
if (process.env.NODE_ENV === 'production') {
  // Determine client build path - works for both development and production
  const clientBuildPath = path.resolve(__dirname, '../client/build');
  const clientBuildPathAlt = path.resolve(__dirname, '../../client/build');
  const finalClientBuildPath = fs.existsSync(clientBuildPath) ? clientBuildPath : clientBuildPathAlt;
  
  console.log('Production mode: serving static React files from', finalClientBuildPath);
  app.use(express.static(finalClientBuildPath));
} else {
  console.log('Development mode: React dev server should handle frontend on port 3000');
}

// API health check route  
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Test CORS route
app.get('/test', (req: Request, res: Response) => {
  res.status(200).json({ message: 'CORS test successful' });
});

// Serve React app for all non-API routes (only in production)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req: Request, res: Response) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path === '/test') {
      res.status(404).json({ error: 'API route not found' });
      return;
    }
    
    // Try to serve React app
    try {
      const clientBuildPath = path.resolve(__dirname, '../client/build');
      const clientBuildPathAlt = path.resolve(__dirname, '../../client/build');
      const finalClientBuildPath = fs.existsSync(clientBuildPath) ? clientBuildPath : clientBuildPathAlt;
      res.sendFile(path.join(finalClientBuildPath, 'index.html'));
    } catch (error) {
      console.error('Error serving React app:', error);
      res.status(500).json({ error: 'Unable to serve application' });
    }
  });
}

  // Create HTTP server
  const server = http.createServer(app);

  // Setup WebSocket server
  setupWebSocketServer(server);

  // Store candle handler for testing routes
  const candleHandler = (candle: any) => {
    handleCandle(candle, detectEngulfingPatterns);
  };
  app.locals.onCandle = candleHandler;
  app.locals.onSignal = handleSignal;
  app.locals.getSignals = getSignals;

  // Start server
  const startServer = () => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      
      // Don't auto-connect to Polygon - let frontend control via subscribe endpoint
      if (process.env.POLYGON_API_KEY) {
        console.log('Polygon API key found - ready for real-time data');
        console.log('Use /api/candlestick/subscribe to start real-time feed');
      } else {
        console.warn('POLYGON_API_KEY not found in environment variables');
      }
      console.log('Use /api/candlestick/test/mock/start for testing');
      
      // Start cleanup schedulers for MT5
      if (process.env.METAAPI_TOKEN && process.env.METAAPI_ACCOUNT_ID) {
        console.log('Starting MT5 cleanup schedulers...');
        metaApiHandler.startEndOfDayScheduler();
        metaApiHandler.startOrderCleanup();
      } else {
        console.log('MetaApi credentials not found - automated cleanup disabled');
      }
    });
  };

  // Connect to MongoDB
  if (process.env.MONGODB_URI) {
    console.log('Attempting to connect to MongoDB...');
    mongoose
      .connect(process.env.MONGODB_URI)
      .then(() => {
        console.log('Connected to MongoDB');
        startServer();
      })
      .catch((error) => {
        console.error('MongoDB connection error:', error);
        console.log('Starting server without MongoDB connection');
        startServer();
      });
  } else {
    console.log('No MongoDB URI provided, starting server without database');
    startServer();
  }

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  
  // Shutdown all connections
  shutdownPolygon();
  stopMockDataFeed();
  stopMockSignalFeed();
  clearAggregator(); // Clean up aggregator timers
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 5000);
  
  server.close(() => {
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close();
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  // Shutdown all connections
  shutdownPolygon();
  stopMockDataFeed();
  stopMockSignalFeed();
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 5000);
  
  server.close(() => {
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close();
    }
    process.exit(0);
  });
});

export default app;

