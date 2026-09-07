// smallMultiples.js — side-by-side monthly journeys (Observable-style small multiples)
// One shared X scale + one shared hover date drive every panel, so a single
// mousemove sweeps a synchronized crosshair across ALL cards simultaneously.
import { state, metrics, toggleStateSelection, setHoveredState, subscribeHover } from './state.js';
import { stateAbbr } from './utils.js';
import { publishGuide } from './insights.js';

// ── Section 1 — Setup & constants ────────────────────────────
const MARGIN = { top: 28, right: 14, bottom: 26, left: 34 };
const W = 220;   // inner chart width
const H = 110;   // inner chart height
const SECONDARY_METRIC_FIELD = 'Emission_Efficiency_Index';

let wrapper = null;          // outer component wrapper
let gridEl = null;           // CSS-grid container of .sm-card elements
let tooltip = null;          // shared floating tooltip
let cardData = new Map();    // stateName → filtered, sorted rows (for bisect)
let sharedX = null;          // ONE scale shared by all panels
let currentHoverDate = null; // drives the synchronized crosshair
const bisectDate = d3.bisector(d => d.Date).center;
const _panelScales = new Map(); // stateName → { yPrimary, ySecondary }

// ── Section 2 — createSmallMultiples: header, legend, grid, tooltip ──
export function createSmallMultiples(containerId) {
  wrapper = d3.select(containerId);

  // Header: live count + how-to hint + legend swatches
  const header = wrapper.append('div').attr('class', 'sm-header');
  header.append('div').attr('class', 'sm-header-left');
  header.append('div').attr('class', 'sm-legend').html(`
    <span class="sm-legend-item"><span class="swatch swatch-primary"></span><span class="lg-primary">Average Daily Traffic</span></span>
    <span class="sm-legend-item"><span class="swatch swatch-secondary"></span>Emission Efficiency</span>
  `);

  // Responsive CSS grid that holds one .sm-card per state
  gridEl = wrapper.append('div').attr('class', 'sm-grid');

  // Shared floating tooltip (appended once to <body>)
  tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip sm-tooltip')
    .style('opacity', 0);

  // Cross-panel hover linking with the map / scatter / heatmap
  subscribeHover(hoveredName => {
    gridEl.selectAll('.sm-card')
      .classed('is-hovered', d => d === hoveredName);
  });

  updateSmallMultiples(state);
}

// ── Section 3 — updateSmallMultiples: the D3 data join ───────
export function updateSmallMultiples(s) {
  if (!gridEl) return;
  const metric = metrics[s.selectedMetric];
  const primaryField = metric.field;

  // Render ALL states — selection highlights/dims cards, nothing is removed
  const displayStates = Array.from(new Set(s.data.map(d => d.State_Name))).sort();
  const isDefaultView = !s.selectedStates.length;

  // Header count + hint text
  wrapper.select('.sm-header-left').html(`
    <div class="sm-count">All <b>${displayStates.length}</b> states</div>
    <div class="sm-hint">${isDefaultView
      ? 'Click any state (map, heatmap row, or a card) to build your comparison'
      : 'Hover to compare · Click to select · Two metrics per panel'}</div>
  `);
  wrapper.select('.lg-primary').text(metric.label);

  // Per-state rows (respect the global time window)
  cardData = new Map();
  const inWindow = d =>
    (!s.startDate || d.Date >= s.startDate) && (!s.endDate || d.Date <= s.endDate);

  for (const name of displayStates) {
    const rows = s.data
      .filter(d => d.State_Name === name && inWindow(d))
      .sort((a, b) => a.Date - b.Date);
    if (rows.length) cardData.set(name, rows);
  }

  const visibleStates = displayStates.filter(n => cardData.has(n));
  if (!visibleStates.length) {
    gridEl.html(`<div class="sm-empty">No data in the selected window.</div>`);
    publishGuide(s.selectedStates);
    return;
  }

  // Shared X — the SAME scale for every panel (the key to synced crosshairs)
  sharedX = d3.scaleUtc()
    .domain(d3.extent(s.data.filter(inWindow).map(d => d.Date)))
    .range([0, W]);
  _panelScales.clear();

  // D3 data join — one .sm-card per state name (cards persist across updates)
  const cards = gridEl.selectAll('.sm-card').data(visibleStates, d => d);

  // EXIT — states removed from the selection
  cards.exit()
    .transition().duration(200)
    .style('opacity', 0)
    .remove();

  // ENTER — build each card's DOM skeleton exactly once
  const cardsEnter = cards.enter().append('div')
    .attr('class', 'sm-card glass')
    .on('click', (e, d) => toggleStateSelection(d))
    .on('mouseenter', (e, d) => setHoveredState(d))
    .on('mouseleave', () => setHoveredState(null));

  const svgEnter = cardsEnter.append('svg')
    .attr('viewBox', `0 0 ${W + MARGIN.left + MARGIN.right} ${H + MARGIN.top + MARGIN.bottom}`)
    .attr('width', '100%')
    .attr('style', 'display:block;');

  // Clip path so the draw-in animation stays inside its panel
  svgEnter.append('defs').append('clipPath')
    .attr('id', d => `sm-clip-${d.replace(/\W/g, '')}`)
    .append('rect')
    .attr('x', MARGIN.left).attr('y', MARGIN.top)
    .attr('width', W).attr('height', H);

  const gEnter = svgEnter.append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

  // Year-range highlight band (behind everything else)
  gEnter.append('rect').attr('class', 'sm-highlight')
    .attr('y', 0).attr('height', H)
    .attr('fill', 'rgba(78,159,245,0.10)')
    .style('display', 'none');

  // Area fill under the primary line
  gEnter.append('path').attr('class', 'sm-area')
    .attr('clip-path', d => `url(#sm-clip-${d.replace(/\W/g, '')})`)
    .attr('fill', 'rgba(78,159,245,0.12)');

  // Line groups: solid primary + dashed secondary overlay
  gEnter.append('path').attr('class', 'sm-line-primary')
    .attr('clip-path', d => `url(#sm-clip-${d.replace(/\W/g, '')})`)
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', 1.8)
    .attr('stroke-opacity', 0.95);

  gEnter.append('path').attr('class', 'sm-line-secondary')
    .attr('clip-path', d => `url(#sm-clip-${d.replace(/\W/g, '')})`)
    .attr('fill', 'none')
    .attr('stroke', '#f0854a')
    .attr('stroke-width', 1.3)
    .attr('stroke-dasharray', '3,3')
    .attr('stroke-opacity', 0.8);

  // Baseline + state label + tick groups (rebuilt on update)
  gEnter.append('line').attr('class', 'sm-baseline')
    .attr('y1', H).attr('y2', H)
    .attr('stroke', 'rgba(148,163,184,0.25)');
  gEnter.append('text').attr('class', 'sm-state-label')
    .attr('x', 0).attr('y', -12);
  gEnter.append('g').attr('class', 'sm-x-ticks');
  gEnter.append('g').attr('class', 'sm-y-ticks');

  // Synchronized crosshair + value dots (hidden until hover)
  const crossG = gEnter.append('g').attr('class', 'sm-cross-g').style('display', 'none');
  crossG.append('line').attr('class', 'sm-crosshair')
    .attr('y1', 0).attr('y2', H)
    .attr('stroke', 'rgba(255,255,255,0.45)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '2,2');
  crossG.append('circle').attr('class', 'sm-dot-primary').attr('r', 3)
    .attr('fill', 'var(--accent)').attr('stroke', '#0b1120');
  crossG.append('circle').attr('class', 'sm-dot-secondary').attr('r', 2.4)
    .attr('fill', '#f0854a').attr('stroke', '#0b1120');

  // Transparent mouse overlay — the ONLY event surface, shared by all panels
  svgEnter.append('rect')
    .attr('x', MARGIN.left).attr('y', MARGIN.top)
    .attr('width', W).attr('height', H)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .on('mousemove', (event) => {
      const [mx] = d3.pointer(event, svgEnter.select('g').node());
      currentHoverDate = sharedX.invert(mx - MARGIN.left);
      _syncCrosshairs(event);
    })
    .on('mouseleave', () => {
      currentHoverDate = null;
      gridEl.selectAll('.sm-cross-g').style('display', 'none');
      tooltip.style('opacity', 0);
    });

  // MERGE — update selection dim/highlight + render each card
  const cardsMerge = cardsEnter.merge(cards);
  const hasSelection = s.selectedStates.length > 0;
  cardsMerge
    .classed('is-selected', d => s.selectedStates.includes(d))
    .classed('is-dimmed', d => hasSelection && !s.selectedStates.includes(d))
    .attr('data-state', d => d);

  cardsMerge.each(function (stateName) {
    _updateCard(d3.select(this), stateName, s, primaryField);
  });

  publishGuide(s.selectedStates);
}

// ── Section 4 — _updateCard: render one panel ────────────────
function _updateCard(card, stateName, s, primaryField) {
  const rows = cardData.get(stateName) || [];
  const fmt = d3.format(metrics[s.selectedMetric].fmt);
  const primaryVal = d => d[primaryField];
  const secondaryVal = d => d[SECONDARY_METRIC_FIELD];
  const okP = d => primaryVal(d) != null && !isNaN(primaryVal(d));
  const okS = d => secondaryVal(d) != null && !isNaN(secondaryVal(d));
  const inRangeP = rows.filter(okP);
  const inRangeS = rows.filter(okS);

  // Independent Y scale per panel — reveals each state's trend shape
  const yPrimary = d3.scaleLinear()
    .domain([0, d3.max(inRangeP, primaryVal) || 1])
    .range([H, 0]).nice();
  const ySecondary = d3.scaleLinear()
    .domain([0, d3.max(inRangeS, secondaryVal) || 1])
    .range([H, 0]).nice();
  _panelScales.set(stateName, { yPrimary, ySecondary });

  // Area fill under the primary line
  const area = d3.area()
    .defined(okP).curve(d3.curveMonotoneX)
    .x(d => sharedX(d.Date)).y0(H).y1(d => yPrimary(primaryVal(d)));
  card.select('.sm-area').attr('d', area(rows));

  // Primary line (solid)
  const lineP = d3.line()
    .defined(okP).curve(d3.curveMonotoneX)
    .x(d => sharedX(d.Date)).y(d => yPrimary(primaryVal(d)));
  const primaryPath = card.select('.sm-line-primary').attr('d', lineP(rows));

  // Secondary line (dashed overlay, own scale)
  const lineS = d3.line()
    .defined(okS).curve(d3.curveMonotoneX)
    .x(d => sharedX(d.Date)).y(d => ySecondary(secondaryVal(d)));
  card.select('.sm-line-secondary').attr('d', lineS(rows));

  // Baseline position + state label
  card.select('.sm-baseline').attr('x1', 0).attr('x2', W);
  card.select('.sm-state-label')
    .text(`${stateAbbr[stateName] || ''} ${stateName}`.trim());

  // Year-range highlight band (visible only when a window is set)
  if (s.startDate && s.endDate) {
    card.select('.sm-highlight')
      .attr('x', sharedX(s.startDate))
      .attr('width', Math.max(0, sharedX(s.endDate) - sharedX(s.startDate)))
      .style('display', null);
  } else {
    card.select('.sm-highlight').style('display', 'none');
  }

  // Entry animation — the line draws itself in (only once per card)
  if (card.attr('data-animated') !== '1' && inRangeP.length > 1) {
    card.attr('data-animated', '1');
    try {
      const pathLen = _pathLength(lineP(rows));
      if (pathLen > 0) {
        primaryPath
          .attr('stroke-dasharray', pathLen)
          .attr('stroke-dashoffset', pathLen)
          .transition().duration(800)
          .attr('stroke-dashoffset', 0)
          .on('end', () => primaryPath.attr('stroke-dasharray', null).attr('stroke-dashoffset', null));
      }
    } catch (err) { /* path length not measurable — skip animation */ }
  }

  // Sparse year ticks along the shared X
  const years = Array.from(new Set(rows.map(d => d.Year))).sort();
  const yStep = years.length > 6 ? 2 : 1;
  const xTicks = card.select('.sm-x-ticks').selectAll('text')
    .data(years.filter((_, i) => i % yStep === 0), d => d);
  xTicks.exit().remove();
  xTicks.join('text')
    .attr('class', 'sm-tick')
    .attr('text-anchor', 'middle')
    .attr('y', H + 14)
    .attr('x', d => sharedX(new Date(d, 0, 1)))
    .text(d => `'${String(d).slice(2)}`);

  // Mid + max y labels (per-panel scale)
  const yMax = yPrimary.domain()[1];
  const yTicks = card.select('.sm-y-ticks').selectAll('text').data([yMax, yMax / 2]);
  yTicks.exit().remove();
  yTicks.join('text')
    .attr('class', 'sm-tick')
    .attr('text-anchor', 'end')
    .attr('x', -6)
    .attr('y', d => yPrimary(d) + 3)
    .text(d => fmt(d));
}

// ── Section 5 — _syncCrosshairs: the Observable technique ────
// One mousemove on ANY panel updates crosshair + dots in ALL panels.
function _syncCrosshairs(event) {
  if (currentHoverDate == null || !sharedX) return;
  const cx = sharedX(currentHoverDate); // same X position in every panel

  gridEl.selectAll('.sm-card').each(function (stateName) {
    const rows = cardData.get(stateName);
    if (!rows || !rows.length) return;
    const scales = _panelScales.get(stateName);
    if (!scales) return;
    const { yPrimary, ySecondary } = scales;

    // Show + position the shared-date crosshair on EVERY panel
    const crossG = d3.select(this).select('.sm-cross-g').style('display', null);
    crossG.select('.sm-crosshair').attr('x1', cx).attr('x2', cx);

    // Bisect this panel's data at the hover date → place the dots
    const row = rows[bisectDate(rows, currentHoverDate)];
    if (!row) return;
    const pv = row[metrics[state.selectedMetric].field];
    const sv = row[SECONDARY_METRIC_FIELD];
    crossG.select('.sm-dot-primary')
      .attr('cx', cx)
      .attr('cy', pv != null && !isNaN(pv) ? yPrimary(pv) : H)
      .style('display', pv != null && !isNaN(pv) ? null : 'none');
    crossG.select('.sm-dot-secondary')
      .attr('cx', cx)
      .attr('cy', sv != null && !isNaN(sv) ? ySecondary(sv) : H)
      .style('display', sv != null && !isNaN(sv) ? null : 'none');
  });

  _showTooltip(event);
}

// ── Section 6 — _showTooltip: rich floating tooltip ──────────
function _showTooltip(event) {
  const metric = metrics[state.selectedMetric];
  // Anchor the tooltip to the panel actually being hovered
  const hoveredCard = gridEl.selectAll('.sm-card').filter(function () {
    const r = this.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX <= r.right &&
           event.clientY >= r.top && event.clientY <= r.bottom;
  });
  if (hoveredCard.empty()) return;
  const stateName = hoveredCard.datum();

  const rows = cardData.get(stateName);
  const row = rows ? rows[bisectDate(rows, currentHoverDate)] : null;
  if (!row) return;

  const dateStr = d3.timeFormat('%b %Y')(currentHoverDate);
  const fmtP = d3.format(metric.fmt);
  const fmtS = d3.format('.2f');
  const pv = row[metric.field];
  const sv = row[SECONDARY_METRIC_FIELD];

  tooltip.style('opacity', 1).html(`
    <div class="tip-header">${stateAbbr[stateName] || ''} ${stateName}</div>
    <div class="tip-date">${dateStr}</div>
    <div class="tip-row"><span class="swatch swatch-primary"></span>${metric.label}: <b>${pv != null ? fmtP(pv) : 'N/A'}</b></div>
    <div class="tip-row"><span class="swatch swatch-secondary"></span>Emission Efficiency: <b>${sv != null ? fmtS(sv) : 'N/A'}</b></div>
  `);

  const bodyW = document.documentElement.clientWidth;
  const [tx, ty] = d3.pointer(event, document.body);
  tooltip
    .style('left', `${Math.min(tx + 14, bodyW - 230)}px`)
    .style('top', `${ty + 14}px`);
}

// ── Section 7 — _pathLength: native SVG path measurement ─────
function _pathLength(pathStr) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', pathStr);
  return p.getTotalLength();
}
