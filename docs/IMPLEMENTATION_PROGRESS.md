# Implementation Progress

## Design Update (Latest)
- Full dark editorial UI with CSS custom properties (no raw hex values in CSS).
- Inter + JetBrains Mono typography via Google Fonts.
- Year slider: dataset-derived min/max, keyboard accessible, connected to `setYear()` → shared state.
- "All Years" reset button with active/inactive visual state.
- Temporal area chart rebuilt using D3 step-after area pattern (zoom + brush).
- Zoom: visual inspection only — does NOT change shared date filter.
- Brush: sets `startDate`/`endDate` in shared state → all visualizations react.
- Heatmap + area chart placed side-by-side in `temporal-grid` (stacks on mobile).
- Project information placeholder section added (ready for real content).
- Filter bar replaced debug UI with clean pill badges.
- Existing data.js / state.js / utils.js / all viz modules preserved.

## Completed
- Phase 1: Existing architecture + Interactive Timeline (Brush + Zoom + Tooltip)
- Phase 2 & 4 & 8: U.S. Geographic Map (Combined Choropleth & Bubble Map with mode toggle)
- Phase 5: Scatterplot (Traffic vs Selected Metric, with state selection and date filtering)
- Phase 6: Quadrant (PM2.5 vs Selected Metric, with quadrant coloring)
- Phase 7: Heatmap (State vs Date, with state selection and date filtering)
- Phase 9: Small Multiples (Trend comparison for selected states)
- Phase 10: Voronoi/dense-point interaction (Skipped as per request)
- Phase 11: Final integration & polish (CSS layout improvements, header, filter bar)
- Shared state pub/sub system and dataset loading/transformations

## Current
- All implementation phases complete.

## Pending
- None.

## Design & Year Control
- Implemented a clean, polished, analytical UI with CSS variables and strong hierarchy.
- Replaced the debug menu with a semantic "Active Filters" bar.
- Added a global Year Slider (range input) that pulls min/max from dataset and filters the shared state temporally.
- Centralized Metric and State dropdowns into a Global Controls section.
- Ensured all changes tie smoothly into the existing `state.js` pub/sub architecture.
- Preserved existing data loading and existing visualization components.
