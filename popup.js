/**
 * popup.js — Zealer Dashboard side panel controller
 *
 * Phase 0 responsibilities (intentionally minimal):
 *   1. Read settings from chrome.storage.local
 *   2. If Jira identity (accountId + displayName) is cached → show home screen with greeting
 *   3. Otherwise → show auth screen with "Open settings" CTA
 *   4. Wire Settings button (top-right gear) to chrome.runtime.openOptionsPage()
 *   5. Listen for settings-updated broadcast and re-load
 *
 * Data sections (My Day, Insights, My Tickets, My Goals) are placeholders for
 * later phases — see docs/ARCHITECTURE.md.
 */

import { runMigrations } from './src/migrations.js';

const SCREEN_AUTH = 'screen-auth';
const SCREEN_HOME = 'screen-home';

function show(screenId) {
  document.getElementById(SCREEN_AUTH).classList.add('hidden');
  document.getElementById(SCREEN_HOME).classList.add('hidden');
  document.getElementById(screenId).classList.remove('hidden');
}

async function loadAndRender() {
  // Apply any pending migrations before reading settings
  await runMigrations().catch(err => console.warn('[popup] Migration failed:', err.message));

  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};

  const accountId = settings.jira?.accountId;
  const displayName = settings.jira?.displayName;

  if (accountId && displayName) {
    document.getElementById('greeting').textContent = `Hello, ${displayName} 👋`;
    document.getElementById('greeting-sub').textContent =
      'Phase 0 scaffolding — data sections arrive in upcoming phases.';
    show(SCREEN_HOME);
  } else {
    show(SCREEN_AUTH);
  }
}

function openSettings() {
  // chrome.runtime.openOptionsPage opens the page defined in manifest.options_page
  chrome.runtime.openOptionsPage().catch(err => {
    console.error('[popup] Failed to open settings:', err);
  });
}

// ── Wire up ────────────────────────────────────────────────────────────────
(async function init() {
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('open-settings-btn').addEventListener('click', openSettings);

  // Re-render when settings change (broadcast from settings.js after Save)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'settings-updated') {
      loadAndRender();
    }
  });

  await loadAndRender();
})();
