/* ============================================================
   Placement Coach — Auth guard
   • Redirects signed-out visitors away from protected pages
   • Refreshes the signed in user and syncs the sidebar
   • Wires logout controls
   • Removes the legacy browser stored Gemini API key
   ============================================================ */
(function () {
  'use strict';

  const PUBLIC_PAGES = ['index', 'login', 'signup', '404'];
  const LOGIN_URL = 'login.html';

  function currentPage() {
    const file = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return file.replace(/\.html?$/, '') || 'index';
  }

  function isPublicPage() {
    return PUBLIC_PAGES.indexOf(currentPage()) !== -1;
  }

  function redirectToLogin() {
    const next = encodeURIComponent(
      window.location.pathname.split('/').pop() + window.location.search
    );
    window.location.replace(`${LOGIN_URL}?next=${next}`);
  }

  function goToDashboardIfLoggedIn() {
    if (window.API && API.isAuthenticated()) {
      window.location.replace('dashboard.html');
    }
  }

  function syncSidebar(user) {
    if (!user) return;
    API.updateUserCache(user);

    const name = user.name || '';
    const role = [user.branch || user.degree, user.graduationYear].filter(Boolean).join(', ');

    if (name) {
      document.querySelectorAll('.sidebar-user .user-name, #sidebarUserName').forEach((el) => {
        el.textContent = name;
      });
    }
    if (role) {
      document.querySelectorAll('.sidebar-user .user-role, #sidebarUserRole').forEach((el) => {
        el.textContent = role + ' • Edit';
      });
    }
    if (user.avatar) {
      document.querySelectorAll('.user-avatar-img').forEach((img) => {
        img.src = user.avatar;
        img.alt = name;
      });
    }
    document.querySelectorAll('.sidebar-user .user-name, #sidebarUserName').forEach((el) => {
      el.setAttribute('title', user.email || '');
    });
  }

  function wireLogout() {
    document.querySelectorAll('[data-logout]').forEach((el) => {
      el.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
          if (window.API && API.isAuthenticated()) await API.logout();
        } catch (e) {
          /* token already invalid — clear locally anyway */
        }
        API.clearSession();
        window.location.replace('index.html');
      });
    });
  }

  async function bootstrap() {
    // Legacy: never keep a browser side AI key around.
    try {
      localStorage.removeItem('GEMINI_API_KEY');
    } catch (e) {
      /* ignore */
    }

    wireLogout();

    if (!window.API) {
      console.error('js/api.js must be loaded before js/auth-guard.js');
      return;
    }

    if (isPublicPage()) {
      goToDashboardIfLoggedIn();
      return;
    }

    if (!API.isAuthenticated()) {
      redirectToLogin();
      return;
    }

    try {
      const payload = await API.me();
      syncSidebar(payload.data && payload.data.user);
    } catch (error) {
      if (error.status === 401) {
        API.clearSession();
        redirectToLogin();
        return;
      }
      // Network/server hiccup: keep the cached profile so the page still renders.
      console.warn('Profile refresh failed:', error.message);
      syncSidebar(API.getUser());
    }
  }

  window.AuthGuard = {
    bootstrap,
    logout() {
      API.clearSession();
      window.location.replace('index.html');
    },
    requireAuth() {
      if (!API.isAuthenticated()) {
        redirectToLogin();
        return false;
      }
      return true;
    },
    syncSidebar,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
