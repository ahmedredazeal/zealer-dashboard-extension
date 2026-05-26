/**
 * popup.js — Zealer Dashboard side panel controller (Phase 2)
 *
 * Data flow (stale-while-revalidate):
 *   boot → loadSettings → [if incomplete → auth screen]
 *        → render from cache immediately (if present)
 *        → fetchSprintData (live Jira fetch)
 *        → writeCache → renderAll → startRefreshTimer
 *
 * Per brief §2: no persistent service-worker timers.
 * Auto-refresh lives inside this page (setInterval, cleared when panel closes).
 */

import { JiraClient }               from './src/jira-api.js';
import { normalizeStory }           from './src/parsers.js';
import { runMigrations }            from './src/migrations.js';
import { sprintBurndownPrediction } from './src/metrics.js';
import {
  escapeHtml,
  buildMiniProgressBar,
  renderTicketRow,
  deriveProjectKey,
  sprintDayMetrics,
} from './src/ticket-render.js';

// ── Constants ──────────────────────────────────────────────────────────────
const REFRESH_CYCLE_MS = 30 * 60 * 1000;
const ELAPSED_MODE_MS  =  5 * 60 * 1000;
const CACHE_KEY        = 'myTicketsCache';

// ── Refresh timer (mirrors EM exactly) ────────────────────────────────────
let _timerInterval = null;
let _lastFetchTime = null;

function setLastFetchTime(ts) {
  _lastFetchTime = ts;
  updateRefreshTimer();
}

function updateRefreshTimer() {
  const el = document.getElementById('refresh-countdown');
  if (!el) return;
  if (!_lastFetchTime) { el.textContent = ''; return; }

  const elapsed   = Date.now() - _lastFetchTime;
  const remaining = Math.max(0, REFRESH_CYCLE_MS - elapsed);

  if (elapsed < ELAPSED_MODE_MS) {
    const mins = Math.floor(elapsed / 60000);
    el.textContent = mins < 1 ? 'just now' : `${mins}m ago`;
    el.style.color = 'var(--text-muted)';
  } else {
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    el.style.color = remaining < 5 * 60 * 1000 ? '#f59e0b' : 'var(--text-muted)';
    if (remaining === 0) {
      console.log('[popup] Auto-refresh triggered');
      refreshDashboard();
    }
  }
}

function startRefreshTimer(ts) {
  if (_timerInterval) clearInterval(_timerInterval);
  _lastFetchTime = ts;
  updateRefreshTimer();
  _timerInterval = setInterval(updateRefreshTimer, 1000);
}

// ── Screen helpers ─────────────────────────────────────────────────────────
function showScreen(id) {
  ['screen-auth', 'screen-home'].forEach(s => {
    document.getElementById(s)?.classList.add('hidden');
  });
  document.getElementById(id)?.classList.remove('hidden');
}

function setSectionLoading(id, loading) {
  document.getElementById(id)?.classList.toggle('visible', loading);
}

// ── Cache ──────────────────────────────────────────────────────────────────
async function readCache() {
  const r = await chrome.storage.local.get([CACHE_KEY]);
  return r[CACHE_KEY] || null;
}

async function writeCache(data) {
  await chrome.storage.local.set({ [CACHE_KEY]: { ...data, fetchedAt: Date.now() } });
}

// ── Jira fetch ─────────────────────────────────────────────────────────────
async function fetchSprintData(settings) {
  const { baseUrl, email, token } = settings.jira;
  const boardId = settings.sprint?.boardId;
  const client  = new JiraClient(baseUrl, email, token);

  console.log('[popup] Fetching active sprint for board', boardId);
  const sprint = await client.getActiveSprint(boardId);
  console.log('[popup] Sprint:', sprint.name, 'id=' + sprint.id);

  // Lazy-cache story points field per board
  let storyPointsField = settings._cachedSpf?.[boardId];
  if (!storyPointsField) {
    storyPointsField = await client.getStoryPointsField(boardId);
    const r = await chrome.storage.local.get(['settings']);
    const s = r.settings || {};
    s._cachedSpf = { ...(s._cachedSpf || {}), [boardId]: storyPointsField };
    await chrome.storage.local.set({ settings: s });
    console.log('[popup] Story points field cached:', storyPointsField);
  }

  const jql = `sprint = ${sprint.id} AND issuetype not in subTaskIssueTypes() ORDER BY priority DESC, updated DESC`;
  const fields = [
    'summary', 'status', 'assignee', 'issuetype', 'priority',
    storyPointsField, 'customfield_10016', 'customfield_10026',
    'duedate', 'labels',
  ];

  const result   = await client._search({ jql, fields, maxResults: 100 });
  const rawIssues = result.issues || [];
  console.log('[popup] Fetched', rawIssues.length, 'sprint issues');

  const stories = rawIssues.map(i => normalizeStory(i, storyPointsField));
  return { sprint, stories, storyPointsField };
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderContextBar(sprint, projectKey) {
  const bar        = document.getElementById('context-bar');
  const keyEl      = document.getElementById('context-key');
  const sep1       = document.getElementById('context-sep-1');
  const sprintEl   = document.getElementById('context-sprint');
  const refreshBtn = document.getElementById('context-refresh');
  const countdown  = document.getElementById('refresh-countdown');
  if (!bar) return;

  bar.classList.remove('empty');
  if (projectKey) {
    keyEl.textContent  = projectKey;
    keyEl.style.display = 'inline-flex';
    sep1.style.display  = 'inline';
  } else {
    keyEl.style.display = 'none';
    sep1.style.display  = 'none';
  }
  sprintEl.textContent = sprint.name || 'Current Sprint';
  if (refreshBtn) refreshBtn.style.display = 'inline-block';
  if (countdown)  countdown.style.display  = 'inline';
}

function renderSprintSection(sprint, stories, workingDays) {
  const titleEl  = document.getElementById('current-sprint-title');
  const totalEl  = document.getElementById('current-sprint-total');
  const countsEl = document.getElementById('sprint-glance-ticket-counts');
  const listEl   = document.getElementById('sprint-story-list');

  const { totalDays, daysElapsed } = sprintDayMetrics(sprint, workingDays);
  const totalPoints     = stories.reduce((s, t) => s + (t.points || 0), 0);
  const completedPoints = stories
    .filter(s => s.statusCategory === 'done')
    .reduce((sum, s) => sum + (s.points || 0), 0);

  let riskText = '';
  try {
    const pred = sprintBurndownPrediction({ totalPoints, completedPoints, daysElapsed, totalDays });
    if (!pred.onTrack && pred.risk !== 'early' && pred.risk !== 'no-data') {
      riskText = `need ${Number(pred.expectedDailyVelocity).toFixed(1)}pt/d`;
    }
  } catch (_) {}

  if (titleEl) titleEl.textContent = `CURRENT SPRINT (${sprint.name || ''})`;
  if (totalEl) {
    totalEl.textContent =
      (totalPoints > 0 ? `${completedPoints}/${totalPoints}pt · ` : '') +
      `Day ${daysElapsed}/${totalDays}`;
  }
  if (countsEl) countsEl.innerHTML = buildMiniProgressBar(stories, { riskText });
  if (listEl) {
    listEl.innerHTML = stories.length > 0
      ? stories.map(s => renderTicketRow(s, null)).join('')
      : '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">No tickets in sprint.</div>';
  }
}

function renderMyTicketsSection(myStories, jiraBaseUrl) {
  const totalEl = document.getElementById('my-tickets-total');
  const listEl  = document.getElementById('my-tickets-list');

  const totalPts = myStories.reduce((s, t) => s + (t.points || 0), 0);
  const doneCount = myStories.filter(s => s.statusCategory === 'done').length;

  if (totalEl) {
    totalEl.textContent = myStories.length > 0
      ? `${myStories.length} · ${totalPts > 0 ? `${totalPts}pt · ` : ''}${doneCount}/${myStories.length} done`
      : '';
  }
  if (listEl) {
    listEl.innerHTML = myStories.length > 0
      ? myStories.map(s => renderTicketRow(s, jiraBaseUrl)).join('')
      : '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">🎉 No tickets assigned in this sprint.</div>';
    wireTicketClicks(listEl);
  }
}

function wireTicketClicks(container) {
  if (!container) return;
  container.querySelectorAll('.ticket-row[data-url]').forEach(row => {
    if (row.dataset.wired) return;
    row.dataset.wired = '1';
    row.addEventListener('click', () => chrome.tabs.create({ url: row.dataset.url }));
  });
}

function renderAll(data, settings) {
  const { sprint, stories } = data;
  const accountId   = settings.jira?.accountId;
  const jiraBaseUrl = settings.jira?.baseUrl || '';
  const workingDays = settings.sprint?.workingDays || [0,1,2,3,4];

  const projectKey = deriveProjectKey(sprint.name, stories);
  renderContextBar(sprint, projectKey);
  renderSprintSection(sprint, stories, workingDays);

  const myStories = accountId
    ? stories.filter(s => s.assigneeAccountId === accountId)
    : stories;
  renderMyTicketsSection(myStories, jiraBaseUrl);

  showScreen('screen-home');
}

// ── Collapsibles ───────────────────────────────────────────────────────────
function wireCollapsibles() {
  [
    { headerId: 'sprint-section-header', bodyId: 'sprint-glance-body',  chevronId: 'sprint-section-chevron' },
    { headerId: 'my-tickets-header',     bodyId: 'my-tickets-body',     chevronId: 'my-tickets-chevron'     },
  ].forEach(({ headerId, bodyId, chevronId }) => {
    const header  = document.getElementById(headerId);
    const body    = document.getElementById(bodyId);
    const chevron = document.getElementById(chevronId);
    if (!header || !body || header.dataset.wired) return;
    header.dataset.wired = '1';
    header.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      if (chevron) chevron.innerHTML = open ? '&#9654;' : '&#9660;';
    });
  });
}

// ── Refresh ────────────────────────────────────────────────────────────────
let _currentSettings = null;

function showErrorBanner(message) {
  let b = document.getElementById('error-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'error-banner';
    b.style.cssText =
      'padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);' +
      'border-radius:6px;margin:8px 12px;font-size:12px;color:#ef4444;';
    document.getElementById('screen-container')?.prepend(b);
  }
  b.innerHTML = `<strong>⚠ Refresh failed:</strong> ${escapeHtml(message)}<br/>` +
    `<small style="color:var(--text-muted);">Check your Jira credentials in Settings.</small>`;
}

async function refreshDashboard() {
  if (!_currentSettings) return;
  setSectionLoading('sprint-loading-pill', true);
  try {
    const data = await fetchSprintData(_currentSettings);
    await writeCache(data);
    renderAll(data, _currentSettings);
    wireCollapsibles();
    setLastFetchTime(Date.now());
    startRefreshTimer(Date.now());
    document.getElementById('error-banner')?.remove();
  } catch (err) {
    console.error('[popup] Refresh failed:', err.message);
    showErrorBanner(err.message);
  } finally {
    setSectionLoading('sprint-loading-pill', false);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await runMigrations().catch(e => console.warn('[popup] Migration:', e.message));

  document.getElementById('settings-btn')
    ?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('auth-goto-settings')
    ?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('context-refresh')
    ?.addEventListener('click', refreshDashboard);

  wireCollapsibles();

  const result   = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  if (!settings.jira?.token) {
    document.getElementById('auth-message').textContent =
      'Connect your Jira account to get started.';
    showScreen('screen-auth');
    return;
  }
  if (!settings.sprint?.boardId) {
    document.getElementById('auth-message').textContent =
      'Almost there — set your sprint board ID in Settings to see your tickets.';
    showScreen('screen-auth');
    return;
  }

  _currentSettings = settings;

  const cache = await readCache();
  if (cache?.sprint && cache?.stories) {
    console.log('[popup] Rendering from cache (age:',
      Math.round((Date.now() - cache.fetchedAt) / 60000), 'min)');
    renderAll(cache, settings);
    wireCollapsibles();
    startRefreshTimer(cache.fetchedAt);
  } else {
    setSectionLoading('sprint-loading-pill', true);
  }

  try {
    const data = await fetchSprintData(settings);
    await writeCache(data);
    renderAll(data, settings);
    wireCollapsibles();
    setLastFetchTime(Date.now());
    startRefreshTimer(Date.now());
  } catch (err) {
    console.error('[popup] Initial fetch failed:', err.message);
    if (!cache) {
      document.getElementById('auth-message').textContent =
        `Failed to load sprint data: ${err.message}. Check Settings.`;
      showScreen('screen-auth');
    } else {
      showErrorBanner(err.message);
    }
  } finally {
    setSectionLoading('sprint-loading-pill', false);
  }
}

// ── Message listener ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'settings-updated') {
    chrome.storage.local.remove([CACHE_KEY]).then(() => location.reload());
  }
});

boot();
