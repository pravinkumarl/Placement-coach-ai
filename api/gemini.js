// Vercel Serverless Function: Proxy calls to Google Gemini API
// Keeps the GEMINI_API_KEY secure on the server without exposing it to client browsers

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed. Use POST.' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: {
        message: 'GEMINI_API_KEY environment variable is not configured. Please add GEMINI_API_KEY in your Vercel Project Settings > Environment Variables.'
      }
    });
  }

  const { contents, systemPrompt, model } = req.body || {};
  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({ error: { message: 'Invalid payload: "contents" array is required.' } });
  }

  // Model fallback chain
  const modelsToTry = [model, 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'].filter(Boolean);
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  let lastErrorData = null;
  let lastStatus = 500;

  for (const targetModel of modelsToTry) {
    try {
      const url = `${baseUrl}/${targetModel}:generateContent?key=${apiKey}`;
      const payload = {
        system_instruction: {
          parts: [{ text: systemPrompt || 'You are an expert, encouraging, and highly knowledgeable AI Placement Coach.' }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        }
      };

      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await upstream.json();
      if (upstream.ok) {
        return res.status(200).json(data);
      }

      lastStatus = upstream.status;
      lastErrorData = data;
    } catch (err) {
      lastErrorData = { error: { message: err.message || 'Upstream request failed' } };
    }
  }

  return res.status(lastStatus).json(lastErrorData || { error: { message: 'Failed to contact Gemini API' } });
}
