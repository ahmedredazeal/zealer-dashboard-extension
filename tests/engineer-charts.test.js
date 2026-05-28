#!/usr/bin/env node
/**
 * tests/engineer-charts.test.js
 * Run with: node tests/engineer-charts.test.js
 */

import {
  renderSprintProgressBar,
  renderBurndownCard,
  renderSupportBoardChart,
  renderDailyTimesheetChart,
  renderSprintTimesheetChart,
  renderEstVsActualCard,
  renderSentryTrendCard,
} from '../src/engineer-charts.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.error(`  ✗ ${name}\n      ${err.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertIncludes(html, str, msg) {
  assert(html.includes(str), msg || `Expected output to contain "${str}"`);
}
function assertExcludes(html, str, msg) {
  assert(!html.includes(str), msg || `Expected output NOT to contain "${str}"`);
}

const DONE_STORIES = [
  { statusCategory: 'done', points: 10 },
  { statusCategory: 'done', points: 10 },
];
const MIXED_STORIES = [
  { statusCategory: 'done',          points: 10, labels: [] },
  { statusCategory: 'indeterminate', points: 5,  labels: [] },
  { statusCategory: 'new',           points: 5,  labels: ['blocked-external'] },
];

// ── renderSprintProgressBar ────────────────────────────────────────────────
console.log('\nrenderSprintProgressBar');

test('returns empty string for empty stories', () => {
  assert(renderSprintProgressBar([]) === '', 'should return empty string');
});
test('shows 100% done for all-done stories', () => {
  const html = renderSprintProgressBar(DONE_STORIES);
  assertIncludes(html, '100% done');
});
test('uses points when available', () => {
  const html = renderSprintProgressBar(MIXED_STORIES);
  assertIncludes(html, 'pt');
});
test('falls back to ticket count with no points', () => {
  const noPoints = MIXED_STORIES.map(s => ({ ...s, points: 0 }));
  const html = renderSprintProgressBar(noPoints);
  assertIncludes(html, 'tickets');
});
test('renders Done/In progress/Not started labels', () => {
  const html = renderSprintProgressBar(MIXED_STORIES);
  assertIncludes(html, 'Done');
  assertIncludes(html, 'In progress');
  assertIncludes(html, 'Not started');
});
test('shows green bar for done percentage', () => {
  const html = renderSprintProgressBar(MIXED_STORIES);
  assertIncludes(html, '#22c55e');
});

// ── renderBurndownCard ────────────────────────────────────────────────────
console.log('\nrenderBurndownCard');

const burndownData = {
  ideal: [20, 16, 12, 8, 4, 0],
  estimate: [20, 18, 15, 10, 5, 0],
  actual: [20, 17, 13, 9, 4, 2],
  labels: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5'],
  totalPoints: 20,
  totalDays: 5,
  hasActualData: true,
};

test('returns no-data message when totalPoints is 0', () => {
  const html = renderBurndownCard({ ...burndownData, totalPoints: 0 });
  assertIncludes(html, 'No point data');
});
test('renders SVG for valid data', () => {
  const html = renderBurndownCard(burndownData);
  assertIncludes(html, '<svg');
  assertIncludes(html, '<polyline');
});
test('includes Ideal legend entry', () => {
  const html = renderBurndownCard(burndownData);
  assertIncludes(html, 'Ideal');
});
test('shows Actual line when hasActualData is true', () => {
  const html = renderBurndownCard(burndownData);
  assertIncludes(html, 'Actual</text>');
});
test('shows no-actual message when hasActualData is false', () => {
  const html = renderBurndownCard({ ...burndownData, hasActualData: false });
  assertIncludes(html, 'no data yet');
});
test('includes date range when provided', () => {
  const html = renderBurndownCard(burndownData, '11 May – 23 May');
  assertIncludes(html, '11 May');
});

// ── renderSupportBoardChart ───────────────────────────────────────────────
console.log('\nrenderSupportBoardChart');

const supportStories = [
  { status: 'In Progress', labels: [] },
  { status: 'In Progress', labels: ['blocked-external'] },
  { status: 'Open', labels: [] },
  { status: 'QA Testing', labels: [] },
];

test('returns empty string for no stories', () => {
  assert(renderSupportBoardChart([]) === '', 'should be empty');
});
test('shows open count', () => {
  const html = renderSupportBoardChart(supportStories);
  assertIncludes(html, '4 open');
});
test('shows blocked-external warning', () => {
  const html = renderSupportBoardChart(supportStories);
  assertIncludes(html, '1 blocked');
});
test('shows blocked summary when total blocked > 0', () => {
  const html = renderSupportBoardChart(supportStories);
  assertIncludes(html, 'blocked-external');
});
test('renders all statuses', () => {
  const html = renderSupportBoardChart(supportStories);
  assertIncludes(html, 'In Progress');
  assertIncludes(html, 'Open');
  assertIncludes(html, 'QA Testing');
});

// ── renderDailyTimesheetChart ─────────────────────────────────────────────
console.log('\nrenderDailyTimesheetChart');

const days = [
  { date: '2026-05-10', label: '10 May', hours: 7.5 },
  { date: '2026-05-11', label: '11 May', hours: 8   },
  { date: '2026-05-12', label: '12 May', hours: 0   },
  { date: '2026-05-13', label: '13 May', hours: 6   },
];

test('shows no-data message for empty days', () => {
  const html = renderDailyTimesheetChart([]);
  assertIncludes(html, 'No worklog data');
});
test('renders bars for each day with hours', () => {
  const html = renderDailyTimesheetChart(days);
  assertIncludes(html, '<rect');
});
test('shows total hours', () => {
  const html = renderDailyTimesheetChart(days);
  assertIncludes(html, '21.5h'); // 7.5+8+0+6
});
test('includes dateRange when provided', () => {
  const html = renderDailyTimesheetChart(days, '10–13 May');
  assertIncludes(html, '10–13 May');
});
test('renders SVG', () => {
  const html = renderDailyTimesheetChart(days);
  assertIncludes(html, '<svg');
});

// ── renderSprintTimesheetChart ────────────────────────────────────────────
console.log('\nrenderSprintTimesheetChart');

const sprints = [
  { name: 'HRM Sprint 62', startDate: '2026-04-06', hours: 72 },
  { name: 'HRM Sprint 63', startDate: '2026-04-20', hours: 68.5 },
];

test('shows no-data message for empty sprints', () => {
  const html = renderSprintTimesheetChart([]);
  assertIncludes(html, 'No worklog data');
});
test('renders bars for each sprint', () => {
  const html = renderSprintTimesheetChart(sprints);
  assertIncludes(html, '<rect');
});
test('shows total hours', () => {
  const html = renderSprintTimesheetChart(sprints);
  assertIncludes(html, '140.5h total');
});
test('includes quarter label', () => {
  const html = renderSprintTimesheetChart(sprints, 'Q2 2026');
  assertIncludes(html, 'Q2 2026');
});

// ── renderEstVsActualCard ─────────────────────────────────────────────────
console.log('\nrenderEstVsActualCard');

const estData = { name: 'Ahmed Reza', logged: 11, estimated: 12, ratio: 0.9 };

test('shows no-data message when logged=0', () => {
  const html = renderEstVsActualCard({ ...estData, logged: 0 });
  assertIncludes(html, 'No logged time');
});
test('renders SVG bar for engineer', () => {
  const html = renderEstVsActualCard(estData);
  assertIncludes(html, '<svg');
  assertIncludes(html, '<rect');
});
test('shows ratio', () => {
  const html = renderEstVsActualCard(estData);
  assertIncludes(html, '×0.9');
});
test('shows logged hours in legend', () => {
  const html = renderEstVsActualCard(estData);
  assertIncludes(html, '11h');
});
test('shows estimated hours in legend', () => {
  const html = renderEstVsActualCard(estData);
  assertIncludes(html, '12h');
});
test('shows engineer first name', () => {
  const html = renderEstVsActualCard(estData);
  assertIncludes(html, 'Ahmed');
});

// ── renderSentryTrendCard ─────────────────────────────────────────────────
console.log('\nrenderSentryTrendCard');

test('shows setup prompt when label is falsy (v1.6.0 fix)', () => {
  const html = renderSentryTrendCard('', []);
  assertIncludes(html, 'Settings');
  assertIncludes(html, 'Sentry view URL');
});
test('shows build-trend prompt when no samples (v1.5.9 fix)', () => {
  const html = renderSentryTrendCard('Production', []);
  assertIncludes(html, 'Open the panel daily');
  assertExcludes(html, '<svg'); // should not render chart with 0 samples
});
test('shows first-reading state for single sample (v1.5.9 fix)', () => {
  const html = renderSentryTrendCard('Production', [{ day: '2026-05-25', count: 42 }]);
  assertIncludes(html, 'First reading');
  assertIncludes(html, '42');
  assertIncludes(html, 'Open the panel daily to build the trend line.');
});
test('renders sparkline SVG for 2+ samples', () => {
  const samples = Array.from({ length: 5 }, (_, i) => ({ day: `2026-05-${20+i}`, count: 40 + i }));
  const html = renderSentryTrendCard('Production', samples);
  assertIncludes(html, '<svg');
  assertIncludes(html, '<polyline');
});
test('shows delta vs yesterday for 2+ samples', () => {
  const samples = [{ day: '2026-05-24', count: 40 }, { day: '2026-05-25', count: 43 }];
  const html = renderSentryTrendCard('Production', samples);
  assertIncludes(html, '↑3 vs yesterday');
});
test('escapes XSS in label', () => {
  const html = renderSentryTrendCard('<script>alert(1)</script>', [{ day: '2026-05-25', count: 1 }]);
  assertExcludes(html, '<script>');
  assertIncludes(html, '&lt;script&gt;');
});

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
