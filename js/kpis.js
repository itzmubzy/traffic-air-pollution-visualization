// kpis.js — "National Pulse" metric cards with sparklines & delta chips
import { state, metrics, setState, toggleStateSelection } from './state.js';

let root;

const CARDS = [
  { id: 'kpi-pm25', key: 'pm25', label: 'PM2.5', unit: 'µg/m³', tip: 'Fine particulate matter. Click to set active metric.' },
  { id: 'kpi-aqi', key: 'aqi', label: 'Air Quality Index', unit: '', tip: 'EPA Air Quality Index. Click to set active metric.' },
  { id: 'kpi-traffic', key: 'traffic', label: 'Traffic Volume', unit: 'veh/day', tip: 'Daily traffic volume. Click to set active metric.' },
  { id: 'kpi-eff', key: 'efficiency', label: 'Emission Efficiency', unit: 'µg/m³ / 1k veh', tip: 'PM2.5 per 1,000 vehicles. Lower = cleaner fleet. Click to set active metric.' },
  { id: 'kpi-clean', key: 'clean', label: 'Cleanest State', unit: 'by PM2.5', tip: 'State with lowest PM2.5 in current window. Click to isolate state.' },
  { id: 'kpi-hot', key: 'hot', label: 'Highest PM2.5', unit: '', tip: 'State with highest PM2.5 in current window. Click to isolate state.' }
];

const seriesCache = {};

export function createKPIs(sel) {
  root = d3.select(sel);
  root.html(CARDS.map(c => `
    <div class="kpi-card glass" id="${c.id}" role="button" tabindex="0" title="${c.tip}">
      <div class="kpi-label">${c.label}${c.unit ? ` <span class="kpi-unit">${c.unit}</span>` : ''}</div>
      <div class="kpi-value">—</div>
      <div class="kpi-delta neutral">baseline</div>
      <svg class="kpi-spark" viewBox="0 0 150 34" preserveAspectRatio="none"></svg>
    </div>`).join(''));

  // Wire interactive clicks on KPI cards
  [['kpi-pm25', 'pm25'], ['kpi-aqi', 'aqi'], ['kpi-traffic', 'traffic'], ['kpi-eff', 'efficiency']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => setState({ selectedMetric: key }));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setState({ selectedMetric: key });
        }
      });
    }
  });

  root.selectAll('.kpi-card')
    .style('opacity', 0)
    .transition()
    .delay((d, i) => i * 70)
    .duration(500)
    .style('opacity', 1);

  updateKPIs(state);
}

export function updateKPIs(s) {
  if (!root || !s.data.length) return;

  const inWindow = (s.startDate || s.endDate)
    ? d => (!s.startDate || d.Date >= s.startDate) && (!s.endDate || d.Date <= s.endDate)
    : () => true;
  const inStates = s.selectedStates.length
    ? d => s.selectedStates.includes(d.State_Name)
    : () => true;

  const win = s.data.filter(d => inWindow(d) && inStates(d));
  const base = s.data.filter(inStates); // same states, full period

  // ── Four metric cards: value + delta vs full-period baseline + sparkline ──
  [['kpi-pm25', 'pm25'], ['kpi-aqi', 'aqi'], ['kpi-traffic', 'traffic'], ['kpi-eff', 'efficiency']]
    .forEach(([id, key]) => {
      const m = metrics[key];
      const meanW = d3.mean(win, d => d[m.field]);
      const meanB = d3.mean(base, d => d[m.field]);
      const el = root.select('#' + id);
      el.select('.kpi-value').classed('kpi-state-name', false);
      _countUp(el.select('.kpi-value'), meanW, m.fmt);

      const deltaEl = el.select('.kpi-delta');
      if (meanW != null && meanB) {
        const pct = (meanW / meanB - 1) * 100;
        const good = m.goodDirection === 'down' ? pct < 0 : null; // all four: lower is better or neutral
        deltaEl
          .attr('class', 'kpi-delta ' + (good == null ? 'neutral' : good ? 'good' : 'bad'))
          .text(`${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs full-period avg`);
      } else {
        deltaEl.attr('class', 'kpi-delta neutral').text('baseline');
      }
      _spark(el.select('.kpi-spark'), key, m);
    });

  // ── Cleanest / hottest state cards (within window, ≥6 months of data) ──
  const byState = d3.rollup(
    win.filter(d => d.Avg_PM2_5 != null),
    v => ({ mean: d3.mean(v, d => d.Avg_PM2_5), n: v.length }),
    d => d.State_Name
  );
  const rows = Array.from(byState, ([name, v]) => ({ name, ...v }))
    .filter(d => d.n >= 6 && d.mean != null)
    .sort((a, b) => a.mean - b.mean);

  const cleanEl = root.select('#kpi-clean');
  const hotEl = root.select('#kpi-hot');
  if (rows.length) {
    const cl = rows[0], ht = rows[rows.length - 1];
    cleanEl.select('.kpi-value').classed('kpi-state-name', true).text(cl.name);
    cleanEl.select('.kpi-delta').attr('class', 'kpi-delta good')
      .text(`${d3.format('.1f')(cl.mean)} µg/m³ · cleanest air`);
    cleanEl.on('click', () => toggleStateSelection(cl.name));

    hotEl.select('.kpi-value').classed('kpi-state-name', true).text(ht.name);
    hotEl.select('.kpi-delta').attr('class', 'kpi-delta bad')
      .text(`${d3.format('.1f')(ht.mean)} µg/m³ · heaviest load`);
    hotEl.on('click', () => toggleStateSelection(ht.name));
  } else {
    cleanEl.select('.kpi-value').text('—');
    hotEl.select('.kpi-value').text('—');
  }
}

// ── Animated count-up for KPI values ─────────────────────────
function _countUp(sel, target, fmt) {
  const format = d3.format(fmt);
  if (target == null) { sel.text('—'); return; }
  const node = sel.node();
  const prev = node.__kpiVal;
  node.__kpiVal = target;
  if (prev == null || Math.abs(target - prev) < 1e-9) {
    sel.text(format(target));
    return;
  }
  sel.transition()
    .duration(700)
    .tween('text', function () {
      const i = d3.interpolateNumber(prev, target);
      return t => { sel.text(format(i(t))); };
    });
}

// ── Static national sparkline (full record) per metric ───────
function _spark(svgSel, key, m) {
  if (!seriesCache[key]) {
    const roll = d3.rollup(state.data, v => d3.mean(v, d => d[m.field]), d => d.Date);
    seriesCache[key] = Array.from(roll, ([Date, v]) => ({ Date, v }))
      .filter(d => d.v != null && !isNaN(d.v))
      .sort((a, b) => a.Date - b.Date);
  }
  const series = seriesCache[key];
  const svg = svgSel.html(null);
  if (!series.length) return;

  const W = 150, H = 34;
  const x = d3.scaleUtc().domain(d3.extent(series, d => d.Date)).range([2, W - 2]);
  const y = d3.scaleLinear().domain(d3.extent(series, d => d.v)).range([H - 4, 4]);
  const line = d3.line().curve(d3.curveMonotoneX).x(d => x(d.Date)).y(d => y(d.v));

  svg.append('path').attr('d', line(series))
    .attr('fill', 'none').attr('stroke', 'var(--accent)')
    .attr('stroke-width', 1.4).attr('stroke-opacity', 0.9);
  const last = series[series.length - 1];
  svg.append('circle').attr('cx', x(last.Date)).attr('cy', y(last.v))
    .attr('r', 2.4).attr('fill', 'var(--highlight)');
}