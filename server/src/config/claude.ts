import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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