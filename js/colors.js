// colors.js — shared palettes, scales & SVG helpers for the whole story
import { metrics } from './state.js';

export const PALETTES = {
  // clean teal → hot red (for pollution-side metrics: higher = dirtier)
  pollution: ["#0b3a4a", "#0e7490", "#22d3ee", "#fde047", "#fb923c", "#ef4444"],
  // deep navy → bright cyan (for volume metrics: higher = busier)
  traffic: ["#0f1b3d", "#1e3a8a", "#3b82f6", "#67e8f9", "#e0f2fe"]
};

export const CAT_COLORS = {
  selected: "#f0854a",
  base: "#4e9ff5",
  noData: "#232b44",
  good: "#34d399",
  moderate: "#facc15"
};

const interpolators = {};

export function paletteInterpolator(key) {
  if (!interpolators[key]) {
    interpolators[key] = d3.interpolateRgbBasis(PALETTES[key] || PALETTES.pollution);
  }
  return interpolators[key];
}

// ── Stable full-record domains so colors stay comparable across filters ──
const domainCache = {};
const maxCache = {};

export function metricDomain(metricKey, data) {
  const m = metrics[metricKey];
  if (!domainCache[m.field]) {
    const vals = data.map(d => d[m.field]).filter(v => v != null && !isNaN(v));
    domainCache[m.field] = vals.length ? [d3.min(vals), d3.max(vals)] : [0, 1];
  }
  return domainCache[m.field].slice();
}

// Max state-average over the full record — shared by bubble map & legend size key
export function metricStateMax(metricKey, data) {
  if (!maxCache[metricKey]) {
    const m = metrics[metricKey];
    const g = d3.rollup(data, v => d3.mean(v, d => d[m.field]), d => d.State_Name);
    const vals = Array.from(g.values()).filter(v => v != null && !isNaN(v));
    maxCache[metricKey] = vals.length ? d3.max(vals) : 1;
  }
  return maxCache[metricKey];
}

export function colorScale(metricKey, data) {
  const m = metrics[metricKey];
  const [lo, hi] = metricDomain(metricKey, data);
  return d3.scaleSequential(paletteInterpolator(m.palette))
    .domain(hi > lo ? [lo, hi] : [lo, lo + 1]);
}

// Sampled color stops for legend gradients
export function scaleStops(paletteKey, n = 14) {
  const itp = paletteInterpolator(paletteKey);
  return d3.range(n).map(i => itp(i / (n - 1)));
}

// Soft glow filter for highlighted SVG elements
export function addGlow(defs, id, color, blur = 4) {
  const f = defs.append('filter')
    .attr('id', id)
    .attr('x', '-80%').attr('y', '-80%')
    .attr('width', '260%').attr('height', '260%');
  f.append('feDropShadow')
    .attr('dx', 0).attr('dy', 0)
    .attr('stdDeviation', blur)
    .attr('flood-color', color)
    .attr('flood-opacity', 0.9);
  return `url(#${id})`;
}