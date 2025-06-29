import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('OPENAI_API_KEY is not defined in environment variables');
    // Provide a fallback or handle missing key
  }

  const openai = new OpenAI({
    apiKey: apiKey || 'MISSING_API_KEY' // Fallback to prevent immediate crash
  });

  export default openai;