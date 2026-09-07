// timeline.js — Temporal Area Chart
// Pattern: d3.area() + curveStepAfter + zoom + brush → shared state
import { state, setState, metrics } from './state.js';
import { seasonMeaning } from './utils.js';
import { aggregateNationalTimeline } from './utils.js';
import { setInsight } from './insights.js';

// ── Dimensions (from provided pattern) ──────────────────────
const width        = 900;
const height       = 340;
const marginTop    = 20;
const marginRight  = 20;
const marginBottom = 36;
const marginLeft   = 48;

let svg, gx, gy, clipRect, gBands, gAnnoT;
let areaPath, linePath;
let brushGroup, brush;
let x, y, xFull;
let nationalData = [];
let tooltip;
let currentTransform = d3.zoomIdentity;
let ignoreBrush = false;

export function createTimeline(containerId) {
  const container = d3.select(containerId);

  // Tooltip (shared body tooltip)
  if (!d3.select('body').select('.area-tooltip').size()) {
    tooltip = d3.select('body').append('div').attr('class', 'tooltip area-tooltip').style('opacity', 0);
  } else {
    tooltip = d3.select('body').select('.area-tooltip');
  }

  // ── SVG ──────────────────────────────────────────────────
  svg = container.append('svg')
    .attr('width', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('style', 'display:block; overflow:hidden;');

  // Clip path so area/line don't overflow axes
  svg.append('defs').append('clipPath')
    .attr('id', 'area-clip')
    .append('rect')
    .attr('x', marginLeft)
    .attr('y', marginTop)
    .attr('width',  width  - marginLeft - marginRight)
    .attr('height', height - marginTop  - marginBottom);

  // ── Scales ───────────────────────────────────────────────
  x = d3.scaleUtc().range([marginLeft, width - marginRight]);
  y = d3.scaleLinear().range([height - marginBottom, marginTop]);

  // ── Axes groups ──────────────────────────────────────────
  gx = svg.append('g').attr('transform', `translate(0,${height - marginBottom})`);
  gy = svg.append('g').attr('transform', `translate(${marginLeft},0)`);

  // ── Winter shading bands (behind area) ───────────────────
  gBands = svg.append('g').attr('clip-path', 'url(#area-clip)');

  // ── Area path ────────────────────────────────────────────
  areaPath = svg.append('path')
    .attr('clip-path', 'url(#area-clip)')
    .attr('fill', 'var(--accent-dim)')
    .attr('stroke', 'none');

  // ── Line path (edge of area) ─────────────────────────────
  linePath = svg.append('path')
    .attr('clip-path', 'url(#area-clip)')
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', 1.6)
    .attr('stroke-opacity', 0.85);

  // ── Selected state trajectory overlay ─────────────────────
  const statePath = svg.append('path')
    .attr('class', 'timeline-state-line')
    .attr('clip-path', 'url(#area-clip)')
    .attr('fill', 'none')
    .attr('stroke', 'var(--highlight)')
    .attr('stroke-width', 2.2)
    .attr('filter', 'drop-shadow(0 0 6px rgba(240,133,74,0.6))');

  // ── Peak / trough annotation layer ───────────────────────
  gAnnoT = svg.append('g').attr('clip-path', 'url(#area-clip)');

  // ── Hover crosshair ──────────────────────────────────────
  const crosshair = svg.append('line')
    .attr('class', 'crosshair')
    .attr('y1', marginTop).attr('y2', height - marginBottom)
    .attr('stroke', 'var(--text-muted)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3')
    .style('display', 'none');

  // ── Brush (date-range filter → shared state) ─────────────
  brush = d3.brushX()
    .extent([[marginLeft, marginTop], [width - marginRight, height - marginBottom]])
    .on('end', brushed);

  brushGroup = svg.append('g').attr('class', 'brush').call(brush);

  // Mouse events on brush overlay for crosshair + tooltip
  brushGroup.select('rect.overlay')
    .on('mousemove', (event) => {
      if (!nationalData.length) return;
      const xz = currentTransform.rescaleX(x);
      const date = xz.invert(d3.pointer(event)[0]);
      const bisect = d3.bisector(d => d.Date).left;
      const i = bisect(nationalData, date, 1);
      const d0 = nationalData[i - 1], d1 = nationalData[i];
      const d = (!d1 || date - d0.Date < d1.Date - date) ? d0 : d1;
      if (!d) return;
      const cx = xz(d.Date);
      const metric = metrics[state.selectedMetric];
      const val = d[metric.field];
      crosshair.style('display', null).attr('x1', cx).attr('x2', cx);
      
      const month0 = d.Date.getMonth();
      const seasonTag = (month0 === 11 || month0 === 0 || month0 === 1) ? ' ❄️ Winter Peak Season'
                      : (month0 >= 5 && month0 <= 7) ? ' ☀️ Summer Ozone Stretch' : '';

      tooltip.style('opacity', 1)
        .html(`
          <div class="tip-header">
            <strong>${d3.timeFormat('%B %Y')(d.Date)}</strong>
            ${seasonTag ? `<span class="tip-season-badge">${seasonTag}</span>` : ''}
          </div>
          <div class="tip-grid">
            <span class="tip-row">📈 <b>National ${metric.label}:</b> ${val != null ? d3.format(metric.fmt)(val) + (metric.unit ? ' ' + metric.unit : '') : 'N/A'}</span>
            <span class="tip-row">🌫️ <b>PM2.5:</b> ${d.Avg_PM2_5 != null ? d.Avg_PM2_5.toFixed(1) + ' µg/m³' : '—'} · <b>AQI:</b> ${d.Avg_AQI != null ? d.Avg_AQI.toFixed(0) : '—'}</span>
            <span class="tip-row">🚗 <b>Daily Traffic:</b> ${d.Avg_Daily_Traffic != null ? d3.format(',.0f')(d.Avg_Daily_Traffic) + ' veh/day' : '—'}</span>
          </div>
          <span class="tip-hint">Drag across timeline to filter time window</span>
        `)
        .style('left', (event.pageX + 16) + 'px')
        .style('top',  (event.pageY - 40) + 'px');
    })
    .on('mouseleave', () => {
      crosshair.style('display', 'none');
      tooltip.style('opacity', 0);
    });

  // Zoom removed for simplicity — the year slider + brush cover time navigation.

  // Initial data render
  _refreshData();
}

// ── Called when shared state changes ────────────────────────
export function updateTimeline(currentState) {
  if (!svg || !nationalData.length) return;
  _drawChart(currentState);
}

// ── Internal: reload aggregated data then draw ───────────────
function _refreshData() {
  nationalData = aggregateNationalTimeline(state.data);
  if (!nationalData.length) return;
  xFull = d3.extent(nationalData, d => d.Date);
  x.domain(xFull);
  currentTransform = d3.zoomIdentity;
  _drawChart(state);
}

// ── Internal: draw / update area chart ──────────────────────
function _drawChart(currentState) {
  if (!nationalData.length) return;
  const metric = metrics[currentState.selectedMetric];
  const xz     = currentTransform.rescaleX(x);

  // Y domain — full national range (not filtered, so zoom context is preserved)
  y.domain([0, d3.max(nationalData, d => d[metric.field])]).nice();

  // Axis builders
  const xAxis = (g, xScale) =>
    g.call(d3.axisBottom(xScale).ticks(width / 80).tickSizeOuter(0))
     .call(g => g.select('.domain').attr('stroke', 'var(--border-strong)'))
     .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border)'))
     .call(g => g.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', '11px'));

  // Y axis — called directly on the selection (not transition) so .clone() works
  gy.call(d3.axisLeft(y).ticks(6).tickSizeOuter(0))
    .call(g => g.select('.domain').remove())
    .call(g => {
      // Remove old gridlines before redrawing
      g.selectAll('.grid-line-y').remove();
      g.selectAll('.tick line').clone()
        .attr('class', 'grid-line-y')
        .attr('x2', width - marginLeft - marginRight)
        .attr('stroke', 'var(--border)')
        .attr('stroke-opacity', 0.35);
    })
    .call(g => g.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', '11px'));

  gx.transition().duration(300).call(xAxis, xz);

  // Area generator — using curveStepAfter as per the provided pattern
  const areaGen = (data, xScale) => d3.area()
    .defined(d => d[metric.field] != null && !isNaN(d[metric.field]))
    .curve(d3.curveStepAfter)
    .x(d => xScale(d.Date))
    .y0(y(0))
    .y1(d => y(d[metric.field]))
    (data);

  const lineGen = (data, xScale) => d3.line()
    .defined(d => d[metric.field] != null && !isNaN(d[metric.field]))
    .curve(d3.curveStepAfter)
    .x(d => xScale(d.Date))
    .y(d => y(d[metric.field]))
    (data);

  areaPath.transition().duration(300).attr('d', areaGen(nationalData, xz));
  linePath.transition().duration(300).attr('d', lineGen(nationalData, xz));

  // Selected state overlay path
  const statePath = svg.select('.timeline-state-line');
  if (currentState.selectedStates.length > 0) {
    const singleState = currentState.selectedStates[0];
    const sRows = currentState.data.filter(d => d.State_Name === singleState);
    sRows.sort((a, b) => a.Date - b.Date);
    statePath.transition().duration(300)
      .attr('d', lineGen(sRows, xz))
      .attr('opacity', 1);
  } else {
    statePath.transition().duration(200).attr('opacity', 0);
  }

  // Annotations & seasonal context
  _drawBands(xz);
  _drawExtremes(metric, xz);
  _callouts(metric);

  // Update metric label in header
  const labelEl = document.getElementById('area-chart-metric-label');
  if (labelEl) {
    const stateSuffix = currentState.selectedStates.length ? ` · vs ${currentState.selectedStates.join(', ')}` : '';
    labelEl.textContent = `${metric.label}${stateSuffix}`;
  }

  // Sync brush selection if startDate/endDate set externally (e.g. year slider)
  if (!ignoreBrush && currentState.startDate && currentState.endDate) {
    ignoreBrush = true;
    const sel = [xz(currentState.startDate), xz(currentState.endDate)];
    // Only move brush if within visible range
    if (sel[0] >= marginLeft && sel[1] <= width - marginRight) {
      brushGroup.call(brush.move, sel);
    }
    ignoreBrush = false;
  } else if (!ignoreBrush && !currentState.startDate) {
    ignoreBrush = true;
    brushGroup.call(brush.move, null);
    ignoreBrush = false;
  }
}

// ── Brush handler: updates shared date range ─────────────────
function brushed(event) {
  if (ignoreBrush || !event.sourceEvent) return;
  const selection = event.selection;
  const xz = currentTransform.rescaleX(x);
  if (selection) {
    const [x0, x1] = selection.map(xz.invert);
    setState({ startDate: x0, endDate: x1, selectedYear: 'All' });
    const btn = document.getElementById('all-years-btn');
    if (btn) btn.classList.remove('is-active');
    const yd = document.getElementById('year-display');
    if (yd) yd.textContent = 'Range';
  } else {
    setState({ startDate: null, endDate: null });
  }
}

// ── Winter shading bands (Dec–Feb) ───────────────────────────
function _drawBands(xz) {
  if (!nationalData.length) return;
  const rects = [];
  nationalData.forEach(d => {
    const m = d.Date.getMonth();
    if (m === 11 || m === 0 || m === 1) {
      const start = new Date(d.Date.getFullYear(), m, 1);
      const end = new Date(d.Date.getFullYear(), m + 1, 1);
      rects.push([xz(start), xz(end)]);
    }
  });
  gBands.selectAll('rect').data(rects).join('rect')
    .attr('x', r => r[0])
    .attr('width', r => Math.max(0, r[1] - r[0]))
    .attr('y', marginTop)
    .attr('height', height - marginTop - marginBottom)
    .attr('fill', 'rgba(78,159,245,0.055)');
  gBands.selectAll('.band-label').data(rects.length ? [rects[0]] : [])
    .join('text')
    .attr('class', 'band-label')
    .attr('x', r => r[0] + 4)
    .attr('y', marginTop + 12)
    .text('❄ winter');
}

// ── Peak / trough annotations (stable, full record) ──────────
function _drawExtremes(metric, xz) {
  gAnnoT.selectAll('*').remove();
  const pts = nationalData.filter(d => d[metric.field] != null && !isNaN(d[metric.field]));
  if (pts.length < 4) return;
  const peak = pts[d3.maxIndex(pts, d => d[metric.field])];
  const low = pts[d3.minIndex(pts, d => d[metric.field])];
  _marker(peak, 'Peak', '#f0854a', metric, xz);
  _marker(low, 'Low', '#4ade80', metric, xz);
}

function _marker(d, tag, color, metric, xz) {
  const cx = xz(d.Date);
  if (cx < marginLeft - 30 || cx > width - marginRight + 30) return;
  const cy = y(d[metric.field]);
  gAnnoT.append('circle')
    .attr('cx', cx).attr('cy', cy).attr('r', 4)
    .attr('fill', color)
    .attr('stroke', 'rgba(7,10,19,0.9)').attr('stroke-width', 1);
  gAnnoT.append('circle')
    .attr('cx', cx).attr('cy', cy).attr('r', 9)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 1)
    .attr('class', 'anno-pulse');
  const anchor = cx > width - 170 ? 'end' : cx < marginLeft + 170 ? 'start' : 'middle';
  const tx = anchor === 'end' ? cx - 10 : anchor === 'start' ? cx + 10 : cx;
  const ty = Math.max(cy - 18, marginTop + 14);
  gAnnoT.append('text')
    .attr('class', 'anno-label')
    .attr('fill', color)
    .attr('x', tx)
    .attr('y', ty)
    .attr('text-anchor', anchor)
    .text(`${tag} · ${d3.timeFormat('%b %y')(d.Date)} — ${d3.format(metric.fmt)(d[metric.field])}`);
}

// ── Insight chips → Story Insights side panel ────────────────
function _callouts(metric) {
  const pts = nationalData.filter(d => d[metric.field] != null && !isNaN(d[metric.field]));
  let html;
  if (!pts.length) {
    html = `<div class="callout-chip"><div class="callout-meaning">Not enough months in view to read the trend yet.</div></div>`;
  } else {
    const peak = pts[d3.maxIndex(pts, d => d[metric.field])];
    const low = pts[d3.minIndex(pts, d => d[metric.field])];
    const f = d3.format(metric.fmt);
    const u = metric.unit ? ` ${metric.unit}` : '';
    html = `
    <div class="callout-chip">
      <div class="callout-head"><span class="callout-pin">📈</span>Peak — ${d3.timeFormat('%b %Y')(peak.Date)}: ${f(peak[metric.field])}${u}</div>
      <div class="callout-meaning"><b>What this means:</b> ${seasonMeaning(peak.Date.getMonth())}</div>
    </div>
    <div class="callout-chip">
      <div class="callout-head"><span class="callout-pin">🌱</span>Low — ${d3.timeFormat('%b %Y')(low.Date)}: ${f(low[metric.field])}${u}</div>
      <div class="callout-meaning"><b>What this means:</b> ${seasonMeaning(low.Date.getMonth())}</div>
    </div>
    <div class="callout-chip">
      <div class="callout-head"><span class="callout-pin">🖱️</span>Drive the story with time</div>
      <div class="callout-meaning"><b>How to use:</b> drag across any span to focus every chart on that period · the ▶ button animates through the years · "All Years" resets.</div>
    </div>`;

    // In-page takeaway under the timeline
    const tk = document.getElementById('timeline-takeaway');
    if (tk) {
      const isWinterPeak = peak.Date.getMonth() === 11 || peak.Date.getMonth() === 0 || peak.Date.getMonth() === 1;
      tk.innerHTML = `<b>What this means:</b> the national peak lands in <b>${d3.timeFormat('%B %Y')(peak.Date)}</b>${isWinterPeak ? ' — a winter month, when cold air tends to trap pollution near the ground' : ''}, and the pattern repeats across the decade.`;
    }
  }
  setInsight('timeline', html);
}
