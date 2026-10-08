import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

// Load .env from the repository root (never committed).
dotenv.config({ path: path.join(repoRoot, '.env') });

const REQUIRED_VARS = ['MONGODB_URI', 'JWT_SECRET'];

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

const missing = REQUIRED_VARS.filter((name) => isBlank(process.env[name]));

if (missing.length > 0) {
  const message =
    `[config] Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Copy .env.example to .env and provide values. Secret values are never printed.';
  throw new Error(message);
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5500',
  mongoUri: process.env.MONGODB_URI.trim(),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  geminiApiKey: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  // Judge0-compatible code execution provider (server side only, never exposed).
  // Falls back to the public Judge0 CE instance when unset.
  judge0ApiUrl: (process.env.JUDGE0_API_URL || 'https://ce.judge0.com').trim().replace(/\/+$/, ''),
  judge0ApiKey: process.env.JUDGE0_API_KEY ? process.env.JUDGE0_API_KEY.trim() : '',
  judge0ApiHost: process.env.JUDGE0_API_HOST ? process.env.JUDGE0_API_HOST.trim() : '',
  repoRoot,
};

export default env;
