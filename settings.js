/**
 * settings.js — Zealer Dashboard settings page controller
 *
 * Storage shape (chrome.storage.local.settings):
 * {
 *   jira:    { baseUrl, email, token, accountId, displayName },
 *   sentry:  { baseUrl, org, viewUrl, viewId, projectIds, environment, token },
 *   sprint:  { boardId, workingDays },   // workingDays: number[] 0..6 (0=Sun)
 *   leapsome:{ token },                  // disabled in UI for now
 *   google:  { connected },              // disabled in UI for now
 *   ui:      { theme, privacyMode }
 * }
 *
 * The Jira "Test connection" button calls /rest/api/3/myself and caches
 * accountId + displayName from the response. This is what the popup uses
 * to greet the engineer by name.
 */

import { parseSentryUrl } from './src/parsers.js';
import { runMigrations } from './src/migrations.js';

const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4]; // Sun–Thu

// ── Helpers ────────────────────────────────────────────────────────────────

function showResult(el, ok, message) {
  el.textContent = (ok ? '✓ ' : '✗ ') + message;
  el.style.background = ok ? 'var(--status-on-track-bg)' : 'var(--status-off-track-bg)';
  el.style.color      = ok ? 'var(--status-on-track)'    : 'var(--status-off-track)';
  el.classList.remove('hidden');
}

function setBtnLoading(btn, originalLabel, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Testing…' : originalLabel;
}

function updateSentryPreview() {
  const urlInput = document.getElementById('sentry-view-url');
  const previewEl = document.getElementById('sv-preview');
  const url = urlInput.value.trim();

  if (!url) {
    previewEl.textContent = '';
    urlInput.style.borderColor = '';
    return;
  }

  const parsed = parseSentryUrl(url);
  if (!parsed) {
    previewEl.innerHTML = `<span style="color:var(--status-off-track);">Couldn't parse this URL — make sure it's a Sentry view URL</span>`;
    urlInput.style.borderColor = 'var(--status-off-track)';
    return;
  }

  urlInput.style.borderColor = 'var(--status-on-track)';
  const parts = [
    `View ${parsed.viewId}`,
    parsed.projectIds.length > 0
      ? `${parsed.projectIds.length} project${parsed.projectIds.length > 1 ? 's' : ''}`
      : 'all projects',
    parsed.environment || null,
    parsed.query || null,
  ].filter(Boolean);
  previewEl.innerHTML = `<span style="color:var(--status-on-track);">✓</span> ${parts.join(' · ')}`;
}

function getCheckedWorkingDays() {
  return Array.from(document.querySelectorAll('#working-days input[type=checkbox]:checked'))
    .map(cb => parseInt(cb.value, 10))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);
}

function setCheckedWorkingDays(days) {
  const set = new Set(days || DEFAULT_WORKING_DAYS);
  document.querySelectorAll('#working-days input[type=checkbox]').forEach(cb => {
    cb.checked = set.has(parseInt(cb.value, 10));
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

(async function init() {
  // Apply any pending migrations before reading settings
  await runMigrations().catch(err => console.warn('[settings] Migration failed:', err.message));

  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  // Populate form ─ Jira
  if (settings.jira) {
    document.getElementById('jira-url').value   = settings.jira.baseUrl || '';
    document.getElementById('jira-email').value = settings.jira.email   || '';
    document.getElementById('jira-token').value = settings.jira.token   || '';
  }

  // Populate form ─ Sentry
  document.getElementById('sentry-url').value = settings.sentry?.baseUrl  || 'https://zeal.sentry.io';
  document.getElementById('sentry-org').value = settings.sentry?.org      || '';
  document.getElementById('sentry-view-url').value = settings.sentry?.viewUrl || '';
  document.getElementById('sentry-token').value = settings.sentry?.token  || '';
  updateSentryPreview();

  // Populate form ─ Sprint config
  if (settings.sprint) {
    document.getElementById('sprint-board-id').value = settings.sprint.boardId ?? '';
    setCheckedWorkingDays(settings.sprint.workingDays);
  } else {
    setCheckedWorkingDays(DEFAULT_WORKING_DAYS);
  }

  // Theme — apply current selection (theme-loader.js already applied it on load)
  const theme = settings.ui?.theme || 'browser';
  const radio = document.querySelector(`input[name="theme"][value="${theme}"]`);
  if (radio) radio.checked = true;

  // ── Wire events ─────────────────────────────────────────────────────────

  // Sentry view URL — live preview
  document.getElementById('sentry-view-url').addEventListener('input', updateSentryPreview);

  // Theme live-preview on change
  document.querySelectorAll('input[name="theme"]').forEach(r => {
    r.addEventListener('change', () => {
      document.documentElement.setAttribute('data-theme', r.value);
    });
  });

  // Test Jira connection — also caches accountId + displayName on success
  document.getElementById('jira-test-btn').addEventListener('click', async () => {
    const btn = document.getElementById('jira-test-btn');
    const resultDiv = document.getElementById('jira-test-result');
    const original = 'Test Jira connection';

    setBtnLoading(btn, original, true);
    resultDiv.classList.add('hidden');

    try {
      const baseUrl = document.getElementById('jira-url').value.trim().replace(/\/+$/, '');
      const email   = document.getElementById('jira-email').value.trim();
      const token   = document.getElementById('jira-token').value.trim();

      if (!baseUrl || !email || !token) {
        throw new Error('Please fill in all Jira fields');
      }

      const authHeader = 'Basic ' + btoa(`${email}:${token}`);
      const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Connection failed (${response.status})`);
      }

      const user = await response.json();
      const accountId = user.accountId;
      const displayName = user.displayName || user.emailAddress || email;

      if (!accountId) {
        throw new Error('Response missing accountId — is this a Jira Cloud instance?');
      }

      // Persist accountId + displayName immediately so popup can greet by name.
      const current = (await chrome.storage.local.get(['settings'])).settings || {};
      current.jira = {
        ...(current.jira || {}),
        baseUrl, email, token,
        accountId,
        displayName
      };
      await chrome.storage.local.set({ settings: current });
      chrome.runtime.sendMessage({ type: 'settings-updated' }).catch(() => { /* popup may be closed */ });

      showResult(resultDiv, true, `Connected as ${displayName}`);
    } catch (err) {
      showResult(resultDiv, false, err.message);
    } finally {
      setBtnLoading(btn, original, false);
    }
  });

  // Test Sentry connection
  document.getElementById('sentry-test-btn').addEventListener('click', async () => {
    const btn = document.getElementById('sentry-test-btn');
    const resultDiv = document.getElementById('sentry-test-result');
    const original = 'Test Sentry connection';

    setBtnLoading(btn, original, true);
    resultDiv.classList.add('hidden');

    try {
      const baseUrl = document.getElementById('sentry-url').value.trim().replace(/\/+$/, '');
      const org     = document.getElementById('sentry-org').value.trim();
      const token   = document.getElementById('sentry-token').value.trim();

      if (!baseUrl || !org || !token) {
        throw new Error('Please fill in all Sentry fields');
      }

      const response = await fetch(`${baseUrl}/api/0/organizations/${org}/`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Connection failed (${response.status})`);
      }

      const orgData = await response.json();
      showResult(resultDiv, true, `Connected to ${orgData.name || org}`);
    } catch (err) {
      showResult(resultDiv, false, err.message);
    } finally {
      setBtnLoading(btn, original, false);
    }
  });

  // Save settings
  document.getElementById('save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-btn');
    const resultDiv = document.getElementById('save-result');
    const original = 'Save settings →';

    btn.disabled = true;
    btn.textContent = 'Saving…';
    resultDiv.classList.add('hidden');

    try {
      // Read existing first so we preserve accountId/displayName cached by Test
      const existing = (await chrome.storage.local.get(['settings'])).settings || {};

      const sentryViewUrl = document.getElementById('sentry-view-url').value.trim();
      const sentryParsed  = sentryViewUrl ? parseSentryUrl(sentryViewUrl) : null;

      const boardIdRaw = document.getElementById('sprint-board-id').value.trim();
      const boardId = boardIdRaw ? parseInt(boardIdRaw, 10) : null;

      const newSettings = {
        jira: {
          baseUrl:     document.getElementById('jira-url').value.trim().replace(/\/+$/, ''),
          email:       document.getElementById('jira-email').value.trim(),
          token:       document.getElementById('jira-token').value.trim(),
          accountId:   existing.jira?.accountId   || null,
          displayName: existing.jira?.displayName || null,
        },
        sentry: {
          baseUrl:     document.getElementById('sentry-url').value.trim().replace(/\/+$/, ''),
          org:         document.getElementById('sentry-org').value.trim(),
          viewUrl:     sentryViewUrl,
          viewId:      sentryParsed?.viewId      || null,
          projectIds:  sentryParsed?.projectIds  || [],
          environment: sentryParsed?.environment || null,
          token:       document.getElementById('sentry-token').value.trim(),
        },
        sprint: {
          boardId: Number.isFinite(boardId) ? boardId : null,
          workingDays: getCheckedWorkingDays(),
        },
        // Reserved schemas for future phases — disabled in UI today
        leapsome: { token: existing.leapsome?.token || null },
        google:   { connected: existing.google?.connected || false },
        ui: {
          theme: document.querySelector('input[name="theme"]:checked')?.value || 'browser',
          privacyMode: existing.ui?.privacyMode || false,
        }
      };

      await chrome.storage.local.set({ settings: newSettings });

      // Notify popup so it re-renders the greeting
      chrome.runtime.sendMessage({ type: 'settings-updated' }).catch(() => { /* popup may be closed */ });

      // Apply theme immediately
      document.documentElement.setAttribute('data-theme', newSettings.ui.theme);

      showResult(resultDiv, true, 'Settings saved');

      // First-run UX: close settings tab 1s after first save, like EM
      const wasFirstRun = !existing.jira?.token;
      if (wasFirstRun) {
        setTimeout(() => window.close(), 1000);
      }
    } catch (err) {
      showResult(resultDiv, false, `Save failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

})();
