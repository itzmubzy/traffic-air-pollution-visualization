// map.js — Macro view "Where": choropleth + bubble modes,
// top-state annotation pointer, rich tooltip & callout chips
import { state, metrics, toggleStateSelection, setHoveredState, subscribeHover } from './state.js';
import { colorScale, metricStateMax, addGlow, CAT_COLORS } from './colors.js';
import { stateAbbr, fmtMetric } from './utils.js';
import { setInsight } from './insights.js';

const width = 975, height = 610;
let svg, path, tooltip, us, mapMode = 'choropleth';
let gStates, gMesh, gBubbles, gAnno;
let glowMain, glowSel;
let firstRender = true;

export async function createMap(containerId) {
  path = d3.geoPath();
  _modeButtons();

  svg = d3.select(containerId).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('style', 'max-width:100%;height:auto;display:block;margin:0 auto;');

  const defs = svg.append('defs');
  glowMain = addGlow(defs, 'map-glow', '#4e9ff5', 4);
  glowSel = addGlow(defs, 'map-glow-sel', '#f0854a', 5);

  gStates = svg.append('g').attr('class', 'states');
  gBubbles = svg.append('g').attr('class', 'bubbles');
  gMesh = svg.append('path').attr('class', 'state-borders');
  gAnno = svg.append('g').attr('class', 'map-anno');

  tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip map-tooltip')
    .style('opacity', 0);

  subscribeHover(hoveredName => {
    if (mapMode === 'choropleth') {
      gStates.selectAll('path')
        .attr('stroke', d => {
          const name = d.properties.name;
          if (state.selectedStates.includes(name)) return '#f0854a';
          if (hoveredName === name) return '#fff';
          return 'none';
        })
        .attr('stroke-width', d => {
          const name = d.properties.name;
          if (state.selectedStates.includes(name)) return 1.5;
          if (hoveredName === name) return 1.2;
          return 0;
        })
        .attr('filter', d => {
          const name = d.properties.name;
          if (state.selectedStates.includes(name)) return glowSel;
          if (hoveredName === name) return glowMain;
          return null;
        });
    } else {
      gBubbles.selectAll('circle')
        .attr('fill-opacity', d => (hoveredName === d.properties.name || state.selectedStates.includes(d.properties.name)) ? 0.9 : 0.55)
        .attr('stroke', d => (hoveredName === d.properties.name || state.selectedStates.includes(d.properties.name)) ? '#f0854a' : 'rgba(255,255,255,0.4)');
    }
  });

  us = await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json');

  gMesh
    .datum(topojson.mesh(us, us.objects.states, (a, b) => a !== b))
    .attr('fill', 'none')
    .attr('stroke', 'rgba(226,232,240,0.13)')
    .attr('stroke-linejoin', 'round')
    .attr('d', path);

  updateMap(state);
}

function _modeButtons() {
  const host = document.getElementById('map-mode');
  if (!host) return;
  host.innerHTML = '';
  [['choropleth', 'Color fill'], ['bubble', 'Bubbles']].forEach(([val, label]) => {
    const b = document.createElement('button');
    b.className = 'map-mode-btn' + (val === mapMode ? ' is-active' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      mapMode = val;
      host.querySelectorAll('.map-mode-btn').forEach(x => x.classList.remove('is-active'));
      b.classList.add('is-active');
      updateMap(state);
    });
    host.appendChild(b);
  });
}

export function updateMap(s) {
  if (!us) return;
  const metric = metrics[s.selectedMetric];
  const labelEl = document.getElementById('map-metric-label');
  if (labelEl) labelEl.textContent = metric.label.toLowerCase();

  // Window filter only — map always shows all states; selection just dims
  const win = s.data.filter(d =>
    (!s.startDate || d.Date >= s.startDate) &&
    (!s.endDate || d.Date <= s.endDate));

  const perState = d3.rollup(win, v => ({
    value: d3.mean(v, d => d[metric.field]),
    traffic: d3.mean(v, d => d.Avg_Daily_Traffic),
    pm25: d3.mean(v, d => d.Avg_PM2_5),
    aqi: d3.mean(v, d => d.Avg_AQI)
  }), d => d.State_Name);

  const ranked = Array.from(perState, ([name, v]) => ({ name, ...v }))
    .filter(d => d.value != null && !isNaN(d.value))
    .sort((a, b) => b.value - a.value);
  const rankOf = new Map(ranked.map((d, i) => [d.name, i + 1]));

  const features = topojson.feature(us, us.objects.states).features;
  const scale = colorScale(s.selectedMetric, s.data);
  const hasSel = s.selectedStates.length > 0;
  const isSel = name => s.selectedStates.includes(name);
  const opacityOf = name => (!hasSel || isSel(name)) ? 1 : 0.16;
  const valueOf = name => {
    const r = perState.get(name);
    return r && r.value != null && !isNaN(r.value) ? r.value : null;
  };

  if (mapMode === 'choropleth') {
    gBubbles.selectAll('*').remove();
    gStates.selectAll('path')
      .data(features, d => d.properties.name)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const v = valueOf(d.properties.name);
        return v == null ? CAT_COLORS.noData : scale(v);
      })
      .attr('stroke', d => isSel(d.properties.name) ? '#f0854a' : 'none')
      .attr('stroke-width', d => isSel(d.properties.name) ? 1.2 : 0)
      .attr('opacity', d => opacityOf(d.properties.name))
      .attr('filter', d => isSel(d.properties.name) ? glowSel : null)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', d => `${d.properties.name}: ${valueOf(d.properties.name) != null ? fmtMetric(metric, valueOf(d.properties.name)) : 'No data'}`)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        const name = d.properties.name;
        setHoveredState(name);
        d3.select(this)
          .attr('stroke', isSel(name) ? '#f0854a' : '#fff')
          .attr('stroke-width', 1.2)
          .attr('filter', isSel(name) ? glowSel : glowMain)
          .raise();
        _tip(event, name, valueOf(name), rankOf, ranked.length, perState, metric);
      })
      .on('mouseleave', function (event, d) {
        setHoveredState(null);
        const name = d.properties.name;
        d3.select(this)
          .attr('stroke', isSel(name) ? '#f0854a' : 'none')
          .attr('stroke-width', isSel(name) ? 1.2 : 0)
          .attr('filter', isSel(name) ? glowSel : null);
        tooltip.style('opacity', 0);
      })
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleStateSelection(d.properties.name);
        }
      })
      .on('click', (event, d) => toggleStateSelection(d.properties.name));
    if (firstRender) {
      gStates.selectAll('path')
        .attr('opacity', 0)
        .transition().duration(700)
        .attr('opacity', d => opacityOf(d.properties.name));
    }
    gMesh.raise();
  } else {
    const maxV = metricStateMax(s.selectedMetric, s.data);
    const radius = d3.scaleSqrt().domain([0, maxV]).range([0, 42]);

    gStates.selectAll('path')
      .data(features, d => d.properties.name)
      .join('path')
      .attr('d', path)
      .attr('fill', '#121a2d')
      .attr('stroke', 'rgba(148,163,184,0.10)')
      .attr('opacity', d => opacityOf(d.properties.name))
      .on('click', (event, d) => toggleStateSelection(d.properties.name));

    gMesh.raise();
    gBubbles.raise();

    gBubbles.selectAll('circle')
      .data(features, d => d.properties.name)
      .join('circle')
      .attr('transform', d => `translate(${path.centroid(d)})`)
      .attr('fill', d => {
        const v = valueOf(d.properties.name);
        return v == null ? CAT_COLORS.noData : scale(v);
      })
      .attr('fill-opacity', 0.55)
      .attr('stroke', d => isSel(d.properties.name) ? '#f0854a' : 'rgba(255,255,255,0.4)')
      .attr('stroke-width', d => isSel(d.properties.name) ? 1.6 : 0.6)
      .attr('filter', d => isSel(d.properties.name) ? glowSel : null)
      .attr('tabindex', 0)
      .style('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        setHoveredState(d.properties.name);
        d3.select(this).attr('fill-opacity', 0.85).attr('filter', glowMain);
        _tip(event, d.properties.name, valueOf(d.properties.name), rankOf, ranked.length, perState, metric);
      })
      .on('mouseleave', function (event, d) {
        setHoveredState(null);
        const name = d.properties.name;
        d3.select(this)
          .attr('fill-opacity', 0.55)
          .attr('filter', isSel(name) ? glowSel : null)
          .attr('stroke', isSel(name) ? '#f0854a' : 'rgba(255,255,255,0.4)')
          .attr('stroke-width', isSel(name) ? 1.6 : 0.6);
        tooltip.style('opacity', 0);
      })
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleStateSelection(d.properties.name);
        }
      })
      .on('click', (event, d) => toggleStateSelection(d.properties.name))
      .transition().duration(450)
      .attr('r', d => {
        const v = valueOf(d.properties.name);
        return v == null ? 0 : radius(v);
      });
    if (firstRender) {
      gBubbles.selectAll('circle')
        .attr('opacity', 0)
        .transition().duration(700).delay((d, i) => i * 4)
        .attr('opacity', 1);
    }
  }

  _annotate(ranked, features, metric);
  _callouts(ranked, metric);
  firstRender = false;
}

// ── Annotation pointer: top state in the current window ─────
function _annotate(ranked, features, metric) {
  gAnno.html('');
  if (!ranked.length) return;
  const top = ranked[0];
  const f = features.find(d => d.properties.name === top.name);
  if (!f) return;
  const [cx, cy] = path.centroid(f);
  const abbr = stateAbbr[top.name] || top.name;
  const right = cx > width * 0.55;
  const lx = right ? cx - 24 : cx + 24;
  const ly = Math.max(cy - 42, 22);

  gAnno.append('circle')
    .attr('cx', cx).attr('cy', cy).attr('r', 9)
    .attr('fill', 'none').attr('stroke', '#f0854a')
    .attr('stroke-width', 1).attr('class', 'anno-pulse');
  gAnno.append('circle')
    .attr('cx', cx).attr('cy', cy).attr('r', 3.2).attr('fill', '#f0854a');
  gAnno.append('line')
    .attr('x1', cx).attr('y1', cy - 6)
    .attr('x2', lx).attr('y2', ly + 8)
    .attr('stroke', 'rgba(240,133,74,0.6)').attr('stroke-width', 1);
  gAnno.append('text')
    .attr('class', 'anno-label')
    .attr('x', lx).attr('y', ly + 12)
    .attr('text-anchor', right ? 'end' : 'start')
    .text(`${abbr} · #1 · ${fmtMetric(metric, top.value)}`);
}

// ── Rich tooltip with Health Badges & Benchmark Context ──────
function _tip(event, name, value, rankOf, nValid, perState, metric) {
  const r = perState.get(name) || {};
  const rk = rankOf.get(name);
  const abbr = stateAbbr[name] ? ` (${stateAbbr[name]})` : '';
  
  // Benchmark assessment
  let healthBadge = '';
  if (r.pm25 != null) {
    if (r.pm25 <= 9.0) {
      healthBadge = `<span class="tip-badge good">Meets EPA Standard (≤9 µg/m³)</span>`;
    } else if (r.pm25 <= 15.0) {
      healthBadge = `<span class="tip-badge warning">Moderate (9–15 µg/m³)</span>`;
    } else {
      healthBadge = `<span class="tip-badge bad">Elevated Risk (&gt;15 µg/m³)</span>`;
    }
  }

  tooltip.style('opacity', 1).html(`
    <div class="tip-header">
      <strong>${name}${abbr}</strong>
      ${healthBadge}
    </div>
    <div class="tip-metric-highlight">
      ${metric.label}: <b>${value != null ? fmtMetric(metric, value) : 'No data'}</b>
      ${rk ? `<span class="tip-rank">· Rank #${rk} of ${nValid}</span>` : ''}
    </div>
    <div class="tip-grid">
      <span class="tip-row">🚗 <b>Traffic:</b> ${r.traffic != null ? d3.format(',.0f')(r.traffic) + ' veh/day' : '—'}</span>
      <span class="tip-row">🌫️ <b>PM2.5:</b> ${r.pm25 != null ? d3.format('.1f')(r.pm25) + ' µg/m³' : '—'}</span>
      <span class="tip-row">📊 <b>AQI:</b> ${r.aqi != null ? d3.format('.0f')(r.aqi) : '—'}</span>
    </div>
    <span class="tip-hint">👆 Click state to isolate &amp; compare across all charts</span>
  `)
    .style('left', (event.pageX + 16) + 'px')
    .style('top', (event.pageY - 16) + 'px');
}

// ── Insight chips → Story Insights side panel ────────────────
function _callouts(ranked, metric) {
  let html;
  if (!ranked.length) {
    html = `<div class="callout-chip"><div class="callout-meaning">No data in the selected window — widen the time range in the controls above.</div></div>`;
  } else {
    const top = ranked[0];
    const abbr = stateAbbr[top.name] || top.name;
    const top5 = ranked.slice(0, 5);
    const top5Avg = d3.mean(top5, d => d.value);
    const allAvg = d3.mean(ranked, d => d.value);
    const pct = allAvg ? (top5Avg / allAvg - 1) * 100 : 0;

    html = `
    <div class="callout-chip">
      <div class="callout-head"><span class="callout-pin">📍</span>${top.name} (${abbr}) leads at <b>&nbsp;${fmtMetric(metric, top.value)}</b></div>
      <div class="callout-meaning"><b>What this means:</b> the highest ${metric.short} in the current window. Click ${abbr} on the map to trace its trend through every chart.</div>
    </div>
    <div class="callout-chip">
      <div class="callout-head"><span class="callout-pin">🗺️</span>Burdens cluster — top 5 average <b>&nbsp;${fmtMetric(metric, top5Avg)}</b></div>
      <div class="callout-meaning"><b>What this means:</b> that's <b>${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%</b> vs the U.S. mean (${fmtMetric(metric, allAvg)}). A few states run consistently hotter — geography and fleet mix matter as much as raw volume.</div>
    </div>`;
  }
  setInsight('map', html);
}