// legend.js — centralized visual key: color scale, size key, categorical encoding
import { state, metrics } from './state.js';
import { paletteInterpolator, metricDomain, metricStateMax, CAT_COLORS } from './colors.js';

let root;
const GW = 300, GH = 92;    // gradient svg viewBox (extra room for threshold row)
const BW = 300, BH = 114;   // bubble svg viewBox (labels clear of the circles)

export function createLegend(sel) {
  root = d3.select(sel);
  root.html(`
    <div class="legend-grid">
      <div class="legend-block">
        <div class="legend-title" id="lg-grad-title">Color scale</div>
        <svg id="lg-grad" viewBox="0 0 ${GW} ${GH}" width="100%" style="display:block"></svg>
      </div>
      <div class="legend-block">
        <div class="legend-title">Bubble size key</div>
        <svg id="lg-bubble" viewBox="0 0 ${BW} ${BH}" width="100%" style="display:block"></svg>
        <div class="legend-caption">Bubble map: circle <b>area &prop; value</b> (square-root scale). Sizes show <b>state averages</b>.</div>
      </div>
      <div class="legend-block">
        <div class="legend-title">Categorical encoding</div>
        <div class="legend-swatches" id="lg-cats"></div>
        <div class="legend-caption">Dots on scatter &amp; quadrant charts = <b>one state</b>, averaged over the selected window.</div>
      </div>
    </div>
  `);
  updateLegend(state);
}

export function updateLegend(s) {
  if (!root || !s.data.length) return;
  const metric = metrics[s.selectedMetric];
  _gradient(metric, s.data);
  _bubbles(metric, s.data);
  _cats();
}

function _metricKey(metric) {
  return Object.keys(metrics).find(k => metrics[k] === metric);
}

// ── Gradient bar with threshold ticks ────────────────────────
function _gradient(metric, data) {
  const svg = root.select('#lg-grad');
  svg.html(null);
  root.select('#lg-grad-title')
    .html(`Color scale — ${metric.label}${metric.unit ? ` <span class="lg-unit">(${metric.unit})</span>` : ''}`);

  const x0 = 8, x1 = GW - 8;
  const barY = 12, barH = 14;
  const itp = paletteInterpolator(metric.palette);
  const [lo, hi] = metricDomain(_metricKey(metric), data);

  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id', 'lg-grad-g');
  d3.range(14).forEach((i, _, all) => {
    grad.append('stop')
      .attr('offset', `${(i / (all.length - 1)) * 100}%`)
      .attr('stop-color', itp(i / (all.length - 1)));
  });

  svg.append('rect')
    .attr('x', x0).attr('y', barY).attr('width', x1 - x0).attr('height', barH)
    .attr('rx', 7).attr('fill', 'url(#lg-grad-g)')
    .attr('stroke', 'rgba(148,163,184,0.25)');

  const xs = d3.scaleLinear().domain([lo, hi]).range([x0, x1]);
  const fmt = d3.format(metric.fmt);

  // ── Threshold ticks + labels BELOW the bar, collision-resolved ──
  // Labels sit on one row under the gradient; if two would collide they are
  // pushed apart (and clamped inside the bar) so they never overlap.
  const thresholds = (metric.thresholds || [])
    .filter(t => t.v > lo && t.v < hi)
    .map(t => ({ label: t.label, tx: xs(t.v) }));

  const MIN_GAP = 84;           // centered labels ≈ 80px wide at this size
  const clampLo = x0 + MIN_GAP / 2, clampHi = x1 - MIN_GAP / 2;
  thresholds.sort((a, b) => a.tx - b.tx);
  thresholds.forEach(t => { t.lx = Math.min(Math.max(t.tx, clampLo), clampHi); });
  for (let i = 1; i < thresholds.length; i++) {
    thresholds[i].lx = Math.max(thresholds[i].lx, thresholds[i - 1].lx + MIN_GAP);
  }
  for (let i = thresholds.length - 1; i > 0; i--) {
    thresholds[i].lx = Math.min(thresholds[i].lx, thresholds[i - 1].lx + MIN_GAP);
    thresholds[i].lx = Math.min(thresholds[i].lx, clampHi);
  }

  thresholds.forEach(t => {
    // Dashed cut-line across the bar itself
    svg.append('line')
      .attr('x1', t.tx).attr('x2', t.tx)
      .attr('y1', barY - 3).attr('y2', barY + barH + 3)
      .attr('stroke', 'rgba(255,255,255,0.9)')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '3,2');
    // Connector from the cut-line down to its (possibly shifted) label
    svg.append('line')
      .attr('x1', t.tx).attr('x2', t.lx)
      .attr('y1', barY + barH + 3).attr('y2', barY + barH + 10)
      .attr('stroke', 'rgba(255,255,255,0.45)')
      .attr('stroke-dasharray', '2,2');
    svg.append('text')
      .attr('class', 'lg-tick lg-thresh')
      .attr('x', t.lx)
      .attr('y', barY + barH + 21)
      .attr('text-anchor', 'middle')
      .text(t.label);
  });

  // Min / max values, then direction hints, on their own clear rows
  const valY = barY + barH + (thresholds.length ? 38 : 22);
  svg.append('text').attr('class', 'lg-tick').attr('x', x0).attr('y', valY).text(fmt(lo));
  svg.append('text').attr('class', 'lg-tick').attr('x', x1).attr('y', valY).attr('text-anchor', 'end').text(fmt(hi));
  svg.append('text').attr('class', 'lg-tick dim').attr('x', x0).attr('y', valY + 15).text('\u2190 lower \u00b7 cleaner');
  svg.append('text').attr('class', 'lg-tick dim').attr('x', x1).attr('y', valY + 15)
    .attr('text-anchor', 'end')
    .text(metric.palette === 'traffic' ? 'higher \u00b7 busier \u2192' : 'higher \u00b7 dirtier \u2192');
}

// ── Bubble size key: diameter ↔ value ────────────────────────
function _bubbles(metric, data) {
  const svg = root.select('#lg-bubble');
  svg.html(null);
  const maxV = metricStateMax(_metricKey(metric), data);
  // Same sqrt scale as the bubble map (range 0–40) so the key mirrors reality
  const r = d3.scaleSqrt().domain([0, maxV]).range([0, 40]);
  const steps = [0.25, 0.5, 1].map(f => f * maxV);
  const fmt = d3.format(metric.fmt);

  // Nest the circles bottom-aligned (like a proper size legend) so the
  // biggest bubble never collides with a caption — labels live underneath.
  const cy = 62;
  let cx = 52;
  steps.forEach(v => {
    const rv = Math.max(r(v), 3);
    svg.append('circle')
      .attr('cx', cx).attr('cy', cy).attr('r', rv)
      .attr('fill', 'rgba(78,159,245,0.18)')
      .attr('stroke', 'rgba(103,232,249,0.65)')
      .attr('stroke-width', 1.2);
    svg.append('text')
      .attr('class', 'lg-tick')
      .attr('x', cx).attr('y', cy + 46)
      .attr('text-anchor', 'middle')
      .text(fmt(v));
    cx += rv * 2 + 26;
  });
}

// ── Categorical swatches ─────────────────────────────────────
function _cats() {
  const rows = [
    { c: CAT_COLORS.selected, t: 'Selected state (click any state to filter)', ring: true },
    { c: 'rgba(78,159,245,0.30)', t: 'Other states (dimmed)' },
    { c: CAT_COLORS.noData, t: 'No data reported' },
    { c: CAT_COLORS.good, t: 'AQI band \u00b7 Good (\u2264 50)' },
    { c: CAT_COLORS.moderate, t: 'AQI band \u00b7 Moderate (51\u2013100)' },
    { c: '#f0854a', t: 'Annotation \u00b7 peak / highest reading' },
    { c: '#4ade80', t: 'Annotation \u00b7 low / cleanest reading' }
  ];
  root.select('#lg-cats').html(rows.map(r =>
    `<div class="lg-row"><span class="lg-swatch${r.ring ? ' ring' : ''}" style="background:${r.c}"></span><span>${r.t}</span></div>`
  ).join(''));
}
