# Zealer Dashboard — Backlog

Living task list. Items move to `CHANGELOG.md` once shipped.
Phases map to `docs/ARCHITECTURE.md §8`.

---

## ✅ Phase 0 — v0.0.1 — Bootstrap

- [x] MV3 manifest, side panel, service worker, options page
- [x] Settings: Jira + Sentry test connections, sprint config, theme swatches
- [x] Identity caching (accountId + displayName on Jira test success)
- [x] Greeting screen — "Hello, Zealer 👋" + "Link your accounts, to get started."
- [x] Theme system (light / dark / browser), theme-loader.js
- [x] Pre-flight release gate (9 checks)
- [x] 154 tests (AS-IS from EM Dashboard)

---

## ✅ Phase 1 — (absorbed into Phase 0)

- [x] Settings live URL preview (parseSentryUrl)
- [x] Working-day picker (Sun–Thu default for Zeal)
- [x] Support board ID field in Sprint config

---

## ✅ Phase 2 — v0.1.0 — My Tickets

- [x] Light fetch: active sprint + stories assigned to currentUser
- [x] Stale-while-revalidate (paint from cache, refresh in background)
- [x] 30-min auto-refresh timer (EM pattern: elapsed mode → countdown mode)
- [x] My Tickets section (collapsed by default in Phase 3+)

---

## ✅ Phase 3 — v0.2.x — Insights

- [x] **SQUAD INSIGHTS** section (expanded by default)
  - [x] Sprint Progress bar (all assignees, points or ticket count)
  - [x] Burndown chart (expand=changelog heavy fetch)
  - [x] Support Board Breakdown (getKanbanBoardIssues — Kanban-safe)
  - [x] Sentry Trend sparkline (EM v1.5.9 + v1.6.0 + v1.7.1 fixes)
- [x] **INDIVIDUAL INSIGHTS** section (expanded by default)
  - [x] Time Logged — daily-grain sprint view + sprint-grain quarter view
  - [x] Estimate vs Actual — engineer ratio bar
  - [x] Sprint / Q1–Q4 time filter toggle (quarter data lazy-fetched)
- [x] Sentry trend recording moved to background.js (EM architecture)
- [x] Port EM v1.7.0 (Sentry count fix — statsPeriod from URL)
- [x] Port EM v1.7.1 (trend chart floor / label / footer visual fixes)
- [x] Two new modules: engineer-timesheet.js (22 tests) + engineer-charts.js (40 tests)

---

## ✅ Phase 3b — v0.3.0 — Gantt

- [x] **GANTT section** (collapsed by default, lazy render on first expand)
- [x] `src/gantt.js` — buildGanttSVG, getWorkingDays, dayColIndex, fmtDay, partitionStories (27 tests)
- [x] All / Mine filter toggle (no refetch — re-renders from cached stories)
- [x] Today vertical marker line
- [x] Engineer row highlight (full opacity + primary-colour key label)
- [x] Unscheduled cluster (tickets without dueDate — dashed full-sprint bars)
- [x] ⎙ Export button → gantt-print.html in new tab
- [x] `gantt-print.html` / `gantt-print.js` — full-width export page, All/Mine filter, Print button, resize-responsive
- [x] 📊 Gantt nav + 📅 My Day nav buttons in app bar
- [x] `web_accessible_resources` for gantt-print in manifest

---

## 🔮 Phase 4 — v0.4.0 — My Day

- [ ] Google Calendar today view (meetings + all-day events)
- [ ] Absence / OOO status from calendar
- [ ] Add `identity` permission + `https://www.googleapis.com/*` host permission
- [ ] Google [Connect] button in Settings activated (currently disabled)
- [ ] Update docs

---

## 🔮 Phase 5 — v0.5.0 — My Goals

- [ ] Leapsome OKRs and dev-plan items in "My Goals" section
- [ ] Leapsome PAT field in Settings activated (currently disabled)
- [ ] Update docs

---

## Polish / future (no phase yet)

- [ ] Auto-detect sprint board ID (JQL: first sprint with issues assigned to me)
- [ ] Privacy mode toggle in popup header (brief §3, deferred)
- [ ] Sprint board auto-refresh when sprint changes (`sprint-cache.js` `detectSprintChange` already in src/)
- [ ] Alerts inbox (carry EM's `src/alerts.js` once rules are defined for engineer scope)
- [ ] Port Gantt view back to EM Dashboard
