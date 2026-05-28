/**
 * src/engineer-charts.js — Zealer Dashboard
 * Pure chart renderers for the Insights section.
 * All functions return HTML strings — no DOM dependencies, testable in Node.
 *
 * Ported and adapted from EM Dashboard popup.js:
 *   buildSprintProgressBar → renderSprintProgressBar   (AS-IS)
 *   buildSupportBoardChart → renderSupportBoardChart   (AS-IS)
 *   buildTrendCardHTML     → renderSentryTrendCard      (AS-IS + day-1 + no-view fixes)
 *   buildBurndownSVG       → renderBurndownCard         (adapted from EM)
 *   buildEstimateVsActual  → renderEstVsActualCard      (adapted for single engineer)
 *
 * New (Zealer-specific):
 *   renderDailyTimesheetChart  — sprint daily-grain bar chart
 *   renderSprintTimesheetChart — quarter sprint-grain bar chart
 */

// ── Shared helpers ─────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function niceStep(max, steps = 4) {
  if (!max || max <= 0) return 1;
  const raw = max / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return ([1, 2, 5, 10].find(m => m * mag >= raw) || 10) * mag;
}

const CARD = 'padding:10px 12px;background:var(--surface,#11131c);border:1px solid var(--border,rgba(255,255,255,0.05));border-radius:8px;';
const CT   = 'var(--color-text-secondary,#94a3b8)';
const CTEXT= 'var(--text,#e2e8f0)';
const CBDR = 'rgba(148,163,184,0.2)';

// ── Sprint Progress Bar ────────────────────────────────────────────────────

/**
 * Renders the big sprint progress bar (full sprint, all assignees).
 * Ported AS-IS from EM buildSprintProgressBar.
 *
 * @param {Object[]} stories — normalizeStory array for the whole sprint
 * @returns {string} HTML string
 */
export function renderSprintProgressBar(stories) {
  if (!stories?.length) return '';

  const totalPoints = stories.reduce((s, t) => s + (t.points || 0), 0);
  const usePoints   = totalPoints > 0;

  let donePts, inProgPts, openPts, total;
  if (usePoints) {
    donePts   = stories.filter(s => s.statusCategory === 'done').reduce((sum, s) => sum + (s.points || 0), 0);
    inProgPts = stories.filter(s => s.statusCategory === 'indeterminate').reduce((sum, s) => sum + (s.points || 0), 0);
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
  const unit    = usePoints ? 'pt' : 'tickets';

  const doneBar = donePct > 0 ? `<div style="width:${donePct}%;background:#22c55e;border-radius:3px;min-width:2px;"></div>` : '';
  const ipBar   = ipPct   > 0 ? `<div style="width:${ipPct}%;background:#3b82f6;border-radius:3px;min-width:2px;"></div>` : '';
  const openBar = openPct > 0 ? `<div style="flex:1;background:rgba(148,163,184,0.15);border-radius:3px;min-width:2px;"></div>` : '';

  return `
    <div style="${CARD}margin-bottom:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
        <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">
          SPRINT PROGRESS <span style="font-size:9px;font-weight:normal;text-transform:none;letter-spacing:normal;">(by ${unit})</span>
        </span>
        <span style="font-size:12px;font-weight:700;color:#22c55e;">${donePct}% done</span>
      </div>
      <div style="display:flex;height:7px;border-radius:4px;overflow:hidden;gap:2px;background:rgba(148,163,184,0.1);">
        ${doneBar}${ipBar}${openBar}
      </div>
      <div style="display:flex;gap:14px;margin-top:7px;">
        <span style="font-size:11px;"><span style="font-weight:700;color:#22c55e;">${donePct}%</span> <span style="color:var(--text-muted);">Done</span></span>
        <span style="font-size:11px;"><span style="font-weight:700;color:#3b82f6;">${ipPct}%</span> <span style="color:var(--text-muted);">In progress</span></span>
        <span style="font-size:11px;"><span style="font-weight:700;color:var(--text-muted);">${openPct}%</span> <span style="color:var(--text-muted);">Not started</span></span>
      </div>
    </div>`;
}

// ── Burndown Chart ─────────────────────────────────────────────────────────

/**
 * Render burndown SVG wrapped in a card.
 * Data shape: { ideal, estimate, actual, labels, totalPoints, totalDays, hasActualData }
 * — from computeBurndownSeries (src/burndown.js)
 */
export function renderBurndownCard(bd, dateRange = '') {
  if (!bd?.totalPoints) {
    return `<div style="${CARD}"><div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;margin-bottom:6px;">BURNDOWN</div>
      <div style="font-size:12px;color:var(--text-muted);">No point data available.</div></div>`;
  }

  const W = 295, H = 140;
  const PAD = { top: 10, right: 14, bottom: 36, left: 32 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;

  const { ideal, estimate, actual, labels, totalPoints, totalDays, hasActualData } = bd;
  const step = niceStep(totalPoints, 4);
  const yMax = Math.ceil(totalPoints / step) * step || 1;

  const px  = d => PAD.left + (d / totalDays) * PW;
  const py  = v => PAD.top  + PH - (Math.max(0, v) / yMax) * PH;

  function polyline(series, color, dash = '') {
    const pts = series.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  }

  let grid = '', yLbl = '';
  for (let v = 0; v <= yMax; v += step) {
    const y = py(v).toFixed(1);
    grid += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="${CBDR}" stroke-width="1"/>`;
    yLbl += `<text x="${PAD.left - 4}" y="${y}" text-anchor="end" dominant-baseline="central" fill="${CT}" font-size="9" font-family="system-ui">${v}</text>`;
  }

  let xLbl = '';
  const xStep = totalDays <= 7 ? 1 : 2;
  for (let d = 0; d <= totalDays; d += xStep) {
    xLbl += `<text x="${px(d).toFixed(1)}" y="${H - PAD.bottom + 12}" text-anchor="middle" fill="${CT}" font-size="9" font-family="system-ui">${esc(labels[d] || `D${d}`)}</text>`;
  }

  const legendY = H - 6;
  const legend = `
    <line x1="${PAD.left}" y1="${legendY}" x2="${PAD.left+12}" y2="${legendY}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 2"/>
    <text x="${PAD.left+15}" y="${legendY}" dominant-baseline="central" fill="${CT}" font-size="9" font-family="system-ui">Ideal</text>
    <line x1="${PAD.left+45}" y1="${legendY}" x2="${PAD.left+57}" y2="${legendY}" stroke="#60a5fa" stroke-width="1.5"/>
    <text x="${PAD.left+60}" y="${legendY}" dominant-baseline="central" fill="${CT}" font-size="9" font-family="system-ui">By due date</text>
    ${hasActualData ? `
    <line x1="${PAD.left+130}" y1="${legendY}" x2="${PAD.left+142}" y2="${legendY}" stroke="#34d399" stroke-width="1.5"/>
    <text x="${PAD.left+145}" y="${legendY}" dominant-baseline="central" fill="${CT}" font-size="9" font-family="system-ui">Actual</text>
    ` : `<text x="${PAD.left+130}" y="${legendY}" dominant-baseline="central" fill="${CT}" font-size="9" font-family="system-ui" opacity="0.5">Actual: no data yet</text>`}`;

  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;" xmlns="http://www.w3.org/2000/svg">
    ${grid}
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="${CBDR}" stroke-width="1"/>
    <line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" stroke="${CBDR}" stroke-width="1"/>
    ${yLbl}${xLbl}
    ${polyline(ideal, '#94a3b8', '5 3')}
    ${polyline(estimate, '#60a5fa')}
    ${hasActualData ? polyline(actual, '#34d399') : ''}
    ${legend}
  </svg>`;

  return `<div style="${CARD}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">BURNDOWN</span>
      ${dateRange ? `<span style="font-size:10px;color:var(--text-muted);">${esc(dateRange)}</span>` : ''}
    </div>
    ${svg}
  </div>`;
}

// ── Support Board Chart ────────────────────────────────────────────────────

/**
 * Renders the support board breakdown card.
 * Ported AS-IS from EM buildSupportBoardChart.
 *
 * @param {Object[]} stories — normalizeStory output for the support board
 * @param {string}  [boardName]
 */
export function renderSupportBoardChart(stories, boardName = 'Support Board') {
  if (!stories?.length) return '';

  const STATUS_ORDER  = ['In Progress', 'QA Testing', 'QA Rejected', 'Code Review', 'Open'];
  const STATUS_COLORS = {
    'Open': '#94a3b8', 'In Progress': '#3b82f6', 'QA Testing': '#a855f7',
    'QA Rejected': '#ef4444', 'QA Accepted': '#22c55e', 'Code Review': '#f97316',
  };

  const byStatus = {}, blockedByStatus = {};
  for (const s of stories) {
    const st = s.status || 'Unknown';
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (s.labels?.includes('blocked-external')) {
      blockedByStatus[st] = (blockedByStatus[st] || 0) + 1;
    }
  }

  const entries = Object.entries(byStatus).sort(([a], [b]) => {
    const ia = STATUS_ORDER.indexOf(a), ib = STATUS_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const maxCount = Math.max(...entries.map(([, c]) => c), 1);
  const totalBlocked = Object.values(blockedByStatus).reduce((s, n) => s + n, 0);

  const rows = entries.map(([status, count]) => {
    const color = STATUS_COLORS[status] || '#6366f1';
    const pct   = Math.round(count / maxCount * 100);
    const blocked = blockedByStatus[status] || 0;
    const blockedCell = blocked > 0
      ? `<span style="font-size:10px;color:#f59e0b;white-space:nowrap;">⚠ ${blocked} blocked</span>`
      : '';
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
      <div style="width:82px;font-size:10px;color:var(--text-muted);text-align:right;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(status)}</div>
      <div style="flex:1;height:8px;background:var(--border,rgba(255,255,255,0.08));border-radius:3px;overflow:hidden;min-width:0;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;"></div>
      </div>
      <span style="font-size:10px;color:${CTEXT};width:18px;text-align:right;flex-shrink:0;">${count}</span>
      <div style="width:80px;flex-shrink:0;text-align:left;">${blockedCell}</div>
    </div>`;
  }).join('');

  const blockedSummary = totalBlocked > 0
    ? `<div style="margin-top:6px;padding:4px 8px;background:rgba(245,158,11,0.08);border-radius:4px;border:1px solid rgba(245,158,11,0.2);font-size:10px;color:#f59e0b;">
        ⚠ ${totalBlocked} ticket${totalBlocked > 1 ? 's' : ''} blocked-external across ${Object.keys(blockedByStatus).length} status${Object.keys(blockedByStatus).length > 1 ? 'es' : ''}
       </div>` : '';

  return `<div style="${CARD}display:flex;flex-direction:column;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">SUPPORT BOARD</span>
      <span style="font-size:10px;color:var(--text-muted);">${stories.length} open</span>
    </div>
    ${rows}${blockedSummary}
  </div>`;
}

// ── Daily Timesheet Chart (sprint view) ───────────────────────────────────

/**
 * One bar per working day. Single colour — engineer's own hours.
 * @param {Array<{ date, label, hours }>} days — from computeDailyTimesheet
 * @param {string} [dateRange] — e.g. "11 May – 23 May"
 */
export function renderDailyTimesheetChart(days, dateRange = '') {
  if (!days?.length) {
    return `<div style="${CARD}"><span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;display:block;margin-bottom:6px;">TIME LOGGED</span>
      <div style="font-size:12px;color:var(--text-muted);">No worklog data for this sprint.</div></div>`;
  }

  const BAR_W   = Math.max(10, Math.min(22, Math.floor(240 / days.length) - 4));
  const PAD     = { top: 10, right: 8, bottom: 36, left: 28 };
  const PH      = 80;
  const PW      = days.length * (BAR_W + 4);
  const W       = PAD.left + PW + PAD.right;
  const H       = PAD.top + PH + PAD.bottom;

  const maxH  = Math.max(...days.map(d => d.hours), 1);
  const step  = niceStep(maxH, 4);
  const yMax  = Math.ceil(maxH / step) * step || 1;

  const barH  = h  => Math.max(1, (h / yMax) * PH);
  const barY  = h  => PAD.top + PH - barH(h);
  const barX  = i  => PAD.left + i * (BAR_W + 4);

  let grid = '', yLbl = '';
  for (let v = 0; v <= yMax; v += step) {
    const y = (PAD.top + PH - (v / yMax) * PH).toFixed(1);
    grid += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + PW}" y2="${y}" stroke="${CBDR}" stroke-width="1"/>`;
    yLbl += `<text x="${PAD.left - 3}" y="${y}" text-anchor="end" dominant-baseline="central" fill="${CT}" font-size="9" font-family="system-ui">${v}</text>`;
  }

  let bars = '', xLbl = '';
  days.forEach((d, i) => {
    const x  = barX(i);
    const bh = barH(d.hours);
    const by = barY(d.hours);
    const cx = x + BAR_W / 2;
    bars += `<rect x="${x}" y="${by.toFixed(1)}" width="${BAR_W}" height="${bh.toFixed(1)}" fill="#6366f1" rx="2" opacity="0.85"/>`;
    if (d.hours > 0) {
      bars += `<text x="${cx.toFixed(1)}" y="${(by - 3).toFixed(1)}" text-anchor="middle" fill="${CT}" font-size="8.5" font-family="system-ui">${d.hours}</text>`;
    }
    // Show label for first, middle, and last day (space saving)
    if (i === 0 || i === Math.floor((days.length - 1) / 2) || i === days.length - 1) {
      xLbl += `<text x="${cx.toFixed(1)}" y="${H - PAD.bottom + 12}" text-anchor="middle" fill="${CT}" font-size="9" font-family="system-ui">${esc(d.label)}</text>`;
    }
  });

  const totalHours = Math.round(days.reduce((s, d) => s + d.hours, 0) * 10) / 10;

  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;" xmlns="http://www.w3.org/2000/svg">
    ${grid}
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + PH}" stroke="${CBDR}" stroke-width="1"/>
    <line x1="${PAD.left}" y1="${PAD.top + PH}" x2="${PAD.left + PW}" y2="${PAD.top + PH}" stroke="${CBDR}" stroke-width="1"/>
    ${yLbl}${bars}${xLbl}
  </svg>`;

  return `<div style="${CARD}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">TIME LOGGED</span>
      <div style="display:flex;align-items:center;gap:8px;">
        ${dateRange ? `<span style="font-size:10px;color:var(--text-muted);">${esc(dateRange)}</span>` : ''}
        <span style="font-size:11px;font-weight:700;color:${CTEXT};">${totalHours}h</span>
      </div>
    </div>
    ${svg}
  </div>`;
}

// ── Sprint Timesheet Chart (quarter view) ─────────────────────────────────

/**
 * One bar per sprint in the quarter.
 * @param {Array<{ name, startDate, hours }>} sprints — from computeQuarterTimesheet
 * @param {string} quarter — e.g. "Q2 2026"
 */
export function renderSprintTimesheetChart(sprints, quarter = '') {
  if (!sprints?.length) {
    return `<div style="${CARD}"><span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;display:block;margin-bottom:6px;">TIME LOGGED · ${esc(quarter)}</span>
      <div style="font-size:12px;color:var(--text-muted);">No worklog data found for this quarter.</div></div>`;
  }

  const BAR_W = Math.max(18, Math.min(40, Math.floor(240 / sprints.length) - 4));
  const PAD   = { top: 10, right: 8, bottom: 40, left: 28 };
  const PH    = 80;
  const PW    = sprints.length * (BAR_W + 6);
  const W     = PAD.left + PW + PAD.right;
  const H     = PAD.top + PH + PAD.bottom;

  const maxH = Math.max(...sprints.map(s => s.hours), 1);
  const step = niceStep(maxH, 4);
  const yMax = Math.ceil(maxH / step) * step || 1;

  const barH = h => Math.max(1, (h / yMax) * PH);
  const barY = h => PAD.top + PH - barH(h);
  const barX = i => PAD.left + i * (BAR_W + 6);

  let grid = '', yLbl = '';
  for (let v = 0; v <= yMax; v += step) {
    const y = (PAD.top + PH - (v / yMax) * PH).toFixed(1);
    grid += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + PW}" y2="${y}" stroke="${CBDR}" stroke-width="1"/>`;
    yLbl += `<text x="${PAD.left - 3}" y="${y}" text-anchor="end" dominant-baseline="central" fill="${CT}" font-size="9" font-family="system-ui">${v}</text>`;
  }

  let bars = '', xLbl = '';
  sprints.forEach((s, i) => {
    const x  = barX(i);
    const bh = barH(s.hours);
    const by = barY(s.hours);
    const cx = x + BAR_W / 2;
    const shortName = s.name.replace(/^.* Sprint\s*/i, 'Spr ').replace(/^Sprint\s*/i, 'Spr ');
    bars += `<rect x="${x}" y="${by.toFixed(1)}" width="${BAR_W}" height="${bh.toFixed(1)}" fill="#a78bfa" rx="2" opacity="0.85"/>`;
    if (s.hours > 0) {
      bars += `<text x="${cx.toFixed(1)}" y="${(by - 3).toFixed(1)}" text-anchor="middle" fill="${CT}" font-size="8.5" font-family="system-ui">${s.hours}h</text>`;
    }
    xLbl += `<text x="${cx.toFixed(1)}" y="${H - PAD.bottom + 12}" text-anchor="middle" fill="${CT}" font-size="8.5" font-family="system-ui">${esc(shortName)}</text>`;
  });

  const totalH = Math.round(sprints.reduce((s, sp) => s + sp.hours, 0) * 10) / 10;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible;" xmlns="http://www.w3.org/2000/svg">
    ${grid}
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + PH}" stroke="${CBDR}" stroke-width="1"/>
    <line x1="${PAD.left}" y1="${PAD.top + PH}" x2="${PAD.left + PW}" y2="${PAD.top + PH}" stroke="${CBDR}" stroke-width="1"/>
    ${yLbl}${bars}${xLbl}
  </svg>`;

  return `<div style="${CARD}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">TIME LOGGED · ${esc(quarter)}</span>
      <span style="font-size:11px;font-weight:700;color:${CTEXT};">${totalH}h total</span>
    </div>
    ${svg}
  </div>`;
}

// ── Estimate vs Actual (single engineer) ──────────────────────────────────

/**
 * Single-bar estimate vs actual for the engineer.
 * @param {{ name, logged, estimated, ratio }} data — from computeEngineerEstVsActual
 * @param {string} [dateRange]
 */
export function renderEstVsActualCard(data, dateRange = '') {
  if (!data || data.logged === 0) {
    return `<div style="${CARD}">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;display:block;margin-bottom:6px;">ESTIMATE VS ACTUAL</span>
      <div style="font-size:12px;color:var(--text-muted);">No logged time yet this sprint.</div></div>`;
  }

  const { name, logged, estimated, ratio } = data;
  const ratioColor = !ratio ? CT : ratio > 1.3 ? '#f97316' : ratio < 0.7 ? '#22c55e' : CT;
  const ratioTxt   = ratio != null ? `×${ratio.toFixed(1)}` : '';
  const maxVal     = Math.max(logged, estimated || 0, 0.1);

  const W = 260, NAME_W = 80, PW = W - NAME_W - 8;
  const bw = h => Math.max(1, (h / maxVal) * PW);

  const wLogged    = bw(logged);
  const wEstimated = estimated > 0 ? bw(estimated) : 0;
  const H = 58;

  const rows = `
    <text x="${NAME_W - 4}" y="14" text-anchor="end" dominant-baseline="central" fill="${CTEXT}" font-size="10" font-family="system-ui">${esc(name.split(' ')[0])}</text>
    <rect x="${NAME_W}" y="8" width="${wLogged.toFixed(1)}" height="7" fill="#6366f1" rx="2" opacity="0.85"/>
    ${wEstimated > 0 ? `<rect x="${NAME_W}" y="17" width="${wEstimated.toFixed(1)}" height="3" fill="var(--text-muted)" rx="1" opacity="0.4"/>` : ''}
    <text x="${NAME_W + wLogged + 3}" y="12" dominant-baseline="central" fill="${ratioColor}" font-size="10" font-family="system-ui" font-weight="600">${esc(ratioTxt)}</text>
    <text x="${NAME_W}" y="${H - 8}" fill="${CT}" font-size="9" font-family="system-ui">■ Logged ${logged}h</text>
    ${estimated > 0 ? `<text x="${NAME_W + 80}" y="${H - 8}" fill="${CT}" font-size="9" font-family="system-ui">— Est. ${estimated}h</text>` : ''}
    <text x="${NAME_W + 160}" y="${H - 8}" fill="#f97316" font-size="9" font-family="system-ui">×1.3+ over</text>`;

  return `<div style="${CARD}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">ESTIMATE VS ACTUAL</span>
      ${dateRange ? `<span style="font-size:10px;color:var(--text-muted);">${esc(dateRange)}</span>` : ''}
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">${rows}</svg>
  </div>`;
}

// ── Sentry Trend Card ──────────────────────────────────────────────────────

/**
 * Sentry trend card. Ported AS-IS from EM buildTrendCardHTML.
 * Includes both EM fixes:
 *   v1.5.9: shows from day 1 (single data point → dot + "First reading" label)
 *   v1.6.0: no view tracked → shows setup prompt instead of hiding silently
 *
 * @param {string} label   — view label, e.g. "Production Issues"
 * @param {Array}  samples — [{ day: 'YYYY-MM-DD', count: number }]
 */
export function renderSentryTrendCard(label, samples) {
  // v1.6.0 fix: no view → setup prompt
  if (!label) {
    return `<div style="${CARD}">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;margin-bottom:6px;">SENTRY TREND</div>
      <div style="font-size:12px;color:var(--text-muted);">Track a Sentry view to see its daily issue count trend here.<br/>
        <span style="color:var(--primary,#6366f1);">Settings → Sentry view URL → Save.</span>
      </div>
    </div>`;
  }

  const last30 = (samples || []).slice(-30);

  // v1.5.9 fix: 0 samples → "Open daily to build trend"
  if (last30.length === 0) {
    return `<div style="${CARD}font-size:11px;color:var(--text-muted);">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;margin-bottom:6px;">${esc(label)} TREND</div>
      Open the panel daily to build trend history.
    </div>`;
  }

  // v1.5.9 fix: single data point
  if (last30.length === 1) {
    const pt = last30[0];
    return `<div style="${CARD}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">${esc(label)} · last 30 days</span>
        <span style="font-size:13px;font-weight:700;color:${CTEXT};">${pt.count} today</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding:6px 0;">
        <div style="width:8px;height:8px;background:#6366f1;border-radius:50%;flex-shrink:0;"></div>
        <span style="font-size:11px;color:var(--text-muted);">First reading · ${esc(pt.day)} · ${pt.count} unresolved</span>
      </div>
      <div style="font-size:10px;color:var(--text-muted);">Open the panel daily to build the trend line.</div>
    </div>`;
  }

  // Full sparkline chart
  const counts = last30.map(s => s.count);
  const days   = last30.map(s => s.day);
  const minVal = Math.min(...counts);
  const maxVal = Math.max(...counts);
  const today  = last30[last30.length - 1];
  const prev   = last30[last30.length - 2];
  const delta  = today.count - prev.count;
  const deltaStr   = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '=';
  const deltaColor = delta > 0 ? '#f97316' : delta < 0 ? '#22c55e' : CT;

  const W = 272, H = 52, PL = 4, PR = 4, PT = 6, PB = 16;
  const PW = W - PL - PR, PH2 = H - PT - PB;
  const range = maxVal - minVal || 1;
  const px2 = i => PL + (i / (last30.length - 1)) * PW;
  const py2 = v => PT + PH2 - ((v - minVal) / range) * PH2;

  const pts = last30.map((s, i) => `${px2(i).toFixed(1)},${py2(s.count).toFixed(1)}`).join(' ');
  const firstX = PL.toFixed(1), lastX = (PL + PW).toFixed(1), baseY = (PT + PH2).toFixed(1);
  const areaPath = `M${firstX},${baseY} L${pts.split(' ').join(' L')} L${lastX},${baseY} Z`;

  const labelIdxs = [0, Math.floor((last30.length - 1) / 2), last30.length - 1];
  const xLabels = labelIdxs.map((idx, li) => {
    const d = days[idx];
    const txt = li === 2 ? 'today'
      : `${parseInt(d.slice(8))} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(d.slice(5,7))-1]}`;
    const anchor = li === 0 ? 'start' : li === 2 ? 'end' : 'middle';
    return `<text x="${px2(idx).toFixed(1)}" y="${H - 2}" text-anchor="${anchor}" fill="${CT}" font-size="8.5" font-family="system-ui">${esc(txt)}</text>`;
  });

  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block;">
    <defs>
      <linearGradient id="zst" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#zst)"/>
    <polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${px2(last30.length - 1).toFixed(1)}" cy="${py2(today.count).toFixed(1)}" r="2.5" fill="#6366f1"/>
    ${xLabels.join('')}
  </svg>`;

  return `<div style="${CARD}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:0.3px;text-transform:uppercase;">${esc(label)} · last 30 days</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:700;color:${deltaColor};">${deltaStr} vs yesterday</span>
        <span style="font-size:13px;font-weight:700;color:${CTEXT};">${today.count}</span>
      </div>
    </div>
    ${svg}
    <div style="display:flex;justify-content:space-between;margin-top:2px;font-size:9px;color:var(--text-muted);">
      <span>min ${minVal}</span><span>max ${maxVal}</span>
    </div>
  </div>`;
}
