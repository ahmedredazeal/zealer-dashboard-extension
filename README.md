# Zealer Dashboard — Chrome Extension

Engineer cockpit for Zeal — your personal sprint progress, burndown, Gantt,
time logged, tickets, and Sentry trend, all in a Chrome side panel.

A sibling project to [EM Dashboard](https://github.com/ahmedredazeal/em-dashboard-extension)
(written for engineering managers). Zealer Dashboard is the same data backbone
re-scoped to "just me, today" rather than "my whole squad".

## Status

**v0.3.0 — Phase 3b (Gantt).** Full analytics + sprint timeline are live.

| Section              | Status |
|----------------------|--------|
| Squad Insights       | ✅ Sprint progress · Burndown · Support Board · Sentry Trend |
| Individual Insights  | ✅ Time Logged (daily / quarterly) · Estimate vs Actual |
| Gantt                | ✅ Sprint timeline · All/Mine filter · Export page |
| My Tickets           | ✅ Engineer's assigned tickets |
| My Day               | 🔮 Phase 4 — Google Calendar |
| My Goals             | 🔮 Phase 5 — Leapsome OKRs |

## Install (developer mode)

1. Clone this repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
   select this folder.
3. Pin "Zealer Dashboard" to the toolbar. Click the icon — the side panel opens.
4. Click **⚙ Settings**, fill in:
   - **Jira** — base URL, email, API token → click **Test Jira connection**
   - **Sentry** — base URL, org slug, view URL, token (optional)
   - **Sprint** — board ID (required), support board ID (optional)
5. Click **Save**. The panel loads your sprint data.

## Development

No build step — plain ES modules served directly by Chrome.
Edit a file, reload the extension in `chrome://extensions`.

```bash
# Run all 291 unit tests
npm test

# Run the full release-gate (syntax · element-ID audit · CSP · version consistency)
npm run preflight
```

Requires Node ≥ 18. No npm install needed — test runner is plain `node`.

## Repo layout

```
zealer-dashboard-extension/
├── manifest.json              MV3 manifest
├── background.js              Service worker — migrations + Sentry trend recording
├── popup.html / popup.js      Side panel UI
├── settings.html / settings.js
├── gantt-print.html / gantt-print.js   Full-width Gantt export page
├── changelog.html             In-extension changelog
├── theme-loader.js            Applies theme + version stamp before paint
├── styles.css                 CSS token system (light / dark / browser)
├── pre-flight.sh              Release gate (9 checks — must pass before tagging)
├── package.json               type=module, test + preflight scripts
├── CHANGELOG.md
├── BACKLOG.md
├── icons/                     16 / 32 / 48 / 128 PNGs
├── docs/
│   └── ARCHITECTURE.md        Module map, fetch architecture, storage schema
├── src/
│   ├── jira-api.js            Jira REST wrappers (AS-IS from EM Dashboard)
│   ├── sentry-api.js          Sentry REST — getIssuesFromView with viewParams
│   ├── sentry-trend.js        Daily sample recorder (chrome.storage.sync)
│   ├── parsers.js             parseSentryUrl, normalizeStory (AS-IS)
│   ├── burndown.js            Burndown series (AS-IS)
│   ├── changelog-parser.js    attachCloseTimestamps (AS-IS)
│   ├── worklog-aggregator.js  Per-member worklog totals (AS-IS)
│   ├── metrics.js             sprintDayMetrics, velocity helpers (AS-IS)
│   ├── privacy-mode.js        Privacy helpers (AS-IS, wired in future)
│   ├── sprint-cache.js        Sprint change detection (AS-IS)
│   ├── migrations.js          Zealer-specific migration chain
│   ├── ticket-render.js       renderTicketRow, escapeHtml, deriveProjectKey
│   ├── engineer-timesheet.js  computeDailyTimesheet, computeQuarterTimesheet, …
│   ├── engineer-charts.js     All Insights chart renderers (HTML strings)
│   └── gantt.js               buildGanttSVG, getWorkingDays, partitionStories, …
└── tests/                     Node-runnable, no framework — 291 tests total
    ├── parsers.test.js         49 tests
    ├── burndown.test.js        41 tests
    ├── burndown-algorithm.test.js  9 tests
    ├── sentry-trend.test.js   15 tests
    ├── worklog-aggregator.test.js  28 tests
    ├── integration.test.js    12 tests
    ├── ticket-render.test.js  48 tests
    ├── engineer-timesheet.test.js  22 tests
    ├── engineer-charts.test.js    40 tests
    └── gantt.test.js          27 tests
```

## Privacy

- All credentials (Jira API token, Sentry auth token) are stored in
  `chrome.storage.local`, never sent anywhere except your configured Jira and Sentry hosts.
- Sentry daily trend samples are stored in `chrome.storage.sync` (device-synced, 
  persists across reinstall) — only issue counts, no content.
- There is no Zealer Dashboard backend. No telemetry.

## Roadmap

| Phase | Version | Status | Scope |
|------:|---------|--------|-------|
| 0–1   | v0.0.1–v0.1.1 | ✅ | Bootstrap, settings, identity, My Tickets |
| 3     | v0.2.x  | ✅     | Squad Insights + Individual Insights |
| 3b    | v0.3.0  | ✅     | Gantt view + export |
| 4     | v0.4.0  | 🔮     | My Day — Google Calendar |
| 5     | v0.5.0  | 🔮     | My Goals — Leapsome |

Full detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`CHANGELOG.md`](CHANGELOG.md).
