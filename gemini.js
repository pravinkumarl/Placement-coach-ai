/**
 * Gemini AI Service for Placement Coach
 * Connects to Google Generative Language API using Gemini 3.6 / 3.8 Flash
 */

const GEMINI_CONFIG = {
  primaryModel: 'gemini-3.6-flash',
  fallbackModel: 'gemini-3.8-flash',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  defaultSystemPrompt: `You are an expert, encouraging, and highly knowledgeable AI Placement Coach for university students and job seekers.
Your purpose is to help students crack campus placements and tech interviews (SDE, Data Analyst, Cloud, QA, Core engineering).
Key capabilities:
- Data Structures & Algorithms (DP, Trees, Graphs, Sorting, etc.) with clean code and Big-O analysis.
- System Design (HLD, LLD, Database scaling, Caching, Microservices).
- Core CS fundamentals: DBMS & SQL, Operating Systems, Computer Networks, OOPs.
- Quantitative Aptitude, Logical Reasoning, and Verbal Ability tips.
- Behavioral & HR questions using the STAR framework (Situation, Task, Action, Result).
- Resume review, personalized study plans, and mock interview practice.

Guidelines:
- Give clear, structured, and actionable answers. Use markdown formatting (bolding, lists, code blocks).
- Be supportive, realistic, and enthusiastic about student growth.
- Keep answers focused and avoid unnecessarily long boilerplate unless asked.
`
};

/**
 * Get active Gemini API Key
 */
function getGeminiApiKey() {
  if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '' && !GEMINI_API_KEY.includes('YOUR_GEMINI_API_KEY')) {
    return GEMINI_API_KEY.trim();
  }
  const stored = localStorage.getItem('GEMINI_API_KEY');
  if (stored && stored.trim() !== '') {
    return stored.trim();
  }
  return '';
}

/**
 * Check if Gemini service has access (either local API key or serverless proxy)
 */
function hasGeminiAccess() {
  return !!getGeminiApiKey() || window.location.protocol.startsWith('http');
}

/**
 * Render Markdown safely into HTML
 */
function renderMarkdown(text) {
  if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
    try {
      return marked.parse(text);
    } catch (e) {
      console.warn('Marked parse error:', e);
    }
  }

  // Fallback simple markdown parser
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks ```code```
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-dark text-light p-3 rounded my-2"><code>$1</code></pre>');
  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-light text-danger px-1 rounded">$1</code>');
  // Bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Newlines to <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Call Gemini API with conversational history
 * Supports direct client call (if API key present) or Vercel serverless /api/gemini proxy
 * @param {Array<{role: 'user'|'model', parts: Array<{text: string}>}>} contents
 * @param {string} customSystemPrompt
 * @returns {Promise<string>}
 */
async function callGemini(contents, customSystemPrompt) {
  const apiKey = getGeminiApiKey();
  const systemInstruction = customSystemPrompt || GEMINI_CONFIG.defaultSystemPrompt;

  // 1. Direct Client API Key (if provided via config.js or localStorage)
  if (apiKey) {
    const makeRequest = async (model) => {
      const url = `${GEMINI_CONFIG.baseUrl}/${model}:generateContent?key=${apiKey}`;
      const payload = {
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        const err = new Error(msg);
        err.status = response.status;
        err.details = errorData;
        throw err;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (!candidate || !candidate.content?.parts?.length) {
        throw new Error('Gemini did not return any candidate response.');
      }

      return candidate.content.parts.map(p => p.text || '').join('');
    };

    try {
      return await makeRequest(GEMINI_CONFIG.primaryModel);
    } catch (err) {
      console.warn(`Primary model ${GEMINI_CONFIG.primaryModel} failed:`, err.message);
      if (err.status === 404 || err.status === 400) {
        console.info(`Attempting fallback to ${GEMINI_CONFIG.fallbackModel}...`);
        return await makeRequest(GEMINI_CONFIG.fallbackModel);
      }
      throw err;
    }
  }

  // 2. Serverless /api/gemini Proxy (e.g. deployed on Vercel)
  if (window.location.protocol.startsWith('http')) {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          systemPrompt: systemInstruction
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const candidate = data.candidates?.[0];
        if (candidate && candidate.content?.parts?.length) {
          return candidate.content.parts.map(p => p.text || '').join('');
        }
      } else {
        const errMsg = data.error?.message || `Serverless API error HTTP ${response.status}`;
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error('Serverless proxy error:', err);
      throw err;
    }
  }

  throw new Error('No Gemini API key found. Please set your key in config.js or configure GEMINI_API_KEY in Vercel Environment Variables.');
}

window.GeminiService = {
  getApiKey: getGeminiApiKey,
  hasAccess: hasGeminiAccess,
  callGemini,
  renderMarkdown,
  config: GEMINI_CONFIG
};
