// insights.js — Story Insights side panel: progressive disclosure of chart narratives.
// Information is hidden by default; each chart publishes its narrative here and the
// user reveals it via an action button (tab). Content updates live with filters.
import { stateAbbr } from './utils.js';

const SECTIONS = [
  { id: 'map',      icon: '📍', label: 'Where it concentrates', desc: 'Hotspot states & clusters' },
  { id: 'timeline', icon: '📈', label: 'When it peaks',         desc: 'National trend & extremes' },
  { id: 'scatter',  icon: '📐', label: 'Traffic ↔ pollution',   desc: 'How closely they move together' },
  { id: 'seasons',  icon: '🌡️', label: 'Seasonal rhythm',      desc: 'Hottest & calmest months' },
  { id: 'guide',    icon: '🔬', label: 'How to read',           desc: 'Guide & current selection' }
];

let activeId = 'map';
const store = {};      // id -> html
const loaded = new Set();
const unread = new Set();

let tabsHost, contentHost, panel, fab, backdrop, closeBtn;
let lastTrigger = null;

export function initInsights() {
  panel = document.getElementById('insight-panel');
  tabsHost = document.getElementById('insight-tabs');
  contentHost = document.getElementById('insight-content');
  fab = document.getElementById('insight-fab');
  backdrop = document.getElementById('insight-backdrop');
  closeBtn = document.getElementById('insight-close');
  if (!panel || !tabsHost || !contentHost) return;

  // ── Build tab buttons (disabled until their insight is published) ──
  SECTIONS.forEach(sec => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'insight-tab';
    b.id = `insight-tab-${sec.id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'insight-content');
    b.setAttribute('aria-selected', String(sec.id === activeId));
    b.setAttribute('aria-disabled', 'true');
    b.disabled = true;
    b.innerHTML = `
      <span class="insight-tab-icon" aria-hidden="true">${sec.icon}</span>
      <span class="insight-tab-text">
        <span class="insight-tab-label">${sec.label}</span>
        <span class="insight-tab-desc">${sec.desc}</span>
      </span>
      <span class="insight-tab-dot" aria-hidden="true"></span>`;
    b.addEventListener('click', () => activateTab(sec.id));
    tabsHost.appendChild(b);
  });

  // ── Keyboard: roving arrows within the tablist ──────────────
  tabsHost.addEventListener('keydown', e => {
    const tabs = Array.from(tabsHost.querySelectorAll('.insight-tab'))
      .filter(t => !t.disabled);
    if (!tabs.length) return;
    const idx = tabs.indexOf(document.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      tabs[next].focus();
      activateTab(tabs[next].id.replace('insight-tab-', ''));
    }
  });

  contentHost.setAttribute('aria-labelledby', `insight-tab-${activeId}`);
  _renderLoading();

  // Auto-open on desktop so the audience lands straight on charts + context
  if (window.innerWidth > 1024) openPanel();

  // ── Mobile drawer behaviour ─────────────────────────────────
  if (fab) {
    fab.addEventListener('click', () => {
      if (panel.classList.contains('is-open')) closePanel();
      else openPanel();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (backdrop) backdrop.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
  });
}
export function activateTab(id) {
  if (!loaded.has(id)) return;
  activeId = id;
  unread.delete(id);
  if (tabsHost) {
    tabsHost.querySelectorAll('.insight-tab').forEach(t => {
      const isActive = t.id === `insight-tab-${id}`;
      t.setAttribute('aria-selected', String(isActive));
      t.classList.toggle('is-active', isActive);
      const dot = t.querySelector('.insight-tab-dot');
      if (dot) dot.classList.remove('is-new');
    });
  }
  if (contentHost) {
    contentHost.setAttribute('aria-labelledby', `insight-tab-${id}`);
    _render(store[id] || `<div class="callout-chip"><div class="callout-meaning">Insight is still being computed…</div></div>`);
  }
  if (window.innerWidth <= 1024) openPanel();
}

function _render(html) {
  contentHost.classList.remove('is-entering');
  contentHost.innerHTML = html;
  // restart the fade/slide micro-transition
  void contentHost.offsetWidth;
  contentHost.classList.add('is-entering');
}

function _renderLoading() {
  _render(`
    <div class="insight-loading" role="status">
      <div class="callout-chip">
        <div class="callout-head"><span class="callout-pin">⏳</span>Loading the data story…</div>
        <div class="callout-meaning">Insights appear here once the dataset is ready. Pick any topic above to explore it.</div>
      </div>
    </div>`);
}

export function setInsight(id, html) {
  store[id] = html;
  if (!loaded.has(id)) loaded.add(id);
  const tab = document.getElementById(`insight-tab-${id}`);
  if (tab) {
    tab.disabled = false;
    tab.setAttribute('aria-disabled', 'false');
    if (id !== activeId && !unread.has(id)) {
      unread.add(id);
      const dot = tab.querySelector('.insight-tab-dot');
      if (dot) dot.classList.add('is-new');
    }
  }
  if (id === activeId && contentHost) _render(html);
}

export function setInsightError(message) {
  if (!contentHost) return;
  _render(`
    <div class="callout-chip insight-error" role="alert">
      <div class="callout-head"><span class="callout-pin">⚠️</span>Something went wrong</div>
      <div class="callout-meaning">${message}<br>Try refreshing the page. Charts stay available — insights resume once the data loads.</div>
    </div>`);
}

function openPanel() {
  lastTrigger = document.activeElement;
  panel.classList.add('is-open');
  panel.removeAttribute('hidden');
  if (backdrop) backdrop.hidden = false;
  if (fab) fab.setAttribute('aria-expanded', 'true');
  document.body.classList.add('insight-open');
  closeBtn?.focus();
}

function closePanel() {
  panel.classList.remove('is-open');
  if (backdrop) backdrop.hidden = true;
  if (fab) fab.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('insight-open');
  if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
}

// ── Guide tab helper: how-to-read + live selection context ────
export function publishGuide(names, extra) {
  const chips = names && names.length
    ? `<div class="callout-chip">
        <div class="callout-head"><span class="callout-pin">🎯</span>Currently tracing ${names.length} state${names.length === 1 ? '' : 's'}</div>
        <div class="callout-meaning"><b>What this means:</b> ${names.map(n => `<b>${stateAbbr[n] || n}</b> ${n}`).join(' · ')} — each mini-chart shares one scale, so compare <i>when</i> they spike, not how high.</div>
      </div>`
    : `<div class="callout-chip">
        <div class="callout-head"><span class="callout-pin">🎯</span>No states selected yet</div>
        <div class="callout-meaning"><b>Next step:</b> click any state on the map or charts — its monthly journey appears in section 04 and is traced here.</div>
      </div>`;
  setInsight('guide', `${extra || ''}${chips}`);
}