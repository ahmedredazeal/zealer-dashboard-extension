/**
 * src/gantt.js — Zealer Dashboard
 * Pure Gantt chart renderer for the current sprint.
 *
 * All functions return SVG/HTML strings — no DOM dependencies, testable in Node.
 *
 * Layout:
 *   ┌──────────────┬─────────────────────────────────────────┐
 *   │ Label column │ Timeline bars                           │
 *   │  (LABEL_W px)│  one column per working day             │
 *   └──────────────┴─────────────────────────────────────────┘
 *   Unscheduled tickets cluster at the bottom with a separator.
 *
 * @module gantt
 */

// ── Layout constants ───────────────────────────────────────────────────────
const LABEL_W   = 100; // px for the key + summary label column
const ROW_H     = 22;  // px per ticket row
const COL_MIN   = 20;  // minimum px per working-day column
const COL_MAX   = 48;  // maximum px per working-day column
const HEADER_H  = 28;  // px for the date header row
const SEP_H     = 20;  // px for the "Unscheduled" separator row
const PAD_RIGHT = 12;  // px trailing padding

// ── Colour helpers ────────────────────────────────────────────────────────
const STATUS_FILL = {
  done:          '#22c55e',
  indeterminate: '#3b82f6',
  new:           '#94a3b8',
};
const STATUS_STROKE = {
  done:          '#16a34a',
  indeterminate: '#2563eb',
  new:           '#64748b',
};

function barFill(statusCategory)   { return STATUS_FILL[statusCategory]   || '#94a3b8'; }
function barStroke(statusCategory) { return STATUS_STROKE[statusCategory] || '#64748b'; }

// ── Date / working-day helpers ─────────────────────────────────────────────

/**
 * Returns an ordered list of working-day date strings between start and end (inclusive).
 * @param {string}   startISO   — sprint.startDate
 * @param {string}   endISO     — sprint.endDate
 * @param {number[]} workingDays — [0..6] Sun=0
 */
export function getWorkingDays(startISO, endISO, workingDays = [0,1,2,3,4]) {
  const set    = new Set(workingDays);
  const result = [];
  const cur    = new Date(startISO);
  cur.setUTCHours(0,0,0,0);
  const end = new Date(endISO);
  end.setUTCHours(23,59,59,999);
  while (cur <= end) {
    if (set.has(cur.getUTCDay())) {
      result.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return result;
}

/**
 * Find the column index (0-based) of a given date within the working-day list.
 * Returns the nearest index if not in the list (clamps to range).
 */
export function dayColIndex(dateISO, workingDayList) {
  const exact = workingDayList.indexOf(dateISO);
  if (exact >= 0) return exact;
  // Clamp: before first → 0, after last → last
  if (dateISO <= workingDayList[0]) return 0;
  if (dateISO >= workingDayList[workingDayList.length - 1]) return workingDayList.length - 1;
  // Find closest
  let lo = 0, hi = workingDayList.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (workingDayList[mid] <= dateISO) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Format "2026-05-23" → "23 May"
 */
export function fmtDay(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

// ── Story partitioning ─────────────────────────────────────────────────────

/**
 * Partition stories into scheduled (have dueDate) and unscheduled.
 * Both sorted: scheduled by dueDate asc then priority; unscheduled by key.
 */
export function partitionStories(stories, accountId, filterMine = false) {
  const PRIORITY_ORDER = { highest:0, critical:0, high:1, medium:2, low:3, lowest:4 };
  const priIdx = p => PRIORITY_ORDER[(p||'medium').toLowerCase()] ?? 2;

  let list = filterMine && accountId
    ? stories.filter(s => s.assigneeAccountId === accountId)
    : stories;

  const scheduled   = list.filter(s => s.dueDate).sort((a,b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return priIdx(a.priority) - priIdx(b.priority);
  });
  const unscheduled = list.filter(s => !s.dueDate).sort((a,b) =>
    a.key < b.key ? -1 : 1
  );
  return { scheduled, unscheduled };
}

// ── SVG builder ────────────────────────────────────────────────────────────

function escHtml(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Build the full Gantt SVG string.
 *
 * @param {Object[]} stories      — normalizeStory array for the sprint
 * @param {Object}   sprint       — { name, startDate, endDate }
 * @param {number[]} workingDays  — [0..6] day-of-week indices
 * @param {string}   accountId    — engineer's account ID (highlight own rows)
 * @param {Object}   [opts]
 * @param {boolean}  [opts.filterMine=false] — if true, only show engineer's tickets
 * @param {number}   [opts.width=580]        — SVG canvas width
 * @returns {string}  SVG markup string
 */
export function buildGanttSVG(stories, sprint, workingDays = [0,1,2,3,4], accountId = '', opts = {}) {
  const { filterMine = false, width = 580 } = opts;

  const wdays  = getWorkingDays(sprint.startDate, sprint.endDate, workingDays);
  const nDays  = wdays.length || 1;
  const todayISO = new Date().toISOString().slice(0, 10);

  // Column width — fit to canvas, clamped
  const timelineW = width - LABEL_W - PAD_RIGHT;
  const colW = Math.max(COL_MIN, Math.min(COL_MAX, Math.floor(timelineW / nDays)));
  const totalW = LABEL_W + colW * nDays + PAD_RIGHT;

  const { scheduled, unscheduled } = partitionStories(stories, accountId, filterMine);

  const hasUnscheduled = unscheduled.length > 0;
  const totalRows = scheduled.length + (hasUnscheduled ? unscheduled.length + 1 : 0);
  const svgH = HEADER_H + totalRows * ROW_H + 8; // 8px bottom padding

  // x() converts a column index to SVG x coordinate
  const x  = col => LABEL_W + col * colW;
  const y  = row => HEADER_H + row * ROW_H;

  // ── Background + grid ─────────────────────────────────────────────────
  let gridLines = '';
  wdays.forEach((d, col) => {
    const isToday   = d === todayISO;
    const isWeekend = false; // already filtered by workingDays
    const cx        = x(col);
    if (isToday) {
      // Today column highlight
      gridLines += `<rect x="${cx}" y="${HEADER_H}" width="${colW}" height="${svgH - HEADER_H - 8}" fill="rgba(245,158,11,0.06)"/>`;
    }
    // Vertical grid line
    gridLines += `<line x1="${cx}" y1="${HEADER_H}" x2="${cx}" y2="${svgH - 8}" stroke="var(--border,rgba(148,163,184,0.12))" stroke-width="1"/>`;
  });
  // Closing right line
  gridLines += `<line x1="${x(nDays)}" y1="${HEADER_H}" x2="${x(nDays)}" y2="${svgH - 8}" stroke="var(--border,rgba(148,163,184,0.12))" stroke-width="1"/>`;

  // ── Header row ────────────────────────────────────────────────────────
  let headerCells = '';
  // Show label for: first, today (if visible), last, and every ~5 working days
  wdays.forEach((d, col) => {
    const isFirst = col === 0;
    const isLast  = col === nDays - 1;
    const isToday = d === todayISO;
    const every5  = col % 5 === 0;
    if (!isFirst && !isLast && !isToday && !every5) return;

    const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
    const cx     = x(col) + (anchor === 'start' ? 2 : anchor === 'end' ? colW - 2 : colW / 2);
    const label  = isToday ? 'today' : fmtDay(d);
    const color  = isToday ? '#f59e0b' : 'var(--text-muted,#94a3b8)';
    const weight = isToday ? '600' : '400';
    headerCells += `<text x="${cx.toFixed(1)}" y="17" text-anchor="${anchor}" font-size="9" font-weight="${weight}" fill="${color}" font-family="system-ui">${escHtml(label)}</text>`;
  });

  // ── Today vertical dashed line ────────────────────────────────────────
  let todayLine = '';
  const todayCol = dayColIndex(todayISO, wdays);
  if (todayISO >= wdays[0] && todayISO <= wdays[nDays - 1]) {
    const tx = x(todayCol) + colW / 2;
    todayLine = `<line x1="${tx.toFixed(1)}" y1="${HEADER_H}" x2="${tx.toFixed(1)}" y2="${svgH - 8}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>`;
  }

  // ── Ticket rows ───────────────────────────────────────────────────────
  let rows = '';

  function renderRow(story, rowIdx) {
    const ry         = y(rowIdx);
    const isMe       = story.assigneeAccountId === accountId;
    const sc         = story.statusCategory || 'new';
    const fill       = barFill(sc);
    const stroke     = barStroke(sc);
    const labelColor = isMe ? 'var(--text,#e2e8f0)' : 'var(--text-muted,#94a3b8)';
    const rowBg      = isMe ? 'rgba(99,102,241,0.05)' : 'transparent';

    // Row background stripe for "me"
    if (isMe) {
      rows += `<rect x="0" y="${ry}" width="${totalW}" height="${ROW_H}" fill="${rowBg}"/>`;
    }
    // Horizontal separator line
    rows += `<line x1="0" y1="${ry}" x2="${totalW}" y2="${ry}" stroke="var(--border,rgba(148,163,184,0.08))" stroke-width="1"/>`;

    // Label (key + summary truncated)
    const labelText = `${story.key}`;
    const summaryText = story.summary || '';
    rows += `<text x="4" y="${ry + 14}" font-size="9.5" font-weight="${isMe?'600':'400'}" fill="${labelColor}" font-family="system-ui">
      <tspan font-weight="600" fill="${isMe ? 'var(--primary,#6366f1)' : labelColor}">${escHtml(labelText)}</tspan>
      <tspan dx="3" font-size="8.5" fill="var(--text-muted,#94a3b8)">${escHtml(summaryText.slice(0, 18))}${summaryText.length > 18 ? '…' : ''}</tspan>
    </text>`;

    // Bar
    if (story.dueDate) {
      // Bar start = max(ticket created date, sprint start) so bars reflect actual work window.
      // Tickets created before the sprint started appear from sprint day 0.
      // Tickets created mid-sprint start at their creation date column.
      const effectiveStart = (story.created && story.created > sprint.startDate)
        ? story.created
        : sprint.startDate;
      const startColIdx = dayColIndex(effectiveStart, wdays);
      const endColIdx   = dayColIndex(story.dueDate,   wdays);

      const barX       = x(startColIdx);
      const barEndX    = x(endColIdx) + colW;
      const barW       = Math.max(colW, barEndX - barX);
      const barY       = ry + 5;
      const barHeight  = ROW_H - 10;

      rows += `<rect x="${barX}" y="${barY}" width="${barW}" height="${barHeight}"
        rx="3" fill="${fill}" fill-opacity="${isMe ? '0.85' : '0.45'}"
        stroke="${stroke}" stroke-width="${isMe ? '1.5' : '0.5'}" stroke-opacity="0.6"/>`;

      // Points badge on bar if > 0
      if (story.points > 0) {
        const badgeX = barX + barW - 4;
        rows += `<text x="${badgeX.toFixed(1)}" y="${barY + barHeight - 3}" text-anchor="end"
          font-size="8" fill="${isMe ? '#fff' : stroke}" font-family="system-ui" opacity="0.8">${story.points}pt</text>`;
      }
    }

    // Status pill at far right of label
    const pillColor = barFill(sc);
    rows += `<rect x="${LABEL_W - 28}" y="${ry + 7}" width="26" height="9" rx="4" fill="${pillColor}" fill-opacity="0.2"/>
      <text x="${LABEL_W - 15}" y="${ry + 14}" text-anchor="middle" font-size="7" fill="${pillColor}" font-family="system-ui">${escHtml((story.status || '').slice(0, 10))}</text>`;
  }

  // Scheduled rows
  scheduled.forEach((s, i) => renderRow(s, i));

  // Unscheduled separator + rows
  if (hasUnscheduled) {
    const sepRowIdx = scheduled.length;
    const sepY      = y(sepRowIdx);
    rows += `<rect x="0" y="${sepY}" width="${totalW}" height="${SEP_H}" fill="var(--surface-raised,rgba(255,255,255,0.03))"/>`;
    rows += `<text x="4" y="${sepY + 14}" font-size="9" fill="var(--text-muted,#94a3b8)" font-family="system-ui" font-style="italic">Unscheduled (no due date)</text>`;

    unscheduled.forEach((s, i) => {
      const rowIdx = sepRowIdx + 1 + i;
      const ry     = y(rowIdx);
      const isMe   = s.assigneeAccountId === accountId;

      rows += `<line x1="0" y1="${ry}" x2="${totalW}" y2="${ry}" stroke="var(--border,rgba(148,163,184,0.08))" stroke-width="1"/>`;
      rows += `<text x="4" y="${ry + 14}" font-size="9.5" fill="var(--text-muted,#94a3b8)" font-family="system-ui">
        <tspan font-weight="${isMe?'600':'400'}" fill="${isMe?'var(--primary,#6366f1)':'var(--text-muted,#94a3b8)'}">${escHtml(s.key)}</tspan>
        <tspan dx="3" font-size="8.5">${escHtml((s.summary||'').slice(0,18))}${(s.summary||'').length>18?'…':''}</tspan>
      </text>`;

      // Dashed full-sprint bar for unscheduled
      const barY = ry + 5;
      const barH2 = ROW_H - 10;
      rows += `<rect x="${x(0)}" y="${barY}" width="${colW * nDays}" height="${barH2}"
        rx="3" fill="none" stroke="var(--text-muted,#94a3b8)" stroke-width="1" stroke-dasharray="5 3" opacity="0.4"/>`;
    });
  }

  // ── Label column divider ──────────────────────────────────────────────
  const divider = `<line x1="${LABEL_W}" y1="0" x2="${LABEL_W}" y2="${svgH}" stroke="var(--border,rgba(148,163,184,0.2))" stroke-width="1"/>`;

  // ── Header background ─────────────────────────────────────────────────
  const headerBg = `<rect x="0" y="0" width="${totalW}" height="${HEADER_H}" fill="var(--surface-raised,rgba(255,255,255,0.04))"/>`;

  return `<svg viewBox="0 0 ${totalW} ${svgH}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">
  ${headerBg}
  ${gridLines}
  ${todayLine}
  ${headerCells}
  ${rows}
  ${divider}
</svg>`;
}
