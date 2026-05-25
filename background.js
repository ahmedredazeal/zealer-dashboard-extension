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
 * Message router (Phase 0: only settings-updated relay).
 *
 * Per brief §4 lesson #4: return undefined for fire-and-forget patterns.
 * Returning true without calling sendResponse causes Chrome to log
 * "message channel closed before response received".
 */
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type === 'settings-updated') {
    // Settings page saved — popup may want to re-read storage.
    // No reply needed; popup listens for the same broadcast directly,
    // but we log here for debuggability.
    console.log('[background] settings-updated received');
    return; // fire-and-forget — explicit return undefined
  }
});
