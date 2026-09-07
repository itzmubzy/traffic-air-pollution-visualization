# Deployment Guide — Air Pollution from Traffic (Interactive Data Story)

## Architecture

This is a **pure static frontend** — no backend, no database, no build step, no
server-side code. Everything is plain HTML + CSS + browser-native ES modules:

```
index.html                                  ← entry point
css/style.css                               ← all styling
js/*.js                                     ← 12 ES modules (d3-based)
traffic_air_pollution_cleaned_features.csv  ← dataset (1.7 MB, public research data)
analyze.py                                  ← dev-only data-profiling script
```

**External CDNs required at runtime:**
- `https://d3js.org` — d3 v7
- `https://unpkg.com` — topojson-client@3
- `https://cdn.jsdelivr.net` — us-atlas@3 (fetched at runtime by `js/map.js`)
- `https://fonts.googleapis.com` / `https://fonts.gstatic.com` — Inter, Space Grotesk, JetBrains Mono

A Content-Security-Policy meta tag in `index.html` whitelists exactly these
hosts. If you change CDN hosts, update the CSP too.

## Prerequisites

- Any static file server / static hosting (GitHub Pages, Netlify, Vercel,
  Cloudflare Pages, nginx, Apache, `python -m http.server`, …).
- No Node.js, Python, or environment variables are required at runtime.
  (Python + pandas are only needed to re-run `analyze.py` during development.)

## Environment Variables

None. The application has no secrets, no API keys, and no backend.
All data is public research data bundled with the site.

## Local Production Test

The site uses ES modules, so it must be served over HTTP (not opened via `file://`):

```bash
# from the project root
python -m http.server 8080
# then open http://localhost:8080
```

Verify: the map, timeline, scatter, heatmap, and small multiples all render;
filters (year slider, metric, state) update every chart; no errors appear in the
browser console. The legacy `js/quadrant.js` file is retained for reference but
is not part of the runtime entry point.

## Deployment

1. Upload only the runtime files: `index.html`, `css/`, `js/`, and the CSV.
   Exclude `.git/`, `.kilo/`, `.vscode/`, `analyze.py`, and `docs/`.
2. Enable **gzip/brotli compression** for `.csv`, `.js`, `.css`, `.html` —
   the 1.7 MB CSV compresses to roughly ~500 KB, which is the single biggest
   performance win.
3. Set long-lived cache headers for `js/`, `css/`, and the CSV, e.g.
   `Cache-Control: public, max-age=86400` (short, since no fingerprinting).
4. Recommended response headers (set at the host, since meta CSP already covers
   script/style origins):
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `X-Frame-Options: SAMEORIGIN` (or CSP `frame-ancestors` if the host supports it)
5. HTTPS is strongly recommended (the CSP allows only https:// origins).

### GitHub Pages example
```bash
git init && git add . && git commit -m "Production ready"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
# then enable Pages on the repo (root, main branch)
```

## Security Checklist

- [x] No secrets/credentials anywhere in the codebase (audited)
- [x] No backend, so no CORS / SQL / auth surface exists
- [x] CSP meta tag restricts script/style/connect origins
- [x] Referrer-Policy set
- [x] Debug `console.log` removed; only error logging remains
- [ ] Host-level headers (`X-Content-Type-Options`, `X-Frame-Options`, HSTS) — configure on your hosting platform
- [x] Static runtime tested locally over HTTP

## Post-Deployment

- [ ] Open the live URL — dashboard renders with no console errors
- [ ] Verify the U.S. map loads (proves `cdn.jsdelivr.net` fetch works under the CSP)
- [ ] Click states / heatmap rows — selection syncs across all charts
- [ ] Test year slider + play animation + metric dropdown
- [ ] Check fonts render (Google Fonts allowed by CSP)
- [ ] Lighthouse quick pass (performance: expect the CSV fetch to dominate)
