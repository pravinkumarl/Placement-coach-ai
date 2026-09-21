/* ============================================================
   Placement Coach — Global JavaScript
   Sidebar, Dark Mode, Chatbot Widget, Counters, AOS init
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initSidebar();
  initSidebarProfileSync();
  initChatbotWidget();
  initCountUpAnimations();
  initNavbarScroll();
  initPasswordStrength();
  initFormValidation();
  initReadinessGauge();
  initToasts();
  initInterviewModalChat();

  // AOS.js
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 700,
      easing: 'ease-out-cubic',
      once: true,
      offset: 80,
    });
  }
});

/* ============================================================
   DARK MODE
   ============================================================ */
function initDarkMode() {
  const saved = localStorage.getItem('pc-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.documentElement.setAttribute('data-bs-theme', saved);

  document.querySelectorAll('.dark-mode-toggle, #themeToggleBtn').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-bs-theme') || document.documentElement.getAttribute('data-theme');
      const newTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      document.documentElement.setAttribute('data-bs-theme', newTheme);
      localStorage.setItem('pc-theme', newTheme);
      // Update chart colors if any
      updateChartTheme(newTheme);
    });
  });
}

function updateChartTheme(theme) {
  if (typeof Chart === 'undefined') return;
  const textColor = theme === 'dark' ? '#E2E8F0' : '#1E293B';
  const gridColor = theme === 'dark' ? 'rgba(226,232,240,0.1)' : 'rgba(0,0,0,0.06)';

  Chart.helpers.each(Chart.instances, (chart) => {
    if (!chart) return;
    const scales = chart.options.scales || {};
    Object.values(scales).forEach(scale => {
      if (scale.ticks) scale.ticks.color = textColor;
      if (scale.grid) scale.grid.color = gridColor;
      if (scale.pointLabels) scale.pointLabels.color = textColor;
    });
    if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
      chart.options.plugins.legend.labels.color = textColor;
    }
    chart.update('none');
  });
}

/* ============================================================
   SIDEBAR (offcanvas on mobile)
   ============================================================ */
function initSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  const toggleBtn = document.querySelector('.sidebar-toggle');

  if (!sidebar) return;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
      if (overlay) overlay.classList.toggle('show');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    });
  }

  // Close sidebar on nav link click (mobile)
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 992) {
        sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
      }
    });
  });
}

/* ============================================================
   SIDEBAR PROFILE SYNC (from localStorage)
   ============================================================ */
function initSidebarProfileSync() {
  const savedName = localStorage.getItem('pc_student_name');
  const savedAvatar = localStorage.getItem('pc_student_avatar');
  const savedDegree = localStorage.getItem('pc_student_degree');

  if (savedName) {
    document.querySelectorAll('.sidebar-user .user-name, #sidebarUserName').forEach(el => {
      el.textContent = savedName;
    });
  }

  if (savedDegree) {
    document.querySelectorAll('.sidebar-user .user-role, #sidebarUserRole').forEach(el => {
      el.textContent = savedDegree;
    });
  }

  if (savedAvatar) {
    document.querySelectorAll('.user-avatar-img').forEach(img => {
      img.src = savedAvatar;
    });
    document.querySelectorAll('.sidebar-user .user-avatar').forEach(av => {
      if (!av.querySelector('img')) {
        av.innerHTML = `<img src="${savedAvatar}" alt="Avatar" class="user-avatar-img w-100 h-100 object-fit-cover rounded-circle">`;
      }
    });
  }
}

/* ============================================================
   PROOF COUNTERS & COUNT-UP ANIMATION (requestAnimationFrame)
   ============================================================ */
function initCountUpAnimations() {
  const counters = document.querySelectorAll('[data-countup]');
  if (!counters.length) return;

  const animateCounter = (el) => {
    const target = parseFloat(el.getAttribute('data-countup'));
    const suffix = el.getAttribute('data-suffix') || '';
    const prefix = el.getAttribute('data-prefix') || '';
    const isK = el.getAttribute('data-format') === 'k';
    const duration = 1800;
    const startTime = performance.now();

    const updateCount = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Cubic ease-out
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(ease * target);

      if (isK && current >= 1000) {
        el.textContent = prefix + (current / 1000).toFixed(0) + 'k' + suffix;
      } else {
        el.textContent = prefix + current.toLocaleString() + suffix;
      }

      if (progress < 1) {
        requestAnimationFrame(updateCount);
      } else {
        if (isK && target >= 1000) {
          el.textContent = prefix + (target / 1000).toFixed(0) + 'k' + suffix;
        } else {
          el.textContent = prefix + target.toLocaleString() + suffix;
        }
      }
    };

    requestAnimationFrame(updateCount);
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });

    counters.forEach(c => observer.observe(c));
  } else {
    counters.forEach(animateCounter);
  }
}

/* ============================================================
   CHATBOT WIDGET
   ============================================================ */
function initChatbotWidget() {
  const fab = document.querySelector('.chatbot-fab');
  const panel = document.querySelector('.chatbot-panel');
  const closeBtn = document.querySelector('.panel-close');

  if (!fab || !panel) return;

  fab.addEventListener('click', () => {
    const isOpen = panel.classList.contains('show');
    if (isOpen) {
      panel.classList.remove('show');
      fab.classList.remove('active');
      fab.innerHTML = '<i class="bi bi-chat-dots-fill"></i>';
    } else {
      panel.classList.add('show');
      fab.classList.add('active');
      fab.innerHTML = '<i class="bi bi-x-lg"></i>';
      // Scroll chat to bottom
      const messages = panel.querySelector('.chat-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('show');
      fab.classList.remove('active');
      fab.innerHTML = '<i class="bi bi-chat-dots-fill"></i>';
    });
  }

  // Quick reply chips
  panel.querySelectorAll('.quick-reply-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = panel.querySelector('.chat-input-bar input');
      if (input) {
        input.value = chip.textContent.trim();
        input.focus();
      }
    });
  });

  // Send message
  const sendBtn = panel.querySelector('.btn-send');
  const chatInput = panel.querySelector('.chat-input-bar input');
  const messagesContainer = panel.querySelector('.chat-messages');

  const widgetHistory = [];

  if (sendBtn && chatInput && messagesContainer) {
    const sendWidgetMessage = async () => {
      const text = chatInput.value.trim();
      if (!text) return;

      // Add user message
      const userRow = document.createElement('div');
      userRow.className = 'chat-message-row user-row';
      userRow.innerHTML = `
        <div class="chat-bubble user">
          ${escapeHtml(text)}
          <span class="bubble-time">Just now</span>
        </div>
        <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" alt="Student" class="img-fluid rounded-circle shadow-sm ms-2 chat-user-avatar" style="width: 32px; height: 32px; object-fit: cover; flex-shrink: 0;">
      `;
      messagesContainer.appendChild(userRow);
      chatInput.value = '';

      // Add typing indicator
      const typingRow = document.createElement('div');
      typingRow.className = 'chat-message-row';
      typingRow.innerHTML = `
        <div class="chat-avatar ai-avatar"><i class="bi bi-robot"></i></div>
        <div class="chat-bubble ai d-flex align-items-center gap-1 py-2 px-3">
          <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true"></span>
          <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true" style="animation-delay: 0.15s;"></span>
          <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true" style="animation-delay: 0.3s;"></span>
          <small class="text-muted ms-1" style="font-size: 0.78rem;">AI Coach is typing...</small>
        </div>
      `;
      messagesContainer.appendChild(typingRow);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      widgetHistory.push({ role: 'user', parts: [{ text }] });

      try {
        let replyText = '';
        if (window.GeminiService && GeminiService.getApiKey()) {
          const systemPrompt = `You are a concise, supportive AI Placement Coach widget assistant. Give brief, punchy, and actionable placement advice in 2-3 short sentences.`;
          replyText = await GeminiService.callGemini(widgetHistory, systemPrompt);
        } else {
          replyText = "Based on your current readiness score (73%), focus on practicing Dynamic Programming and SQL subqueries this week!";
        }

        widgetHistory.push({ role: 'model', parts: [{ text: replyText }] });

        typingRow.remove();
        const aiRow = document.createElement('div');
        aiRow.className = 'chat-message-row';
        const formatted = window.GeminiService ? GeminiService.renderMarkdown(replyText) : escapeHtml(replyText);
        aiRow.innerHTML = `
          <div class="chat-avatar ai-avatar"><i class="bi bi-robot"></i></div>
          <div class="chat-bubble ai">
            ${formatted}
            <span class="bubble-time">Just now</span>
          </div>
        `;
        messagesContainer.appendChild(aiRow);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      } catch (err) {
        console.error('Gemini widget error:', err);
        typingRow.remove();
        const errRow = document.createElement('div');
        errRow.className = 'chat-message-row';
        errRow.innerHTML = `
          <div class="chat-avatar ai-avatar text-danger"><i class="bi bi-exclamation-triangle"></i></div>
          <div class="chat-bubble ai text-danger">
            Sorry, I encountered an issue connecting to Gemini: ${escapeHtml(err.message || 'Network error')}.
            <span class="bubble-time">Just now</span>
          </div>
        `;
        messagesContainer.appendChild(errRow);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };

    sendBtn.addEventListener('click', sendWidgetMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendWidgetMessage();
    });
  }
}

/* ============================================================
   COUNT-UP ANIMATION
   ============================================================ */
function initCountUpAnimations() {
  const counters = document.querySelectorAll('[data-countup]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.counted) {
        entry.target.dataset.counted = 'true';
        animateCounter(entry.target);
      }
    });
  }, { threshold: 0.3 });

  counters.forEach(counter => observer.observe(counter));
}

function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-countup'), 10);
  const suffix = el.getAttribute('data-suffix') || '';
  const prefix = el.getAttribute('data-prefix') || '';
  const duration = 2000;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);
    el.textContent = prefix + current.toLocaleString() + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/* ============================================================
   NAVBAR SCROLL EFFECT (Landing page)
   ============================================================ */
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar-landing');
  if (!navbar) return;

  const onScroll = () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ============================================================
   PASSWORD STRENGTH METER
   ============================================================ */
function initPasswordStrength() {
  const passwordInput = document.getElementById('passwordInput');
  const strengthBar = document.querySelector('.password-strength-bar');

  if (!passwordInput || !strengthBar) return;

  passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;
    let strength = 0;
    if (val.length >= 6) strength++;
    if (val.length >= 10) strength++;
    if (/[A-Z]/.test(val)) strength++;
    if (/[0-9]/.test(val)) strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;

    const percent = (strength / 5) * 100;
    let color = 'var(--clr-danger)';
    if (strength >= 4) color = 'var(--clr-success)';
    else if (strength >= 3) color = 'var(--clr-warning)';

    strengthBar.style.width = percent + '%';
    strengthBar.style.background = color;
  });
}

/* ============================================================
   FORM VALIDATION (Login/Signup)
   ============================================================ */
function initFormValidation() {
  const forms = document.querySelectorAll('.needs-validation');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
      }
      form.classList.add('was-validated');
    }, false);
  });
}

/* ============================================================
   READINESS GAUGE (SVG animation)
   ============================================================ */
function initReadinessGauge() {
  const gauge = document.querySelector('.readiness-gauge');
  if (!gauge) return;

  const fill = gauge.querySelector('.gauge-fill');
  const scoreEl = gauge.querySelector('.gauge-score');
  if (!fill || !scoreEl) return;

  const score = parseInt(gauge.getAttribute('data-score') || '0', 10);
  const circumference = 2 * Math.PI * 90; // r=90

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const offset = circumference - (score / 100) * circumference;
        fill.style.strokeDashoffset = offset;

        // Animate score text
        animateCounter(scoreEl);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  observer.observe(gauge);
}

/* ============================================================
   TOASTS (auto-show)
   ============================================================ */
function initToasts() {
  document.querySelectorAll('.toast[data-bs-autohide="true"], .toast.auto-show').forEach(toastEl => {
    setTimeout(() => {
      const toast = new bootstrap.Toast(toastEl, { delay: 6000 });
      toast.show();
    }, 1500);
  });
}

/* ============================================================
   CHART.JS HELPERS
   ============================================================ */
function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    primary: isDark ? '#818CF8' : '#4F46E5',
    primaryLight: isDark ? 'rgba(129,140,248,0.15)' : 'rgba(79,70,229,0.1)',
    success: isDark ? '#34D399' : '#10B981',
    warning: isDark ? '#FBBF24' : '#F59E0B',
    danger: isDark ? '#F87171' : '#EF4444',
    text: isDark ? '#E2E8F0' : '#1E293B',
    textMuted: isDark ? '#64748B' : '#94A3B8',
    grid: isDark ? 'rgba(226,232,240,0.08)' : 'rgba(0,0,0,0.05)',
    surface: isDark ? '#1E293B' : '#FFFFFF',
  };
}

function createGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

/* ============================================================
   CONFETTI ANIMATION
   ============================================================ */
function triggerConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#4F46E5', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#EC4899'];

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 1.5 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 4000);
}

/* ============================================================
   UTILITY
   ============================================================ */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* Assessment tab filter */
function initAssessmentTabs() {
  const tabs = document.querySelectorAll('[data-filter-tab]');
  const cards = document.querySelectorAll('[data-category]');

  if (!tabs.length || !cards.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.getAttribute('data-filter-tab');
      cards.forEach(card => {
        if (filter === 'all' || card.getAttribute('data-category') === filter) {
          card.style.display = '';
          card.style.animation = 'bubbleFadeIn 0.3s ease';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

/* Mock Simulation company select */
function selectCompany(card) {
  document.querySelectorAll('.company-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  const simSection = document.getElementById('simulationSection');
  if (simSection) {
    simSection.style.display = 'block';
    simSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* Mark roadmap item as done */
function markAsDone(btn) {
  const item = btn.closest('.roadmap-item');
  const dot = item.querySelector('.roadmap-dot');

  if (dot.classList.contains('completed')) return;

  dot.classList.remove('in-progress', 'upcoming');
  dot.classList.add('completed');
  dot.innerHTML = '<i class="bi bi-check-lg"></i>';

  btn.textContent = 'Completed';
  btn.classList.remove('btn-primary-custom');
  btn.classList.add('btn', 'btn-outline-success');
  btn.disabled = true;

  // Confetti for completion
  triggerConfetti();
}

/* Full-page chat send (chat.html) */
function initFullPageChat() {
  const sendBtn = document.querySelector('.full-chat .btn-send');
  const chatInput = document.querySelector('.full-chat .chat-input-bar input');
  const messagesContainer = document.querySelector('.full-chat .chat-messages');
  const newChatBtn = document.getElementById('newChatBtn') || document.querySelector('.full-chat .header-actions .btn-icon');

  if (!sendBtn || !chatInput || !messagesContainer) return;

  const conversationHistory = [];
  const systemPrompt = `You are an expert AI Placement Coach for a college student named Rahul Sharma (4th Year CSE).
Current Student Stats:
- Readiness: 73% (Target: 85% for Placement Ready badge)
- Weak areas: Dynamic Programming (35%), Graphs (30%), System Design (60%)
- Strong areas: DBMS/SQL (62%), Trees, Verbal Ability
- Last mock interview: 65% (Good communication, needs improvement in problem decomposition and edge cases)

When responding:
- Address the student's question directly with clear, actionable advice.
- Use clean Markdown (bullet points, bold highlights, concise code snippets when appropriate).
- If recommending next steps, suggest realistic practice routines or conceptual breakdowns.
- Keep the tone encouraging, professional, and practical.`;

  const sendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text) return;

    // Append user message
    const userRow = document.createElement('div');
    userRow.className = 'chat-message-row user-row';
    userRow.innerHTML = `
      <div class="chat-bubble user">
        ${escapeHtml(text)}
        <span class="bubble-time">Just now</span>
      </div>
      <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" alt="Student" class="img-fluid rounded-circle shadow-sm ms-2 chat-user-avatar" style="width: 34px; height: 34px; object-fit: cover; flex-shrink: 0;">
    `;
    messagesContainer.appendChild(userRow);
    chatInput.value = '';

    // Typing indicator with Bootstrap spinners
    const typingRow = document.createElement('div');
    typingRow.className = 'chat-message-row';
    typingRow.innerHTML = `
      <div class="chat-avatar ai-avatar"><i class="bi bi-robot"></i></div>
      <div class="chat-bubble ai d-flex align-items-center gap-1 py-2 px-3">
        <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true"></span>
        <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true" style="animation-delay: 0.15s;"></span>
        <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true" style="animation-delay: 0.3s;"></span>
        <small class="text-muted ms-1" style="font-size: 0.85rem;">AI Placement Coach is analyzing with Gemini...</small>
      </div>
    `;
    messagesContainer.appendChild(typingRow);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    conversationHistory.push({ role: 'user', parts: [{ text }] });

    try {
      let replyText = '';
      if (window.GeminiService && GeminiService.getApiKey()) {
        replyText = await GeminiService.callGemini(conversationHistory, systemPrompt);
      } else {
        replyText = "I'm ready to coach you! Please ensure the GEMINI_API_KEY is configured in `config.js` to enable live reasoning.";
      }

      conversationHistory.push({ role: 'model', parts: [{ text: replyText }] });

      typingRow.remove();
      const aiRow = document.createElement('div');
      aiRow.className = 'chat-message-row';
      const renderedHtml = window.GeminiService ? GeminiService.renderMarkdown(replyText) : escapeHtml(replyText);
      aiRow.innerHTML = `
        <div class="chat-avatar ai-avatar"><i class="bi bi-mortarboard-fill"></i></div>
        <div class="chat-bubble ai">
          ${renderedHtml}
          <span class="bubble-time">Just now</span>
        </div>
      `;
      messagesContainer.appendChild(aiRow);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (err) {
      console.error('Gemini chat error:', err);
      typingRow.remove();
      const errRow = document.createElement('div');
      errRow.className = 'chat-message-row';
      errRow.innerHTML = `
        <div class="chat-avatar ai-avatar text-danger"><i class="bi bi-exclamation-octagon-fill"></i></div>
        <div class="chat-bubble ai border border-danger-subtle bg-danger-subtle text-danger-emphasis">
          <strong>Connection Error:</strong> ${escapeHtml(err.message || 'Failed to generate response')}.
          <br><small class="text-muted">Please check your network and Gemini API key.</small>
          <span class="bubble-time">Just now</span>
        </div>
      `;
      messagesContainer.appendChild(errRow);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Quick reply chips
  document.querySelectorAll('.full-chat .quick-reply-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.textContent.trim();
      sendMessage();
    });
  });

  // New Chat button
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      conversationHistory.length = 0;
      messagesContainer.innerHTML = `
        <div class="chat-message-row">
          <div class="chat-avatar ai-avatar"><i class="bi bi-mortarboard-fill"></i></div>
          <div class="chat-bubble ai">
            Hello Rahul! I'm your Gemini-powered AI Placement Coach. How can I help you today?
            <br><br>
            We can review your weak topics (Dynamic Programming & Graphs), practice mock interview questions, tailor your STAR behavioral stories, or build your 3-week sprint to hit 85% readiness.
            <span class="bubble-time">Just now</span>
          </div>
        </div>
      `;
      messagesContainer.scrollTop = 0;
    });
  }
}

/* Mock simulation interview modal interactive chat */
function initInterviewModalChat() {
  const modal = document.getElementById('interviewModal');
  if (!modal) return;

  const sendBtn = modal.querySelector('.btn-send');
  const chatInput = modal.querySelector('.chat-input-bar input');
  const messagesContainer = modal.querySelector('.chat-messages');

  if (!sendBtn || !chatInput || !messagesContainer) return;

  const interviewHistory = [];
  const interviewSystemPrompt = `You are a Senior Technical Interviewer conducting a Technical Interview for Google Software Development Engineer (SDE).
Candidate: Rahul Sharma (Final Year CSE).
Assess their answer critically like a real Google interviewer.
1. Give brief, sharp, constructive feedback on their answer (mention strengths, missing edge cases, or design bottlenecks).
2. Ask one relevant, challenging technical follow-up question (Algorithms, Big-O, System Design, or Concurrency).
Keep your tone professional, crisp, and realistic.`;

  const sendAnswer = async () => {
    const text = chatInput.value.trim();
    if (!text) return;

    const userRow = document.createElement('div');
    userRow.className = 'chat-message-row user-row';
    userRow.innerHTML = `
      <div class="chat-bubble user">
        ${escapeHtml(text)}
        <span class="bubble-time">Just now</span>
      </div>
    `;
    messagesContainer.appendChild(userRow);
    chatInput.value = '';

    const typingRow = document.createElement('div');
    typingRow.className = 'chat-message-row';
    typingRow.innerHTML = `
      <div class="chat-avatar ai-avatar"><i class="bi bi-robot"></i></div>
      <div class="chat-bubble ai d-flex align-items-center gap-1 py-2 px-3">
        <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true"></span>
        <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true" style="animation-delay: 0.15s;"></span>
        <span class="spinner-grow spinner-grow-sm text-primary" role="status" aria-hidden="true" style="animation-delay: 0.3s;"></span>
        <small class="text-muted ms-1" style="font-size: 0.8rem;">Interviewer is evaluating...</small>
      </div>
    `;
    messagesContainer.appendChild(typingRow);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    interviewHistory.push({ role: 'user', parts: [{ text }] });

    try {
      let reply = '';
      if (window.GeminiService && GeminiService.getApiKey()) {
        reply = await GeminiService.callGemini(interviewHistory, interviewSystemPrompt);
      } else {
        reply = "Good point. How would you handle distributed locking if multiple workers attempt to update the same record?";
      }

      interviewHistory.push({ role: 'model', parts: [{ text: reply }] });

      typingRow.remove();
      const aiRow = document.createElement('div');
      aiRow.className = 'chat-message-row';
      const formatted = window.GeminiService ? GeminiService.renderMarkdown(reply) : escapeHtml(reply);
      aiRow.innerHTML = `
        <div class="chat-avatar ai-avatar"><i class="bi bi-robot"></i></div>
        <div class="chat-bubble ai">
          ${formatted}
          <span class="bubble-time">Just now</span>
        </div>
      `;
      messagesContainer.appendChild(aiRow);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (err) {
      console.error('Interview Gemini error:', err);
      typingRow.remove();
      const errRow = document.createElement('div');
      errRow.className = 'chat-message-row';
      errRow.innerHTML = `
        <div class="chat-avatar ai-avatar text-danger"><i class="bi bi-exclamation-circle"></i></div>
        <div class="chat-bubble ai text-danger">
          Interviewer connection error: ${escapeHtml(err.message || 'Failed')}.
          <span class="bubble-time">Just now</span>
        </div>
      `;
      messagesContainer.appendChild(errRow);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  sendBtn.addEventListener('click', sendAnswer);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAnswer();
  });
}

/* Chat sidebar toggle for mobile */
function toggleChatSidebar() {
  const sidebar = document.querySelector('.chat-sidebar');
  if (sidebar) sidebar.classList.toggle('show');
}

/* Timer for live assessment */
function initAssessmentTimer() {
  const timerFill = document.querySelector('.timer-bar-fill');
  const timerText = document.getElementById('timerText');
  if (!timerFill || !timerText) return;

  let totalSeconds = 45 * 60; // 45 minutes
  let remaining = totalSeconds;

  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      remaining = 0;
    }

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const percent = ((totalSeconds - remaining) / totalSeconds) * 100;
    timerFill.style.width = percent + '%';

    // Color change when low
    if (remaining < 300) { // < 5 min
      timerText.classList.add('text-danger');
    }
  }, 1000);
}

/* Question navigation for live assessment */
function navigateQuestion(direction) {
  const panels = document.querySelectorAll('.question-panel');
  const current = document.querySelector('.question-panel.active');
  if (!current || !panels.length) return;

  let idx = Array.from(panels).indexOf(current);
  if (direction === 'next' && idx < panels.length - 1) idx++;
  else if (direction === 'prev' && idx > 0) idx--;

  panels.forEach(p => p.classList.remove('active'));
  panels[idx].classList.add('active');

  // Update progress
  const progress = document.getElementById('questionProgress');
  if (progress) {
    const pct = ((idx + 1) / panels.length) * 100;
    progress.style.width = pct + '%';
    progress.setAttribute('aria-valuenow', pct);
  }

  const counter = document.getElementById('questionCounter');
  if (counter) counter.textContent = `Question ${idx + 1} of ${panels.length}`;

  // Prev/Next button states
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.disabled = (idx === 0);
  if (nextBtn) {
    if (idx === panels.length - 1) {
      nextBtn.textContent = 'Submit';
      nextBtn.onclick = () => {
        const modal = new bootstrap.Modal(document.getElementById('submitModal'));
        modal.show();
      };
    } else {
      nextBtn.innerHTML = 'Next <i class="bi bi-arrow-right"></i>';
      nextBtn.onclick = () => navigateQuestion('next');
    }
  }
}
