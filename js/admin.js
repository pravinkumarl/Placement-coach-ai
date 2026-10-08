/* ============================================================
   Placement Coach — Admin / TPO Portal Controller (js/admin.js)
   Integrates with /api/admin/* endpoints, Chart.js, and modals.
   ============================================================ */
(function () {
  'use strict';

  // Global state
  let charts = {
    distribution: null,
    branches: null,
    weakTopics: null,
    categoryMastery: null,
  };

  let studentState = {
    page: 1,
    limit: 15,
    search: '',
    branch: '',
    minReadiness: '',
    placementStatus: '',
  };

  let questionsState = {
    page: 1,
    limit: 15,
    search: '',
    type: '',
    difficulty: '',
  };

  let activeStudentDrillId = null;

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getTierBadge(score, tier) {
    const s = Math.round(Number(score) || 0);
    if (s >= 85) return `<span class="badge badge-tier-excellent">Excellent (${s}%)</span>`;
    if (s >= 70) return `<span class="badge badge-tier-ready">Ready (${s}%)</span>`;
    if (s >= 55) return `<span class="badge badge-tier-almost">Almost Ready (${s}%)</span>`;
    return `<span class="badge badge-tier-needs">Needs Work (${s}%)</span>`;
  }

  function getStatusPill(status) {
    const st = String(status || 'unplaced').toLowerCase();
    if (st === 'placed') return '<span class="status-pill bg-success-subtle text-success">Placed</span>';
    if (st === 'opted_out') return '<span class="status-pill bg-secondary-subtle text-secondary">Opted Out</span>';
    return '<span class="status-pill bg-warning-subtle text-warning">Unplaced</span>';
  }

  // ======================== NAVIGATION ========================
  window.switchSection = function (sectionId) {
    document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .nav-link').forEach((link) => link.classList.remove('active'));

    const targetSec = document.getElementById(sectionId);
    if (targetSec) {
      targetSec.classList.add('active');
    }

    const navLink = document.querySelector(`[data-target-section="${sectionId}"]`);
    if (navLink) {
      navLink.classList.add('active');
    }

    // Update Topbar Title
    const titleEl = document.getElementById('currentSectionTitle');
    const subtitleEl = document.getElementById('currentSectionSubtitle');
    const titles = {
      'section-overview': ['TPO Overview', 'Institutional Placement Management Dashboard'],
      'section-students': ['Student Directory', 'Candidate Profiles & Placement Tracking'],
      'section-analytics': ['Batch Weakness Analytics', 'Cohort Assessment Bottlenecks & AI Insights'],
      'section-eligibility': ['Drive Eligibility Screener', 'Rule-based Candidate Shortlisting'],
      'section-drives': ['Placement Drives', 'Campus Hiring & Corporate Recruiter Drives'],
      'section-applications': ['Applications Pipeline', 'Recruitment Rounds & Student Status Tracking'],
      'section-assessments': ['Assessment Manager', 'Test Modules, Timing, and Publish Controls'],
      'section-questions': ['Question Bank Repository', 'MCQs, Coding, SQL, and Interview Bank'],
      'section-notifications': ['Institutional Announcements', 'Broadcast Messages & Drive Alerts'],
      'section-logs': ['System Audit Logs', 'Administrative Actions & Security Records'],
    };

    if (titles[sectionId]) {
      if (titleEl) titleEl.textContent = titles[sectionId][0];
      if (subtitleEl) subtitleEl.textContent = titles[sectionId][1];
    }

    // Lazy load specific sections
    if (sectionId === 'section-students') loadStudents();
    if (sectionId === 'section-analytics') loadBatchAnalytics();
    if (sectionId === 'section-drives') loadDrives();
    if (sectionId === 'section-applications') loadApplications();
    if (sectionId === 'section-assessments') loadAssessments();
    if (sectionId === 'section-questions') loadQuestions();
    if (sectionId === 'section-notifications') loadNotifications();
    if (sectionId === 'section-logs') loadLogs();
  };

  function setupNavigation() {
    document.querySelectorAll('[data-target-section]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = el.getAttribute('data-target-section');
        switchSection(target);
        if (window.innerWidth < 992) {
          document.getElementById('sidebar')?.classList.remove('show');
          document.getElementById('sidebarOverlay')?.classList.remove('show');
        }
      });
    });

    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      const activeSec = document.querySelector('.admin-section.active')?.id || 'section-overview';
      switchSection(activeSec);
      if (activeSec === 'section-overview') loadOverview();
    });
  }

  // ======================== OVERVIEW ========================
  async function loadOverview() {
    try {
      const res = await API.get('/api/admin/overview');
      const data = res.data || {};
      const kpis = data.kpis || {};
      const dist = data.distribution || {};
      const branches = data.branchAnalytics || [];
      const attempts = data.recentAttempts || [];

      // Render KPIs
      document.getElementById('kpiTotalStudents').textContent = kpis.totalStudents || 0;
      document.getElementById('kpiAvgReadiness').textContent = `${kpis.avgReadinessScore || 0}%`;
      document.getElementById('kpiReadyStudents').textContent = kpis.placementReadyStudents || 0;
      document.getElementById('kpiNeedsImprovement').textContent = kpis.studentsNeedingImprovement || 0;
      document.getElementById('kpiTotalAttempts').textContent = kpis.totalAssessmentAttempts || 0;
      document.getElementById('kpiActiveDrives').textContent = kpis.activePlacementDrives || 0;

      // Distribution Counts
      document.getElementById('distExc').textContent = dist.excellent || 0;
      document.getElementById('distRdy').textContent = dist.placementReady || 0;
      document.getElementById('distAlm').textContent = dist.almostReady || 0;
      document.getElementById('distNeed').textContent = dist.needsImprovement || 0;

      // Render Distribution Chart
      renderDistributionChart(dist);

      // Render Branch Readiness Chart
      renderBranchChart(branches);

      // Render Recent Attempts
      renderRecentAttempts(attempts);

      // Also trigger batch analytics for AI Insight card
      loadOverviewAiInsight();
    } catch (err) {
      console.warn('Overview load error:', err.message);
    }
  }

  async function loadOverviewAiInsight() {
    try {
      const res = await API.get('/api/admin/analytics');
      const insight = res.data?.aiInsight;
      if (insight) {
        document.getElementById('aiInsightTitle').textContent = insight.summary || 'AI Placement Insight';
        document.getElementById('aiInsightText').textContent = insight.recommendation || 'Batch metrics computed successfully.';
      }
    } catch (e) {
      /* ignore */
    }
  }

  function renderDistributionChart(dist) {
    const canvas = document.getElementById('chartDistribution');
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts.distribution) charts.distribution.destroy();

    const colors = typeof getChartColors === 'function' ? getChartColors() : { text: '#1E293B' };

    charts.distribution = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Excellent (≥85)', 'Ready (70-84)', 'Almost Ready (55-69)', 'Needs Work (<55)'],
        datasets: [
          {
            data: [dist.excellent || 0, dist.placementReady || 0, dist.almostReady || 0, dist.needsImprovement || 0],
            backgroundColor: ['#10B981', '#6366F1', '#F59E0B', '#EF4444'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: colors.text, boxWidth: 12 } },
        },
        cutout: '68%',
      },
    });
  }

  function renderBranchChart(branches) {
    const canvas = document.getElementById('chartBranches');
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts.branches) charts.branches.destroy();

    const colors = typeof getChartColors === 'function' ? getChartColors() : { text: '#1E293B', grid: 'rgba(0,0,0,0.06)' };

    charts.branches = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: branches.map((b) => b.branch || 'Other'),
        datasets: [
          {
            label: 'Avg Readiness (%)',
            data: branches.map((b) => b.avgReadiness || 0),
            backgroundColor: 'rgba(99, 102, 241, 0.85)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: colors.grid },
            ticks: { color: colors.text },
          },
          y: {
            grid: { display: false },
            ticks: { color: colors.text },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  function renderRecentAttempts(attempts) {
    const tbody = document.getElementById('recentAttemptsBody');
    if (!tbody) return;

    if (!attempts.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No assessment attempts recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = attempts.map((a) => {
      const time = a.completedAt ? new Date(a.completedAt).toLocaleString() : 'Just now';
      const pctBadge = a.percentage >= 70 ? 'bg-success-subtle text-success' : a.percentage >= 50 ? 'bg-warning-subtle text-warning' : 'bg-danger-subtle text-danger';
      return `
        <tr>
          <td class="ps-3 ps-md-4">
            <span class="fw-semibold d-block">${escapeHtml(a.studentName)}</span>
            <small class="text-muted">${escapeHtml(a.studentEmail)}</small>
          </td>
          <td>${escapeHtml(a.branch || '—')}</td>
          <td><span class="fw-medium">${escapeHtml(a.title)}</span></td>
          <td><span class="badge ${pctBadge}">${a.percentage}%</span></td>
          <td class="small text-muted">${time}</td>
        </tr>`;
    }).join('');
  }

  // ======================== STUDENT DIRECTORY ========================
  async function loadStudents() {
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Loading students...</td></tr>';

    try {
      const q = new URLSearchParams({
        page: studentState.page,
        limit: studentState.limit,
        search: studentState.search,
        branch: studentState.branch,
        minReadiness: studentState.minReadiness,
        placementStatus: studentState.placementStatus,
      });

      const res = await API.get(`/api/admin/students?${q.toString()}`);
      const data = res.data || {};
      const students = data.students || [];
      const pagination = data.pagination || {};

      renderStudentsTable(students);
      renderStudentsPagination(pagination);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderStudentsTable(students) {
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;

    if (!students.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No students matched the query filters.</td></tr>';
      return;
    }

    tbody.innerHTML = students.map((s) => {
      return `
        <tr onclick="window.openStudentDrillDown('${s._id}')">
          <td class="fw-semibold text-primary">${escapeHtml(s.name)}</td>
          <td><code>${escapeHtml(s.registerNumber || '—')}</code></td>
          <td>${escapeHtml(s.branch || '—')}</td>
          <td>${s.cgpa != null ? s.cgpa : '—'}</td>
          <td class="fw-bold">${s.readinessScore || 0}%</td>
          <td>${getTierBadge(s.readinessScore)}</td>
          <td>${s.attemptsCount || 0}</td>
          <td>${getStatusPill(s.placementStatus)}</td>
          <td class="text-end pe-3">
            <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); window.openStudentDrillDown('${s._id}')">
              <i class="bi bi-eye"></i> View Profile
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function renderStudentsPagination(pagination) {
    const summary = document.getElementById('studentsPaginationSummary');
    const controls = document.getElementById('studentsPaginationControls');
    if (!summary || !controls) return;

    const total = pagination.total || 0;
    const page = pagination.page || 1;
    const totalPages = pagination.totalPages || 1;

    summary.textContent = `Showing page ${page} of ${totalPages} (${total} total students)`;

    let btns = '';
    btns += `<button class="btn btn-sm btn-outline-custom" ${page <= 1 ? 'disabled' : ''} onclick="changeStudentPage(${page - 1})">Previous</button>`;
    btns += `<span class="btn btn-sm btn-outline-custom disabled fw-bold">${page} / ${totalPages}</span>`;
    btns += `<button class="btn btn-sm btn-outline-custom" ${page >= totalPages ? 'disabled' : ''} onclick="changeStudentPage(${page + 1})">Next</button>`;

    controls.innerHTML = btns;
  }

  window.changeStudentPage = function (newPage) {
    studentState.page = newPage;
    loadStudents();
  };

  function setupStudentFilters() {
    let debounceTimer;
    document.getElementById('studentSearchInput')?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        studentState.search = e.target.value.trim();
        studentState.page = 1;
        loadStudents();
      }, 350);
    });

    document.getElementById('studentBranchFilter')?.addEventListener('change', (e) => {
      studentState.branch = e.target.value;
      studentState.page = 1;
      loadStudents();
    });

    document.getElementById('studentReadinessFilter')?.addEventListener('change', (e) => {
      studentState.minReadiness = e.target.value;
      studentState.page = 1;
      loadStudents();
    });

    document.getElementById('studentStatusFilter')?.addEventListener('change', (e) => {
      studentState.placementStatus = e.target.value;
      studentState.page = 1;
      loadStudents();
    });

    document.getElementById('exportStudentsBtn')?.addEventListener('click', () => {
      const q = new URLSearchParams({
        search: studentState.search,
        branch: studentState.branch,
        minReadiness: studentState.minReadiness,
        placementStatus: studentState.placementStatus,
      });
      window.location.href = `${API.base}/api/admin/students/export?${q.toString()}`;
    });
  }

  // ======================== STUDENT DRILL-DOWN ========================
  window.openStudentDrillDown = async function (studentId) {
    activeStudentDrillId = studentId;
    const modalEl = document.getElementById('modalStudentDrillDown');
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Reset drill-down fields
    document.getElementById('drillDownTitle').textContent = 'Loading profile...';
    document.getElementById('drillDownSubtitle').textContent = '...';
    document.getElementById('drillReadinessScore').textContent = '...';
    document.getElementById('drillCgpa').textContent = '...';
    document.getElementById('drillCategoriesRow').innerHTML = '<div class="col-12 text-center py-2 text-muted">Loading breakdown...</div>';

    try {
      const res = await API.get(`/api/admin/students/${studentId}`);
      const data = res.data || {};
      const st = data.student || {};
      const readiness = data.readiness || {};
      const breakdown = readiness.breakdown || {};
      const strong = data.strongTopics || [];
      const weak = data.weakTopics || [];
      const attempts = data.attempts || [];
      const apps = data.applications || [];

      document.getElementById('drillDownTitle').textContent = st.name || 'Candidate Profile';
      document.getElementById('drillDownSubtitle').textContent = `${st.registerNumber ? st.registerNumber + ' • ' : ''}${st.branch || 'Engineering'} • Batch ${st.graduationYear || '2026'}`;
      document.getElementById('drillReadinessScore').textContent = `${st.readinessScore || 0}%`;
      document.getElementById('drillTierBadge').innerHTML = getTierBadge(st.readinessScore);
      document.getElementById('drillCgpa').textContent = st.cgpa != null ? st.cgpa : '—';
      document.getElementById('drillStatusSelect').value = st.placementStatus || 'unplaced';

      // Render Categories
      const catRow = document.getElementById('drillCategoriesRow');
      const cats = [
        { label: 'Aptitude', val: breakdown.aptitude },
        { label: 'Coding & DSA', val: breakdown.coding },
        { label: 'Technical Core', val: breakdown.technical },
        { label: 'Communication', val: breakdown.communication },
        { label: 'Interview', val: breakdown.interview },
      ];
      catRow.innerHTML = cats.map((c) => {
        const val = c.val != null ? c.val : '—';
        const color = typeof c.val === 'number' && c.val >= 70 ? 'text-success' : typeof c.val === 'number' && c.val >= 50 ? 'text-warning' : 'text-body';
        return `
          <div class="col-4 col-md">
            <div class="p-2 border rounded-2 text-center bg-body">
              <small class="text-muted d-block" style="font-size:0.75rem;">${c.label}</small>
              <strong class="${color}" style="font-size:1.05rem;">${typeof val === 'number' ? val + '%' : val}</strong>
            </div>
          </div>`;
      }).join('');

      // Strong / Weak Topics
      const strongEl = document.getElementById('drillStrongTopics');
      strongEl.innerHTML = strong.length
        ? strong.map((t) => `<span class="badge bg-success-subtle text-success border border-success-subtle">${escapeHtml(t.topic)} (${t.averageScore}%)</span>`).join('')
        : '<span class="text-muted small">No strong topics recorded yet</span>';

      const weakEl = document.getElementById('drillWeakTopics');
      weakEl.innerHTML = weak.length
        ? weak.map((t) => `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">${escapeHtml(t.topic)} (${t.averageScore}%)</span>`).join('')
        : '<span class="text-muted small">No weak areas flagged</span>';

      // Attempts Table
      const attemptsBody = document.getElementById('drillAttemptsTable');
      attemptsBody.innerHTML = attempts.length
        ? attempts.map((a) => `
          <tr>
            <td class="fw-semibold">${escapeHtml(a.title)}</td>
            <td><small class="text-muted">${escapeHtml(a.category)}</small></td>
            <td><span class="badge ${a.percentage >= 70 ? 'bg-success' : a.percentage >= 50 ? 'bg-warning' : 'bg-danger'}">${a.percentage}%</span></td>
            <td>${a.correctAnswers || 0} / ${a.totalQuestions || 0}</td>
            <td class="small text-muted">${a.completedAt ? new Date(a.completedAt).toLocaleDateString() : '—'}</td>
          </tr>`).join('')
        : '<tr><td colspan="5" class="text-center py-3 text-muted">No attempts found for this candidate.</td></tr>';

      // Applications Table
      const appsBody = document.getElementById('drillApplicationsTable');
      appsBody.innerHTML = apps.length
        ? apps.map((app) => `
          <tr>
            <td class="fw-semibold">${escapeHtml(app.company)}</td>
            <td>${escapeHtml(app.role)}</td>
            <td>${escapeHtml(app.package || '—')}</td>
            <td><span class="badge bg-primary-subtle text-primary">${escapeHtml(app.status)}</span></td>
          </tr>`).join('')
        : '<tr><td colspan="4" class="text-center py-3 text-muted">No active drive applications.</td></tr>';

    } catch (e) {
      console.warn('Drill-down error:', e.message);
    }
  };

  document.getElementById('saveStudentStatusBtn')?.addEventListener('click', async () => {
    if (!activeStudentDrillId) return;
    const newStatus = document.getElementById('drillStatusSelect')?.value;
    try {
      await API.patch(`/api/admin/students/${activeStudentDrillId}/status`, { placementStatus: newStatus });
      bootstrap.Modal.getInstance(document.getElementById('modalStudentDrillDown'))?.hide();
      loadStudents();
    } catch (err) {
      alert(`Status update failed: ${err.message}`);
    }
  });

  // ======================== BATCH WEAKNESS ANALYTICS ========================
  async function loadBatchAnalytics() {
    try {
      const res = await API.get('/api/admin/analytics');
      const data = res.data || {};
      const weakest = data.weakestTopics || [];
      const categories = data.categoryComparison || [];

      renderWeakTopicsChart(weakest);
      renderCategoryMasteryChart(categories);
      renderTopicsTable(weakest);
    } catch (err) {
      console.warn('Batch analytics error:', err.message);
    }
  }

  function renderWeakTopicsChart(topics) {
    const canvas = document.getElementById('chartWeakTopics');
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts.weakTopics) charts.weakTopics.destroy();

    const colors = typeof getChartColors === 'function' ? getChartColors() : { text: '#1E293B', grid: 'rgba(0,0,0,0.06)' };

    charts.weakTopics = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: topics.map((t) => t.topic),
        datasets: [
          {
            label: 'Students Struggling (%)',
            data: topics.map((t) => t.strugglingPercentage || 0),
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderRadius: 6,
          },
          {
            label: 'Avg Score (%)',
            data: topics.map((t) => t.avgScore || 0),
            backgroundColor: 'rgba(245, 158, 11, 0.65)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: colors.text } },
          y: { min: 0, max: 100, grid: { color: colors.grid }, ticks: { color: colors.text } },
        },
        plugins: {
          legend: { position: 'top', labels: { color: colors.text } },
        },
      },
    });
  }

  function renderCategoryMasteryChart(categories) {
    const canvas = document.getElementById('chartCategoryMastery');
    if (!canvas || typeof Chart === 'undefined') return;

    if (charts.categoryMastery) charts.categoryMastery.destroy();

    const colors = typeof getChartColors === 'function' ? getChartColors() : { text: '#1E293B' };

    charts.categoryMastery = new Chart(canvas.getContext('2d'), {
      type: 'polarArea',
      data: {
        labels: categories.map((c) => c.category),
        datasets: [
          {
            data: categories.map((c) => c.avgScore || 0),
            backgroundColor: [
              'rgba(109, 40, 217, 0.75)',
              'rgba(59, 130, 246, 0.75)',
              'rgba(16, 185, 129, 0.75)',
              'rgba(245, 158, 11, 0.75)',
              'rgba(236, 72, 153, 0.75)',
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: colors.text, boxWidth: 12 } },
        },
      },
    });
  }

  function renderTopicsTable(topics) {
    const tbody = document.getElementById('topicBreakdownBody');
    if (!tbody) return;

    if (!topics.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No topic assessment data yet.</td></tr>';
      return;
    }

    tbody.innerHTML = topics.map((t) => {
      const priorityBadge = t.strugglingPercentage >= 65 ? '<span class="badge bg-danger">Critical</span>' : t.strugglingPercentage >= 40 ? '<span class="badge bg-warning">Moderate</span>' : '<span class="badge bg-success">Low</span>';
      return `
        <tr>
          <td class="ps-4 fw-semibold">${escapeHtml(t.topic)}</td>
          <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle">${escapeHtml(t.category || 'General')}</span></td>
          <td class="fw-bold">${t.avgScore}%</td>
          <td><span class="text-danger fw-semibold">${t.strugglingPercentage}%</span> of students</td>
          <td>${t.totalAttempts} attempts</td>
          <td>${priorityBadge}</td>
          <td class="text-end pe-4">
            <button class="btn btn-sm btn-outline-danger" onclick="window.deleteTopic('${escapeHtml(t.topic)}', event)" title="Remove topic from analytics">
              <i class="bi bi-trash" style="pointer-events:none;"></i>
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  window.deleteTopic = async function (topicName, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!topicName) return;
    if (!confirm(`Are you sure you want to remove "${topicName}" from batch analytics?`)) return;

    try {
      await API.del(`/api/admin/topics/${encodeURIComponent(topicName)}`);
      await loadBatchAnalytics();
    } catch (err) {
      alert(`Failed to remove topic: ${err.message}`);
    }
  };

  // ======================== ELIGIBILITY SCREENER ========================
  function setupEligibilityScreener() {
    const cgpaRange = document.getElementById('screenCgpaRange');
    const cgpaVal = document.getElementById('screenCgpaVal');
    const readinessRange = document.getElementById('screenReadinessRange');
    const readinessVal = document.getElementById('screenReadinessVal');

    cgpaRange?.addEventListener('input', () => {
      if (cgpaVal) cgpaVal.textContent = cgpaRange.value;
    });

    readinessRange?.addEventListener('input', () => {
      if (readinessVal) readinessVal.textContent = `${readinessRange.value}%`;
    });

    document.getElementById('applyScreenBtn')?.addEventListener('click', runEligibilityScreen);

    document.getElementById('exportEligibleCsvBtn')?.addEventListener('click', () => {
      const branches = Array.from(document.querySelectorAll('.branch-check:checked')).map((c) => c.value);
      const q = new URLSearchParams({
        minCgpa: cgpaRange?.value || 7.0,
        minReadiness: readinessRange?.value || 65,
        maxBacklogs: document.getElementById('screenBacklogsSelect')?.value || 0,
      });
      branches.forEach((b) => q.append('branches', b));
      window.location.href = `${API.base}/api/admin/eligibility/export?${q.toString()}`;
    });
  }

  async function runEligibilityScreen() {
    const cgpa = document.getElementById('screenCgpaRange')?.value || 7.0;
    const readiness = document.getElementById('screenReadinessRange')?.value || 65;
    const backlogs = document.getElementById('screenBacklogsSelect')?.value || 0;
    const branches = Array.from(document.querySelectorAll('.branch-check:checked')).map((c) => c.value);

    const tbody = document.getElementById('eligibleStudentsBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Evaluating candidates...</td></tr>';
    }

    try {
      const q = new URLSearchParams({
        minCgpa: cgpa,
        minReadiness: readiness,
        maxBacklogs: backlogs,
      });
      branches.forEach((b) => q.append('branches', b));

      const res = await API.get(`/api/admin/eligibility?${q.toString()}`);
      const data = res.data || {};
      const count = data.eligibleCount || 0;
      const students = data.students || [];

      document.getElementById('eligibleCountBadge').textContent = `Matched ${count} eligible candidate${count === 1 ? '' : 's'}`;

      if (tbody) {
        if (!students.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No students meet the specified criteria. Try loosening filters.</td></tr>';
          return;
        }

        tbody.innerHTML = students.map((s) => `
          <tr onclick="window.openStudentDrillDown('${s._id}')">
            <td class="ps-3 ps-md-4 fw-semibold">${escapeHtml(s.name)}</td>
            <td><code>${escapeHtml(s.registerNumber || '—')}</code></td>
            <td>${escapeHtml(s.branch || '—')}</td>
            <td class="fw-bold">${s.cgpa != null ? s.cgpa : '—'}</td>
            <td>${s.readinessScore || 0}%</td>
            <td>${s.backlogs || 0}</td>
            <td class="text-end pe-3">
              <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); window.openStudentDrillDown('${s._id}')">
                <i class="bi bi-person"></i>
              </button>
            </td>
          </tr>`).join('');
      }
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ======================== PLACEMENT DRIVES ========================
  let cachedDrives = [];

  function formatDateForInput(dateVal) {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }

  async function loadDrives() {
    const container = document.getElementById('drivesGridContainer');
    if (!container) return;

    try {
      const res = await API.get('/api/admin/drives');
      const drives = res.data?.drives || [];
      cachedDrives = drives;

      // Populate drive filter dropdown on Applications tab too
      const appDriveSelect = document.getElementById('appFilterDrive');
      if (appDriveSelect) {
        appDriveSelect.innerHTML = '<option value="">All Drives</option>' +
          drives.map((d) => `<option value="${d._id}">${escapeHtml(d.company)} — ${escapeHtml(d.role)}</option>`).join('');
      }

      if (!drives.length) {
        container.innerHTML = '<div class="col-12 text-center py-5 text-muted">No placement drives created yet. Click "+ Create New Drive" above.</div>';
        return;
      }

      container.innerHTML = drives.map((d) => {
        const driveDate = d.driveDate ? new Date(d.driveDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
        const deadline = d.applicationDeadline ? new Date(d.applicationDeadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Open';
        const branches = (d.eligibleBranches || []).join(', ');

        return `
          <div class="col-md-6 col-lg-4">
            <div class="card border-0 shadow-sm h-100 p-3">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <h5 class="fw-bold mb-0 text-primary">${escapeHtml(d.company)}</h5>
                  <span class="small fw-semibold text-body">${escapeHtml(d.role)}</span>
                </div>
                <span class="badge ${d.status === 'Open' ? 'bg-success' : 'bg-secondary'}">${d.status}</span>
              </div>
              <p class="text-muted small mb-3 text-truncate-2">${escapeHtml(d.description || 'Campus recruitment drive.')}</p>
              <div class="small mb-3 d-flex flex-column gap-1 bg-body-tertiary p-2 rounded-2">
                <div><strong>Package:</strong> ${escapeHtml(d.package || 'Confidential')}</div>
                <div><strong>Drive Date:</strong> ${driveDate}</div>
                <div><strong>Deadline:</strong> ${deadline}</div>
                <div><strong>Eligibility:</strong> CGPA ≥ ${d.minCgpa}, Readiness ≥ ${d.minReadiness}%</div>
                <div><strong>Branches:</strong> ${escapeHtml(branches)}</div>
              </div>
              <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top">
                <span class="badge bg-primary-subtle text-primary">
                  <i class="bi bi-people me-1"></i>${d.applicantCount || 0} Applied
                </span>
                <div class="d-flex gap-1">
                  <button class="btn btn-sm btn-outline-primary" onclick="window.openEditDriveModal('${d._id || d.id}', event)" title="Edit drive">
                    <i class="bi bi-pencil" style="pointer-events:none;"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger" onclick="window.deleteDrive('${d._id || d.id}', event)" title="Delete drive">
                    <i class="bi bi-trash" style="pointer-events:none;"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="col-12 text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  window.openEditDriveModal = function (driveId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const d = cachedDrives.find((item) => String(item._id || item.id) === String(driveId));
    if (!d) {
      alert('Could not find drive details.');
      return;
    }

    const form = document.getElementById('editDriveForm');
    if (!form) return;

    form.driveId.value = d._id || d.id;
    form.company.value = d.company || '';
    form.role.value = d.role || '';
    form.package.value = d.package || '';
    form.status.value = d.status || 'Open';
    form.minCgpa.value = d.minCgpa != null ? d.minCgpa : 7.0;
    form.minReadiness.value = d.minReadiness != null ? d.minReadiness : 65;
    form.maxBacklogs.value = d.maxBacklogs != null ? d.maxBacklogs : 0;
    form.driveDate.value = formatDateForInput(d.driveDate);
    form.applicationDeadline.value = formatDateForInput(d.applicationDeadline);
    form.branches.value = Array.isArray(d.eligibleBranches) ? d.eligibleBranches.join(', ') : (d.eligibleBranches || 'CSE, IT, ECE');
    form.description.value = d.description || '';

    const modalEl = document.getElementById('modalEditDrive');
    if (modalEl) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }
  };

  window.handleEditDriveSubmit = async function (e) {
    e.preventDefault();
    const form = e.target;
    const driveId = form.driveId.value;
    if (!driveId) {
      alert('Missing drive ID.');
      return;
    }

    const branches = (form.branches.value || '').split(',').map((s) => s.trim()).filter(Boolean);
    const submitBtn = document.getElementById('editDriveSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
    }

    const payload = {
      company: form.company.value.trim(),
      role: form.role.value.trim(),
      package: form.package.value.trim(),
      status: form.status.value,
      minCgpa: parseFloat(form.minCgpa.value) || 0,
      minReadiness: parseInt(form.minReadiness.value, 10) || 0,
      maxBacklogs: parseInt(form.maxBacklogs.value, 10) || 0,
      driveDate: form.driveDate.value || null,
      applicationDeadline: form.applicationDeadline.value || null,
      eligibleBranches: branches,
      description: form.description.value.trim(),
    };

    try {
      await API.put(`/api/admin/drives/${driveId}`, payload);
      const modalEl = document.getElementById('modalEditDrive');
      if (modalEl) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }
      await loadDrives();
    } catch (err) {
      alert(`Failed to update drive: ${err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Save Changes';
      }
    }
  };

  window.handleCreateDriveSubmit = async function (e) {
    e.preventDefault();
    const form = e.target;
    const branches = (form.branches.value || '').split(',').map((s) => s.trim()).filter(Boolean);

    const payload = {
      company: form.company.value,
      role: form.role.value,
      package: form.package.value,
      minCgpa: form.minCgpa.value,
      minReadiness: form.minReadiness.value,
      driveDate: form.driveDate.value || null,
      applicationDeadline: form.applicationDeadline.value || null,
      eligibleBranches: branches,
      description: form.description.value,
      status: 'Open',
    };

    try {
      await API.post('/api/admin/drives', payload);
      bootstrap.Modal.getInstance(document.getElementById('modalCreateDrive'))?.hide();
      form.reset();
      loadDrives();
    } catch (err) {
      alert(`Failed to create drive: ${err.message}`);
    }
  };

  window.deleteDrive = async function (id, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!id || id === 'undefined') {
      alert('Invalid drive ID.');
      return;
    }
    if (!confirm('Are you sure you want to delete this placement drive?')) return;
    try {
      await API.del(`/api/admin/drives/${id}`);
      loadDrives();
    } catch (err) {
      alert(`Failed to delete drive: ${err.message}`);
    }
  };

  // ======================== APPLICATIONS PIPELINE ========================
  async function loadApplications() {
    const tbody = document.getElementById('applicationsTableBody');
    if (!tbody) return;

    const driveId = document.getElementById('appFilterDrive')?.value || '';
    const status = document.getElementById('appFilterStatus')?.value || '';

    try {
      const q = new URLSearchParams();
      if (driveId) q.append('driveId', driveId);
      if (status) q.append('status', status);

      const res = await API.get(`/api/admin/applications?${q.toString()}`);
      const apps = res.data?.applications || [];

      if (!apps.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No applications found in this stage.</td></tr>';
        return;
      }

      tbody.innerHTML = apps.map((app) => {
        const student = app.studentId || {};
        const drive = app.driveId || {};
        const appliedDate = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : '—';

        return `
          <tr>
            <td class="ps-3 ps-md-4">
              <span class="fw-semibold text-primary d-block">${escapeHtml(student.name || 'Candidate')}</span>
              <small class="text-muted">${escapeHtml(student.branch || '')} • CGPA: ${student.cgpa != null ? student.cgpa : '—'}</small>
            </td>
            <td class="fw-semibold">${escapeHtml(drive.company || '—')}</td>
            <td>${escapeHtml(drive.role || '—')}</td>
            <td class="small text-muted">${appliedDate}</td>
            <td><span class="badge bg-primary-subtle text-primary">${escapeHtml(app.status)}</span></td>
            <td><small class="text-muted text-truncate-1">${escapeHtml(app.stageNotes || 'No notes')}</small></td>
            <td class="text-end pe-3">
              <select class="form-select form-select-sm d-inline-block" style="width: auto;" onchange="window.updateAppStage('${app._id}', this.value)">
                <option value="Applied" ${app.status === 'Applied' ? 'selected' : ''}>Applied</option>
                <option value="Shortlisted" ${app.status === 'Shortlisted' ? 'selected' : ''}>Shortlisted</option>
                <option value="Assessment" ${app.status === 'Assessment' ? 'selected' : ''}>Assessment</option>
                <option value="Interview" ${app.status === 'Interview' ? 'selected' : ''}>Interview</option>
                <option value="Selected" ${app.status === 'Selected' ? 'selected' : ''}>Selected 🎉</option>
                <option value="Rejected" ${app.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
              </select>
            </td>
          </tr>`;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  window.updateAppStage = async function (appId, newStatus) {
    try {
      await API.patch(`/api/admin/applications/${appId}/status`, { status: newStatus });
    } catch (err) {
      alert(`Failed to update stage: ${err.message}`);
      loadApplications();
    }
  };

  document.getElementById('appFilterDrive')?.addEventListener('change', loadApplications);
  document.getElementById('appFilterStatus')?.addEventListener('change', loadApplications);

  // ======================== ASSESSMENTS CRUD ========================
  async function loadAssessments() {
    const tbody = document.getElementById('assessmentsTableBody');
    if (!tbody) return;

    try {
      const res = await API.get('/api/admin/assessments');
      const list = res.data?.assessments || [];

      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No assessment modules found.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map((a) => `
        <tr>
          <td class="ps-3 ps-md-4 fw-semibold text-primary">${escapeHtml(a.title)}</td>
          <td><code>${escapeHtml(a.moduleKey)}</code></td>
          <td><span class="small text-muted">${escapeHtml(a.category)}</span></td>
          <td><span class="badge bg-body-secondary text-body">${escapeHtml(a.difficulty)}</span></td>
          <td>${a.durationMinutes} mins</td>
          <td>${a.questionCount} questions</td>
          <td>
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" ${a.isPublished ? 'checked' : ''} onchange="window.toggleAssessmentPublish('${a._id || a.id || a.moduleKey}', event)">
            </div>
          </td>
          <td class="text-end pe-3">
            <button class="btn btn-sm btn-outline-danger" onclick="window.deleteAssessment('${a._id || a.id || a.moduleKey}', event)" title="Delete assessment">
              <i class="bi bi-trash" style="pointer-events:none;"></i>
            </button>
          </td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  window.toggleAssessmentPublish = async function (id, event) {
    if (event) event.stopPropagation();
    try {
      await API.patch(`/api/admin/assessments/${id}/publish`, {});
    } catch (err) {
      alert(`Failed to toggle status: ${err.message}`);
      loadAssessments();
    }
  };

  window.deleteAssessment = async function (id, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!id || id === 'undefined') {
      alert('Invalid assessment ID.');
      return;
    }
    if (!confirm('Are you sure you want to delete this assessment?')) return;
    try {
      await API.del(`/api/admin/assessments/${id}`);
      loadAssessments();
    } catch (err) {
      alert(`Failed to delete assessment: ${err.message}`);
    }
  };

  window.handleCreateAssessmentSubmit = async function (e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
      title: form.title.value,
      moduleKey: form.moduleKey.value,
      category: form.category.value,
      difficulty: form.difficulty.value,
      durationMinutes: form.durationMinutes.value,
    };

    try {
      await API.post('/api/admin/assessments', payload);
      bootstrap.Modal.getInstance(document.getElementById('modalCreateAssessment'))?.hide();
      form.reset();
      loadAssessments();
    } catch (err) {
      alert(`Failed to create assessment: ${err.message}`);
    }
  };

  // ======================== QUESTION BANK ========================
  async function loadQuestions() {
    const tbody = document.getElementById('questionsTableBody');
    if (!tbody) return;

    try {
      const q = new URLSearchParams({
        page: questionsState.page,
        limit: questionsState.limit,
        search: questionsState.search,
        type: questionsState.type,
        difficulty: questionsState.difficulty,
      });

      const res = await API.get(`/api/admin/questions?${q.toString()}`);
      const data = res.data || {};
      const questions = data.questions || [];
      const pagination = data.pagination || {};

      document.getElementById('questionsPaginationSummary').textContent = `Showing page ${pagination.page || 1} of ${pagination.totalPages || 1} (${pagination.total || 0} questions)`;

      let btns = '';
      const p = pagination.page || 1;
      const tp = pagination.totalPages || 1;
      btns += `<button class="btn btn-sm btn-outline-custom" ${p <= 1 ? 'disabled' : ''} onclick="changeQuestionsPage(${p - 1})">Previous</button>`;
      btns += `<span class="btn btn-sm btn-outline-custom disabled fw-bold">${p} / ${tp}</span>`;
      btns += `<button class="btn btn-sm btn-outline-custom" ${p >= tp ? 'disabled' : ''} onclick="changeQuestionsPage(${p + 1})">Next</button>`;
      document.getElementById('questionsPaginationControls').innerHTML = btns;

      if (!questions.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No questions found matching criteria.</td></tr>';
        return;
      }

      tbody.innerHTML = questions.map((qItem) => `
        <tr>
          <td class="ps-3 ps-md-4">
            <span class="fw-semibold text-body d-block">${escapeHtml(qItem.title)}</span>
            <small class="text-muted text-truncate-2">${escapeHtml(qItem.question)}</small>
          </td>
          <td><span class="badge bg-primary-subtle text-primary">${qItem.type.toUpperCase()}</span></td>
          <td><small class="text-muted">${escapeHtml(qItem.category)}</small></td>
          <td><span class="fw-medium">${escapeHtml(qItem.topic)}</span></td>
          <td><span class="badge ${qItem.difficulty === 'Easy' ? 'bg-success' : qItem.difficulty === 'Medium' ? 'bg-warning' : 'bg-danger'}">${qItem.difficulty}</span></td>
          <td>${qItem.marks || 1}</td>
          <td class="text-end pe-3">
            <button class="btn btn-sm btn-outline-danger" onclick="window.deleteQuestion('${qItem._id || qItem.id || qItem.questionId}', event)" title="Archive question">
              <i class="bi bi-trash" style="pointer-events:none;"></i>
            </button>
          </td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  window.changeQuestionsPage = function (newPage) {
    questionsState.page = newPage;
    loadQuestions();
  };

  document.getElementById('filterQuestionsBtn')?.addEventListener('click', () => {
    questionsState.search = document.getElementById('questionSearchInput')?.value.trim() || '';
    questionsState.type = document.getElementById('questionTypeFilter')?.value || '';
    questionsState.difficulty = document.getElementById('questionDiffFilter')?.value || '';
    questionsState.page = 1;
    loadQuestions();
  });

  window.handleCreateQuestionSubmit = async function (e) {
    e.preventDefault();
    const form = e.target;
    const options = [
      { key: 'A', text: form.optA?.value || '' },
      { key: 'B', text: form.optB?.value || '' },
      { key: 'C', text: form.optC?.value || '' },
      { key: 'D', text: form.optD?.value || '' },
    ].filter((o) => o.text.trim().length > 0);

    const payload = {
      title: form.title.value,
      question: form.question.value,
      type: form.type.value,
      category: form.category.value,
      topic: form.topic.value,
      difficulty: form.difficulty.value,
      marks: form.marks.value,
      options,
      correctKey: form.correctKey?.value || '',
      explanation: form.explanation?.value || '',
    };

    try {
      await API.post('/api/admin/questions', payload);
      bootstrap.Modal.getInstance(document.getElementById('modalCreateQuestion'))?.hide();
      form.reset();
      loadQuestions();
    } catch (err) {
      alert(`Failed to add question: ${err.message}`);
    }
  };

  window.deleteQuestion = async function (id, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!id || id === 'undefined') {
      alert('Invalid question ID.');
      return;
    }
    if (!confirm('Archive this question from the bank?')) return;
    try {
      await API.del(`/api/admin/questions/${id}`);
      loadQuestions();
    } catch (err) {
      alert(`Failed to delete question: ${err.message}`);
    }
  };

  // ======================== ANNOUNCEMENTS ========================
  async function loadNotifications() {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    try {
      const res = await API.get('/api/admin/notifications');
      const list = res.data?.notifications || [];

      if (!list.length) {
        container.innerHTML = '<div class="col-12 text-center py-5 text-muted">No announcements broadcasted yet.</div>';
        return;
      }

      container.innerHTML = list.map((n) => `
        <div class="col-md-6">
          <div class="card border-0 shadow-sm p-3 h-100 ${n.isPinned ? 'border-start border-4 border-primary' : ''}">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <h6 class="fw-bold mb-0">${escapeHtml(n.title)}</h6>
              <span class="badge ${n.type === 'drive' ? 'bg-primary' : n.type === 'alert' ? 'bg-danger' : 'bg-info'}">${n.type}</span>
            </div>
            <p class="text-body small mb-3">${escapeHtml(n.message)}</p>
            <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top">
              <small class="text-muted">${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</small>
              <button class="btn btn-sm btn-outline-danger" onclick="window.deleteNotification('${n._id || n.id}', event)" title="Delete announcement">
                <i class="bi bi-trash" style="pointer-events:none;"></i>
              </button>
            </div>
          </div>
        </div>`).join('');
    } catch (err) {
      container.innerHTML = `<div class="col-12 text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  window.handleCreateNotificationSubmit = async function (e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
      title: form.title.value,
      message: form.message.value,
      type: form.type.value,
      isPinned: form.isPinned?.checked || false,
    };

    try {
      await API.post('/api/admin/notifications', payload);
      bootstrap.Modal.getInstance(document.getElementById('modalCreateNotification'))?.hide();
      form.reset();
      loadNotifications();
    } catch (err) {
      alert(`Failed to broadcast notice: ${err.message}`);
    }
  };

  window.deleteNotification = async function (id, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!id || id === 'undefined') {
      alert('Invalid announcement ID.');
      return;
    }
    if (!confirm('Delete this broadcast announcement?')) return;
    try {
      await API.del(`/api/admin/notifications/${id}`);
      loadNotifications();
    } catch (err) {
      alert(`Failed to delete notice: ${err.message}`);
    }
  };

  // ======================== AUDIT LOGS ========================
  async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;

    try {
      const res = await API.get('/api/admin/logs?limit=50');
      const logs = res.data?.logs || [];

      if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No audit logs recorded yet.</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map((l) => `
        <tr>
          <td class="ps-3 ps-md-4 small text-muted">${l.createdAt ? new Date(l.createdAt).toLocaleString() : '—'}</td>
          <td class="fw-medium">${escapeHtml(l.adminName || 'Admin')}</td>
          <td><code class="text-primary">${escapeHtml(l.action)}</code></td>
          <td>${escapeHtml(l.resource)}</td>
          <td><small class="text-muted">${escapeHtml(l.resourceId || '—')}</small></td>
          <td><span class="badge ${l.result === 'success' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">${l.result}</span></td>
          <td><small class="text-muted">${escapeHtml(l.ipAddress || '—')}</small></td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ======================== CSV IMPORT ========================
  document.getElementById('submitCsvImportBtn')?.addEventListener('click', async () => {
    const text = document.getElementById('csvImportText')?.value.trim();
    const alertEl = document.getElementById('importResultAlert');
    if (!text) {
      alert('Please paste CSV rows to import.');
      return;
    }

    try {
      const res = await API.post('/api/admin/students/import', { csvText: text });
      const data = res.data || {};
      if (alertEl) {
        alertEl.className = 'alert alert-success small';
        alertEl.innerHTML = `Successfully processed: <strong>${data.imported || 0}</strong> students imported / updated. (${data.skipped || 0} skipped).`;
        alertEl.classList.remove('d-none');
      }
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('modalImportStudents'))?.hide();
        loadStudents();
      }, 1500);
    } catch (err) {
      if (alertEl) {
        alertEl.className = 'alert alert-danger small';
        alertEl.textContent = `Import failed: ${err.message}`;
        alertEl.classList.remove('d-none');
      }
    }
  });

  // ======================== BOOTSTRAP ========================
  document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupStudentFilters();
    setupEligibilityScreener();
    loadOverview();
  });
})();
