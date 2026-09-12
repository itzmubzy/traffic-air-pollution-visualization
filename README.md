# Do Busier Roads Mean Dirtier Air? 🚙💨

An **interactive data story & visualization dashboard** exploring ten years (2015–2025) of U.S. traffic and air-quality data — 6,700 monthly records across 51 states and territories — to answer one core research question:

> **Why do some high-traffic states have relatively cleaner air?**

The dashboard guides readers through three chapters — *Where and when is pollution happening?*, *Does traffic explain pollution?*, and *Why do some busy states stay clean?* — combining a choropleth map, timeline brush, scatter analysis, and narrative discovery cards into a single scrolling story.

---

## ✨ Key Features & Interactive Elements

- **Interactive USA Map (Choropleth)** — Click states to select/deselect them; selections instantly sync across every other chart. Built with D3 geo projections + `us-atlas` TopoJSON fetched at runtime, with a graceful fallback if the network asset is unavailable.
- **Brushable Timeline** — A national-timeline area chart with a D3 brush and a keyboard-accessible year slider. Dragging the brush sets the global date range; every visualization reacts.
- **Scatter Plot (Traffic vs. Pollution)** — Cross-metric analysis with state selection, date filtering, and a median crosshair.
- **Heatmap & Small Multiples** — State × date heatmap for seasonality, plus side-by-side monthly trend panels with a synchronized crosshair sweep.
- **Floating Insight Bubbles** — Contextual KPI/insight callouts that surface key takeaways as readers move through the story.
- **Section 3A Discovery Cards** — Four uniform, click-to-flip 3D learning cards (glow icon badge → evidence takeaway, stat badge, and a "View Chart Evidence ↓" button that smooth-scrolls to the target chart). Pure CSS 3D (`preserve-3d`, `backface-visibility`, GPU-composited) with keyboard parity and `prefers-reduced-motion` fallback.
- **Story Presets** — Objective cards and preset buttons (e.g., *Traffic Giants*, *Clean Champions*, *Winter Inversions*) apply coordinated state/metric selections across the map and scatter in one click.
- **Global Filters & Reset** — Centralized year slider, metric dropdown, and state controls with an "Active Filters" pill bar and one-click reset of all filters.

---

## 🗺️ Website Architecture & Structure

Single-page, chapter-based editorial layout (`index.html`):

| Section | Label | Content |
|---|---|---|
| Hero | — | Title, research question, intro narrative |
| Controls bar | — | Year slider, metric & state dropdowns, reset, active-filter pills |
| Chapter 1 | `1a · Where` + `1b · When` | USA choropleth map, timeline brush, KPI strip |
| Chapter 2 | `2 · Relationships` | Traffic-vs-pollution scatter with median crosshair |
| Chapter 3 | `3a · What did we learn?` | Four 3D flip discovery cards → jump to evidence |
| Advanced | `3b · Advanced Exploration` | Heatmap, small multiples, extra insight tools |

**State management** — A centralized pub/sub store (`js/state.js`) holds `selectedStates`, `startDate`/`endDate`, `selectedMetric`, hover state, and active story preset. Every chart subscribes; `setState()` broadcasts only-changed updates, so all views stay in sync with zero coupling.

**Data** — `traffic_air_pollution_cleaned_features.csv` (~1.7 MB, State × Month grain, 34 columns) is fetched exactly once by `js/data.js` via `d3.csv`, then aggregated client-side (`d3.rollup`) to State × Year and national-timeline grains.

### Module map
```
index.html            ← entry point (CSP meta, all sections)
css/style.css         ← base styling (design tokens, charts)
css/story-redesign.css← editorial story layout + discovery cards
js/main.js            ← bootstrap, chart registry, global controls
js/state.js           ← shared state + pub/sub, metric config
js/data.js            ← CSV loader/parser (single fetch)
js/utils.js           ← aggregations & data helpers
js/map.js             ← choropleth USA map
js/timeline.js        ← brush timeline + year slider sync
js/scatter.js         ← traffic vs. pollution scatter
js/heatmap.js         ← state × date heatmap
js/smallMultiples.js  ← monthly trend panels (shared crosshair)
js/kpis.js            ← KPI strip
js/insights.js        ← insight bubbles/panel
js/discovery.js       ← Section 3A flip cards + preset sync
js/bubbles.js         ← floating bubble layer
js/anomalies.js       ← anomaly highlights
js/legend.js, js/colors.js ← shared palettes & legend
analyze.py            ← dev-only data-profiling script (not runtime)
```

---

## 🛠 Tech Stack

- **HTML5** — semantic single-page layout with a Content-Security-Policy meta tag
- **CSS3** — custom properties (design tokens), grid/flex layouts, CSS 3D transforms for flip cards; no CSS framework
- **JavaScript (ES Modules)** — framework-free vanilla JS
- **D3.js v7** (CDN) — scales, shapes, geo projections, brush, rollups
- **topojson-client@3 + us-atlas@3** (CDN) — U.S. map geometry
- **Google Fonts** — Inter, Space Grotesk, JetBrains Mono
- **Python + pandas** (dev only) — to re-run `analyze.py` for data profiling

No backend, no database, no build step, no environment variables.

---

## 🚀 Getting Started / Local Setup

### Prerequisites
Any static file server — e.g., Python, Node `npx serve`, or VS Code Live Server. Because the site uses ES modules, it **must be served over HTTP** (opening `index.html` via `file://` will not work).

### Run locally
```bash
# from the project root
python -m http.server 8080
# then open http://localhost:8080
```

### Verify
- Map, timeline, scatter, heatmap, and small multiples all render with no console errors
- Year slider / brush / metric / state filters update every chart
- Clicking states syncs the selection across all charts

### Deploy
Deploy as a static site to GitHub Pages, Netlify, Vercel, Cloudflare Pages, nginx, etc.

1. Upload only runtime files: `index.html`, `css/`, `js/`, and the CSV (exclude `.git/`, `.kilo/`, `.vscode/`, `analyze.py`).
2. Enable gzip/brotli for `.csv`, `.js`, `.css`, `.html` — the 1.7 MB CSV compresses to ~500 KB (the biggest performance win).
3. Set cache headers (e.g., `Cache-Control: public, max-age=86400`) and HTTPS (the CSP allows only `https://` origins).

GitHub Pages example:
```bash
git init && git add . && git commit -m "Deploy"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
# then enable Pages on the repo (root, main branch)
```
