#!/usr/bin/env node
/**
 * tests/ticket-render.test.js
 * Unit tests for src/ticket-render.js
 * Run with: node tests/ticket-render.test.js
 */

import {
  escapeHtml,
  priorityDot,
  ticketStatusColor,
  ticketStatusIcon,
  formatDueDate,
  renderTicketRow,
  buildMiniProgressBar,
  deriveProjectKey,
  countWorkingDays,
  sprintDayMetrics,
} from '../src/ticket-render.js';

let pass = 0, fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${name}\n      ${err.message}`);
    fail++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b) {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── escapeHtml ─────────────────────────────────────────────────────────────
console.log('\nescapeHtml');

test('escapes ampersand', () => assertEqual(escapeHtml('a & b'), 'a &amp; b'));
test('escapes < and >', () => assertEqual(escapeHtml('<script>'), '&lt;script&gt;'));
test('escapes double quote', () => assertEqual(escapeHtml('"hi"'), '&quot;hi&quot;'));
test('escapes single quote', () => assertEqual(escapeHtml("it's"), 'it&#39;s'));
test('handles null/undefined gracefully', () => {
  assertEqual(escapeHtml(null), '');
  assertEqual(escapeHtml(undefined), '');
});
test('passes through plain text unchanged', () => assertEqual(escapeHtml('Hello'), 'Hello'));

// ── priorityDot ────────────────────────────────────────────────────────────
console.log('\npriorityDot');

test('highest renders red', () => assert(priorityDot('Highest').includes('#ef4444')));
test('critical renders red', () => assert(priorityDot('Critical').includes('#ef4444')));
test('high renders orange', () => assert(priorityDot('High').includes('#f97316')));
test('medium renders amber', () => assert(priorityDot('Medium').includes('#f59e0b')));
test('low renders blue', () => assert(priorityDot('Low').includes('#60a5fa')));
test('lowest renders slate', () => assert(priorityDot('Lowest').includes('#94a3b8')));
test('unknown priority falls back to medium', () => {
  const dot = priorityDot('Blocker');
  assert(dot.includes('#f59e0b'), 'unknown should render amber (medium fallback)');
});
test('case-insensitive', () => {
  const lower = priorityDot('high');
  const upper = priorityDot('HIGH');
  assertEqual(lower, upper);
});

// ── ticketStatusColor ──────────────────────────────────────────────────────
console.log('\nticketStatusColor');

test('done is green', () => assertEqual(ticketStatusColor('Done'), '#22c55e'));
test('in progress is blue', () => assertEqual(ticketStatusColor('In Progress'), '#3b82f6'));
test('blocked is red', () => assertEqual(ticketStatusColor('Blocked'), '#ef4444'));
test('qa testing is purple', () => assertEqual(ticketStatusColor('QA Testing'), '#a78bfa'));
test('unknown status falls back to muted', () => {
  assertEqual(ticketStatusColor('Mystery Status'), 'var(--text-muted)');
});
test('handles empty string', () => assertEqual(ticketStatusColor(''), 'var(--text-muted)'));

// ── ticketStatusIcon ───────────────────────────────────────────────────────
console.log('\nticketStatusIcon');

test('done → checkmark', () => assertEqual(ticketStatusIcon('done'), '✓'));
test('indeterminate → filled circle', () => assertEqual(ticketStatusIcon('indeterminate'), '●'));
test('new → open circle', () => assertEqual(ticketStatusIcon('new'), '○'));
test('unknown → open circle', () => assertEqual(ticketStatusIcon('unknown'), '○'));

// ── formatDueDate ──────────────────────────────────────────────────────────
console.log('\nformatDueDate');

test('empty dateStr returns empty string', () => assertEqual(formatDueDate('', 'new'), ''));
test('null dateStr returns empty string', () => assertEqual(formatDueDate(null, 'new'), ''));

test('overdue (not done) shows red warning', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 5);
  const ds = yesterday.toISOString().slice(0, 10);
  const result = formatDueDate(ds, 'indeterminate');
  assert(result.includes('#ef4444'), 'overdue should be red');
  assert(result.includes('⚠'), 'overdue should show warning');
});

test('overdue but done shows muted (no warning)', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 5);
  const ds = yesterday.toISOString().slice(0, 10);
  const result = formatDueDate(ds, 'done');
  assert(!result.includes('#ef4444'), 'done ticket should not show red');
  assert(!result.includes('⚠'), 'done ticket should not show warning');
});

test('due soon (≤2 days) shows amber', () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ds = tomorrow.toISOString().slice(0, 10);
  const result = formatDueDate(ds, 'indeterminate');
  assert(result.includes('#f59e0b'), 'due soon should be amber');
});

test('due in future shows plain calendar emoji', () => {
  const future = new Date();
  future.setDate(future.getDate() + 10);
  const ds = future.toISOString().slice(0, 10);
  const result = formatDueDate(ds, 'indeterminate');
  assert(result.includes('📅'), 'future should show calendar');
  assert(!result.includes('#ef4444'), 'future should not be red');
  assert(!result.includes('#f59e0b'), 'future should not be amber');
});

// ── renderTicketRow ────────────────────────────────────────────────────────
console.log('\nrenderTicketRow');

const baseStory = {
  key: 'HRM-9978',
  summary: 'Fix login bug',
  status: 'In Progress',
  statusCategory: 'indeterminate',
  priority: 'High',
  points: 3,
  dueDate: null,
  labels: [],
};

test('renders key in output', () => {
  assert(renderTicketRow(baseStory, 'https://zeal.atlassian.net').includes('HRM-9978'));
});
test('renders summary in output', () => {
  assert(renderTicketRow(baseStory, 'https://zeal.atlassian.net').includes('Fix login bug'));
});
test('renders Jira URL when base URL provided', () => {
  const html = renderTicketRow(baseStory, 'https://zeal.atlassian.net');
  assert(html.includes('https://zeal.atlassian.net/browse/HRM-9978'));
});
test('renders points', () => {
  assert(renderTicketRow(baseStory, '').includes('3pt'));
});
test('omits points when 0', () => {
  const s = { ...baseStory, points: 0 };
  assert(!renderTicketRow(s, '').includes('pt'), 'zero points should not show');
});
test('escapes XSS in summary', () => {
  const s = { ...baseStory, summary: '<script>alert(1)</script>' };
  const html = renderTicketRow(s, '');
  assert(!html.includes('<script>'), 'raw <script> should be escaped');
  assert(html.includes('&lt;script&gt;'), 'should contain escaped version');
});

// ── buildMiniProgressBar ───────────────────────────────────────────────────
console.log('\nbuildMiniProgressBar');

test('empty stories returns "No tickets"', () => {
  assert(buildMiniProgressBar([]).includes('No tickets'));
});
test('shows done percentage', () => {
  const stories = [
    { statusCategory: 'done', points: 5 },
    { statusCategory: 'new',  points: 5 },
  ];
  assert(buildMiniProgressBar(stories).includes('50%'), 'should show 50%');
});
test('includes riskText when provided', () => {
  const stories = [{ statusCategory: 'new', points: 3 }];
  const result = buildMiniProgressBar(stories, { riskText: 'need 2pt/d' });
  assert(result.includes('need 2pt/d'), 'risk text should appear');
});
test('omits riskText when not provided', () => {
  const stories = [{ statusCategory: 'done', points: 3 }];
  const result = buildMiniProgressBar(stories);
  assert(!result.includes('need'), 'no risk text');
});
test('works without points (count-based)', () => {
  const stories = [
    { statusCategory: 'done',          points: 0 },
    { statusCategory: 'indeterminate', points: 0 },
    { statusCategory: 'new',           points: 0 },
  ];
  const result = buildMiniProgressBar(stories);
  assert(result.includes('%'), 'should show percentage');
});

// ── deriveProjectKey ───────────────────────────────────────────────────────
console.log('\nderiveProjectKey');

test('extracts key from story keys', () => {
  const stories = [{ key: 'HRM-9978' }, { key: 'HRM-9910' }];
  assertEqual(deriveProjectKey('HRM Sprint 64', stories), 'HRM');
});
test('falls back to sprint name when no stories', () => {
  assertEqual(deriveProjectKey('HRM Sprint 64', []), 'HRM');
});
test('returns empty string for unrecognised format', () => {
  assertEqual(deriveProjectKey('Sprint 64', []), '');
});

// ── countWorkingDays ───────────────────────────────────────────────────────
console.log('\ncountWorkingDays');

test('counts Mon-Fri in a Mon-Fri week', () => {
  // 2026-05-11 (Mon) to 2026-05-15 (Fri)
  const start = new Date('2026-05-11');
  const end   = new Date('2026-05-15');
  assertEqual(countWorkingDays(start, end, [1,2,3,4,5]), 5);
});
test('counts Sun-Thu for Zeal working week', () => {
  // 2026-05-10 (Sun) to 2026-05-14 (Thu)
  const start = new Date('2026-05-10');
  const end   = new Date('2026-05-14');
  assertEqual(countWorkingDays(start, end, [0,1,2,3,4]), 5);
});
test('skips weekends (Fri+Sat) in Sun-Thu config', () => {
  // 2026-05-10 (Sun) to 2026-05-16 (Sat) = 5 working days (Sun-Thu) + 1 Fri + 1 Sat
  const start = new Date('2026-05-10');
  const end   = new Date('2026-05-16');
  assertEqual(countWorkingDays(start, end, [0,1,2,3,4]), 5);
});
test('same-day returns 1 on a working day', () => {
  // 2026-05-11 (Mon) is a working day for Mon-Fri config
  const d = new Date('2026-05-11');
  assertEqual(countWorkingDays(d, d, [1,2,3,4,5]), 1);
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
