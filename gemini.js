/**
 * Gemini AI client for Placement Coach.
 *
 * All Gemini calls are proxied through the Placement Coach backend
 * (`POST /api/chat/gemini`) so the API key stays on the server.
 * The browser never holds a Gemini key — any previously stored key in
 * localStorage is ignored and removed by the auth guard.
 */

const GEMINI_CONFIG = {
  primaryModel: 'gemini-3.6-flash',
  fallbackModel: 'gemini-3.8-flash',
  baseUrl: '/api/chat/gemini',
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
`,
};

/**
 * Kept for backwards compatibility: the client no longer stores a key.
 * @returns {string} always an empty string
 */
function getGeminiApiKey() {
  try {
    localStorage.removeItem('GEMINI_API_KEY');
  } catch (e) {
    /* storage unavailable */
  }
  return '';
}

/**
 * AI access now depends on the signed in session + server configuration.
 */
function hasGeminiAccess() {
  if (window.API) return API.isAuthenticated();
  return window.location.protocol.startsWith('http');
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

  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-dark text-light p-3 rounded my-2"><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-light text-danger px-1 rounded">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

async function postJson(url, body) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (window.API && API.getToken()) headers.Authorization = 'Bearer ' + API.getToken();

  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error('Cannot reach the Placement Coach server. Is the backend running?');
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    if (window.API) API.clearSession();
    throw new Error('Your session expired. Please sign in again.');
  }
  if (!response.ok) {
    if (response.status === 401 && window.API) API.clearSession();
    throw new Error(data && data.message ? data.message : `AI request failed (HTTP ${response.status}).`);
  }

  return data;
}

/**
 * Call the coach through the backend proxy with conversational history.
 * @param {Array<{role: 'user'|'model', parts: Array<{text: string}>}>} contents
 * @param {string} customSystemPrompt
 * @returns {Promise<string>}
 */
async function callGemini(contents, customSystemPrompt) {
  const systemPrompt = customSystemPrompt || GEMINI_CONFIG.defaultSystemPrompt;
  const base = (window.API && API.base) || '';
  const url = base + GEMINI_CONFIG.baseUrl;

  const data = await postJson(url, { contents, systemPrompt });
  const text = data && data.data ? data.data.text : '';

  if (!text) {
    throw new Error('The AI coach returned an empty response. Please try again.');
  }
  return text;
}

/**
 * Report whether the server side AI is reachable (used by the chat status modal).
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function checkAiStatus() {
  if (!window.API || !API.isAuthenticated()) {
    return { ok: false, message: 'Sign in to use the AI coach.' };
  }
  try {
    await API.health();
    return { ok: true, message: 'Backend connected. AI requests are handled securely on the server.' };
  } catch (e) {
    return { ok: false, message: e.message || 'Backend unreachable.' };
  }
}

window.GeminiService = {
  getApiKey: getGeminiApiKey,
  hasAccess: hasGeminiAccess,
  callGemini,
  renderMarkdown,
  checkAiStatus,
  config: GEMINI_CONFIG,
};
