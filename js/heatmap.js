// heatmap.js — "Seasonal rhythm": State × Month-of-year matrix
import { state, metrics, toggleStateSelection, setHoveredState } from './state.js';
import { colorScale, CAT_COLORS } from './colors.js';
import { stateAbbr, seasonMeaning } from './utils.js';
import { setInsight } from './insights.js';

const M = { top: 44, right: 18, bottom: 14, left: 108 };
const W = 660, ROW_H = 16;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let tooltip;

export function createHeatmap(containerId) {
  tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);
  updateHeatmap(state);
}

export function updateHeatmap(s) {
  const host = d3.select('#heatmap-wrapper');
  host.selectAll('svg').remove();
  host.selectAll('.hm-empty').remove();

  const metric = metrics[s.selectedMetric];
  const win = s.data.filter(d =>
    (!s.startDate || d.Date >= s.startDate) &&
    (!s.endDate || d.Date <= s.endDate));

  if (!win.length) {
    host.append('div').attr('class', 'hm-empty').text('No data in the selected window.');
    _callouts(null, metric);
    return;
  }

  // State × Month-of-year means over the selected window
  const bySM = d3.rollup(win, v => d3.mean(v, d => d[metric.field]), d => d.State_Name, d => d.Month);
  const stateMeans = d3.rollup(win, v => d3.mean(v, d => d[metric.field]), d => d.State_Name);
  let states = Array.from(stateMeans, ([name, val]) => ({ name, val }))
    .filter(d => d.val != null && !isNaN(d.val))
    .sort((a, b) => b.val - a.val);

  // Selection HIGHLIGHTS rows instead of hiding the rest — every state
  // stays visible so users can keep clicking more rows (multi-select).
  const selected = new Set(s.selectedStates);
  const TOPN = 14, MAXROWS = 24;
  const top = states.slice(0, TOPN);
  const pinned = states.filter(d => selected.has(d.name) && !top.includes(d));
  states = top.concat(pinned).sort((a, b) => b.val - a.val).slice(0, MAXROWS);
  let note = null;
  if (s.selectedStates.length) {
    note = `${s.selectedStates.length} state${s.selectedStates.length === 1 ? '' : 's'} selected — highlighted rows · click rows to add / remove`;
  } else if (states.length >= MAXROWS) {
    note = `Top ${states.length} of ${stateMeans.size} states shown — click any row to pin a state`;
  }

  if (!states.length) {
    host.append('div').attr('class', 'hm-empty').text('No data for the selected states.');
    _callouts(null, metric);
    return;
  }

  const scale = colorScale(s.selectedMetric, s.data);
  const cellW = (W - M.left - M.right) / 12;
  const H = M.top + M.bottom + states.length * ROW_H;
  const fmt = d3.format(metric.fmt);
  const u = metric.unit ? ` ${metric.unit}` : '';

  const svg = host.append('svg')
    .attr('width', '100%')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('style', 'display:block;max-width:100%;height:auto;');

  // Column means → peak / low month
  const colMeans = MONTHS.map((_, j) =>
    d3.mean(states, st => { const rm = bySM.get(st.name); return rm ? rm.get(j + 1) : null; }));
  const peakIdx = d3.maxIndex(colMeans);
  const lowIdx = d3.minIndex(colMeans);

  // Column headers (peak month highlighted)
  MONTHS.forEach((mn, j) => {
    svg.append('text')
      .attr('x', M.left + j * cellW + cellW / 2)
      .attr('y', M.top - 14)
      .attr('text-anchor', 'middle')
      .attr('class', 'hm-col' + (j === peakIdx ? ' is-peak' : ''))
      .text(mn);
  });

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  // Cells + row labels
  let hot = null;
  states.forEach((st, i) => {
    const rm = bySM.get(st.name) || new Map();

    // Full-row hit area: click ANYWHERE in the row to select / deselect.
    // Appended before the cells, so it sits behind them in the DOM.
    svg.append('rect')
      .attr('class', 'hm-row-bg' + (selected.has(st.name) ? ' is-selected' : ''))
      .attr('x', M.left - 6)
      .attr('y', M.top + i * ROW_H)
      .attr('width', W - M.left - M.right + 12)
      .attr('height', ROW_H)
      .attr('rx', 3)
      .style('cursor', 'pointer')
      .on('click', () => toggleStateSelection(st.name))
      .append('title').text(`${st.name} — click row to select / deselect`);

    MONTHS.forEach((_, j) => {
      const val = rm.get(j + 1);
      if (val != null && (!hot || val > hot.v)) hot = { i, j, v: val };
      g.append('rect')
        .attr('x', j * cellW + 1)
        .attr('y', i * ROW_H + 1)
        .attr('width', cellW - 2)
        .attr('height', ROW_H - 2)
        .attr('rx', 3)
        .attr('fill', val == null ? CAT_COLORS.noData : scale(val))
        .on('mouseover', (event) => {
          setHoveredState(st.name);
          tooltip.style('opacity', 1).html(`
            <div class="tip-header">
              <strong>${st.name} · ${MONTHS[j]}</strong>
            </div>
            <div class="tip-grid">
              <span class="tip-row">📈 <b>${metric.label}:</b> ${val != null ? fmt(val) + u : 'No data'}</span>
              <span class="tip-row">🗺️ <b>State Avg:</b> ${fmt(st.val)}${u}</span>
              <span class="tip-row">🗓️ <b>National ${MONTHS[j]} Avg:</b> ${fmt(colMeans[j])}${u}</span>
            </div>
            <span class="tip-hint">Click anywhere in the row to select / deselect</span>
          `)
            .style('left', (event.pageX + 14) + 'px')
            .style('top', (event.pageY - 12) + 'px');
        })
        .on('mouseleave', () => {
          setHoveredState(null);
          tooltip.style('opacity', 0);
        })
        .on('click', () => toggleStateSelection(st.name))
        .attr('opacity', 0)
        .transition()
        .delay(i * 20 + j * 4)
        .duration(250)
        .attr('opacity', 1);
    });

    svg.append('text')
      .attr('x', M.left - 10)
      .attr('y', M.top + i * ROW_H + ROW_H / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('class', 'hm-row' + (state.selectedStates.includes(st.name) ? ' is-selected' : ''))
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', `Select ${st.name}`)
      .style('cursor', 'pointer')
      .text(stateAbbr[st.name] || st.name)
      .on('mouseenter', () => setHoveredState(st.name))
      .on('mouseleave', () => setHoveredState(null))
      .on('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleStateSelection(st.name);
        }
      })
      .on('click', () => toggleStateSelection(st.name))
      .append('title').text(`${st.name} — click to select`);
  });

  // Annotation: outline the peak month column
  svg.append('rect')
    .attr('x', M.left + peakIdx * cellW + 0.5)
    .attr('y', M.top - 8)
    .attr('width', cellW - 1)
    .attr('height', states.length * ROW_H + 10)
    .attr('rx', 4)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(240,133,74,0.8)')
    .attr('stroke-dasharray', '3,3');

  // Annotation: ring the hottest single cell
  if (hot) {
    svg.append('circle')
      .attr('cx', M.left + hot.j * cellW + cellW / 2)
      .attr('cy', M.top + hot.i * ROW_H + ROW_H / 2)
      .attr('r', 5.4)
      .attr('fill', 'none')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.2)
      .attr('opacity', 0.85)
      .append('title').text('Hottest cell in view');
  }

  _callouts({ peakIdx, lowIdx, colMeans, note }, metric);
}

function _callouts(info, metric) {
  let html;
  if (!info) {
    html = `<div class="callout-chip"><div class="callout-meaning">No seasonal data in the current window — widen the time range to see the state × month rhythm.</div></div>`;
  } else {
    const fmt = d3.format(metric.fmt);
    const u = metric.unit ? ` ${metric.unit}` : '';
    html = `
    ${info.note ? `<div class="callout-chip"><div class="callout-head"><span class="callout-pin">🔬</span>${info.note}</div></div>` : ''}
    <div class="callout-chip">
      <div class="callout-head"><span class="callout-pin">🌡️</span>Seasonal shift — ${MONTHS[info.peakIdx]} runs hottest (${fmt(info.colMeans[info.peakIdx])}${u})</div>
      <div class="callout-meaning"><b>What this means:</b> ${seasonMeaning(info.peakIdx)}</div>
    </div>
    <div class="callout-chip">
      <div class="callout-head"><span class="callout-pin">🍃</span>${MONTHS[info.lowIdx]} is the calmest month (${fmt(info.colMeans[info.lowIdx])}${u})</div>
      <div class="callout-meaning"><b>What this means:</b> ${seasonMeaning(info.lowIdx)}</div>
    </div>`;
  }
  setInsight('seasons', html);
}