import env from '../config/env.js';
import { generateContent } from '../services/gemini.service.js';
import { ApiError, asyncHandler } from '../utils/response.js';

const DEFAULT_SYSTEM_PROMPT =
  'You are an expert, encouraging, and highly knowledgeable AI Placement Coach for university students and job seekers.';

/**
 * POST /api/gemini
 * Legacy compatible proxy — accepts the same payload shape the frontend used
 * with the old Vercel function (`{ contents, systemPrompt, model }`) and
 * returns a raw Gemini style `{ candidates: [...] }` response.
 * Requires an authenticated user and never exposes the API key.
 */
export const geminiProxy = asyncHandler(async (req, res) => {
  const { contents, systemPrompt, model } = req.body || {};

  if (!Array.isArray(contents) || contents.length === 0) {
    throw ApiError.badRequest('Invalid payload: "contents" array is required.');
  }

  const text = await generateContent({
    contents,
    systemInstruction: { parts: [{ text: systemPrompt || DEFAULT_SYSTEM_PROMPT }] },
    temperature: 0.7,
    maxOutputTokens: 2048,
  });

  return res.status(200).json({
    candidates: [
      {
        content: { role: 'model', parts: [{ text }] },
        finishReason: 'STOP',
      },
    ],
    modelVersion: model || env.geminiModel,
  });
});

export default geminiProxy;
