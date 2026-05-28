/**
 * src/engineer-timesheet.js — Zealer Dashboard
 * Engineer-scoped timesheet computations.
 *
 * Replaces EM's src/timesheet.js week1/week2 grouping with:
 *   - Sprint mode:  one bar per working day  (daily-grain, per brief §6)
 *   - Quarter mode: one bar per sprint in the selected quarter
 *
 * All functions are pure — no side effects, no DOM, testable in Node.
 */

export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4]; // Sun–Thu

// ── Sprint mode (daily-grain) ──────────────────────────────────────────────

/**
 * Extract an engineer's own worklogs from raw Jira issues.
 * Works with issues fetched with fields: ['worklog'].
 *
 * @param {Array}  rawIssues  — Jira issue objects with fields.worklog
 * @param {string} accountId  — engineer's Jira account ID
 * @returns {Array<{ started: string, timeSpentSeconds: number }>}
 */
export function extractEngineerWorklogs(rawIssues, accountId) {
  const result = [];
  for (const issue of rawIssues) {
    const wls = issue.fields?.worklog?.worklogs || [];
    for (const wl of wls) {
      if (wl.author?.accountId === accountId) {
        result.push({ started: wl.started, timeSpentSeconds: wl.timeSpentSeconds || 0 });
      }
    }
  }
  return result;
}

/**
 * Compute daily time-logged for the engineer across the sprint.
 * Returns one entry per working day (sprint start → today, capped at sprint end).
 *
 * @param {Array}    worklogs     — output of extractEngineerWorklogs
 * @param {string}   sprintStart  — ISO date string (sprint.startDate)
 * @param {string}   sprintEnd    — ISO date string (sprint.endDate)
 * @param {number[]} workingDays  — day-of-week indices [0=Sun..6=Sat]
 * @returns {Array<{ date: string, label: string, hours: number }>}
 */
export function computeDailyTimesheet(worklogs, sprintStart, sprintEnd, workingDays = DEFAULT_WORKING_DAYS) {
  const set   = new Set(workingDays);
  const start = new Date(sprintStart);
  const end   = new Date(sprintEnd);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const cap = today < end ? today : end;

  // Build ordered list of working days in range
  const days = [];
  const cur  = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur <= cap) {
    if (set.has(cur.getDay())) {
      const iso = cur.toISOString().slice(0, 10);
      days.push({
        date:  iso,
        label: cur.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        hours: 0,
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Bin worklogs into days
  for (const wl of worklogs) {
    if (!wl.started) continue;
    const wlDate = wl.started.slice(0, 10); // YYYY-MM-DD
    const entry  = days.find(d => d.date === wlDate);
    if (entry) {
      entry.hours = Math.round((entry.hours + (wl.timeSpentSeconds || 0) / 3600) * 10) / 10;
    }
  }

  return days;
}

// ── Quarter mode (sprint-grain) ────────────────────────────────────────────

/**
 * Calendar-year quarter boundaries.
 * @param {'Q1'|'Q2'|'Q3'|'Q4'} quarter
 * @param {number} [year] — defaults to current year
 * @returns {{ start: string, end: string }} — YYYY-MM-DD
 */
export function quarterDateRange(quarter, year = new Date().getFullYear()) {
  const ranges = {
    Q1: [`${year}-01-01`, `${year}-03-31`],
    Q2: [`${year}-04-01`, `${year}-06-30`],
    Q3: [`${year}-07-01`, `${year}-09-30`],
    Q4: [`${year}-10-01`, `${year}-12-31`],
  };
  const [start, end] = ranges[quarter] || ranges.Q1;
  return { start, end };
}

/**
 * Compute per-sprint hour totals for the engineer in a given quarter.
 * Works with issues fetched with fields: ['worklog', 'customfield_10020'].
 *
 * customfield_10020 is the standard Jira Cloud Sprint field.
 * Each issue's sprint array is ordered chronologically; we use the last entry.
 *
 * @param {Array}    rawIssues    — Jira issues with worklog + sprint customfield
 * @param {string}   accountId
 * @param {string}   quarterStart — YYYY-MM-DD
 * @param {string}   quarterEnd   — YYYY-MM-DD
 * @param {number[]} workingDays
 * @returns {Array<{ name: string, startDate: string, hours: number }>} sorted by startDate
 */
export function computeQuarterTimesheet(rawIssues, accountId, quarterStart, quarterEnd, workingDays = DEFAULT_WORKING_DAYS) {
  const set    = new Set(workingDays);
  const qStart = new Date(quarterStart);
  const qEnd   = new Date(quarterEnd);
  qEnd.setHours(23, 59, 59, 999);

  const sprintMap = new Map(); // sprintName → { name, startDate, hours }

  for (const issue of rawIssues) {
    const sprintField = issue.fields?.customfield_10020;
    if (!sprintField?.length) continue;
    const sprint = sprintField[sprintField.length - 1];
    if (!sprint?.name) continue;

    const worklogs = issue.fields?.worklog?.worklogs || [];
    for (const wl of worklogs) {
      if (wl.author?.accountId !== accountId) continue;
      if (!wl.started) continue;

      const logged = new Date(wl.started);
      if (logged < qStart || logged > qEnd) continue;
      if (!set.has(logged.getDay())) continue;

      if (!sprintMap.has(sprint.name)) {
        sprintMap.set(sprint.name, {
          name:      sprint.name,
          startDate: sprint.startDate || '',
          hours:     0,
        });
      }
      const entry = sprintMap.get(sprint.name);
      entry.hours = Math.round((entry.hours + (wl.timeSpentSeconds || 0) / 3600) * 10) / 10;
    }
  }

  return Array.from(sprintMap.values())
    .sort((a, b) => (a.startDate > b.startDate ? 1 : -1));
}

// ── Estimate vs Actual ─────────────────────────────────────────────────────

/**
 * Compute estimate vs actual for the engineer across the sprint.
 *
 * @param {Array}    rawIssues        — Jira issues with timeoriginalestimate + worklog fields
 * @param {string}   accountId
 * @param {string}   displayName      — engineer's display name (for the chart label)
 * @returns {{ name: string, logged: number, estimated: number, ratio: number|null }}
 */
export function computeEngineerEstVsActual(rawIssues, accountId, displayName = 'Me') {
  let totalLoggedSec    = 0;
  let totalEstimateSec  = 0;

  for (const issue of rawIssues) {
    const worklogs = issue.fields?.worklog?.worklogs || [];
    const myWorklogs = worklogs.filter(wl => wl.author?.accountId === accountId);
    if (myWorklogs.length === 0) continue;

    for (const wl of myWorklogs) {
      totalLoggedSec += wl.timeSpentSeconds || 0;
    }
    // Only count estimate if the engineer logged time on this issue
    totalEstimateSec += issue.fields?.timeoriginalestimate || 0;
  }

  const logged    = Math.round(totalLoggedSec    / 3600 * 10) / 10;
  const estimated = Math.round(totalEstimateSec  / 3600 * 10) / 10;
  const ratio     = estimated > 0 ? Math.round((logged / estimated) * 10) / 10 : null;

  return { name: displayName, logged, estimated, ratio };
}
