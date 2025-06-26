import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Log environment variables for debugging
console.log('Environment variables loaded. Claude API key exists:', !!process.env.ANTHROPIC_API_KEY);

// Direct file read for debugging
try {
  const envPath = path.resolve(__dirname, '../../.env');
  console.log('Attempting to read .env file from:', envPath);
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('.env file content length:', envContent.length);
} catch (error) {
  console.error('Error reading .env file:', error);
}

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not defined in environment variables');
  // Provide a fallback or handle missing key
}

// @ts-ignore - Ignore TypeScript constructor issues
const claude = new Anthropic({
  apiKey: apiKey || 'MISSING_API_KEY' // Fallback to prevent immediate crash
});

export default claude; 