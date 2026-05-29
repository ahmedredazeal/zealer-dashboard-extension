/**
 * popup.js — Zealer Dashboard side panel controller (Phase 3)
 *
 * Data flow (Option B — parallel):
 *   boot → settings → render stale cache → fire 3 parallel fetches:
 *     1. Light  fetch: active sprint + issues (My Tickets, Sprint Progress)
 *     2. Heavy  fetch: same issues + changelog + worklog (Insights charts)
 *     3. Support fetch: support board issues (if supportBoardId configured)
 *   Sentry trend: recordTrendSample fires in parallel then reads stored samples.
 *   Quarter view: lazily fetched on first toggle, cached per quarter in session.
 */

import { JiraClient }               from './src/jira-api.js';
import { normalizeStory }           from './src/parsers.js';
import { runMigrations }            from './src/migrations.js';
import { attachCloseTimestamps }    from './src/changelog-parser.js';
import { computeBurndownSeries, sprintDayLabels } from './src/burndown.js';
import { sprintBurndownPrediction } from './src/metrics.js';
import { recordTrendSample, getTrendSamples } from './src/sentry-trend.js';
import { SentryClient }             from './src/sentry-api.js';
import {
  extractEngineerWorklogs,
  computeDailyTimesheet,
  computeEngineerEstVsActual,
  computeQuarterTimesheet,
  quarterDateRange,
} from './src/engineer-timesheet.js';
import {
  renderSprintProgressBar,
  renderBurndownCard,
  renderSupportBoardChart,
  renderDailyTimesheetChart,
  renderSprintTimesheetChart,
  renderEstVsActualCard,
  renderSentryTrendCard,
} from './src/engineer-charts.js';
import {
  escapeHtml,
  renderTicketRow,
  deriveProjectKey,
  sprintDayMetrics,
} from './src/ticket-render.js';

// ── Constants ──────────────────────────────────────────────────────────────
const REFRESH_CYCLE_MS = 30 * 60 * 1000;
const ELAPSED_MODE_MS  =  5 * 60 * 1000;
const LIGHT_CACHE      = 'myTicketsCache';
const INSIGHTS_CACHE   = 'insightsCache';

// ── Session state ──────────────────────────────────────────────────────────
let _settings       = null;
let _lightData      = null;   // { sprint, stories, storyPointsField }
let _insightsData   = null;   // { storiesHeavy, worklogs, supportStories }
let _quarterCache   = {};     // { Q1: [...], Q2: [...], ... }
let _timeFilter     = 'sprint';
let _timerInterval  = null;
let _lastFetchTime  = null;

// ── Refresh timer (mirrors EM 30-min pattern) ──────────────────────────────
function startRefreshTimer(ts) {
  if (_timerInterval) clearInterval(_timerInterval);
  _lastFetchTime = ts;
  updateRefreshTimer();
  _timerInterval = setInterval(updateRefreshTimer, 1000);
}

function updateRefreshTimer() {
  const el = document.getElementById('refresh-countdown');
  if (!el || !_lastFetchTime) return;
  const elapsed   = Date.now() - _lastFetchTime;
  const remaining = Math.max(0, REFRESH_CYCLE_MS - elapsed);
  if (elapsed < ELAPSED_MODE_MS) {
    const mins = Math.floor(elapsed / 60000);
    el.textContent = mins < 1 ? 'just now' : `${mins}m ago`;
    el.style.color = 'var(--text-muted)';
  } else {
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    el.style.color = remaining < 5*60*1000 ? '#f59e0b' : 'var(--text-muted)';
    if (remaining === 0) refreshDashboard();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showScreen(id) {
  ['screen-auth','screen-home'].forEach(s => document.getElementById(s)?.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}

function setLoading(id, on) { document.getElementById(id)?.classList.toggle('visible', on); }

function inject(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ── Cache helpers ──────────────────────────────────────────────────────────
async function readCache(key) {
  const r = await chrome.storage.local.get([key]);
  return r[key] || null;
}

async function writeCache(key, data) {
  await chrome.storage.local.set({ [key]: { ...data, fetchedAt: Date.now() } });
}

// ── Jira fetches ───────────────────────────────────────────────────────────

/** Light fetch — sprint + issues, no changelog or worklog. Used by My Tickets + Sprint Progress. */
async function fetchLightData(settings) {
  const { baseUrl, email, token } = settings.jira;
  const boardId = settings.sprint.boardId;
  const client  = new JiraClient(baseUrl, email, token);

  const sprint = await client.getActiveSprint(boardId);
  let spf      = settings._cachedSpf?.[boardId];
  if (!spf) {
    spf = await client.getStoryPointsField(boardId);
    const r = await chrome.storage.local.get(['settings']);
    const s = r.settings || {};
    s._cachedSpf = { ...(s._cachedSpf || {}), [boardId]: spf };
    await chrome.storage.local.set({ settings: s });
  }

  const jql = `sprint = ${sprint.id} AND issuetype not in subTaskIssueTypes() ORDER BY priority DESC, updated DESC`;
  const result = await client._search({ jql, fields: ['summary','status','assignee','priority',spf,'customfield_10016','customfield_10026','duedate','labels'], maxResults: 100 });
  const stories = (result.issues || []).map(i => normalizeStory(i, spf));

  return { sprint, stories, storyPointsField: spf, client };
}

/** Heavy fetch — same issues but with changelog + worklog + timeoriginalestimate. */
async function fetchInsightsData(settings, sprint, spf) {
  const { baseUrl, email, token } = settings.jira;
  const client = new JiraClient(baseUrl, email, token);

  const jql = `sprint = ${sprint.id} AND issuetype not in subTaskIssueTypes()`;
  const fields = ['summary','status','assignee','priority',spf,'customfield_10016','customfield_10026','duedate','labels','worklog','timeoriginalestimate'];

  // Bug fix: expand must be inside body, not a second positional arg
  const result = await client._search({ jql, fields, maxResults: 100, expand: 'changelog' });
  const rawIssues = result.issues || [];

  // Bug fix: attachCloseTimestamps(rawIssues, stories, sprintStartDate) — returns new array
  const normalized    = rawIssues.map(i => normalizeStory(i, spf));
  const storiesHeavy  = attachCloseTimestamps(rawIssues, normalized, sprint.startDate);

  // Extract engineer worklogs
  const accountId = settings.jira.accountId;
  const worklogs  = accountId ? extractEngineerWorklogs(rawIssues, accountId) : [];

  // Estimate vs actual
  const estVsActual = accountId
    ? computeEngineerEstVsActual(rawIssues, accountId, settings.jira.displayName || 'Me')
    : null;

  return { storiesHeavy, worklogs, estVsActual, rawIssues };
}

/** Support board fetch — mirrors EM's getKanbanBoardIssues pattern exactly.
 *  Fetches the board's own filter JQL via the board config API, then appends
 *  `status != "Closed"` to exclude only truly terminal tickets.
 *  Works for Kanban and Scrum boards; no hardcoded status names. */
async function fetchSupportData(settings) {
  const sbId = settings.sprint?.supportBoardId;
  if (!sbId) return [];

  const { baseUrl, email, token } = settings.jira;
  const client = new JiraClient(baseUrl, email, token);
  const spf    = settings._cachedSpf?.[settings.sprint.boardId] || 'customfield_10016';

  try {
    // getKanbanBoardIssues: reads board.filter.id → filter JQL → appends status != "Closed"
    // This is exactly what EM does for extra/support boards.
    const rawIssues = await client.getKanbanBoardIssues(sbId, spf, { excludeClosed: true });
    console.log(`[popup] Support board ${sbId}: ${rawIssues.length} open issues`);
    return rawIssues.map(i => normalizeStory(i, spf));
  } catch (err) {
    console.warn('[popup] Support board fetch failed:', err.message);
    return [];
  }
}

/** Quarter fetch (lazy) — issues with worklog + sprint field logged by engineer. */
async function fetchQuarterData(settings, quarter) {
  const { baseUrl, email, token, accountId } = settings.jira;
  const boardId    = settings.sprint?.boardId;
  const workingDays = settings.sprint?.workingDays || [0,1,2,3,4];
  const client     = new JiraClient(baseUrl, email, token);
  const { start, end } = quarterDateRange(quarter);

  const jql    = `worklogDate >= "${start}" AND worklogDate <= "${end}" AND issuetype not in subTaskIssueTypes()`;
  const fields = ['worklog', 'customfield_10020'];
  const result = await client._search({ jql, fields, maxResults: 200 });
  const rawIssues = result.issues || [];

  return computeQuarterTimesheet(rawIssues, accountId, start, end, workingDays);
}

// ── Sentry trend ───────────────────────────────────────────────────────────
async function loadSentryTrend(settings) {
  const sentry  = settings.sentry;
  const viewId  = sentry?.viewId;
  // Use org slug for the label; fall back to viewId
  const viewLabel = sentry?.org ? `${sentry.org} · View ${viewId || ''}` : (viewId ? `View ${viewId}` : '');

  if (!viewId || !sentry?.token) {
    inject('sentry-trend-container', renderSentryTrendCard('', []));
    return;
  }

  // Record today's sample: fetch live count → recordTrendSample(viewId, count)
  // Bug fix: SentryClient(baseUrl, orgSlug, projectSlug, token) — 4 args
  // Bug fix: recordTrendSample(viewId, count) — not (client, org, viewId, projectIds)
  try {
    const sc    = new SentryClient(
      sentry.baseUrl || 'https://sentry.io',
      sentry.org || '',
      null,
      sentry.token
    );
    const env    = sentry.environment || undefined; // undefined → API default ('production')
    const issues = await sc.getIssuesFromView(viewId, sentry.projectIds || [], env);
    const count  = Array.isArray(issues) ? issues.length : 0;
    await recordTrendSample(viewId, count);
  } catch (e) {
    console.warn('[popup] Sentry sample failed:', e.message);
  }

  const samples = await getTrendSamples(viewId).catch(() => []);
  inject('sentry-trend-container', renderSentryTrendCard(viewLabel, samples));
}

// ── Render functions ───────────────────────────────────────────────────────

function renderContextBar(sprint, projectKey) {
  const bar = document.getElementById('context-bar');
  if (!bar) return;
  bar.classList.remove('empty');
  const keyEl = document.getElementById('context-key');
  const sep   = document.getElementById('context-sep-1');
  if (projectKey) {
    keyEl.textContent = projectKey; keyEl.style.display = 'inline-flex';
    sep.style.display = 'inline';
  } else {
    keyEl.style.display = 'none'; sep.style.display = 'none';
  }
  document.getElementById('context-sprint').textContent = sprint.name || 'Current Sprint';
  document.getElementById('context-refresh').style.display = 'inline-block';
  document.getElementById('refresh-countdown').style.display = 'inline';
}

// ── Shared date-range helper ───────────────────────────────────────────────
function formatDateRange(startDate, endDate) {
  const fmt = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

// ── Squad Insights (team charts) ──────────────────────────────────────────
function renderSquadInsights(lightData, insightsData, settings) {
  const { sprint, stories } = lightData;
  const workingDays = settings.sprint?.workingDays || [0,1,2,3,4];
  const { totalDays } = sprintDayMetrics(sprint, workingDays);

  // Sprint progress bar (all stories, all assignees)
  inject('sprint-progress-container', renderSprintProgressBar(stories));

  // Burndown (needs heavy data with changelog)
  if (insightsData?.storiesHeavy) {
    const totalPoints = insightsData.storiesHeavy.reduce((s,t) => s + (t.points||0), 0);
    const bd = computeBurndownSeries({ ...sprint, totalDays, totalPoints }, insightsData.storiesHeavy);
    inject('burndown-container', renderBurndownCard(bd, formatDateRange(sprint.startDate, sprint.endDate)));
  } else {
    inject('burndown-container',
      '<div style="padding:10px 12px;background:var(--surface);border:1px solid var(--border,rgba(255,255,255,.05));border-radius:8px;font-size:12px;color:var(--text-muted);">Loading burndown…</div>'
    );
  }
  // Support board renders separately via renderSupportBoard() after its own fetch
}

// ── Individual Insights (personal charts) ─────────────────────────────────
function renderIndividualInsights(insightsData, settings, sprint) {
  if (!insightsData) {
    inject('time-logged-container',
      '<div style="padding:10px 12px;background:var(--surface);border:1px solid var(--border,rgba(255,255,255,.05));border-radius:8px;font-size:12px;color:var(--text-muted);">Loading…</div>'
    );
    inject('est-vs-actual-container', '');
    return;
  }
  const workingDays = settings.sprint?.workingDays || [0,1,2,3,4];
  const dr = formatDateRange(sprint.startDate, sprint.endDate);

  const days = computeDailyTimesheet(insightsData.worklogs, sprint.startDate, sprint.endDate, workingDays);
  inject('time-logged-container', renderDailyTimesheetChart(days, dr));

  if (insightsData.estVsActual) {
    inject('est-vs-actual-container', renderEstVsActualCard(insightsData.estVsActual, dr));
  } else {
    inject('est-vs-actual-container', '');
  }
}

function renderSupportBoard(supportStories) {
  const html = supportStories?.length
    ? renderSupportBoardChart(supportStories)
    : '<div style="font-size:11px;color:var(--text-muted);padding:8px;">No open support tickets.</div>';
  inject('support-board-container', html);
}

function renderMyTicketsSection(stories, settings) {
  const accountId   = settings.jira?.accountId;
  const jiraBaseUrl = settings.jira?.baseUrl || '';
  const myStories   = accountId ? stories.filter(s => s.assigneeAccountId === accountId) : stories;

  const totalPts  = myStories.reduce((s,t) => s + (t.points||0), 0);
  const doneCount = myStories.filter(s => s.statusCategory === 'done').length;
  const totalEl   = document.getElementById('my-tickets-total');
  if (totalEl) {
    totalEl.textContent = myStories.length > 0
      ? `${myStories.length} · ${totalPts > 0 ? `${totalPts}pt · ` : ''}${doneCount}/${myStories.length} done`
      : '';
  }

  const listEl = document.getElementById('my-tickets-list');
  if (listEl) {
    listEl.innerHTML = myStories.length > 0
      ? myStories.map(s => renderTicketRow(s, jiraBaseUrl)).join('')
      : '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">🎉 No tickets assigned this sprint.</div>';
    listEl.querySelectorAll('.ticket-row[data-url]').forEach(row => {
      if (row.dataset.wired) return;
      row.dataset.wired = '1';
      row.addEventListener('click', () => chrome.tabs.create({ url: row.dataset.url }));
    });
  }
}

// ── Time filter ────────────────────────────────────────────────────────────
async function applyTimeFilter(filter) {
  _timeFilter = filter;

  // Update button styles
  document.querySelectorAll('.timefilter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  const sprintRow  = document.getElementById('time-row-sprint');
  const quarterRow = document.getElementById('time-row-quarter');

  if (filter === 'sprint') {
    if (sprintRow)  sprintRow.style.display  = '';
    if (quarterRow) quarterRow.style.display = 'none';
    return;
  }

  // Quarter mode
  if (sprintRow)  sprintRow.style.display  = 'none';
  if (quarterRow) quarterRow.style.display = '';

  if (_quarterCache[filter]) {
    inject('quarter-time-logged-container', renderSprintTimesheetChart(_quarterCache[filter], `${filter} ${new Date().getFullYear()}`));
    return;
  }

  inject('quarter-time-logged-container', '<div style="font-size:12px;color:var(--text-muted);padding:8px;">Loading…</div>');

  try {
    const sprints = await fetchQuarterData(_settings, filter);
    _quarterCache[filter] = sprints;
    inject('quarter-time-logged-container', renderSprintTimesheetChart(sprints, `${filter} ${new Date().getFullYear()}`));
  } catch (err) {
    inject('quarter-time-logged-container', `<div style="font-size:12px;color:#ef4444;padding:8px;">Failed to load ${filter} data: ${escapeHtml(err.message)}</div>`);
  }
}

// ── Collapsibles ───────────────────────────────────────────────────────────
function wireCollapsibles() {
  [
    { headerId:'squad-insights-header',       bodyId:'squad-insights-body',       chevronId:'squad-insights-chevron',       initOpen:true  },
    { headerId:'individual-insights-header',  bodyId:'individual-insights-body',  chevronId:'individual-insights-chevron',  initOpen:true  },
    { headerId:'my-tickets-header',           bodyId:'my-tickets-body',           chevronId:'my-tickets-chevron',           initOpen:false },
  ].forEach(({ headerId, bodyId, chevronId, initOpen }) => {
    const hdr     = document.getElementById(headerId);
    const body    = document.getElementById(bodyId);
    const chevron = document.getElementById(chevronId);
    if (!hdr || !body || hdr.dataset.wired) return;
    hdr.dataset.wired = '1';
    body.style.display = initOpen ? '' : 'none';
    if (chevron) chevron.innerHTML = initOpen ? '&#9660;' : '&#9654;';
    hdr.addEventListener('click', () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      if (chevron) chevron.innerHTML = open ? '&#9654;' : '&#9660;';
    });
  });
}

function wireTimeFilterButtons() {
  document.querySelectorAll('.timefilter-btn').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => applyTimeFilter(btn.dataset.filter));
  });
}

// ── Error banner ───────────────────────────────────────────────────────────
function showErrorBanner(msg) {
  let b = document.getElementById('error-banner');
  if (!b) {
    b = document.createElement('div'); b.id = 'error-banner';
    b.style.cssText = 'padding:8px 12px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:6px;margin:8px 12px;font-size:12px;color:#ef4444;';
    document.getElementById('screen-container')?.prepend(b);
  }
  b.innerHTML = `<strong>⚠ Refresh failed:</strong> ${escapeHtml(msg)}<br/><small style="color:var(--text-muted);">Check your Jira credentials in Settings.</small>`;
}

// ── Refresh ────────────────────────────────────────────────────────────────
async function refreshDashboard() {
  if (!_settings) return;
  setLoading('squad-loading-pill', true);
  _quarterCache = {}; // invalidate quarter cache on manual refresh
  try {
    // Parallel: light + insights + support + sentry
    const [lightData, , supportStories] = await Promise.all([
      fetchLightData(_settings),
      loadSentryTrend(_settings),
      _settings.sprint?.supportBoardId ? fetchSupportData(_settings) : Promise.resolve([]),
    ]);
    _lightData = lightData;

    // Write light cache
    await writeCache(LIGHT_CACHE, { sprint: lightData.sprint, stories: lightData.stories, storyPointsField: lightData.storyPointsField });

    // Render with light data first
    renderContextBar(lightData.sprint, deriveProjectKey(lightData.sprint.name, lightData.stories));
    renderSquadInsights(lightData, null, _settings);
    renderIndividualInsights(null, _settings, lightData.sprint);
    renderSupportBoard(supportStories);
    renderMyTicketsSection(lightData.stories, _settings);
    showScreen('screen-home');
    wireCollapsibles();
    wireTimeFilterButtons();

    // Then heavy fetch
    const insightsData = await fetchInsightsData(_settings, lightData.sprint, lightData.storyPointsField);
    _insightsData = insightsData;
    await writeCache(INSIGHTS_CACHE, { sprint: lightData.sprint, storiesHeavy: insightsData.storiesHeavy, worklogs: insightsData.worklogs, estVsActual: insightsData.estVsActual });
    renderSquadInsights(lightData, insightsData, _settings);
    renderIndividualInsights(insightsData, _settings, lightData.sprint);

    startRefreshTimer(Date.now());
    document.getElementById('error-banner')?.remove();
  } catch (err) {
    console.error('[popup] Refresh failed:', err.message);
    showErrorBanner(err.message);
  } finally {
    setLoading('squad-loading-pill', false);
    setLoading('individual-loading-pill', false);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await runMigrations().catch(e => console.warn('[popup] Migration:', e.message));

  document.getElementById('settings-btn')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('auth-goto-settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('context-refresh')?.addEventListener('click', refreshDashboard);

  wireCollapsibles();
  wireTimeFilterButtons();

  const result   = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  if (!settings.jira?.token) {
    inject('auth-message', 'Link your accounts, to get started.');
    showScreen('screen-auth'); return;
  }
  if (!settings.sprint?.boardId) {
    inject('auth-message', 'Almost there — set your sprint board ID in Settings.');
    showScreen('screen-auth'); return;
  }

  _settings = settings;

  // Stale-while-revalidate: paint from cache immediately
  const lightCache    = await readCache(LIGHT_CACHE);
  const insightsCache = await readCache(INSIGHTS_CACHE);
  if (lightCache?.sprint && lightCache?.stories) {
    renderContextBar(lightCache.sprint, deriveProjectKey(lightCache.sprint.name, lightCache.stories));
    renderSquadInsights(lightCache, insightsCache, settings);
    renderIndividualInsights(insightsCache, settings, lightCache.sprint);
    renderMyTicketsSection(lightCache.stories, settings);
    showScreen('screen-home');
    wireCollapsibles();
    wireTimeFilterButtons();
    startRefreshTimer(lightCache.fetchedAt);
  } else {
    setLoading('squad-loading-pill', true);
    setLoading('individual-loading-pill', true);
  }

  // Parallel fetches
  try {
    const [lightData, , supportStories] = await Promise.all([
      fetchLightData(settings),
      loadSentryTrend(settings),
      settings.sprint?.supportBoardId ? fetchSupportData(settings) : Promise.resolve([]),
    ]);
    _lightData = lightData;
    await writeCache(LIGHT_CACHE, { sprint: lightData.sprint, stories: lightData.stories, storyPointsField: lightData.storyPointsField });

    renderContextBar(lightData.sprint, deriveProjectKey(lightData.sprint.name, lightData.stories));
    renderSquadInsights(lightData, insightsCache, settings);
    renderIndividualInsights(insightsCache, settings, lightData.sprint);
    renderSupportBoard(supportStories);
    renderMyTicketsSection(lightData.stories, settings);
    showScreen('screen-home');
    wireCollapsibles();
    wireTimeFilterButtons();

    // Heavy fetch
    const insightsData = await fetchInsightsData(settings, lightData.sprint, lightData.storyPointsField);
    _insightsData = insightsData;
    await writeCache(INSIGHTS_CACHE, { sprint: lightData.sprint, storiesHeavy: insightsData.storiesHeavy, worklogs: insightsData.worklogs, estVsActual: insightsData.estVsActual });
    renderSquadInsights(lightData, insightsData, settings);
    renderIndividualInsights(insightsData, settings, lightData.sprint);

    startRefreshTimer(Date.now());
  } catch (err) {
    console.error('[popup] Boot fetch failed:', err.message);
    if (!lightCache) {
      inject('auth-message', `Failed to load: ${err.message}. Check Settings.`);
      showScreen('screen-auth');
    } else {
      showErrorBanner(err.message);
    }
  } finally {
    setLoading('squad-loading-pill', false);
    setLoading('individual-loading-pill', false);
  }
}

// ── Message listener ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'settings-updated') {
    chrome.storage.local.remove([LIGHT_CACHE, INSIGHTS_CACHE]).then(() => location.reload());
  }
});

boot();
