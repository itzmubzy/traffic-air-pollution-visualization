// quadrant.js
import { state, metrics, toggleStateSelection, setHoveredState, subscribeHover } from './state.js';
import { stateAbbr, fmtMetric } from './utils.js';
import { setInsight } from './insights.js';

let svg, x, y, xAxis, yAxis, tooltip, width, height, currentData;
let xMedianLine, yMedianLine;
let gTint, cornerTL, cornerTR, cornerBL, cornerBR, medianXLabel, medianYLabel;

const margin = { top: 20, right: 30, bottom: 40, left: 50 };
width = 500 - margin.left - margin.right;
height = 400 - margin.top - margin.bottom;

export function createQuadrant(containerId) {
    const container = d3.select(containerId);

    svg = container.append("svg")
        .attr("width", "100%")
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    x = d3.scaleLinear().range([0, width]);
    y = d3.scaleLinear().range([height, 0]);

    xAxis = svg.append("g").attr("transform", `translate(0,${height})`);
    yAxis = svg.append("g");

    // Quadrant tints (rendered behind everything)
    gTint = svg.append("g").attr("class", "quad-tints");
    gTint.lower();

    // Median lines
    xMedianLine = svg.append("line").attr("stroke", "rgba(148,163,184,0.55)").attr("stroke-dasharray", "4").attr("y1", 0).attr("y2", height);
    yMedianLine = svg.append("line").attr("stroke", "rgba(148,163,184,0.55)").attr("stroke-dasharray", "4").attr("x1", 0).attr("x2", width);

    // Quadrant corner labels + median captions (updated per metric)
    cornerTL = svg.append("text").attr("class", "quad-corner").attr("x", 6).attr("y", 14).attr("text-anchor", "start");
    cornerTR = svg.append("text").attr("class", "quad-corner").attr("x", width - 6).attr("y", 14).attr("text-anchor", "end");
    cornerBL = svg.append("text").attr("class", "quad-corner").attr("x", 6).attr("y", height - 8).attr("text-anchor", "start");
    cornerBR = svg.append("text").attr("class", "quad-corner").attr("x", width - 6).attr("y", height - 8).attr("text-anchor", "end");
    medianXLabel = svg.append("text").attr("class", "quad-med").attr("text-anchor", "start");
    medianYLabel = svg.append("text").attr("class", "quad-med").attr("text-anchor", "end");

    // Labels
    svg.append("text")
        .attr("x", width)
        .attr("y", height - 10)
        .attr("text-anchor", "end")
        .attr("font-size", "12px")
        .text("Avg PM2.5 →");

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("x", 0)
        .attr("y", -10)
        .attr("text-anchor", "start")
        .attr("font-size", "12px")
        .text("Selected Metric");

    tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    subscribeHover(hoveredName => {
        svg.selectAll(".quad-dot")
            .attr("stroke", d => {
                if (state.selectedStates.includes(d.stateName)) return "#fff";
                if (hoveredName === d.stateName) return "#fff";
                return "rgba(7,10,19,0.9)";
            })
            .attr("stroke-width", d => (hoveredName === d.stateName || state.selectedStates.includes(d.stateName)) ? 2 : 1)
            .attr("r", d => {
                if (hoveredName === d.stateName) return 8;
                return state.selectedStates.includes(d.stateName) ? 7 : 5;
            })
            .attr("opacity", d => {
                if (hoveredName === d.stateName) return 1.0;
                if (!state.selectedStates.length) return 0.85;
                return state.selectedStates.includes(d.stateName) ? 1.0 : 0.15;
            });
    });

    updateQuadrant(state);
}

export function updateQuadrant(currentState) {
    const timeFilteredData = currentState.data.filter(d => {
        return (!currentState.startDate || d.Date >= currentState.startDate) &&
               (!currentState.endDate || d.Date <= currentState.endDate);
    });

    const stateData = d3.rollup(
        timeFilteredData,
        v => ({
            pm25: d3.mean(v, d => d.Avg_PM2_5),
            metric: d3.mean(v, d => d[metrics[currentState.selectedMetric].field]),
            traffic: d3.mean(v, d => d.Avg_Daily_Traffic),
            stateName: v[0].State_Name
        }),
        d => d.State_Name
    );

    currentData = Array.from(stateData.values())
        .filter(d => d.pm25 != null && !isNaN(d.pm25) && d.metric != null && !isNaN(d.metric));

    if(currentData.length === 0) return;

    x.domain([0, d3.max(currentData, d => d.pm25)]).nice();
    y.domain([0, d3.max(currentData, d => d.metric)]).nice();

    xAxis.transition().duration(500).call(d3.axisBottom(x).ticks(6));
    yAxis.transition().duration(500).call(d3.axisLeft(y).ticks(6));

    svg.select(".y-axis-label").text(`↑ ${metrics[currentState.selectedMetric].label}`);

    // Compute medians for quadrants
    const xMed = d3.median(currentData, d => d.pm25);
    const yMed = d3.median(currentData, d => d.metric);
    const mShort = metrics[currentState.selectedMetric].short;
    const mFmt = d3.format(metrics[currentState.selectedMetric].fmt);

    xMedianLine.transition().duration(500).attr("x1", x(xMed)).attr("x2", x(xMed));
    yMedianLine.transition().duration(500).attr("y1", y(yMed)).attr("y2", y(yMed));

    // Quadrant tints — double burden (top-right) vs benchmark (bottom-left)
    gTint.selectAll("rect")
        .data([
            { x: x(xMed), y: 0, w: width - x(xMed), h: y(yMed), c: "rgba(248,113,113,0.07)" },
            { x: 0, y: y(yMed), w: x(xMed), h: height - y(yMed), c: "rgba(52,211,153,0.07)" }
        ])
        .join("rect")
        .attr("x", d => d.x).attr("y", d => d.y)
        .attr("width", d => d.w).attr("height", d => d.h)
        .attr("fill", d => d.c);

    // Corner labels & median captions
    cornerTL.text(`high ${mShort} · low PM2.5`);
    cornerTR.text(`high ${mShort} · high PM2.5`);
    cornerBL.text(`low ${mShort} · low PM2.5`);
    cornerBR.text(`low ${mShort} · high PM2.5`);
    medianXLabel.attr("x", x(xMed) + 4).attr("y", 12).text(`median PM2.5 ${xMed.toFixed(1)}`);
    medianYLabel.attr("x", width - 4).attr("y", y(yMed) - 6).text(`median ${mShort} ${mFmt(yMed)}`);

    _callouts(currentData, xMed, yMed, currentState);

    const circles = svg.selectAll(".quad-dot")
        .data(currentData, d => d.stateName);

    const circlesEnter = circles.enter().append("circle")
        .attr("class", "quad-dot")
        .attr("r", 5)
        .attr("cx", d => x(d.pm25))
        .attr("cy", d => y(d.metric))
        .attr("fill", d => {
            if (currentState.selectedStates.includes(d.stateName)) return "#f0854a";
            // Color by quadrant
            if (d.pm25 > xMed && d.metric > yMed) return "#f87171"; // High-High burden
            if (d.pm25 < xMed && d.metric < yMed) return "#34d399"; // Low-Low benchmark
            return "#fbbf24"; // Mixed
        })
        .attr("stroke", "rgba(7,10,19,0.9)")
        .attr("stroke-width", 1)
        .attr("opacity", 0)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => `${d.stateName}: PM2.5 ${d.pm25.toFixed(1)}, ${mShort} ${mFmt(d.metric)}`)
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("keydown", (event, d) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleStateSelection(d.stateName);
            }
        })
        .on("click", (event, d) => toggleStateSelection(d.stateName));

    circlesEnter.merge(circles)
        .transition().duration(500)
        .attr("cx", d => x(d.pm25))
        .attr("cy", d => y(d.metric))
        .attr("opacity", d => {
            if (currentState.selectedStates.length === 0) return 0.85;
            return currentState.selectedStates.includes(d.stateName) ? 1.0 : 0.12;
        })
        .attr("fill", d => {
            if (currentState.selectedStates.includes(d.stateName)) return "#f0854a";
            if (d.pm25 > xMed && d.metric > yMed) return "#f87171"; 
            if (d.pm25 < xMed && d.metric < yMed) return "#34d399"; 
            return "#fbbf24";
        })
        .attr("r", d => currentState.selectedStates.includes(d.stateName) ? 7 : 5);

    circles.exit().transition().duration(500).attr("opacity", 0).remove();
}

function mouseover(event, d) {
    setHoveredState(d.stateName);
    d3.select(this).attr("stroke", "#fff").attr("stroke-width", 2);
    tooltip.transition().duration(100).style("opacity", 1);
}

function mousemove(event, d) {
    const metric = metrics[state.selectedMetric];
    const abbr = stateAbbr[d.stateName] ? ` (${stateAbbr[d.stateName]})` : '';
    tooltip.html(`
        <div class="tip-header">
            <strong>${d.stateName}${abbr}</strong>
        </div>
        <div class="tip-grid">
            <span class="tip-row">🌫️ <b>PM2.5:</b> ${d.pm25.toFixed(2)} µg/m³</span>
            <span class="tip-row">📊 <b>${metric.label}:</b> ${fmtMetric(metric, d.metric)}</span>
            ${d.traffic != null ? `<span class="tip-row">🚗 <b>Daily Traffic:</b> ${d3.format(',.0f')(d.traffic)} veh/day</span>` : ''}
        </div>
        <span class="tip-hint">Click dot to filter the story</span>
    `)
    .style("left", (event.pageX + 12) + "px")
    .style("top", (event.pageY - 28) + "px");
}

function mouseleave(event, d) {
    setHoveredState(null);
    d3.select(this).attr("stroke", "rgba(7,10,19,0.9)").attr("stroke-width", 1);
    tooltip.transition().duration(200).style("opacity", 0);
}

// ── Insight chips → Story Insights side panel ────────────────
function _callouts(currentData, xMed, yMed, currentState) {
    const m = metrics[currentState.selectedMetric];
    let html;
    if (!currentData.length) {
        html = `<div class="callout-chip"><div class="callout-meaning">No states in the current window — widen the time range to see the quadrant breakdown.</div></div>`;
    } else {
        const count = f => currentData.filter(f).length;
        const hh = count(d => d.pm25 > xMed && d.metric > yMed);
        const ll = count(d => d.pm25 < xMed && d.metric < yMed);
        const tl = count(d => d.pm25 < xMed && d.metric > yMed);
        const br = count(d => d.pm25 > xMed && d.metric < yMed);
        const n = currentData.length;
        const pct = v => n ? ` (${Math.round(v / n * 100)}%)` : "";
        const plural = v => v === 1 ? "state" : "states";

        html = `
        <div class="callout-chip">
            <div class="callout-head chip-hh"><span class="callout-pin">🔴</span>Top-right: ${hh} ${plural(hh)}${pct(hh)} — high ${m.short} + high PM2.5</div>
            <div class="callout-meaning"><b>What this means:</b> a double burden — dirtier fleets and heavier particulate pollution compound. Prime targets for clean-fleet policy.</div>
        </div>
        <div class="callout-chip">
            <div class="callout-head chip-ll"><span class="callout-pin">🟢</span>Bottom-left: ${ll} ${plural(ll)}${pct(ll)} — low on both</div>
            <div class="callout-meaning"><b>What this means:</b> the benchmark — cleaner-running fleets pair with cleaner air. Proof the two can go together.</div>
        </div>
        <div class="callout-chip">
            <div class="callout-head chip-mix"><span class="callout-pin">🟡</span>Mixed: ${tl + br} ${plural(tl + br)}${pct(tl + br)} — one lever out of place</div>
            <div class="callout-meaning"><b>What this means:</b> these states run clean on one axis but not the other — targeted fixes (fleet turnover or non-traffic sources) apply.</div>
        </div>`;
    }
    setInsight('quadrant', html);
}
