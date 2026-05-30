/**
 * gantt-print.js — Zealer Dashboard Gantt export page controller
 * Reads myTicketsCache + settings from chrome.storage.local and renders
 * the full-width Gantt SVG using the same buildGanttSVG function as the panel.
 */

import { buildGanttSVG, partitionStories } from './src/gantt.js';

let _cache    = null;
let _settings = null;
let _filter   = 'all'; // 'all' | 'mine'

async function loadAndRender() {
  const r = await chrome.storage.local.get(['myTicketsCache', 'settings']);
  _cache    = r.myTicketsCache;
  _settings = r.settings;

  const loading = document.getElementById('loading');
  const canvas  = document.getElementById('gantt-canvas');

  if (!_cache?.sprint || !_cache?.stories?.length) {
    if (loading) loading.textContent = 'No sprint data found. Open the Zealer Dashboard panel first to load data.';
    return;
  }
  if (loading) loading.style.display = 'none';

  // Page header
  const title    = document.getElementById('gantt-title');
  const subtitle = document.getElementById('gantt-subtitle');
  if (title)    title.textContent    = `Sprint Gantt — ${_cache.sprint.name || ''}`;
  if (subtitle) subtitle.textContent =
    `${_cache.sprint.startDate?.slice(0,10) || ''} → ${_cache.sprint.endDate?.slice(0,10) || ''} · ${_cache.stories.length} tickets`;

  render(canvas);
}

function render(canvas) {
  if (!_cache) return;

  const { sprint, stories } = _cache;
  const accountId   = _settings?.jira?.accountId;
  const workingDays = _settings?.sprint?.workingDays || [0,1,2,3,4];
  const width       = Math.max(900, window.innerWidth - 80);

  const svg = buildGanttSVG(stories, sprint, workingDays, accountId, {
    filterMine: _filter === 'mine',
    width,
  });

  const checkList = (_filter === 'mine' && accountId)
    ? stories.filter(s => s.assigneeAccountId === accountId)
    : stories;
  const noDate  = checkList.filter(s => !s.dueDate);
  const notice  = document.getElementById('gantt-notice');
  if (notice) {
    notice.textContent = noDate.length > 0
      ? `ⓘ ${noDate.length} ticket${noDate.length > 1 ? 's have' : ' has'} no due date — shown in the Unscheduled section below.`
      : '';
  }

  canvas.innerHTML = svg;
}

// Wire filter buttons
document.querySelectorAll('.gf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _filter = btn.dataset.filter;
    document.querySelectorAll('.gf-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === _filter));
    const canvas = document.getElementById('gantt-canvas');
    if (canvas) render(canvas);
  });
});

// Wire print button (no inline onclick — CSP compliant)
document.getElementById('print-btn')?.addEventListener('click', () => window.print());

// Re-render on resize (debounced)
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const canvas = document.getElementById('gantt-canvas');
    if (canvas) render(canvas);
  }, 200);
});

loadAndRender();
