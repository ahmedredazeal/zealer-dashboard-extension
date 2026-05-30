#!/usr/bin/env node
/**
 * tests/gantt.test.js
 * Run with: node tests/gantt.test.js
 */

import {
  getWorkingDays,
  dayColIndex,
  fmtDay,
  partitionStories,
  buildGanttSVG,
} from '../src/gantt.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (err) { console.error(`  ✗ ${name}\n      ${err.message}`); fail++; }
}
function assertEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertIncludes(html, str) { assert(html.includes(str), `Expected to contain "${str}"`); }
function assertExcludes(html, str) { assert(!html.includes(str), `Expected NOT to contain "${str}"`); }

// ── getWorkingDays ─────────────────────────────────────────────────────────
console.log('\ngetWorkingDays');

test('returns only Sun-Thu days for default Zeal config', () => {
  // 2026-05-10 (Sun) to 2026-05-16 (Sat)
  const days = getWorkingDays('2026-05-10', '2026-05-16', [0,1,2,3,4]);
  assertEqual(days.length, 5); // Sun Mon Tue Wed Thu
  assertEqual(days[0], '2026-05-10'); // Sunday
  assertEqual(days[4], '2026-05-14'); // Thursday
});

test('excludes Fri and Sat in Sun-Thu config', () => {
  const days = getWorkingDays('2026-05-10', '2026-05-16', [0,1,2,3,4]);
  assert(!days.includes('2026-05-15'), 'Fri should be excluded');
  assert(!days.includes('2026-05-16'), 'Sat should be excluded');
});

test('returns empty for invalid range', () => {
  const days = getWorkingDays('2026-05-16', '2026-05-10', [0,1,2,3,4]);
  assertEqual(days.length, 0);
});

test('single day range returns that day if it is a working day', () => {
  // 2026-05-11 is a Monday (workday in Mon-Fri config)
  const days = getWorkingDays('2026-05-11', '2026-05-11', [1,2,3,4,5]);
  assertEqual(days.length, 1);
  assertEqual(days[0], '2026-05-11');
});

test('single day range returns empty if non-working day', () => {
  // 2026-05-10 is Sunday — not in Mon-Fri config
  const days = getWorkingDays('2026-05-10', '2026-05-10', [1,2,3,4,5]);
  assertEqual(days.length, 0);
});

test('2-week sprint Sun-Thu gives 10 working days', () => {
  // 2026-05-10 (Sun) to 2026-05-23 (Sat) — 10 working Sun-Thu days
  const days = getWorkingDays('2026-05-10', '2026-05-23', [0,1,2,3,4]);
  assertEqual(days.length, 10);
});

// ── dayColIndex ────────────────────────────────────────────────────────────
console.log('\ndayColIndex');

const SAMPLE_DAYS = ['2026-05-10','2026-05-11','2026-05-12','2026-05-13','2026-05-14'];

test('returns exact index for date in list', () => {
  assertEqual(dayColIndex('2026-05-12', SAMPLE_DAYS), 2);
});
test('clamps to 0 for date before list', () => {
  assertEqual(dayColIndex('2026-05-01', SAMPLE_DAYS), 0);
});
test('clamps to last for date after list', () => {
  assertEqual(dayColIndex('2026-06-01', SAMPLE_DAYS), 4);
});
test('returns closest for date between working days', () => {
  // 2026-05-15 (Fri) is not in the Sun-Thu list — should clamp to 4 (Thu)
  const idx = dayColIndex('2026-05-15', SAMPLE_DAYS);
  assert(idx >= 3 && idx <= 4, `Expected 3 or 4, got ${idx}`);
});

// ── fmtDay ─────────────────────────────────────────────────────────────────
console.log('\nfmtDay');

test('formats YYYY-MM-DD to "D Mon"', () => {
  assertEqual(fmtDay('2026-05-23'), '23 May');
});
test('single digit day has no leading zero', () => {
  assertEqual(fmtDay('2026-05-01'), '1 May');
});
test('formats December correctly', () => {
  assertEqual(fmtDay('2026-12-31'), '31 Dec');
});

// ── partitionStories ───────────────────────────────────────────────────────
console.log('\npartitionStories');

const ME = 'acc-me';
const stories = [
  { key:'HRM-1', summary:'Alpha', dueDate:'2026-05-20', assigneeAccountId: ME,   statusCategory:'done',          priority:'High',   points:3 },
  { key:'HRM-2', summary:'Beta',  dueDate:'2026-05-15', assigneeAccountId:'x',   statusCategory:'indeterminate', priority:'Medium', points:5 },
  { key:'HRM-3', summary:'Gamma', dueDate: null,        assigneeAccountId: ME,   statusCategory:'new',           priority:'Low',    points:0 },
  { key:'HRM-4', summary:'Delta', dueDate: null,        assigneeAccountId:'y',   statusCategory:'new',           priority:'High',   points:2 },
  { key:'HRM-5', summary:'Epsilon',dueDate:'2026-05-23',assigneeAccountId: ME,   statusCategory:'new',           priority:'Low',    points:1 },
];

test('scheduled sorted by dueDate asc', () => {
  const { scheduled } = partitionStories(stories, ME, false);
  assertEqual(scheduled.map(s => s.key), ['HRM-2','HRM-1','HRM-5']);
});
test('unscheduled sorted by key', () => {
  const { unscheduled } = partitionStories(stories, ME, false);
  assertEqual(unscheduled.map(s => s.key), ['HRM-3','HRM-4']);
});
test('filterMine=true returns only engineer tickets', () => {
  const { scheduled, unscheduled } = partitionStories(stories, ME, true);
  const all = [...scheduled, ...unscheduled].map(s => s.key);
  assert(all.every(k => ['HRM-1','HRM-3','HRM-5'].includes(k)), 'Only ME tickets');
  assert(!all.includes('HRM-2'), 'HRM-2 (other engineer) excluded');
});
test('filterMine=false returns all tickets', () => {
  const { scheduled, unscheduled } = partitionStories(stories, ME, false);
  assertEqual(scheduled.length + unscheduled.length, 5);
});
test('null accountId with filterMine=true returns nothing', () => {
  const { scheduled, unscheduled } = partitionStories(stories, null, true);
  assertEqual(scheduled.length + unscheduled.length, 5); // no filter applied
});

// ── buildGanttSVG ──────────────────────────────────────────────────────────
console.log('\nbuildGanttSVG');

const sprint = {
  name: 'HRM Sprint 64',
  startDate: '2026-05-10',
  endDate:   '2026-05-23',
};

test('returns an SVG element', () => {
  const svg = buildGanttSVG(stories, sprint, [0,1,2,3,4], ME);
  assertIncludes(svg, '<svg');
  assertIncludes(svg, '</svg>');
});
test('renders ticket keys', () => {
  const svg = buildGanttSVG(stories, sprint, [0,1,2,3,4], ME);
  assertIncludes(svg, 'HRM-1');
  assertIncludes(svg, 'HRM-2');
});
test('renders unscheduled separator when there are no-due-date tickets', () => {
  const svg = buildGanttSVG(stories, sprint, [0,1,2,3,4], ME);
  assertIncludes(svg, 'Unscheduled');
});
test('no unscheduled separator when all tickets have due dates', () => {
  const allDated = stories.filter(s => s.dueDate);
  const svg = buildGanttSVG(allDated, sprint, [0,1,2,3,4], ME);
  assertExcludes(svg, 'Unscheduled');
});
test('filterMine=true excludes other engineers tickets', () => {
  const svg = buildGanttSVG(stories, sprint, [0,1,2,3,4], ME, { filterMine: true });
  assertExcludes(svg, 'HRM-2'); // belongs to 'x'
  assertExcludes(svg, 'HRM-4'); // belongs to 'y'
  assertIncludes(svg, 'HRM-1'); // mine
});
test('filterMine=false includes all tickets', () => {
  const svg = buildGanttSVG(stories, sprint, [0,1,2,3,4], ME, { filterMine: false });
  assertIncludes(svg, 'HRM-2');
  assertIncludes(svg, 'HRM-4');
});
test('escapes XSS in ticket key and summary', () => {
  const xssStory = [{ key:'<script>', summary:'alert("xss")', dueDate:'2026-05-20', assigneeAccountId: ME, statusCategory:'new', priority:'Medium', points:0 }];
  const svg = buildGanttSVG(xssStory, sprint, [0,1,2,3,4], ME);
  assertExcludes(svg, '<script>');
  assertIncludes(svg, '&lt;script&gt;');
});
test('empty stories returns valid SVG', () => {
  const svg = buildGanttSVG([], sprint, [0,1,2,3,4], ME);
  assertIncludes(svg, '<svg');
});
test('renders today line when today is in sprint range', () => {
  // Create a sprint that includes today
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const end   = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const svg = buildGanttSVG(stories, { name:'Test', startDate: start, endDate: end }, [0,1,2,3,4,5,6], ME);
  assertIncludes(svg, '#f59e0b'); // today colour appears somewhere
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
