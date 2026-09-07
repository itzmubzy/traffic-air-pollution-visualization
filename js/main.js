// main.js — Bootstrap, shared-state wiring & component registry
import { loadData } from './data.js';
import { state, setState, subscribe, setYear, metrics, STORY_PRESETS, applyStoryPreset } from './state.js';
import { initInsights, setInsightError, activateTab } from './insights.js';
import { createTimeline, updateTimeline } from './timeline.js';
import { createScatterplot, updateScatterplot } from './scatter.js';
import { createHeatmap, updateHeatmap } from './heatmap.js';
import { createMap, updateMap } from './map.js';
import { createSmallMultiples, updateSmallMultiples } from './smallMultiples.js';
import { createLegend, updateLegend } from './legend.js';
import { createKPIs, updateKPIs } from './kpis.js';

let playInterval = null;

// ── Story Tour Presets Grid ──────────────────────────────────
function renderStoryTours() {
  const host = document.getElementById('story-tours-grid');
  if (!host) return;
  host.innerHTML = STORY_PRESETS.map(p => `
    <button class="story-tour-card glass${state.activeStoryPreset === p.id ? ' is-active' : ''}" data-preset="${p.id}" type="button">
      <div class="tour-card-head">
        <span class="tour-card-icon" aria-hidden="true">${p.icon}</span>
        <span class="tour-card-title">${p.title}</span>
      </div>
      <div class="tour-card-desc">${p.desc}</div>
      <div class="tour-card-tag">${p.states.length} states · ${metrics[p.metric].short}</div>
    </button>
  `).join('');

  host.querySelectorAll('.story-tour-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-preset');
      const preset = STORY_PRESETS.find(x => x.id === id);
      applyStoryPreset(id);
      if (preset && preset.insightTab) {
        activateTab(preset.insightTab);
      }
    });
  });
}

// ── Filter pills + KPI window label ──────────────────────────
function updateFilterBar(s) {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;

  const metricLabel = metrics[s.selectedMetric].label;
  const statesLabel = s.selectedStates.length ? s.selectedStates.join(', ') : 'All States';

  let timeLabel = 'All Years';
  if (s.selectedYear !== 'All') {
    timeLabel = String(s.selectedYear);
  } else if (s.startDate && s.endDate) {
    timeLabel = `${d3.timeFormat('%b %Y')(s.startDate)} – ${d3.timeFormat('%b %Y')(s.endDate)}`;
  }

  bar.innerHTML = `
    <span class="filter-pill"><span class="pill-key">Year</span><span class="pill-val">${timeLabel}</span></span>
    <span class="filter-pill"><span class="pill-key">Metric</span><span class="pill-val">${metricLabel}</span></span>
    <span class="filter-pill"><span class="pill-key">States</span><span class="pill-val">${statesLabel}</span></span>
    ${s.activeStoryPreset ? `<span class="filter-pill story-active-pill"><span class="pill-key">Story Mode</span><span class="pill-val">${STORY_PRESETS.find(p => p.id === s.activeStoryPreset)?.title || 'Custom'}</span></span>` : ''}
  `;

  const winLabel = document.getElementById('kpi-window-label');
  if (winLabel) winLabel.textContent = timeLabel.toLowerCase();

  // Keep selects in sync with shared state
  const metricSel = document.getElementById('global-metric');
  if (metricSel && metricSel.value !== s.selectedMetric) metricSel.value = s.selectedMetric;

  const stateSel = document.getElementById('global-state');
  if (stateSel) {
    if (s.selectedStates.length === 1) stateSel.value = s.selectedStates[0];
    else if (s.selectedStates.length === 0) stateSel.value = '';
  }

  const clearBtn = document.getElementById('clear-state-btn');
  if (clearBtn) clearBtn.classList.toggle('is-active', s.selectedStates.length > 0);

  const yearDisplay = document.getElementById('year-display');
  const yearSlider = document.getElementById('global-year');
  const allYearsBtn = document.getElementById('all-years-btn');
  if (yearDisplay && yearSlider) {
    if (s.selectedYear === 'All') {
      yearDisplay.textContent = s.startDate ? 'Range' : 'All';
      yearDisplay.classList.remove('is-animating');
      if (allYearsBtn) allYearsBtn.classList.add('is-active');
    } else {
      yearDisplay.textContent = s.selectedYear;
      yearSlider.value = s.selectedYear;
      if (s.isPlaying) yearDisplay.classList.add('is-animating');
      else yearDisplay.classList.remove('is-animating');
      if (allYearsBtn) allYearsBtn.classList.remove('is-active');
    }
  }

  // Sync active KPI card highlight with selected metric
  const metricToCardId = { pm25: 'kpi-pm25' };
  document.querySelectorAll('.kpi-card').forEach(card => {
    const isActive = metricToCardId[s.selectedMetric] === card.id;
    card.setAttribute('data-metric-active', isActive ? 'true' : 'false');
  });

  // Update story tour card active borders
  document.querySelectorAll('.story-tour-card').forEach(card => {
    const pId = card.getAttribute('data-preset');
    card.classList.toggle('is-active', s.activeStoryPreset === pId);
  });
}

// ── Time Playback Animation ──────────────────────────────────
function setupPlayback(minYear, maxYear) {
  const playBtn = document.getElementById('btn-play-year');
  const playIcon = document.getElementById('play-icon');
  if (!playBtn) return;

  function stopPlay() {
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
    setState({ isPlaying: false });
    if (playIcon) playIcon.textContent = '▶';
    playBtn.classList.remove('is-playing');
    playBtn.setAttribute('aria-label', 'Play timeline animation');
  }

  function startPlay() {
    setState({ isPlaying: true });
    if (playIcon) playIcon.textContent = '⏸';
    playBtn.classList.add('is-playing');
    playBtn.setAttribute('aria-label', 'Pause timeline animation');

    let curYear = state.selectedYear === 'All' ? minYear : parseInt(state.selectedYear, 10);
    if (curYear >= maxYear) curYear = minYear;
    setYear(curYear);

    playInterval = setInterval(() => {
      curYear++;
      if (curYear > maxYear) {
        stopPlay();
        setYear('All');
      } else {
        setYear(curYear);
      }
    }, 1200);
  }

  playBtn.addEventListener('click', () => {
    if (state.isPlaying) stopPlay();
    else startPlay();
  });
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  initInsights();
  try {
    const rawData = await loadData();
    const extent = d3.extent(rawData, d => d.Date);
    const minYear = extent[0].getFullYear();
    const maxYear = extent[1].getFullYear();

    setState({ data: rawData, startDate: null, endDate: null });

    renderStoryTours();
    setupPlayback(minYear, maxYear);

    // ── Year slider ─────────────────────────────────────────
    const yearSlider = document.getElementById('global-year');
    const yearDisplay = document.getElementById('year-display');
    const yearMinEl = document.getElementById('year-min');
    const yearMaxEl = document.getElementById('year-max');
    const allYearsBtn = document.getElementById('all-years-btn');

    if (yearSlider) {
      yearSlider.min = minYear;
      yearSlider.max = maxYear;
      yearSlider.value = maxYear;
      yearSlider.setAttribute('aria-valuemin', minYear);
      yearSlider.setAttribute('aria-valuemax', maxYear);
      yearSlider.setAttribute('aria-valuenow', maxYear);
      if (yearMinEl) yearMinEl.textContent = minYear;
      if (yearMaxEl) yearMaxEl.textContent = maxYear;

      yearSlider.addEventListener('input', function () {
        yearDisplay.textContent = this.value;
        this.setAttribute('aria-valuenow', this.value);
        if (allYearsBtn) allYearsBtn.classList.remove('is-active');
      });

      yearSlider.addEventListener('change', function () {
        const y = parseInt(this.value, 10);
        yearDisplay.textContent = y;
        setYear(y);
      });
    }

    if (allYearsBtn) {
      allYearsBtn.addEventListener('click', () => {
        yearDisplay.textContent = 'All';
        allYearsBtn.classList.add('is-active');
        setState({ selectedYear: 'All', startDate: null, endDate: null, activeStoryPreset: null });
      });
    }

    // ── Metric selector (primary metrics only; AQI & advanced notes live in Advanced Exploration) ──
    const metricSel = document.getElementById('global-metric');
    if (metricSel) {
      ['pm25', 'traffic', 'efficiency', 'aqi'].forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = metrics[key].label;
        metricSel.appendChild(opt);
      });
      metricSel.value = state.selectedMetric;
      metricSel.addEventListener('change', e => setState({ selectedMetric: e.target.value, activeStoryPreset: null }));
    }

    // ── State selector ──────────────────────────────────────
    const stateSel = document.getElementById('global-state');
    if (stateSel) {
      const stateNames = Array.from(new Set(rawData.map(d => d.State_Name))).sort();
      stateNames.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        stateSel.appendChild(opt);
      });
      stateSel.addEventListener('change', e =>
        setState({ selectedStates: e.target.value ? [e.target.value] : [], activeStoryPreset: null }));
    }

    const clearStateBtn = document.getElementById('clear-state-btn');
    if (clearStateBtn) {
      clearStateBtn.addEventListener('click', () => setState({ selectedStates: [], activeStoryPreset: null }));
    }

    // ── Finding cards → apply preset + scroll to the evidence ──
    const TAB_TO_SECTION = { map: 'section-where', timeline: 'section-when', scatter: 'section-relationships', seasons: 'section-advanced', guide: 'section-advanced' };
    document.querySelectorAll('[data-preset-btn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-preset-btn');
        const preset = STORY_PRESETS.find(p => p.id === id);
        if (!preset) return;
        applyStoryPreset(id);
        if (preset.insightTab) activateTab(preset.insightTab);
        const target = document.getElementById(TAB_TO_SECTION[preset.insightTab] || 'section-where');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // ── Create components ───────────────────────────────────
    createLegend('#legend-panel');
    createKPIs('#kpi-strip');
    createMap('#map-wrapper');
    createScatterplot('#scatter-wrapper');
    createHeatmap('#heatmap-wrapper');
    createTimeline('#area-chart-container');
    createSmallMultiples('#small-multiples-wrapper');

    // ── Subscribe updaters ──────────────────────────────────
    subscribe(updateFilterBar);
    subscribe(updateLegend);
    subscribe(updateKPIs);
    subscribe(updateMap);
    subscribe(updateScatterplot);
    subscribe(updateHeatmap);
    subscribe(updateTimeline);
    subscribe(updateSmallMultiples);

    updateFilterBar(state);
  } catch (err) {
    console.error('Dashboard init error:', err);
    setInsightError('The dataset could not be loaded, so insights are unavailable right now.');
  }
}

init();