# Zealer Dashboard — Backlog

Living task list. Items move to `CHANGELOG.md` once shipped and the marker here changes to ✅.
Phases map to `docs/ARCHITECTURE.md §7`.

---

## 🔧 Immediate / housekeeping

- [x] Text: "Hello, Zealer 👋" + "Link your accounts, to get started" *(shipped v0.1.1)*

---

## Phase 3 — v0.2.0 — Insights

Analytics-first layout: Insights section becomes the top section in the panel,
above My Tickets. Uses parallel data fetching (Option B) so My Tickets renders
instantly from the light sprint fetch while Insights fires a second heavier
fetch (changelog + worklogs) in parallel.

- [ ] **SPRINT PROGRESS bar** — big bar at top of Insights, showing % done /
      in-progress / not-started across all sprint stories (same as EM screenshot).
- [ ] **BURNDOWN chart** — carry `renderBurndownChart` from EM's `src/chart-svg.js`
      AS-IS. Needs re-fetch with `expand=changelog` for the insights pass.
- [ ] **TIME LOGGED** — engineer's own worklogs, daily-grain variant (brief §6).
      Single-bar per working day. Requires worklog field in insights fetch.
- [ ] **ESTIMATE VS ACTUAL** — single bar for the engineer (their estimate vs their
      logged time). Reuse EM's `renderTimesheetChart` adapted for 1 person.
- [ ] **SUPPORT BOARD BREAKDOWN** — show only if engineer has tickets on a support
      board. Carry EM's `buildSupportBoardChart` logic.
- [ ] **SENTRY TREND** — carry `src/sentry-trend.js` AS-IS + apply both EM fixes:
      (1) show setup prompt when no view tracked (v1.6.0 fix, not silent hide);
      (2) show from day 1 with single dot + "Open daily to build trend" prompt
      (v1.5.9 fix, not requiring 2 data points).
- [ ] **Panel section order**: Insights → My Tickets → Gantt (collapsed) → My Day → My Goals.
- [ ] Update `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `changelog.html`, `README.md`.

---

## Phase 3b — v0.2.1 — Gantt view

> Note: Gantt is NOT in EM Dashboard yet (`gantt-print.html` / `gantt-print.js`
> are listed in EM's GUIDELINES.md as planned but unimplemented). Building it
> in Zealer Dashboard first; can be ported to EM later.

- [ ] **Gantt chart** — horizontal bars per sprint ticket, spanning issue
      `startDate` (or sprint start if none) → `dueDate`.
- [ ] **No-due-date prompt** — if any assigned ticket has no due date, show
      inline message: "Add due dates to your tickets to see the full Gantt."
- [ ] **Export button (⎙)** — opens `gantt-print.html` in a new tab for
      full-width rendering (same UX pattern as EM's planned export feature).
- [ ] **Header nav idea** — gantt (📊) + calendar (📅) icon buttons in the app
      bar; click scrolls to section and expands it. Finalise design in this phase.
- [ ] `gantt-print.html` + `gantt-print.js` — export page controller.
- [ ] Update docs.

---

## Phase 4 — v0.3.0 — My Day

- [ ] Google Calendar today view (meetings + all-day events).
- [ ] Absence / OOO status from calendar.
- [ ] Add `identity` permission + `https://www.googleapis.com/*` host permission.
- [ ] Google [Connect] button in Settings activated (currently disabled).
- [ ] Update docs.

---

## Phase 5 — v0.4.0 — My Goals

- [ ] Leapsome OKRs and dev-plan items surfaced in "My Goals" section.
- [ ] Leapsome PAT field in Settings activated (currently disabled).
- [ ] Update docs.

---

## Polish / future ideas (no phase assigned yet)

- [ ] Auto-detect sprint board ID from "first sprint with issues assigned to me"
      (removes the manual board-ID copy-paste from Settings).
- [ ] Privacy mode toggle in popup header (brief §3, deferred from Phase 0).
- [ ] Sprint board auto-refresh when sprint changes (use `sprint-cache.js`
      `detectSprintChange` already in src/).
- [ ] Alerts inbox (carry EM's `src/alerts.js` AS-IS once rules are defined for engineer scope).
- [ ] Port Gantt view back to EM Dashboard once built here.
