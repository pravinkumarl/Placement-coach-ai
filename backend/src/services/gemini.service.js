import env from '../config/env.js';
import { ApiError } from '../utils/response.js';

const MODEL_FALLBACKS = [
  env.geminiModel,
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-2.0-flash',
].filter((model, index, list) => model && list.indexOf(model) === index);

const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Minimal JSON extractor — models sometimes wrap JSON in ``` fences / prose.
 * @param {string} text
 * @returns {object}
 */
export function parseJsonSafe(text) {
  if (!text) throw ApiError.serviceUnavailable('The AI service returned an empty response.');
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }
  throw ApiError.serviceUnavailable('The AI service returned an unreadable response.');
}

async function callModel(model, payload, attempt = 0) {
  const url = `${GEMINI_BASE_URL}/${model}:generateContent`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.geminiApiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (attempt < MODEL_FALLBACKS.length - 1) {
      return callModel(MODEL_FALLBACKS[attempt + 1], payload, attempt + 1);
    }
    throw ApiError.serviceUnavailable(
      'Unable to reach the AI service right now. Please try again shortly.'
    );
  }

  if (response.ok) {
    const body = await response.json();
    const text = body?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    if (!text) {
      throw ApiError.serviceUnavailable('The AI service returned no content.');
    }
    return text;
  }

  // Retry the next model on transient errors / not found.
  if ((response.status === 404 || response.status === 429 || response.status >= 500) &&
      attempt < MODEL_FALLBACKS.length - 1) {
    return callModel(MODEL_FALLBACKS[attempt + 1], payload, attempt + 1);
  }

  if (response.status === 401 || response.status === 403) {
    throw ApiError.serviceUnavailable(
      'The AI service rejected the configured API key. Check GEMINI_API_KEY on the server.'
    );
  }

  throw ApiError.serviceUnavailable('The AI service is temporarily unavailable.');
}

export function assertGeminiConfigured() {
  if (!env.geminiApiKey) {
    throw ApiError.serviceUnavailable(
      'AI features are disabled: GEMINI_API_KEY is not configured on the server.'
    );
  }
}

/**
 * Low level Gemini call with model fallback.
 * @param {{systemInstruction?: string, contents: Array<{role: string, parts: object[]}>}} payload
 * @returns {Promise<string>}
 */
export async function generateContent(payload) {
  assertGeminiConfigured();

  const { contents, systemInstruction, temperature, maxOutputTokens, responseMimeType } = payload;
  const body = {
    contents,
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxOutputTokens ?? 2048,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  return callModel(MODEL_FALLBACKS[0], body);
}

/**
 * Ask Gemini for text content.
 * @param {string} prompt
 * @param {{systemInstruction?: string, temperature?: number, maxOutputTokens?: number}} [options]
 */
export async function generateText(prompt, options = {}) {
  return generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(options.systemInstruction
      ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
      : {}),
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
  });
}

/**
 * Ask Gemini for a JSON object.
 */
export async function generateJson(prompt, options = {}) {
  const text = await generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(options.systemInstruction
      ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
      : {}),
    temperature: options.temperature ?? 0.4,
    maxOutputTokens: options.maxOutputTokens,
    responseMimeType: 'application/json',
  });
  return parseJsonSafe(text);
}

/**
 * Multi turn conversation helper.
 * @param {Array<{role:'user'|'assistant', content:string}>} messages
 * @param {string} systemInstruction
 */
export async function generateConversation(messages, systemInstruction) {
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content) }],
  }));

  return generateContent({
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    temperature: 0.8,
    maxOutputTokens: 2048,
  });
}

export default {
  generateText,
  generateJson,
  generateConversation,
  assertGeminiConfigured,
  parseJsonSafe,
};
