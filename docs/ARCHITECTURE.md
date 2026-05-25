# Zealer Dashboard — Architecture

> Living document. Updated whenever a phase lands or a module changes.
> Items marked **🔮 Future Plan** describe behaviour or modules that are
> scaffolded or specced but not yet wired up. Strip the marker once the
> work ships.

## 1. High-level shape

Zealer Dashboard is a Chrome MV3 extension with three execution contexts:

1. **Service worker** (`background.js`) — runs migrations on init, configures
   the side panel to open on toolbar click, and (🔮 from Phase 2) orchestrates
   data fetches.
2. **Side panel page** (`popup.html` + `popup.js`) — the user-facing surface.
3. **Options page** (`settings.html` + `settings.js`) — connection config and
   appearance.

All three pages share `styles.css` and load `theme-loader.js` before paint to
prevent theme flash. There is no build step; ES modules are served directly
to Chrome.

## 2. Data sources

| Source            | Used for                                                        | Status      |
|-------------------|------------------------------------------------------------------|-------------|
| Jira Cloud REST   | Identity (`/myself`), sprints, issues, worklog, changelog        | live in v0.0.1 for `/myself` only; rest is 🔮 Phase 2+ |
| Sentry            | Org metadata, issue counts for the tracked view (trend)          | live in v0.0.1 for org test; rest is 🔮 Phase 3 |
| Google Calendar   | Today's meetings + absence                                       | 🔮 Phase 4 |
| Leapsome          | OKRs and dev-plan items                                          | 🔮 Phase 5 |

Credentials live in `chrome.storage.local.settings.*` (see §4). Nothing leaves
the browser except direct calls to the configured Jira/Sentry hosts.

## 3. Module map

### Top-level

| File              | Purpose |
|-------------------|---------|
| `manifest.json`   | MV3 manifest — side panel, options page, permissions, host permissions. Phase 0 has only `storage` + `sidePanel` and Atlassian/Sentry hosts. |
| `background.js`   | Service worker — migrations + side-panel behaviour + 🔮 fetch orchestration. |
| `popup.html/.js`  | Side panel UI. Phase 0 renders auth screen or greeting; 🔮 later phases render data sections. |
| `settings.html/.js` | Settings page. Live test-connection buttons; persists to `chrome.storage.local.settings`. |
| `changelog.html`  | In-extension changelog viewer linked from settings. |
| `theme-loader.js` | Applies `data-theme` and stamps `v{manifest.version}` into matching elements before paint. |
| `styles.css`      | Theme tokens (`:root` light, `:root[data-theme=dark]`, browser default) + base styles. |
| `pre-flight.sh`   | Release gate — must pass before tagging a version. |

### `src/`

| Module                     | Origin            | Purpose |
|----------------------------|-------------------|---------|
| `jira-api.js`              | EM Dashboard 1.6.5 (AS-IS) | Jira REST wrappers (`getMyself`, `getSprintIssues`, paginated `/search/jql`, worklog and changelog fetchers). |
| `sentry-api.js`            | EM (AS-IS)        | Sentry REST wrappers (org, view, issue counts). |
| `sentry-trend.js`          | EM (AS-IS)        | Daily issue-count sampler, persisted to storage. |
| `worklog-aggregator.js`    | EM (AS-IS)        | Aggregate worklog totals per member and per issue type. |
| `burndown.js`              | EM (AS-IS)        | Ideal/actual burndown series from sprint issues + their changelog. |
| `parsers.js`               | EM (AS-IS)        | `parseSentryUrl`, `parseExtraBoardSpec`, etc. Used by settings.js for live preview. |
| `metrics.js`               | EM (AS-IS)        | Sprint metrics (progress, in-flight, status counts). |
| `privacy-mode.js`          | EM (AS-IS)        | Privacy-mode helpers (🔮 wired up to a popup toggle in Phase 3). |
| `sprint-cache.js`          | EM (AS-IS)        | `setCachedSprintData`, `detectSprintChange` — used by background to know when to invalidate. |
| `changelog-parser.js`      | EM (AS-IS)        | `dayIndex`, `attachCloseTimestamps`, `transitionToDoneTimestamp`. Transitive dependency of `burndown.js`. |
| `migrations.js`            | Adapted           | Clean shell — Engineer Dashboard's history starts fresh at v0.0.0. |

### `tests/`

Pure-node, no framework. Each test file is `node tests/<name>.test.js`.

| File                          | Tests | Asserts |
|-------------------------------|-------|---------|
| `parsers.test.js`             | 49    | Sentry URL parsing edge cases, board-spec parsing. |
| `burndown.test.js`            | 41    | End-to-end burndown shape under various sprint scenarios. |
| `burndown-algorithm.test.js`  | 9     | The "ideal vs actual" arithmetic in isolation. |
| `sentry-trend.test.js`        | 15    | Daily sample dedupe and persistence rules. |
| `worklog-aggregator.test.js`  | 28    | Per-member and per-issue-type aggregation. |
| `integration.test.js`         | 12    | Settings → fetch → render flow with mocked storage. |
| **Total**                     | **154** | All passing as of v0.0.1. |

## 4. Storage schema

`chrome.storage.local.settings`:

```js
{
  jira: {
    baseUrl:     'https://your-org.atlassian.net',
    email:       'you@company.com',
    token:       '...',          // Jira API token
    accountId:   '...',          // cached from /myself on Test Jira success
    displayName: 'Ahmed Reza'    // ditto
  },

  sentry: {
    baseUrl:     'https://zeal.sentry.io',
    org:         'zeal',
    viewUrl:     'https://zeal.sentry.io/issues/views/205220/?project=...',
    viewId:      '205220',       // parsed from viewUrl
    projectIds:  ['6042935'],    // parsed from viewUrl
    environment: 'production',   // parsed from viewUrl (nullable)
    token:       '...'           // Sentry auth token
  },

  sprint: {
    boardId:     42,                       // 🔮 auto-detect in a later phase
    workingDays: [0, 1, 2, 3, 4]           // 0=Sun .. 6=Sat; default Sun–Thu
  },

  leapsome: { token: null },               // 🔮 Phase 5
  google:   { connected: false },          // 🔮 Phase 4
  ui:       { theme: 'browser', privacyMode: false }
}
```

Other storage keys (used by carried modules):

- `sentryTrend:{viewId}` — `{ samples: [{date, count}], lastUpdated }`
  written by `recordTrendSample` (🔮 Phase 3 wires it up).
- `sprintCache:{boardId}` — `{ sprintId, data, fetchedAt }` written by
  `sprint-cache.js` (🔮 Phase 2 wires it up).

## 5. Theme system

`styles.css` exposes a token set on `:root` (light), overridden by
`:root[data-theme="dark"]` and conditionally by `:root[data-theme="browser"]`
inside `@media (prefers-color-scheme: dark)`. Components only reference tokens
(`var(--text)`, `var(--surface)`, etc.) so theme switches are atomic.

`theme-loader.js` is loaded synchronously at the top of every HTML page before
the stylesheet processes, applying `data-theme` before first paint so users
never see a light flash on a dark-themed extension.

## 6. Pre-flight checks

`pre-flight.sh` is the release gate. It must exit 0 before tagging. Checks:

1. `node --check` on every `.js` file.
2. Brace balance (catches unclosed blocks `node --check` misses in ES modules).
3. Element-ID audit — every `getElementById('foo')` in `popup.js` has a
   matching `id="foo"` in `popup.html` (or is created dynamically in JS).
4. CSP compliance — no `<script>code</script>` and no inline event handlers
   in any `*.html`.
5. `manifest.json` parses as JSON.
6. All required files exist.
7. All four icons exist.
8. Version in `manifest.json` appears in `changelog.html` *and* `CHANGELOG.md`.

Run with `bash pre-flight.sh` or `npm run preflight`.

## 7. Phasing

| Phase | Version | What lands |
|------:|---------|-----------|
| 0     | v0.0.1  | This document. Bootstrap, settings, identity caching, greeting. |
| 1     | v0.1.0  | 🔮 Settings polish — auto-detect board ID, validation toasts, first-run flow refinements. |
| 2     | v0.2.0  | 🔮 My Tickets — sprint tickets assigned to currentUser via cached accountId. |
| 3     | v0.3.0  | 🔮 Insights row — sprint progress, burndown, support board, time logged (daily-grain variant), estimate vs actual, Sentry trend. Privacy-mode toggle wired. |
| 4     | v0.4.0  | 🔮 My Day — Google Calendar today + absence. Adds `identity` permission. |
| 5     | v0.5.0  | 🔮 My Goals — Leapsome OKRs + dev plan. |

## 8. Operational notes

- **No persistent timers.** Per architecture decision (and EM Dashboard
  experience), data is fetched on side-panel open, not on a background alarm.
  Avoids stale caches, missed runs after Chrome quit, and battery drain.
- **`chrome.runtime.sendMessage` for fire-and-forget.** Returning `true` from
  the receiver without calling `sendResponse` triggers the
  *"message channel closed before response received"* warning in Chrome.
  The pattern used here: receiver returns `undefined`, sender catches the
  no-receiver rejection silently. See `background.js` and `popup.js`.
- **Trailing slash hygiene.** Both `jiraUrl` and `sentryUrl` are normalized
  with `.replace(/\/+$/, '')` on save and on test, so users pasting either
  `https://zeal.sentry.io` or `https://zeal.sentry.io/` produce the same
  outgoing request.
