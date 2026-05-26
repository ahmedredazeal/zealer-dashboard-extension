# Changelog

## v0.1.0 (2026-05-26) — Phase 2: My Tickets

**Added:**
- Sprint data fetch on panel open (stale-while-revalidate): active sprint via
  `getActiveSprint(boardId)` then all sprint issues via `POST /rest/api/3/search/jql`
  scoped to the configured board's sprint ID.
- **Current Sprint section** — full EM-style header: sprint name, completed/total
  points, Day X/Y in working days, mini stacked progress bar (Done% / In flight /
  Open), at-risk prediction (`⚠ need N.Npt/d`) using the carried `sprintBurndownPrediction`
  from `src/metrics.js`. Collapsible with chevron, expanded by default.
- **My Tickets section** — tickets filtered to `assigneeAccountId === accountId`
  (the identity cached by the Settings page Jira Test). Ticket rows: priority dot,
  summary (1-line ellipsis), `PROJ-123 · Npt · 📅 due`, status badge. Click opens
  Jira issue in a new tab.
- **Context bar** — project key badge (derived from sprint name / story keys),
  sprint name, 30-min auto-refresh countdown, manual ↻ refresh button.
- **Refresh timer** — mirrors EM Dashboard: 0–5 min shows elapsed ("just now" /
  "Nm ago"), 5–30 min shows countdown to next auto-refresh, fires refresh at 0.
- `src/ticket-render.js` — new pure-function module: `escapeHtml`, `priorityDot`,
  `ticketStatusColor`, `ticketStatusIcon`, `formatDueDate`, `renderTicketRow`,
  `buildMiniProgressBar`, `deriveProjectKey`, `countWorkingDays`, `sprintDayMetrics`.
  DOM-free (string-replace escaping) so it runs in Node.js tests.
- `tests/ticket-render.test.js` — 48 unit tests covering all helpers.
- `tabs` permission added to manifest for `chrome.tabs.create` (ticket click → new tab).
- Error banner shown when fetch fails with stale cache available (stale data stays
  visible; banner is dismissible by a successful refresh).
- Auth screen now shows context-specific messages: "connect Jira" vs "set board ID".

**Changed:**
- `popup.html` — replaced Phase 3+ placeholder cards with the live sprint and
  my-tickets sections; My Day and My Goals placeholders remain with phase badges.
- `popup.js` — fully rewritten for Phase 2 data flow.
- `manifest.json` — version bumped to 0.1.0; `tabs` permission added.
- `pre-flight.sh` — `ticket-render.js` and `ticket-render.test.js` added to
  required-files and test-file lists.

**Tests:** 202 total (154 carried + 48 new), all passing.

---

## v0.0.1 (2026-05-25) — Phase 0 bootstrap

**Added:**
- Manifest V3 extension scaffolding with Chrome side panel as the primary UI.
- Settings page (functional) covering Jira connection, Sentry connection (single
  tracked view), sprint configuration (board ID + working days), theme swatches
  (light / dark / browser), and reserved sections for Leapsome and Google
  Calendar marked "🔮 Coming soon" pending later phases.
- Jira "Test connection" calls `/rest/api/3/myself` and caches `accountId` +
  `displayName` to `chrome.storage.local`. Popup uses these to greet the
  engineer by name on subsequent opens.
- Sentry "Test connection" calls `/api/0/organizations/{org}/`.
- Sentry view URL field shows a live preview (view ID, project count,
  environment) via the carried-over `parseSentryUrl` helper.
- Side panel popup with greeting screen and placeholder sections for My Day,
  Insights, My Tickets and My Goals (each labelled with the phase that will
  implement it).
- Slim service worker: runs migrations on init, configures the side panel to
  open on toolbar click, relays `settings-updated` messages. No persistent
  timers per architecture decision.
- Theme-loader (applies theme + version before paint to avoid flash).
- Pre-flight script with seven checks: JS syntax, brace balance, element-ID
  audit (popup.html ↔ popup.js), CSP compliance, required files, icons, and
  version-consistency between manifest, CHANGELOG.md, and changelog.html.

**Carried AS-IS from EM Dashboard (v1.6.5):**
- `src/jira-api.js`, `src/sentry-api.js`, `src/sentry-trend.js`,
  `src/worklog-aggregator.js`, `src/burndown.js`, `src/changelog-parser.js`,
  `src/parsers.js`, `src/metrics.js`, `src/privacy-mode.js`,
  `src/sprint-cache.js`.
- Unit tests: `parsers.test.js` (49), `burndown.test.js` (41),
  `burndown-algorithm.test.js` (9), `sentry-trend.test.js` (15),
  `worklog-aggregator.test.js` (28), `integration.test.js` (12).
  **Total: 154 tests, all passing.**
- CSS variable system (light / dark / browser) and base styles from `styles.css`.
- Icons (16/32/48/128) — to be re-themed once EM Dashboard adopts a new icon.

**Adapted from EM Dashboard:**
- `src/migrations.js` — clean shell starting fresh at v0.0.0. Does not inherit
  EM's `v1.1.0` / `v1.4.4` / `rescueSquadFromBoards` history.
- `settings.html` / `settings.js` — single Sentry view (no multi-row Track
  buttons), sprint config replaces squad-selection, Leapsome and Google
  sections added (disabled), Jira test caches accountId for engineer scope.
- `background.js` — slim service worker; data-fetch orchestration deferred to
  Phase 2+.

**Not in this release (future plans):**
- Identity-aware data fetches (My Tickets, sprint, burndown, time logged) →
  Phase 2.
- Insights row (sprint progress, burndown, support board, time logged,
  estimate vs actual, Sentry trend) → Phase 3.
- My Day (Google Calendar today + absence) → Phase 4.
- My Goals (Leapsome OKRs and dev plan) → Phase 5.
- Privacy mode toggle in popup header → Phase 3.
- Auto-detection of sprint board ID from "first sprint assigned to me" →
  later phase.
