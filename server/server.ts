import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import analysisRoutes from './src/routes/analysis.js';

  // Load environment variables
  dotenv.config();

  // Initialize Express app
  const app = express();
  const PORT = process.env.PORT || 5001;

  // Middleware
  app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

app.use('/api/analysis', analysisRoutes);

// Serve static React build files
const clientBuildPath = path.join(__dirname, '../../client/build');
console.log('Server __dirname:', __dirname);
console.log('Client build path:', clientBuildPath);
console.log('Client build exists:', require('fs').existsSync(clientBuildPath));
app.use(express.static(clientBuildPath));

// API health check route  
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Test CORS route
app.get('/test', (req: Request, res: Response) => {
  res.status(200).json({ message: 'CORS test successful' });
});

// Serve React app for all non-API routes (must be last)
app.get('*', (req: Request, res: Response) => {
  // Skip API routes
  if (req.path.startsWith('/api') || req.path === '/test') {
    res.status(404).json({ error: 'API route not found' });
    return;
  }
  
  // Try to serve React app
  try {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  } catch (error) {
    console.error('Error serving React app:', error);
    res.status(500).json({ error: 'Unable to serve application' });
  }
});

  // Start server
  const startServer = () => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
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

export default app;