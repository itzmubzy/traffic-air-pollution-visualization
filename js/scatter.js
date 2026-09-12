// scatter.js
import { state, metrics, toggleStateSelection, setHoveredState, subscribeHover } from './state.js';
import { stateAbbr, pearson, fmtMetric } from './utils.js';
import { setInsight } from './insights.js';
import { computeAnomalies, ANOMALY_COLOR, anomalyNameSet } from './anomalies.js';

const margin = { top: 20, right: 30, bottom: 40, left: 50 };
const W = 420, H = 320;

let svg, x, y, xAxis, yAxis, tooltip, gAnno, gTrend, gMedian, gAnomaly;
let currentAnomalies = [];

export function getAnomalies() { return currentAnomalies; }

export function createScatterplot(containerId) {
    const container = d3.select(containerId);

    svg = container.append('svg')
        .attr('width', '100%')
        .attr('viewBox', `0 0 ${W + margin.left + margin.right} ${H + margin.top + margin.bottom}`)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    x = d3.scaleLinear().range([0, W]);
    y = d3.scaleLinear().range([H, 0]);

    // Trendline group behind points
    gTrend = svg.append('g').attr('class', 'scatter-trend');

    // Median crosshair (absorbed from the old quadrant chart):
    // shows how each state compares to the "middle state"
    gMedian = svg.append('g').attr('class', 'scatter-median');
    gMedian.append('line').attr('class', 'median-x')
      .attr('stroke', 'rgba(148,163,184,0.4)').attr('stroke-dasharray', '3,3');
    gMedian.append('line').attr('class', 'median-y')
      .attr('stroke', 'rgba(148,163,184,0.4)').attr('stroke-dasharray', '3,3');
    gMedian.append('text').attr('class', 'median-label med-tl')
      .attr('font-size', '10px').attr('fill', 'var(--text-muted)')
      .attr('text-anchor', 'start').text('↖ quieter & lower');
    gMedian.append('text').attr('class', 'median-label med-tr')
      .attr('font-size', '10px').attr('fill', 'var(--text-muted)')
      .attr('text-anchor', 'end').text('busier & higher ↗');

    xAxis = svg.append('g').attr('transform', `translate(0,${H})`);
    yAxis = svg.append('g');

    svg.append('text').attr('class', 'axis-label x-label')
        .attr('x', W).attr('y', H + 35)
        .attr('text-anchor', 'end').attr('font-size', '11px')
        .attr('fill', 'var(--text-muted)')
        .text('Avg Daily Traffic →');

    svg.append('text').attr('class', 'axis-label y-label')
        .attr('x', 4).attr('y', -6)
        .attr('text-anchor', 'start').attr('font-size', '11px')
        .attr('fill', 'var(--text-muted)');

    gAnno = svg.append('g').attr('class', 'scatter-anno');
    gAnomaly = svg.append('g').attr('class', 'scatter-anomaly');

    tooltip = d3.select('body').select('.scatter-tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div').attr('class', 'tooltip scatter-tooltip').style('opacity', 0);
    }

    subscribeHover(hoveredName => {
        svg.selectAll('.dot')
            .attr('stroke', d => {
                if (state.selectedStates.includes(d.stateName)) return '#fff';
                if (hoveredName === d.stateName) return '#fff';
                return 'none';
            })
            .attr('stroke-width', d => (hoveredName === d.stateName || state.selectedStates.includes(d.stateName)) ? 2 : 0)
            .attr('r', d => {
                if (hoveredName === d.stateName) return 8;
                return state.selectedStates.includes(d.stateName) ? 7 : 5;
            })
            .attr('fill-opacity', d => {
                if (hoveredName === d.stateName) return 1.0;
                if (!state.selectedStates.length) return 0.75;
                return state.selectedStates.includes(d.stateName) ? 0.95 : 0.15;
            });
    });

    updateScatterplot(state);
}

export function updateScatterplot(currentState) {
    if (!svg) return;

    const timeFiltered = currentState.data.filter(d =>
        (!currentState.startDate || d.Date >= currentState.startDate) &&
        (!currentState.endDate   || d.Date <= currentState.endDate)
    );

    const rolled = d3.rollup(
        timeFiltered,
        v => ({
            traffic:   d3.mean(v, d => d.Avg_Daily_Traffic),
            metric:    d3.mean(v, d => d[metrics[currentState.selectedMetric].field]),
            pm25:      d3.mean(v, d => d.Avg_PM2_5),
            aqi:       d3.mean(v, d => d.Avg_AQI),
            stateName: v[0].State_Name
        }),
        d => d.State_Name
    );

    const data = Array.from(rolled.values())
        .filter(d => d.traffic != null && !isNaN(d.traffic) && d.metric != null && !isNaN(d.metric));

    if (!data.length) return;

    _annotate(data);
    _callouts(data, currentState);
    currentAnomalies = computeAnomalies(data);

    x.domain([0, d3.max(data, d => d.traffic)]).nice();
    y.domain([0, d3.max(data, d => d.metric)]).nice();

    xAxis.transition().duration(400).call(d3.axisBottom(x).ticks(5)
        .tickFormat(d3.format('.2s')))
        .call(g => g.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', '10px'))
        .call(g => g.select('.domain').attr('stroke', 'var(--border-strong)'));
    yAxis.transition().duration(400).call(d3.axisLeft(y).ticks(5))
        .call(g => g.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', '10px'))
        .call(g => g.select('.domain').remove());

    const metric = metrics[currentState.selectedMetric];
    svg.select('.y-label').text(`↑ ${metric.label}`);

    // Linear regression trendline (OLS)
    _drawTrendline(data);

    // Median crosshair — "compared to the middle state" (absorbed quadrant view)
    const xMed = d3.median(data, d => d.traffic);
    const yMed = d3.median(data, d => d.metric);
    gMedian.select('.median-x')
      .attr('x1', x(xMed)).attr('x2', x(xMed)).attr('y1', 0).attr('y2', H);
    gMedian.select('.median-y')
      .attr('x1', 0).attr('x2', W).attr('y1', y(yMed)).attr('y2', y(yMed));
    gMedian.select('.med-tl').attr('x', 6).attr('y', 12);
    gMedian.select('.med-tr').attr('x', W - 6).attr('y', 12);

    const isSelected = name => currentState.selectedStates.includes(name);
    const hasSelection = currentState.selectedStates.length > 0;

    const circles = svg.selectAll('.dot').data(data, d => d.stateName);

    const isAnomaly = anomalyNameSet(currentAnomalies);

    circles.enter().append('circle')
        .attr('class', 'dot')
        .attr('cx', d => x(d.traffic))
        .attr('cy', d => y(d.metric))
        .attr('r', 0)
        .attr('fill', d => isAnomaly.has(d.stateName) ? ANOMALY_COLOR : 'var(--accent)')
        .attr('fill-opacity', 0.75)
        .attr('stroke', 'none')
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-label', d => `${d.stateName}: Traffic ${d3.format(',.0f')(d.traffic)}, ${metric.label} ${fmtMetric(metric, d.metric)}`)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            setHoveredState(d.stateName);
            d3.select(this).attr('stroke', '#fff').attr('stroke-width', 2).attr('fill-opacity', 1).attr('r', 8);
            _tip(event, d, metric);
        })
        .on('mouseleave', function(event, d) {
            setHoveredState(null);
            d3.select(this)
                .attr('stroke', isSelected(d.stateName) ? '#fff' : 'none')
                .attr('stroke-width', isSelected(d.stateName) ? 1.5 : 0)
                .attr('r', isSelected(d.stateName) ? 7 : 5)
                .attr('fill-opacity', !hasSelection || isSelected(d.stateName) ? 0.8 : 0.15);
            tooltip.style('opacity', 0);
        })
        .on('keydown', (event, d) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleStateSelection(d.stateName);
            }
        })
        .on('click', (event, d) => toggleStateSelection(d.stateName))
        .merge(circles)
        .transition().duration(400)
        .attr('cx', d => x(d.traffic))
        .attr('cy', d => y(d.metric))
        .attr('fill', d => isSelected(d.stateName) ? 'var(--highlight)' : isAnomaly.has(d.stateName) ? ANOMALY_COLOR : 'var(--accent)')
        .attr('r', d => isSelected(d.stateName) ? 7 : isAnomaly.has(d.stateName) ? 6.5 : 5)
        .attr('fill-opacity', d => !hasSelection || isSelected(d.stateName) ? 0.8 : 0.15);

    circles.exit().transition().duration(300).attr('r', 0).remove();

    // ── Anomaly accents: pulsing mint ring + "busy but clean" labels ──
    gAnomaly.selectAll('*').remove();
    currentAnomalies.slice(0, 3).forEach(a => {
      const px = x(a.traffic), py = y(a.metric);
      gAnomaly.append('circle')
        .attr('cx', px).attr('cy', py).attr('r', 11)
        .attr('fill', 'none').attr('stroke', ANOMALY_COLOR)
        .attr('stroke-width', 1.2).attr('class', 'anno-pulse')
        .attr('stroke-opacity', 0.9);
      const above = py > 26;
      const tx = Math.min(Math.max(px, 66), W - 66);
      gAnomaly.append('text')
        .attr('class', 'anno-label')
        .attr('fill', ANOMALY_COLOR)
        .attr('x', tx)
        .attr('y', above ? py - 16 : py + 22)
        .attr('text-anchor', 'middle')
        .text(`✦ ${stateAbbr[a.stateName] || a.stateName} · busy but clean`);
    });
}

// ── Trendline Calculation & Drawing ──────────────────────────
function _drawTrendline(data) {
    gTrend.selectAll('*').remove();
    if (data.length < 3) return;

    const xs = data.map(d => d.traffic);
    const ys = data.map(d => d.metric);
    const mx = d3.mean(xs), my = d3.mean(ys);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < xs.length; i++) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) * (xs[i] - mx);
    }
    const slope = sxx !== 0 ? sxy / sxx : 0;
    const intercept = my - slope * mx;

    const xMin = 0;
    const xMax = d3.max(xs);
    const y0 = intercept + slope * xMin;
    const y1 = intercept + slope * xMax;

    gTrend.append('line')
        .attr('x1', x(xMin))
        .attr('y1', y(Math.max(0, y0)))
        .attr('x2', x(xMax))
        .attr('y2', y(Math.max(0, y1)))
        .attr('stroke', 'rgba(78, 159, 245, 0.45)')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5,4');
}

function _tip(event, d, metric) {
    const abbr = stateAbbr[d.stateName] ? ` (${stateAbbr[d.stateName]})` : '';
    tooltip.style('opacity', 1).html(`
        <div class="tip-header">
            <strong>${d.stateName}${abbr}</strong>
        </div>
        <div class="tip-grid">
            <span class="tip-row">🚗 <b>Daily Traffic:</b> ${d3.format(',.0f')(d.traffic)} veh/day</span>
            <span class="tip-row">📈 <b>${metric.label}:</b> ${fmtMetric(metric, d.metric)}</span>
            <span class="tip-row">🌫️ <b>PM2.5:</b> ${d.pm25 != null ? d.pm25.toFixed(1) + ' µg/m³' : '—'}</span>
        </div>
        <span class="tip-hint">Click dot to filter the story</span>
    `).style('left', (event.pageX + 14) + 'px').style('top', (event.pageY - 36) + 'px');
}

// ── Annotation pointers: traffic extreme + metric extreme ────
function _annotate(data) {
    gAnno.selectAll('*').remove();
    if (!data.length) return;
    const metric = metrics[state.selectedMetric];
    const topT = data.reduce((a, b) => b.traffic > a.traffic ? b : a);
    const topM = data.reduce((a, b) => b.metric > a.metric ? b : a);
    const abbr = n => stateAbbr[n] || n;
    _point(topT, `${abbr(topT.stateName)} · busiest roads`, '#7ec8ff', metric);
    if (topM.stateName !== topT.stateName) {
        _point(topM, `${abbr(topM.stateName)} · highest ${metric.short}`, '#f0854a', metric);
    }
}

function _point(d, label, color, metric) {
    const px = x(d.traffic), py = y(d.metric);
    gAnno.append('circle')
        .attr('cx', px).attr('cy', py).attr('r', 9)
        .attr('fill', 'none').attr('stroke', color)
        .attr('stroke-width', 1).attr('class', 'anno-pulse');
    const above = py > 26;
    const tx = Math.min(Math.max(px, 58), W - 58);
    gAnno.append('text')
        .attr('class', 'anno-label')
        .attr('fill', color)
        .attr('x', tx)
        .attr('y', above ? py - 14 : py + 20)
        .attr('text-anchor', 'middle')
        .text(label);
}

// ── Insight chips → Story Insights side panel ────────────────
function _callouts(data, s) {
    let html;
    if (!data.length) {
        html = `<div class="callout-chip"><div class="callout-meaning">Not enough states in the current window to correlate traffic with pollution.</div></div>`;
    } else {
        const metric = metrics[s.selectedMetric];
        const r = pearson(data.map(d => d.traffic), data.map(d => d.metric));
        const absR = r == null ? 0 : Math.abs(r);
        const strength = r == null ? 'cannot be computed here'
            : absR < 0.25 ? 'barely predicts'
            : absR < 0.55 ? 'only moderately tracks'
            : 'strongly tracks';
        const dirTxt = r == null ? '' : (r >= 0 ? 'more traffic ↔ more pollution' : 'more traffic ↔ less pollution');
        const meaning = r == null ? 'Not enough states in the current window to correlate.'
            : absR < 0.25
                ? `Traffic volume ${strength} ${metric.short} — fleet cleanliness and geography dominate the outcome.`
                : absR < 0.55
                    ? `Traffic volume ${strength} ${metric.short} (${dirTxt}) — volume matters, but it isn't destiny.`
                    : `Traffic volume ${strength} ${metric.short} (${dirTxt}) — where roads are busiest, air is measurably worse.`;

        const topT = data.reduce((a, b) => b.traffic > a.traffic ? b : a);
        const n = data.length;
        const sortedM = [...data].sort((a, b) => b.metric - a.metric);
        const rankM = new Map(sortedM.map((d, i) => [d.stateName, i + 1]));
        const rankOfTop = rankM.get(topT.stateName);
        const midRank = Math.ceil(n / 2);
        const topMeaning = rankOfTop == null ? 'Not enough data.'
            : rankOfTop <= midRank
                ? `<b>What this means:</b> ${topT.stateName} carries the heaviest traffic <i>and</i> ranks #${rankOfTop} of ${n} on ${metric.short} — volume and pollution compound here.`
                : `<b>What this means:</b> ${topT.stateName} carries the heaviest traffic yet ranks #${rankOfTop} of ${n} on ${metric.short} — busy roads don't have to mean dirty air when fleets run clean.`;

        html = `
        <div class="callout-chip">
            <div class="callout-head"><span class="callout-pin">📐</span>r = ${r == null ? '—' : r.toFixed(2)} · traffic ↔ ${metric.short}</div>
            <div class="callout-meaning">${meaning}</div>
        </div>
        <div class="callout-chip">
            <div class="callout-head"><span class="callout-pin">🚗</span>${topT.stateName} tops traffic at ${d3.format(',.0f')(topT.traffic)} veh/day</div>
            <div class="callout-meaning">${topMeaning}</div>
        </div>`;

        // In-page takeaway under the scatter plot
        const tk = document.getElementById('scatter-takeaway');
        if (tk) {
            const u = metric.unit ? ` ${metric.unit}` : '';
            const f = d3.format(metric.fmt);
            tk.innerHTML = `<b>What this means:</b> traffic and ${metric.short} move together only ${absR < 0.25 ? 'weakly' : absR < 0.55 ? 'moderately' : 'strongly'} here — ${topT.stateName} carries the heaviest traffic yet ${rankOfTop <= midRank ? `still ranks #${rankOfTop} of ${n} on ${metric.short} (${f(topT.metric)}${u})` : `ranks #${rankOfTop} of ${n} on ${metric.short} (${f(topT.metric)}${u}) — busy roads don't have to mean dirtier air`}. Association, not proof of cause.`;
        }
    }
    setInsight('scatter', html);
}
