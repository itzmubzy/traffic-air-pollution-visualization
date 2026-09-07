// utils.js

export function aggregateStateYear(data) {
    // Rollup averages by State then Year
    const grouped = d3.rollup(
        data,
        v => ({
            Avg_Daily_Traffic: d3.mean(v, d => d.Avg_Daily_Traffic),
            Avg_PM2_5: d3.mean(v, d => d.Avg_PM2_5),
            Avg_AQI: d3.mean(v, d => d.Avg_AQI),
            Emission_Efficiency_Index: d3.mean(v, d => d.Emission_Efficiency_Index)
        }),
        d => d.State_Name,
        d => d.Year
    );

    const result = [];
    for (const [state, yearMap] of grouped) {
        for (const [year, metrics] of yearMap) {
            result.push({ State_Name: state, Year: year, ...metrics });
        }
    }
    return result;
}

export function aggregateNationalTimeline(data) {
    // Rollup averages across all states per Date
    const grouped = d3.rollup(
        data,
        v => ({
            Avg_Daily_Traffic: d3.mean(v, d => d.Avg_Daily_Traffic),
            Avg_PM2_5: d3.mean(v, d => d.Avg_PM2_5),
            Avg_AQI: d3.mean(v, d => d.Avg_AQI),
            Emission_Efficiency_Index: d3.mean(v, d => d.Emission_Efficiency_Index)
        }),
        d => d.Date
    );

    const result = Array.from(grouped, ([date, metrics]) => ({ Date: date, ...metrics }));
    result.sort((a, b) => d3.ascending(a.Date, b.Date));
    return result;
}

export function filterData(data, selectedStates, startDate, endDate) {
    return data.filter(d => {
        const stateMatch = selectedStates.length === 0 || selectedStates.includes(d.State_Name);
        const dateMatch = (!startDate || d.Date >= startDate) && (!endDate || d.Date <= endDate);
        return stateMatch && dateMatch;
    });
}


// ── Story helpers: abbreviations, formatting, stats ─────────
export const stateAbbr = {
  "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO",
  "Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA",
  "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS",
  "Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA",
  "Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT",
  "Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM",
  "New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK",
  "Oregon":"OR","Pennsylvania":"PA","Puerto Rico":"PR","Rhode Island":"RI","South Carolina":"SC",
  "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA",
  "Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"
};

export function fmtMetric(metric, v) {
  if (v == null || isNaN(v)) return "N/A";
  const s = d3.format(metric.fmt)(v);
  return metric.unit ? `${s} ${metric.unit}` : s;
}

export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = d3.mean(xs), my = d3.mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  return den ? sxy / den : null;
}

export function seasonMeaning(month0) {
  if (month0 === 11 || month0 === 0 || month0 === 1)
    return "cold-air inversions trap emissions near the ground — pollution peaks cluster in winter.";
  if (month0 >= 5 && month0 <= 7)
    return "summer heat cooks traffic emissions into ground-level ozone, and wildfire smoke can stack on top.";
  if (month0 === 2 || month0 === 3 || month0 === 9)
    return "mild shoulder-season weather disperses pollutants fastest — usually the cleanest stretch of the year.";
  return "transitional weather lets pollutants build up and clear out quickly — a middle-of-the-road month.";
}