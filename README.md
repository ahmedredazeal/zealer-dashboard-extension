# Zealer Dashboard — Chrome Extension

Engineer cockpit for Zeal — your personal sprint progress, time logged,
tickets, and reliability, in a Chrome side panel.

A sibling project to [EM Dashboard](https://github.com/ahmedredazeal/em-dashboard-extension)
(written for engineering managers), Zealer Dashboard is the same data backbone
re-scoped to "just me, today" rather than "my whole squad".

## Status

**v0.0.1 — Phase 0 bootstrap.** The extension installs, opens a side panel,
runs a fully functional settings page (Jira + Sentry test connections, sprint
config, theme), and greets you by name once you connect Jira. Data sections
(tickets, burndown, time logged, calendar) arrive in later phases — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`CHANGELOG.md`](CHANGELOG.md).

## Install (developer mode)

1. Clone this repo.
2. Run `bash pre-flight.sh` once to verify the checkout is sound (optional
   but recommended).
3. In Chrome, open `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select this folder.
4. Pin "Zealer Dashboard" to the toolbar. Click the icon — the side panel
   opens with a welcome screen.
5. Click **Open settings →**, fill in Jira (URL + email + API token) and click
   **Test Jira connection**. On success your account ID and display name are
   cached; the popup will greet you by name from then on.

## Development

The repo uses no build step — everything is plain ES modules served by Chrome.
That means editing a file and reloading the extension in `chrome://extensions`
is the entire dev loop.

```bash
# Run the unit-test suite (154 tests carried from EM Dashboard)
npm test

# Run the full pre-flight (syntax, braces, element audit, CSP, files,
# icons, version consistency) before tagging a release
npm run preflight
```

There is no package to install; `npm test` and `npm run preflight` just shell
out to `node` and `bash`. You do need Node ≥ 18 and Python 3 (the latter for
pre-flight's brace-balance and element-audit checks).

## Repo layout

```
zealer-dashboard-extension/
├── manifest.json          # MV3 manifest
├── background.js          # service worker (slim — runs migrations + side panel)
├── popup.html / popup.js  # side panel UI
├── settings.html / settings.js
├── changelog.html         # in-extension changelog viewer
├── theme-loader.js        # applies theme + version before first paint
├── styles.css             # CSS-variable theme tokens + base styles
├── pre-flight.sh          # release-gate checks (must pass before tagging)
├── package.json           # type=module, test + preflight scripts
├── CHANGELOG.md           # human-readable changelog
├── README.md              # this file
├── icons/                 # 16/32/48/128 PNGs
├── docs/
│   └── ARCHITECTURE.md    # module map, data flow, "🔮 Future Plan" markers
├── src/                   # ES modules (shared with EM Dashboard)
│   ├── jira-api.js
│   ├── sentry-api.js
│   ├── sentry-trend.js
│   ├── worklog-aggregator.js
│   ├── burndown.js
│   ├── parsers.js
│   ├── metrics.js
│   ├── privacy-mode.js
│   ├── sprint-cache.js
│   ├── changelog-parser.js
│   └── migrations.js      # Zealer-Dashboard-specific (fresh history)
└── tests/                 # node-runnable test files (no framework)
    ├── parsers.test.js
    ├── burndown.test.js
    ├── burndown-algorithm.test.js
    ├── sentry-trend.test.js
    ├── worklog-aggregator.test.js
    └── integration.test.js
```

## Privacy

- All credentials (Jira API token, Sentry auth token) are stored in
  `chrome.storage.local`, never sent anywhere except the configured Jira and
  Sentry instances. There is no Zealer Dashboard backend.
- Test-connection buttons hit `/rest/api/3/myself` (Jira) and
  `/api/0/organizations/{org}/` (Sentry). Nothing else is called in v0.0.1.

## Roadmap

| Phase | Version (target) | Scope |
|------:|------------------|-------|
| 0     | v0.0.1 ✓         | Bootstrap, settings, identity caching, greeting |
| 1     | v0.1.0           | Tighten auth UX (auto-detect board, settings polish) |
| 2     | v0.2.0           | My Tickets — current sprint tickets assigned to me |
| 3     | v0.3.0           | Insights row — sprint progress, burndown, support, time logged, est-vs-actual, Sentry trend |
| 4     | v0.4.0           | My Day — Google Calendar today + absence |
| 5     | v0.5.0           | My Goals — Leapsome OKRs and dev-plan items |

Detail and rationale live in the parent brief and in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
