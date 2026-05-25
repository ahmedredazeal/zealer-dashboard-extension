/**
 * migrations.js — Zealer Dashboard
 * Handles data model migrations between extension versions.
 *
 * Engineer Dashboard's migration history starts fresh at v0.0.0
 * (it does NOT inherit EM Dashboard's migration baggage).
 *
 * To add a future migration:
 *   1. Write an async migrateToV_X_Y_Z(settings) function.
 *   2. Guard with settings.migrationsApplied['v_X_Y_Z_descriptor'].
 *   3. Call it from runMigrations() in chronological order.
 *   4. Persist with chrome.storage.local.set({ settings }) inside the function.
 */

/**
 * Run all necessary migrations against persisted settings.
 * Idempotent: each migration self-flags via settings.migrationsApplied.
 */
export async function runMigrations() {
  const result = await chrome.storage.local.get(['settings']);
  if (!result.settings) {
    console.log('[migration] No settings found, skipping migrations');
    return null;
  }

  let settings = result.settings;

  // No migrations yet — placeholder block for future use.
  // Example shape:
  //   settings = await migrateToV0_2_0(settings);
  //   settings = await migrateToV0_3_0(settings);

  return settings;
}

/**
 * Get current settings (with migrations applied).
 * Use this helper anywhere you'd previously read settings directly.
 */
export async function getSettings() {
  await runMigrations();
  const result = await chrome.storage.local.get(['settings']);
  return result.settings || null;
}
