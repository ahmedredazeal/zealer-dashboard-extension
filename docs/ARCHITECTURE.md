# Zealer Dashboard — Architecture

> Living document. Updated on every phase landing.
> Items marked **🔮 Future Plan** describe behaviour that is specced but not yet built.
> Strip the marker when the work ships.

---

## 1. High-level shape

Zealer Dashboard is a Chrome MV3 extension with three execution contexts:

1. **Service worker** (`background.js`) — runs migrations on init, configures the
   side panel to open on toolbar click, records Sentry trend samples when the panel opens.
2. **Side panel page** (`popup.html` + `popup.js`) — the user-facing surface. Fetches
   Jira data directly (light + heavy parallel fetches), renders all sections.
3. **Options page** (`settings.html` + `settings.js`) — connection config and appearance.
4. **Export page** (`gantt-print.html` + `gantt-print.js`) — full-width Gantt opened in
   a new tab via the ⎙ export button.

All pages share `styles.css` and load `theme-loader.js` before paint to prevent theme
flash. There is no build step; ES modules are served directly to Chrome.

---

## 2. Data sources

| Source          | Used for                                                     | Status      |
|-----------------|--------------------------------------------------------------|-------------|
| Jira Cloud REST | Identity, sprints, issues, worklog, changelog, board config  | ✅ Live (v0.1.0+) |
| Sentry          | Issue counts for the tracked view (trend chart)              | ✅ Live (v0.2.0+) |
| Google Calendar | Today's meetings + absence                                   | 🔮 Phase 4  |
| Leapsome        | OKRs and dev-plan items                                      | 🔮 Phase 5  |

Credentials live in `chrome.storage.local.settings.*` (see §4). Nothing leaves the browser
except direct calls to the configured Jira/Sentry hosts.

---

## 3. Fetch architecture

### Popup: parallel fetches (Option B)

On every panel open, three fetches fire in parallel:

```
boot()
  ├─ fetchLightData()     → sprint + stories (no changelog/worklog)
  │    → renderSquadInsights (progress bar only)
  │    → renderMyTicketsSection
  │    → renderGanttSection (lazy — only if already expanded)
  │
  ├─ loadSentryTrend()    → reads chrome.storage.sync (read-only in popup)
  │    → renderSentryTrendCard
  │
  └─ fetchSupportData()   → getKanbanBoardIssues (if supportBoardId set)
       → renderSupportBoardChart

Then (sequential, after light):
  └─ fetchInsightsData()  → same JQL + expand=changelog + worklog field
       → renderBurndownCard
       → renderDailyTimesheetChart
       → renderEstVsActualCard
```

### Background: Sentry trend recording

On `panel-opened` message from popup, `background.js` calls
`fetchAndRecordSentryTrend(settings)`:
- Parses the view URL via `parseSentryUrl` (URL-authoritative, not form fields)
- Calls `getIssuesFromView(viewId, projectIds, env, viewParams)` — passes
  `query/sort/statsPeriod` from the URL so the count matches what Sentry UI shows
- Calls `recordTrendSample(viewId, count)` → writes to `chrome.storage.sync`

The popup never calls `recordTrendSample` — it only reads via `getTrendSamples`.
This mirrors EM Dashboard's architecture exactly.

---

## 4. Module map

### Top-level files

| File                   | Purpose |
|------------------------|---------|
| `manifest.json`        | MV3 manifest — side panel, options page, permissions (`storage`, `sidePanel`, `tabs`), host permissions, `web_accessible_resources` for gantt-print. |
| `background.js`        | Service worker — migrations + side-panel config + Sentry trend recording. |
| `popup.html/.js`       | Side panel UI — Squad Insights, Individual Insights, Gantt, My Tickets, placeholders. |
| `settings.html/.js`    | Settings page — Jira, Sentry, Sprint (boardId, supportBoardId, workingDays), theme. |
| `gantt-print.html/.js` | Full-width Gantt export page. Reads `myTicketsCache` from storage. |
| `changelog.html`       | In-extension changelog viewer. |
| `theme-loader.js`      | Applies `data-theme` + stamps `v{version}` before paint. |
| `styles.css`           | CSS token system (light/dark/browser) + base component styles. |
| `pre-flight.sh`        | Release gate — must pass (9 checks) before tagging. |

### `src/` — shared modules

| Module                  | Origin             | Purpose |
|-------------------------|--------------------|---------|
| `jira-api.js`           | EM (AS-IS)         | Jira REST wrappers — `getMyself`, `getActiveSprint`, `_search` (JQL), `getKanbanBoardIssues`, `getStoryPointsField`. |
| `sentry-api.js`         | EM (v1.7.0 port)   | Sentry REST — `getIssuesFromView(viewId, projectIds, env, viewParams)`. `viewParams` honours `query/sort/statsPeriod` from the view URL. |
| `sentry-trend.js`       | EM (AS-IS)         | `recordTrendSample`, `getTrendSamples`, `pruneOldSamples`, `todayUTC`. Bucketed by month in `chrome.storage.sync`. |
| `parsers.js`            | EM (AS-IS)         | `parseSentryUrl`, `normalizeStory`, `parseSentryViewSpec`. |
| `burndown.js`           | EM (AS-IS)         | `computeBurndownSeries` — ideal/actual series from sprint stories with changelog. |
| `changelog-parser.js`   | EM (AS-IS)         | `attachCloseTimestamps(rawIssues, stories, sprintStart)` — attaches `closedDay` to stories. Returns new array (does NOT mutate). |
| `worklog-aggregator.js` | EM (AS-IS)         | Aggregate worklogs per member and per issue type. |
| `metrics.js`            | EM (AS-IS)         | `sprintDayMetrics`, velocity, SLA helpers. |
| `privacy-mode.js`       | EM (AS-IS)         | Privacy-mode helpers (🔮 wired to popup toggle in future). |
| `sprint-cache.js`       | EM (AS-IS)         | `setCachedSprintData`, `detectSprintChange`. |
| `migrations.js`         | Adapted            | Clean history starting at v0.0.0 — Zealer-specific migration chain. |
| `ticket-render.js`      | Zealer-new         | `renderTicketRow`, `escapeHtml`, `deriveProjectKey`, `sprintDayMetrics`. |
| `engineer-timesheet.js` | Zealer-new         | `extractEngineerWorklogs`, `computeDailyTimesheet`, `computeEngineerEstVsActual`, `computeQuarterTimesheet`, `quarterDateRange`. All pure, DOM-free. |
| `engineer-charts.js`    | Zealer-new (+ EM ports) | All Insights chart renderers — `renderSprintProgressBar`, `renderBurndownCard`, `renderSupportBoardChart`, `renderDailyTimesheetChart`, `renderSprintTimesheetChart`, `renderEstVsActualCard`, `renderSentryTrendCard` (EM v1.7.1 visual fixes applied). All return HTML strings. |
| `gantt.js`              | Zealer-new         | `buildGanttSVG`, `getWorkingDays`, `dayColIndex`, `fmtDay`, `partitionStories`. Pure SVG string output, DOM-free. |

### `tests/` — node-runnable, no framework

| File                          | Tests | Coverage |
|-------------------------------|-------|----------|
| `parsers.test.js`             | 49    | Sentry URL parsing, board-spec parsing, normalizeStory |
| `burndown.test.js`            | 41    | End-to-end burndown shape under sprint scenarios |
| `burndown-algorithm.test.js`  | 9     | Ideal vs actual arithmetic in isolation |
| `sentry-trend.test.js`        | 15    | Daily sample dedup, persistence, pruning |
| `worklog-aggregator.test.js`  | 28    | Per-member and per-issue-type aggregation |
| `integration.test.js`         | 12    | Settings → fetch → render flow with mocked storage |
| `ticket-render.test.js`       | 48    | Ticket row HTML, escaping, project key derivation |
| `engineer-timesheet.test.js`  | 22    | Daily grain, quarter grain, est-vs-actual |
| `engineer-charts.test.js`     | 40    | SVG string assertions for all chart functions |
| `gantt.test.js`               | 27    | Working-day calc, bar positioning, partition, filter |
| **Total**                     | **291** | All passing |

---

## 5. Storage schema

### `chrome.storage.local`

```js
settings: {
  jira: {
    baseUrl:     'https://your-org.atlassian.net',
    email:       'you@company.com',
    token:       '...',          // Jira API token
    accountId:   '...',          // cached from /myself on Test Jira success
    displayName: 'Ahmed Reza',
  },
  sentry: {
    baseUrl:     'https://zeal.sentry.io',
    org:         'zeal',
    viewUrl:     'https://zeal.sentry.io/issues/views/205220/?project=...',
    viewId:      '205220',       // parsed from viewUrl
    projectIds:  ['6042935'],    // parsed from viewUrl
    environment: 'production',   // parsed from viewUrl (nullable)
    query:       'is:unresolved',// parsed from viewUrl (nullable)
    sort:        'date',         // parsed from viewUrl (nullable)
    statsPeriod: null,           // parsed from viewUrl; null = "all time"
    token:       '...',
  },
  sprint: {
    boardId:        42,
    supportBoardId: 45,          // optional; drives Support Board Breakdown chart
    workingDays:    [0,1,2,3,4], // 0=Sun … 6=Sat; default Sun–Thu
  },
  leapsome: { token: null },     // 🔮 Phase 5
  google:   { connected: false },// 🔮 Phase 4
  ui:       { theme: 'browser', privacyMode: false },
  _cachedSpf: { [boardId]: 'customfield_10016' }, // story-points field, per board
}

myTicketsCache: {
  sprint:           { id, name, startDate, endDate },
  stories:          [ ...normalizeStory objects... ],
  storyPointsField: 'customfield_10016',
  fetchedAt:        1234567890,
}

insightsCache: {
  sprint:         { id, name, startDate, endDate },
  storiesHeavy:   [ ...normalizeStory with closedDay... ],
  worklogs:       [ { started, timeSpentSeconds } ],
  estVsActual:    { name, logged, estimated, ratio },
  fetchedAt:      1234567890,
}
```

### `chrome.storage.sync`

```js
// Sentry trend — one key per view per month, persists across reinstall/machine
'sentryTrend:{viewId}:{YYYY-MM}': {
  viewId:      '205220',
  yearMonth:   '2026-05',
  samples:     [ { day: '2026-05-23', count: 13 }, ... ],
}
```

---

## 6. Panel section order

```
App bar   [📊 Gantt] [📅 My Day] [⚙ Settings]
──────────────────────────────────────────────
Context bar  [HRM · HRM Sprint 64]  [↻]  [xx:xx]
──────────────────────────────────────────────
SQUAD INSIGHTS          ▼  (expanded)
  Sprint Progress bar
  [Burndown chart]  [Support Board Breakdown]
  Sentry Trend

INDIVIDUAL INSIGHTS     ▼  (expanded)
  [Sprint][Q1][Q2][Q3][Q4]  ← time filter
  [Time Logged]  [Est vs Actual]

GANTT                   ▶  (collapsed)
  [All][Mine]  [⎙]
  SVG timeline (renders on first expand)

My Tickets              ▶  (collapsed)

My Day                  (placeholder 🔮 Phase 4)

My Goals                (placeholder 🔮 Phase 5)
──────────────────────────────────────────────
Powered by [Zeal logo]
```

---

## 7. Pre-flight checks

`pre-flight.sh` is the release gate. Checks:

1. `node --check` on every `.js` file.
2. Brace balance (catches unclosed blocks `node --check` misses in ES modules).
3. Element-ID audit — every `getElementById('foo')` in `popup.js` has a
   matching `id="foo"` in `popup.html` (or is created dynamically in JS).
4. CSP compliance — no `<script>code</script>` and no inline event handlers
   (`onclick`, `onerror`, `onload`) in any `*.html`.
5. `manifest.json` parses as JSON.
6. All required source files exist (including new `src/gantt.js`, `gantt-print.html`, etc.).
7. All four icons exist.
8. Current version in `manifest.json` appears in both `changelog.html` and `CHANGELOG.md`.
9. All test files pass with zero failures.

Run with `bash pre-flight.sh` or `npm run preflight`.

---

## 8. Phase history

| Phase | Version | Status | What shipped |
|------:|---------|--------|-------------|
| 0     | v0.0.1  | ✅     | Bootstrap, settings, identity caching (accountId + displayName), greeting screen, theme system, pre-flight. |
| 1     | absorbed into Phase 0 | ✅ | Settings live-preview, Sentry URL parsing, working-day picker, support board ID field. |
| 2     | v0.1.0  | ✅     | My Tickets — sprint tickets assigned to currentUser, refresh timer, stale-while-revalidate cache. |
| 3     | v0.2.0  | ✅     | Insights — Squad Insights (sprint progress, burndown, support board, Sentry trend) + Individual Insights (time logged daily-grain, est-vs-actual, Q1–Q4 quarter view). Parallel light + heavy fetch. |
| 3b    | v0.3.0  | ✅     | Gantt view — full sprint timeline SVG, All/Mine filter, today line, unscheduled cluster, ⎙ export page, 📊/📅 app-bar nav buttons. |
| 4     | v0.4.0  | 🔮     | My Day — Google Calendar today + absence. Needs `identity` permission. |
| 5     | v0.5.0  | 🔮     | My Goals — Leapsome OKRs + dev plan. |

---

## 9. Operational notes

- **No persistent background timers.** Data is fetched on side-panel open.
  Background only records the Sentry trend sample (one `fetch` + one storage write)
  on each open; it does not run on an alarm.

- **`chrome.runtime.sendMessage` fire-and-forget pattern.** Returning `true` from
  the listener without calling `sendResponse` logs *"message channel closed"*. Pattern
  used: listener returns `undefined`, sender catches the no-receiver rejection silently.

- **`attachCloseTimestamps` returns a new array.** It is NOT mutating — callers must
  capture the return value: `const stories = attachCloseTimestamps(rawIssues, normalized, sprintStart)`.

- **`_search` expand parameter goes inside the body.** Pass `{ jql, fields, expand: 'changelog' }`
  — a second positional argument is silently ignored by the current JiraClient implementation.

- **Trailing slash hygiene.** Both `jiraUrl` and `sentryUrl` are normalized with
  `.replace(/\/+$/, '')` on save and on test.

- **`getKanbanBoardIssues` for support boards.** Uses the board's own filter JQL
  (reads `/rest/agile/1.0/board/{id}` → filter → JQL) and appends `status != "Closed"`.
  Never use sprint-based JQL for Kanban boards — they have no sprint.
