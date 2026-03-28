import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Use GEMINI_API_KEY if set, otherwise fall back to GOOGLE_GENERATIVE_AI_API_KEY
export const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});
