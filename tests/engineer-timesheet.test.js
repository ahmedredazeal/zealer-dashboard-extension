#!/usr/bin/env node
/**
 * tests/engineer-timesheet.test.js
 * Run with: node tests/engineer-timesheet.test.js
 */

import {
  extractEngineerWorklogs,
  computeDailyTimesheet,
  quarterDateRange,
  computeQuarterTimesheet,
  computeEngineerEstVsActual,
} from '../src/engineer-timesheet.js';

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

// ── extractEngineerWorklogs ────────────────────────────────────────────────
console.log('\nextractEngineerWorklogs');

const ME = 'acc-me';
const mockIssues = [
  {
    key: 'HRM-1',
    fields: {
      worklog: {
        worklogs: [
          { author: { accountId: ME   }, started: '2026-05-11T09:00:00+0000', timeSpentSeconds: 7200 },
          { author: { accountId: 'x' }, started: '2026-05-11T10:00:00+0000', timeSpentSeconds: 3600 },
        ]
      }
    }
  },
  {
    key: 'HRM-2',
    fields: {
      worklog: {
        worklogs: [
          { author: { accountId: ME }, started: '2026-05-12T09:00:00+0000', timeSpentSeconds: 3600 },
        ]
      }
    }
  }
];

test('returns only the engineer\'s worklogs', () => {
  const wls = extractEngineerWorklogs(mockIssues, ME);
  assertEqual(wls.length, 2);
});
test('excludes other engineers\' worklogs', () => {
  const wls = extractEngineerWorklogs(mockIssues, 'x');
  assertEqual(wls.length, 1);
});
test('returns empty for unknown accountId', () => {
  const wls = extractEngineerWorklogs(mockIssues, 'nobody');
  assertEqual(wls.length, 0);
});
test('handles issues with no worklog field', () => {
  const wls = extractEngineerWorklogs([{ key: 'X-1', fields: {} }], ME);
  assertEqual(wls.length, 0);
});

// ── computeDailyTimesheet ─────────────────────────────────────────────────
console.log('\ncomputeDailyTimesheet');

// Sprint: Sun 2026-05-10 → Sat 2026-05-23, working days Sun-Thu
const SPRINT_START = '2026-05-10';
const SPRINT_END   = '2026-05-23';
const WORKING_DAYS = [0, 1, 2, 3, 4]; // Sun-Thu

const worklogs = [
  { started: '2026-05-11T09:00:00+0000', timeSpentSeconds: 7200 }, // Mon → 2h
  { started: '2026-05-11T14:00:00+0000', timeSpentSeconds: 3600 }, // Mon → 1h (same day, adds up to 3h)
  { started: '2026-05-12T09:00:00+0000', timeSpentSeconds: 3600 }, // Tue → 1h
  { started: '2026-05-16T09:00:00+0000', timeSpentSeconds: 7200 }, // Sat → ignored (not a working day)
];

test('returns entries only for working days', () => {
  const days = computeDailyTimesheet(worklogs, SPRINT_START, SPRINT_END, WORKING_DAYS);
  // All entries should be Sun-Thu days
  for (const d of days) {
    const dow = new Date(d.date + 'T00:00:00').getDay();
    assert(WORKING_DAYS.includes(dow), `${d.date} (dow=${dow}) should be a working day`);
  }
});
test('sums multiple worklogs on same day', () => {
  const days = computeDailyTimesheet(worklogs, SPRINT_START, SPRINT_END, WORKING_DAYS);
  const mon  = days.find(d => d.date === '2026-05-11');
  assert(mon, 'Monday should exist');
  assertEqual(mon.hours, 3); // 2h + 1h
});
test('excludes non-working day worklogs', () => {
  const days = computeDailyTimesheet(worklogs, SPRINT_START, SPRINT_END, WORKING_DAYS);
  const sat  = days.find(d => d.date === '2026-05-16');
  assert(!sat, 'Saturday should not appear in Sun-Thu config');
});
test('days with no worklogs have hours=0', () => {
  const days = computeDailyTimesheet([], SPRINT_START, SPRINT_END, WORKING_DAYS);
  assert(days.length > 0, 'should return working days even with no worklogs');
  for (const d of days) {
    assertEqual(d.hours, 0, `${d.date} should have 0 hours`);
  }
});
test('includes human-readable label', () => {
  const days = computeDailyTimesheet(worklogs, SPRINT_START, SPRINT_END, WORKING_DAYS);
  const mon  = days.find(d => d.date === '2026-05-11');
  assert(mon?.label.includes('11'), 'label should contain day number');
});

// ── quarterDateRange ──────────────────────────────────────────────────────
console.log('\nquarterDateRange');

test('Q1 = Jan-Mar', () => {
  const r = quarterDateRange('Q1', 2026);
  assertEqual(r.start, '2026-01-01');
  assertEqual(r.end,   '2026-03-31');
});
test('Q2 = Apr-Jun', () => {
  const r = quarterDateRange('Q2', 2026);
  assertEqual(r.start, '2026-04-01');
  assertEqual(r.end,   '2026-06-30');
});
test('Q3 = Jul-Sep', () => {
  const r = quarterDateRange('Q3', 2026);
  assertEqual(r.start, '2026-07-01');
  assertEqual(r.end,   '2026-09-30');
});
test('Q4 = Oct-Dec', () => {
  const r = quarterDateRange('Q4', 2026);
  assertEqual(r.start, '2026-10-01');
  assertEqual(r.end,   '2026-12-31');
});

// ── computeQuarterTimesheet ───────────────────────────────────────────────
console.log('\ncomputeQuarterTimesheet');

const quarterIssues = [
  {
    fields: {
      customfield_10020: [{ name: 'HRM Sprint 62', startDate: '2026-04-06T00:00:00.000Z' }],
      worklog: {
        worklogs: [
          { author: { accountId: ME }, started: '2026-04-07T09:00:00+0000', timeSpentSeconds: 28800 }, // Mon 8h
          { author: { accountId: 'x' }, started: '2026-04-07T10:00:00+0000', timeSpentSeconds: 3600 }, // ignored
        ]
      }
    }
  },
  {
    fields: {
      customfield_10020: [{ name: 'HRM Sprint 63', startDate: '2026-04-20T00:00:00.000Z' }],
      worklog: {
        worklogs: [
          { author: { accountId: ME }, started: '2026-04-21T09:00:00+0000', timeSpentSeconds: 14400 }, // Mon 4h
        ]
      }
    }
  }
];

test('groups by sprint name', () => {
  const result = computeQuarterTimesheet(quarterIssues, ME, '2026-04-01', '2026-06-30');
  assertEqual(result.length, 2);
});
test('includes only engineer worklogs', () => {
  const result = computeQuarterTimesheet(quarterIssues, ME, '2026-04-01', '2026-06-30');
  const sp62 = result.find(r => r.name === 'HRM Sprint 62');
  assertEqual(sp62.hours, 8); // only ME's 8h, not 'x''s 1h
});
test('excludes worklogs outside quarter date range', () => {
  const result = computeQuarterTimesheet(quarterIssues, ME, '2026-04-20', '2026-06-30');
  const sp62 = result.find(r => r.name === 'HRM Sprint 62');
  assert(!sp62, 'Sprint 62 worklogs (Apr 7) should be excluded when quarter starts Apr 20');
});
test('sorts by sprint startDate', () => {
  const result = computeQuarterTimesheet(quarterIssues, ME, '2026-04-01', '2026-06-30');
  assert(result[0].name === 'HRM Sprint 62', 'Sprint 62 should come first');
});

// ── computeEngineerEstVsActual ────────────────────────────────────────────
console.log('\ncomputeEngineerEstVsActual');

const estIssues = [
  {
    fields: {
      timeoriginalestimate: 28800, // 8h
      worklog: { worklogs: [
        { author: { accountId: ME }, timeSpentSeconds: 32400 }, // 9h logged
      ]}
    }
  },
  {
    fields: {
      timeoriginalestimate: 14400, // 4h
      worklog: { worklogs: [
        { author: { accountId: 'x'  }, timeSpentSeconds: 7200  }, // different person, ignored
        { author: { accountId: ME   }, timeSpentSeconds: 7200  }, // 2h logged by me
      ]}
    }
  },
  {
    fields: {
      timeoriginalestimate: 7200,
      worklog: { worklogs: [] } // no worklogs → not counted in estimate
    }
  }
];

test('sums only engineer logged hours', () => {
  const r = computeEngineerEstVsActual(estIssues, ME, 'Ahmed');
  assertEqual(r.logged, 11); // 9 + 2
});
test('only counts estimate for issues where engineer logged time', () => {
  const r = computeEngineerEstVsActual(estIssues, ME, 'Ahmed');
  assertEqual(r.estimated, 12); // 8h + 4h only (3rd issue has no worklogs by ME)
});
test('computes ratio correctly', () => {
  const r = computeEngineerEstVsActual(estIssues, ME, 'Ahmed');
  // ratio = 11/12 = 0.9166... rounded to 0.9
  assertEqual(r.ratio, 0.9);
});
test('returns null ratio when no estimate', () => {
  const r = computeEngineerEstVsActual(
    [{ fields: { timeoriginalestimate: 0, worklog: { worklogs: [{ author: { accountId: ME }, timeSpentSeconds: 3600 }] } } }],
    ME, 'Ahmed'
  );
  assertEqual(r.ratio, null);
});
test('includes display name', () => {
  const r = computeEngineerEstVsActual(estIssues, ME, 'Ahmed Reza');
  assertEqual(r.name, 'Ahmed Reza');
});

// ── Summary ───────────────────────────────────────────────────────────────
console.log('');
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
