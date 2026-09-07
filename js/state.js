// state.js — shared dashboard state + metric configuration

export const metrics = {
  traffic: {
    field: "Avg_Daily_Traffic", label: "Traffic Volume", short: "traffic volume",
    unit: "veh/day", fmt: ",.0f", palette: "traffic", goodDirection: null,
    about: "Average daily traffic counted on monitored roads."
  },
  pm25: {
    field: "Avg_PM2_5", label: "PM2.5", short: "PM2.5",
    unit: "µg/m³", fmt: ".1f", palette: "pollution", goodDirection: "down",
    thresholds: [{ v: 9.0, label: "EPA annual std" }, { v: 15, label: "WHO 24-h" }],
    about: "Fine particulate matter — the pollutant most harmful to human health."
  },
  aqi: {
    field: "Avg_AQI", label: "Air Quality Index", short: "AQI",
    unit: "", fmt: ".0f", palette: "pollution", goodDirection: "down",
    thresholds: [{ v: 50, label: "Good ≤ 50" }, { v: 100, label: "Moderate ≤ 100" }],
    about: "Composite air-quality index reported by EPA monitors."
  },
  efficiency: {
    field: "Emission_Efficiency_Index", label: "Emission Efficiency Index", short: "emission efficiency",
    unit: "µg/m³ per 1,000 veh", fmt: ".2f", palette: "pollution", goodDirection: "down",
    about: "PM2.5 emitted per 1,000 vehicles — lower means a cleaner-running fleet."
  },
  trafficPer1000: {
    field: "Traffic_per_1000", label: "Traffic per 1,000", short: "traffic intensity",
    unit: "k·veh/day", fmt: ".1f", palette: "traffic", goodDirection: null,
    about: "Traffic volume rescaled per 1,000 vehicles for comparability."
  }
};

export const STORY_PRESETS = [
  {
    id: "clean-champions",
    icon: "🌟",
    title: "Clean Fleet Champions",
    desc: "States with low emissions despite vehicle volumes",
    metric: "efficiency",
    states: ["Washington", "Oregon", "Vermont", "New Hampshire"],
    year: "All",
    insightTab: "quadrant",
    storySummary: "These states demonstrate that strict vehicle maintenance and renewable power decouple traffic from particulate pollution."
  },
  {
    id: "winter-inversions",
    icon: "❄️",
    title: "Winter Inversion Crisis",
    desc: "Cold mountain valleys trapping particulate emissions",
    metric: "pm25",
    states: ["Utah", "Idaho", "Nevada", "Montana"],
    year: "All",
    insightTab: "seasons",
    storySummary: "Winter cold-air inversions trap vehicle tailpipe exhaust near the ground, producing extreme seasonal PM2.5 spikes."
  },
  {
    id: "traffic-giants",
    icon: "🚗",
    title: "High Traffic Corridors",
    desc: "Heaviest traffic vs pollution decoupling",
    metric: "traffic",
    states: ["California", "Texas", "Florida", "New York"],
    year: "All",
    insightTab: "scatter",
    storySummary: "Comparing the largest mega-states: California has massive traffic yet manages lower emissions per vehicle than less regulated corridors."
  },
  {
    id: "hotspots-double-burden",
    icon: "⚠️",
    title: "Double Burden Hotspots",
    desc: "High pollution load & aging fleet indices",
    metric: "pm25",
    states: ["California", "Indiana", "Illinois", "Ohio", "Pennsylvania"],
    year: "All",
    insightTab: "map",
    storySummary: "Industrial and freight corridors suffer compounding burdens from heavy interstate diesel freight and local commuter traffic."
  }
];

export const state = {
  data: [],                 // Raw parsed records
  selectedStates: [],       // Array of State_Name strings
  startDate: null,          // Date object or null
  endDate: null,            // Date object or null
  selectedYear: "All",      // "All" or a number
  selectedMetric: "efficiency", // Key from metrics
  hoveredState: null,
  hoveredDatum: null,
  isPlaying: false,
  activeStoryPreset: null
};

const listeners = [];
const hoverListeners = [];

export function subscribe(listener) {
  listeners.push(listener);
}

export function subscribeHover(listener) {
  hoverListeners.push(listener);
}

export function notify() {
  listeners.forEach(listener => listener(state));
}

export function notifyHover() {
  hoverListeners.forEach(listener => listener(state.hoveredState));
}

export function setHoveredState(stateName) {
  if (state.hoveredState !== stateName) {
    state.hoveredState = stateName;
    notifyHover();
  }
}

export function setState(updates) {
  let changed = false;
  let hoverChanged = false;
  for (const key in updates) {
    if (state[key] !== updates[key]) {
      state[key] = updates[key];
      changed = true;
      if (key === 'hoveredState') hoverChanged = true;
    }
  }
  if (changed) notify();
  if (hoverChanged) notifyHover();
}

export function toggleStateSelection(stateName) {
  const current = new Set(state.selectedStates);
  if (current.has(stateName)) current.delete(stateName);
  else current.add(stateName);
  setState({ selectedStates: Array.from(current), activeStoryPreset: null });
}

export function applyStoryPreset(presetId) {
  const preset = STORY_PRESETS.find(p => p.id === presetId);
  if (!preset) return;
  setState({
    selectedMetric: preset.metric,
    selectedStates: [...preset.states],
    selectedYear: preset.year,
    startDate: preset.year === "All" ? null : new Date(preset.year, 0, 1),
    endDate: preset.year === "All" ? null : new Date(preset.year, 11, 31),
    activeStoryPreset: preset.id
  });
}

export function setYear(yearValue) {
  if (yearValue === "All") {
    setState({ selectedYear: "All", startDate: null, endDate: null, activeStoryPreset: null });
    return;
  }
  const year = parseInt(yearValue, 10);
  setState({
    selectedYear: year,
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31),
    activeStoryPreset: null
  });
}