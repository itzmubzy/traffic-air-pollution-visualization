// anomalies.js — shared "outlier state" detection + bite-sized why-takeaways.
// An anomaly = a state whose traffic volume is well above average while its
// pollution metric stays comparatively low (high traffic + clean air).

export const ANOMALY_COLOR = '#34d399'; // distinct mint accent (vs blue/orange chart palette)

// ── Why-takeaways for states that tend to show the busy-but-clean pattern ──
export const ANOMALY_NOTES = {
  'Washington': {
    icon: '🌲',
    title: 'Washington — busy roads, mountain air',
    why: 'Pacific storms constantly flush air west→east, over 50% of its electricity is carbon-free hydropower, and its vehicle fleet is among the cleanest in the U.S. (strict emissions rules + strong EV adoption).'
  },
  'Oregon': {
    icon: '🌬️',
    title: 'Oregon — wind does the housekeeping',
    why: 'Persistent onshore winds push pollutants inland and out, hydropower dominates the grid, and Portland\u2019s tight urban growth boundary keeps driving concentrated on fewer, cleaner corridors.'
  },
  'California': {
    icon: '⚡',
    title: 'California — the busiest state, surprisingly clean per mile',
    why: 'Despite the nation\u2019s heaviest traffic, the strictest vehicle-emission standards in the country, a rapidly electrifying fleet, and coastal sea breezes keep PM2.5 far lower per vehicle than in less-regulated states.'
  },
  'New York': {
    icon: '🚇',
    title: 'New York — trains beat tailpipes',
    why: 'Heavy investment in mass transit means many trips never touch a car: the MTA moves more riders than all other U.S. transit systems combined, and congestion pricing further trims tailpipe emissions.'
  },
  'Massachusetts': {
    icon: '🍁',
    title: 'Massachusetts — dense, short, cleaner trips',
    why: 'Short commutes, a big share of hybrid/EV vehicles, and prevailing Atlantic winds off the coast help dilute particulates despite dense Boston-area traffic.'
  },
  'Vermont': {
    icon: '🌳',
    title: 'Vermont — the forest filter',
    why: 'Nearly 80% tree canopy cover acts as a natural particle filter, and its small, hydro-powered grid means even busy commuter corridors stay low on PM2.5.'
  },
  'Florida': {
    icon: '🏖️',
    title: 'Florida — sea breeze ventilation',
    why: 'Daily sea-breeze circulation vents pollution offshore, and the state runs on relatively little heavy industry — so heavy tourist traffic doesn\u2019t fully translate into dirtier air.'
  },
  'Texas': {
    icon: '🌪️',
    title: 'Texas — big skies, fast winds',
    why: 'Wide-open plains and strong southerly winds disperse emissions quickly; its growing wind-power share also displaces some of the pollution that traffic and industry would otherwise add.'
  },
  'New Hampshire': {
    icon: '⛰️',
    title: 'New Hampshire — small roads, big forests',
    why: 'About 84% forest cover and a small, mostly rural population dilute its moderate traffic into very low pollution readings.'
  },
  'Georgia': {
    icon: '🌦️',
    title: 'Georgia — rain rinses the air',
    why: 'Frequent Gulf-fed rainstorms wash particulates out of the atmosphere (wet deposition), helping Atlanta\u2019s busy highways register lower PM2.5 than expected.'
  }
};

const FALLBACK = {
  icon: '✨',
  title: 'An outlier state',
  why: 'This state carries above-average traffic yet keeps pollution readings low — a mix of favorable winds, a cleaner or younger vehicle fleet, renewable electricity, and natural ventilation (rain, forests, coastline) likely explains the gap.'
};

// ── Detection ────────────────────────────────────────────────
// data: array of { stateName, traffic, metric } (one row per state)
// Returns array of anomaly rows, sorted by "how anomalous" (traffic rank vs metric rank gap).
export function computeAnomalies(data, opts = {}) {
  if (!data || data.length < 8) return [];
  const trafficP = d3.quantile(data.map(d => d.traffic).sort((a, b) => a - b), opts.trafficHi ?? 0.68);
  const metricP  = d3.quantile(data.map(d => d.metric).sort((a, b) => a - b),  opts.metricLo ?? 0.45);
  if (trafficP == null || metricP == null) return [];

  const n = data.length;
  const trRank = new Map([...data].sort((a, b) => b.traffic - a.traffic).map((d, i) => [d.stateName, i + 1]));
  const meRank = new Map([...data].sort((a, b) => b.metric  - a.metric).map((d, i) => [d.stateName, i + 1]));

  const anomalies = data
    .filter(d => d.traffic >= trafficP && d.metric <= metricP)
    .map(d => ({
      ...d,
      trafficRank: trRank.get(d.stateName),
      metricRank: meRank.get(d.stateName),
      gap: (trRank.get(d.stateName) - meRank.get(d.stateName)) / n // how far "off trend" it is
    }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 6);

  return anomalies;
}

export function anomalyNameSet(anomalies) {
  return new Set((anomalies || []).map(a => a.stateName));
}

export function anomalyNote(stateName) {
  return ANOMALY_NOTES[stateName] || { ...FALLBACK, title: `${stateName} — busy but clean` };
}
