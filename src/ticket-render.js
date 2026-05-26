/**
 * src/ticket-render.js — Zealer Dashboard
 * Pure rendering helpers for Jira ticket rows and sprint progress.
 * No DOM dependencies — all functions return HTML strings or plain values,
 * so they can be tested in Node without a browser.
 *
 * Adapted from EM Dashboard popup.js (renderTicketRow, priorityDot, etc.)
 * with the following changes:
 *   - escapeHtml uses string-replace (no document.createElement → Node-safe)
 *   - exported individually (tree-shakeable)
 */

// ── HTML safety ────────────────────────────────────────────────────────────

/**
 * Escape a value for safe innerHTML insertion.
 * Uses string-replacement so it works in Node.js tests as well as the browser.
 */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Priority ───────────────────────────────────────────────────────────────

const PRIORITY_DOT = {
  highest: '<span title="Highest" style="color:#ef4444;font-size:9px;flex-shrink:0;">●</span>',
  critical:'<span title="Critical" style="color:#ef4444;font-size:9px;flex-shrink:0;">●</span>',
  high:    '<span title="High"     style="color:#f97316;font-size:9px;flex-shrink:0;">●</span>',
  medium:  '<span title="Medium"   style="color:#f59e0b;font-size:9px;flex-shrink:0;">●</span>',
  low:     '<span title="Low"      style="color:#60a5fa;font-size:9px;flex-shrink:0;">●</span>',
  lowest:  '<span title="Lowest"   style="color:#94a3b8;font-size:9px;flex-shrink:0;">●</span>',
};

export function priorityDot(priority) {
  return PRIORITY_DOT[(priority || 'medium').toLowerCase()] || PRIORITY_DOT.medium;
}

// ── Status ─────────────────────────────────────────────────────────────────

const TICKET_STATUS_COLORS = {
  'done':        '#22c55e',
  'in progress': '#3b82f6',
  'in review':   '#8b5cf6',
  'blocked':     '#ef4444',
  'todo':        'var(--text-muted)',
  'to do':       'var(--text-muted)',
  'open':        'var(--text-muted)',
  'qa rejected': '#f59e0b',
  'qa testing':  '#a78bfa',
  'qa accepted': '#22c55e',
};

export function ticketStatusColor(status) {
  return TICKET_STATUS_COLORS[(status || '').toLowerCase()] || 'var(--text-muted)';
}

export function ticketStatusIcon(statusCategory) {
  return ({ done: '✓', indeterminate: '●', new: '○' })[statusCategory] || '○';
}

// ── Due date ───────────────────────────────────────────────────────────────

/**
 * Format a Jira duedate string ("YYYY-MM-DD") for display.
 * Suppresses overdue warnings for completed tickets (statusCategory === 'done').
 */
export function formatDueDate(dateStr, statusCategory) {
  if (!dateStr) return '';
  const due   = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days  = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  const label = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  if (statusCategory === 'done') {
    return `<span style="color:var(--text-muted);">📅 ${label}</span>`;
  }
  if (days < 0)  return `<span style="color:#ef4444;">⚠ due ${label}</span>`;
  if (days <= 2) return `<span style="color:#f59e0b;">📅 ${label}</span>`;
  return `📅 ${label}`;
}

// ── Ticket row ─────────────────────────────────────────────────────────────

/**
 * Render one Jira ticket row as an HTML string.
 * @param {Object} story — normalizeStory output
 * @param {string} jiraBaseUrl — e.g. "https://your-org.atlassian.net"
 */
export function renderTicketRow(story, jiraBaseUrl) {
  const url = jiraBaseUrl
    ? `${jiraBaseUrl.replace(/\/$/, '')}/browse/${story.key}`
    : null;
  const duePart = story.dueDate ? formatDueDate(story.dueDate, story.statusCategory) : '';

  return `
    <div class="ticket-row"
         ${url ? `data-url="${escapeHtml(url)}"` : ''}
         style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;
                border-bottom:1px solid var(--border,rgba(255,255,255,0.05));
                ${url ? 'cursor:pointer;' : ''}">
      ${priorityDot(story.priority)}
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;color:var(--text);white-space:nowrap;
                    overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(story.summary)}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">
          ${escapeHtml(story.key)}${story.points > 0 ? ` · ${story.points}pt` : ''}${duePart ? ` · ${duePart}` : ''}
        </div>
      </div>
      <span style="font-size:10px;color:${ticketStatusColor(story.status)};
                   white-space:nowrap;flex-shrink:0;margin-top:2px;">
        ${escapeHtml(story.status)}
      </span>
    </div>`;
}

// ── Sprint mini progress bar ───────────────────────────────────────────────

/**
 * Compact horizontal stacked bar + headline metrics.
 * Used in the sprint section header. Mirrors EM's buildMiniProgressBar.
 *
 * @param {Object[]} stories   — normalizeStory array
 * @param {Object}  [opts]
 * @param {string}  [opts.riskText]     — e.g. "At risk · need 4.5pt/d"
 * @param {boolean} [opts.showUnassigned]
 */
export function buildMiniProgressBar(stories, opts = {}) {
  if (!stories || stories.length === 0) {
    return `<span style="font-size:11px;color:var(--text-muted);">No tickets</span>`;
  }

  const totalPoints = stories.reduce((s, t) => s + (t.points || 0), 0);
  const usePoints   = totalPoints > 0;

  let donePts, inProgPts, openPts, total;
  if (usePoints) {
    donePts   = stories.filter(s => s.statusCategory === 'done')
                       .reduce((sum, s) => sum + (s.points || 0), 0);
    inProgPts = stories.filter(s => s.statusCategory === 'indeterminate')
                       .reduce((sum, s) => sum + (s.points || 0), 0);
    openPts   = totalPoints - donePts - inProgPts;
    total     = totalPoints;
  } else {
    donePts   = stories.filter(s => s.statusCategory === 'done').length;
    inProgPts = stories.filter(s => s.statusCategory === 'indeterminate').length;
    openPts   = stories.length - donePts - inProgPts;
    total     = stories.length;
  }

  const donePct = total > 0 ? Math.round(donePts  / total * 100) : 0;
  const ipPct   = total > 0 ? Math.round(inProgPts / total * 100) : 0;
  const openPct = Math.max(0, 100 - donePct - ipPct);

  const inFlightCount = stories.filter(s => s.statusCategory === 'indeterminate').length;
  const unit = usePoints ? 'pt' : '';

  const barStyle = `height:4px;border-radius:2px;`;

  let pills = `
    <div style="display:flex;gap:4px;align-items:center;margin-top:6px;flex-wrap:wrap;">
      <div style="display:flex;width:100%;height:4px;border-radius:2px;overflow:hidden;gap:1px;margin-bottom:4px;">
        <div style="${barStyle}flex:${donePct};background:#22c55e;"></div>
        <div style="${barStyle}flex:${ipPct};background:#3b82f6;"></div>
        <div style="${barStyle}flex:${openPct};background:var(--border,rgba(255,255,255,0.1));"></div>
      </div>
      <span style="font-size:10px;color:#22c55e;">${donePct}% Done</span>
      <span style="font-size:10px;color:var(--text-muted);">·</span>
      <span style="font-size:10px;color:#3b82f6;">${inFlightCount} in flight</span>
      ${opts.riskText ? `
        <span style="font-size:10px;color:var(--text-muted);">·</span>
        <span style="font-size:10px;color:#f59e0b;">⚠ ${escapeHtml(opts.riskText)}</span>
      ` : ''}
    </div>`;

  return pills;
}

// ── Project key extraction ─────────────────────────────────────────────────

/**
 * Derive a project key from sprint name or story keys.
 * e.g. "HRM Sprint 64" → "HRM", or story key "HRM-9978" → "HRM"
 */
export function deriveProjectKey(sprintName, stories = []) {
  // Try from story keys first (most reliable)
  for (const s of stories) {
    const m = (s.key || '').match(/^([A-Z][A-Z0-9_]+)-\d+$/);
    if (m) return m[1];
  }
  // Fall back to first all-caps word in sprint name
  const m = (sprintName || '').match(/^([A-Z][A-Z0-9_]+)\b/);
  return m ? m[1] : '';
}

// ── Sprint day helpers ─────────────────────────────────────────────────────

/**
 * Count working days between two dates (inclusive on both ends).
 * @param {Date}     start
 * @param {Date}     end
 * @param {number[]} workingDays — day-of-week indices, 0=Sun..6=Sat
 */
export function countWorkingDays(start, end, workingDays = [0,1,2,3,4]) {
  const set = new Set(workingDays);
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(0, 0, 0, 0);
  while (cur <= endD) {
    if (set.has(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count); // at least 1 to avoid division-by-zero
}

/**
 * Compute sprint day metrics.
 * @returns {{ totalDays, daysElapsed, daysRemaining }}
 */
export function sprintDayMetrics(sprint, workingDays = [0,1,2,3,4]) {
  const start = new Date(sprint.startDate);
  const end   = new Date(sprint.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays    = countWorkingDays(start, end, workingDays);
  const capToday     = today > end ? end : today;
  const daysElapsed  = countWorkingDays(start, capToday, workingDays);
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  return { totalDays, daysElapsed, daysRemaining };
}
