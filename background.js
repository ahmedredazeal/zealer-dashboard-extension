/**
 * background.js — Zealer Dashboard service worker
 *
 * Phase 0 responsibilities (intentionally minimal):
 *   1. Run data migrations on init (idempotent)
 *   2. Configure side panel to open on toolbar click
 *   3. Broadcast settings-updated messages from settings page to popup
 *
 * Data-fetch orchestration arrives in Phase 2+.
 * Per brief §2: "No persistent service worker timers."
 */

import { runMigrations } from './src/migrations.js';
import { JiraClient }       from './src/jira-api.js';
import { SentryClient }     from './src/sentry-api.js';
import { parseSentryUrl }   from './src/parsers.js';
import { recordTrendSample } from './src/sentry-trend.js';

// Run migrations on service worker init (idempotent — flagged per migration)
runMigrations().catch(err => console.warn('[background] Migration failed:', err.message));

/**
 * Record today's Sentry trend sample from settings.
 * Mirrors EM's fetchSentryData recording logic exactly:
 *   - Uses parseSentryUrl to derive viewId + projectIds + environment from the URL
 *   - Uses settings.sentry.org as orgSlug (same as EM's settings.sentry.org field)
 *   - Records only if viewId is valid and API call succeeds
 * Called on every panel open so samples accumulate passively.
 */
async function fetchAndRecordSentryTrend(settings) {
  const sentry = settings?.sentry;
  if (!sentry?.viewUrl || !sentry?.token) {
    console.log('[background] Sentry not configured — skipping trend recording');
    return;
  }

  const parsed = parseSentryUrl(sentry.viewUrl);
  if (!parsed?.viewId) {
    console.warn('[background] Could not parse Sentry view URL:', sentry.viewUrl);
    return;
  }

  const { viewId, projectIds, environment } = parsed;
  const env = environment || 'production';
  // v1.7.0 port: pass query/sort/statsPeriod from the URL so count matches Sentry UI.
  // When statsPeriod is absent, Sentry returns all-time issues (no 7-day truncation).
  const viewParams = {
    query:       parsed.query       || null,
    sort:        parsed.sort        || null,
    statsPeriod: parsed.statsPeriod || null,
  };

  try {
    const client = new SentryClient(
      sentry.baseUrl || parsed.baseUrl || 'https://sentry.io',
      sentry.org || parsed.orgSlug || '',
      '',
      sentry.token
    );
    const issues = await client.getIssuesFromView(viewId, projectIds, env, viewParams);
    const count  = Array.isArray(issues) ? issues.length : 0;
    await recordTrendSample(viewId, count);
    console.log(`[background] Sentry trend recorded: view ${viewId} → ${count} issues`);
  } catch (err) {
    console.warn('[background] Sentry trend recording failed:', err.message);
  }
}

// Run migrations on service worker init (idempotent — flagged per migration)
runMigrations().catch(err => console.warn('[background] Migration failed:', err.message));

/**
 * Configure side panel on install/update
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[background] Zealer Dashboard installed/updated');
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log('[background] Side panel configured to open on toolbar click');
});

/**
 * Configure side panel on startup (when Chrome restarts)
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[background] Zealer Dashboard starting up');
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/**
 * Message router (Phase 2+: settings-updated relay + Sentry trend recording).
 *
 * Per brief §4 lesson #4: return undefined for fire-and-forget patterns.
 * Returning true without calling sendResponse causes Chrome to log
 * "message channel closed before response received".
 */
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type === 'settings-updated') {
    // Settings page saved — popup may want to re-read storage.
    console.log('[background] settings-updated received');
    return; // fire-and-forget — explicit return undefined
  }

  if (msg?.type === 'panel-opened') {
    // Popup opened — record today's Sentry trend sample in the background.
    // Mirrors EM's architecture: background records, popup only reads.
    chrome.storage.local.get(['settings']).then(r => {
      if (r.settings) {
        fetchAndRecordSentryTrend(r.settings).catch(e =>
          console.warn('[background] Sentry trend error:', e.message)
        );
      }
    }).catch(() => {});
    return; // fire-and-forget
  }
});
