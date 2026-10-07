/* ============================================================
   Placement Coach — Frontend API client
   Talks to the Express/MongoDB backend. JWT is stored in
   localStorage and sent as `Authorization: Bearer <token>`.
   The Gemini API key NEVER reaches the browser.
   ============================================================ */
(function () {
  'use strict';

  const TOKEN_KEY = 'pc_auth_token';
  const USER_KEY = 'pc_auth_user';
  const DEV_FALLBACK = 'http://localhost:5000';

  function resolveBase() {
    const configured = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || '';
    if (configured) return String(configured).replace(/\/+$/, '');

    const origin = window.location.origin;
    if (!origin || origin === 'null' || /^file:/.test(window.location.protocol)) {
      return DEV_FALLBACK;
    }
    return origin;
  }

  const BASE = resolveBase();

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      /* storage unavailable (private mode) */
    }
  }

  function updateUserCache(user) {
    if (!user) return;
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (user.name) localStorage.setItem('pc_student_name', user.name);
      if (user.avatar) localStorage.setItem('pc_student_avatar', user.avatar);
      const degreeLabel = [user.branch || user.degree, user.graduationYear]
        .filter(Boolean)
        .join(', ');
      if (degreeLabel) localStorage.setItem('pc_student_degree', degreeLabel);
    } catch (e) {
      /* ignore */
    }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('pc_student_name');
      localStorage.removeItem('pc_student_avatar');
      localStorage.removeItem('pc_student_degree');
      // Legacy client side AI key — superseded by server side configuration.
      localStorage.removeItem('GEMINI_API_KEY');
    } catch (e) {
      /* ignore */
    }
  }

  async function request(method, path, body, options) {
    const opts = options || {};
    const headers = { Accept: 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';

    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    let response;
    try {
      response = await fetch(BASE + path, {
        method,
        headers,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const error = new Error(
        'Cannot reach the Placement Coach server. Make sure the backend is running (npm start).'
      );
      error.network = true;
      throw error;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      const error = new Error(
        (data && data.message) || 'Request failed with status ' + response.status
      );
      error.status = response.status;
      error.data = data;
      if (response.status === 401 && opts.handleUnauthorized !== false) {
        clearSession();
      }
      throw error;
    }

    return data;
  }

  const api = {
    base: BASE,
    getToken,
    setSession,
    updateUserCache,
    clearSession,
    getUser,
    request,
    get: (path, options) => request('GET', path, undefined, options),
    post: (path, body, options) => request('POST', path, body, options),
    patch: (path, body, options) => request('PATCH', path, body, options),
    put: (path, body, options) => request('PUT', path, body, options),
    del: (path, options) => request('DELETE', path, undefined, options),

    // Convenience helpers for common flows
    register: (payload) => request('POST', '/api/auth/register', payload),
    login: (payload) => request('POST', '/api/auth/login', payload),
    logout: () => request('POST', '/api/auth/logout', null, { handleUnauthorized: false }),
    me: () => request('GET', '/api/auth/me'),
    health: () => request('GET', '/api/health', undefined, { handleUnauthorized: false }),

    isAuthenticated: () => !!getToken(),
  };

  window.API = api;
})();
