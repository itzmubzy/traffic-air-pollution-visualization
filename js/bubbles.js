// bubbles.js — "Insight Bubbles": playful floating bubbles anchored to key
// chart sections. Click → pop sound (WebAudio) + canvas particle burst +
// lightweight modal with a bite-sized takeaway.

import { anomalyNote } from './anomalies.js';

let audioCtx = null;
let fxCanvas = null, fxCtx = null, particles = [], fxRunning = false;

// ── Bubble definitions per anchor container ──────────────────
// Each bubble: { id, icon, color, size, delay, modal: {icon,title,body} }
const BUBBLE_SETS = {
  'bubble-anchor-map': [
    {
      id: 'map-anomaly',
      icon: '✦',
      color: '#34d399',
      size: 54,
      delay: 0,
      modal: () => ({
        icon: '✦',
        title: 'The mint states: busy but clean',
        body: `States outlined in mint carry above-average traffic yet rank among the <b>cleanest air</b>. Wind patterns, cleaner fleets and renewable power — not luck — explain most of the gap. Find them on the scatter plot next.`
      })
    },
    {
      id: 'map-cluster',
      icon: '📍',
      color: '#f0854a',
      size: 42,
      delay: 2200,
      modal: () => ({
        icon: '📍',
        title: 'Pollution clusters, it doesn\u2019t spread',
        body: 'A handful of states carry most of the pollution burden — geography, industry and traffic compound in the same few places. Click any state to trace it through the whole story.'
      })
    }
  ],
  'bubble-anchor-scatter': [
    {
      id: 'scatter-anomaly',
      icon: '✦',
      color: '#34d399',
      size: 50,
      delay: 0,
      modal: null // filled at runtime with the top-ranked anomaly state
    },
    {
      id: 'scatter-trend',
      icon: '📐',
      color: '#4e9ff5',
      size: 40,
      delay: 3000,
      modal: () => ({
        icon: '📐',
        title: 'The dashed line is the "if traffic ruled" line',
        body: 'If traffic alone determined pollution, every dot would hug this trend line. The dots sitting far below it <b>with lots of traffic</b> are the interesting ones — that\u2019s where cleaner fleets, transit and geography do the heavy lifting.'
      })
    }
  ],
  'bubble-anchor-findings': [
    {
      id: 'findings-winter',
      icon: '❄️',
      color: '#7ec8ff',
      size: 44,
      delay: 0,
      modal: () => ({
        icon: '❄️',
        title: 'Why winter is the worst season',
        body: 'Cold-air <b>inversions</b> act like a lid: cold, dense air traps warm exhaust near the ground instead of letting it rise and disperse. Valley states like Utah get the sharpest winter PM2.5 spikes.'
      })
    }
  ]
};

// ── Public API ───────────────────────────────────────────────
export function initBubbles(topAnomaly) {
  const scatterSet = BUBBLE_SETS['bubble-anchor-scatter'];
  if (topAnomaly) {
    const note = anomalyNote(topAnomaly.stateName);
    scatterSet[0].modal = () => ({
      icon: note.icon,
      title: note.title,
      body: `<b>${topAnomaly.stateName}</b> ranks <b>#${topAnomaly.trafficRank}</b> in traffic but only <b>#${topAnomaly.metricRank}</b> in pollution. ${note.why}`
    });
  }
  for (const [anchorId, bubbles] of Object.entries(BUBBLE_SETS)) {
    const arena = document.getElementById(anchorId);
    if (!arena) continue;
    ensureFxCanvas();
    const spawned = bubbles.map(cfg => spawnBubble(arena, cfg));
    startArenaPhysics(arena, spawned.filter(Boolean));
  }
}

// ── Non-overlap layout + gentle drifting physics ─────────────
// Bubbles float inside the arena (dedicated free-space strip),
// bounce softly off its edges, and are pushed apart whenever
// their circles touch — so they never overlap and never cover
// the charts above.
const ARENAS = new Map(); // arena element -> { bubbles, raf }

function arenaSize(arena) {
  const r = arena.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

function placeWithoutOverlap(bubbles, w, h) {
  // Simple dart-throwing placement with a minimum center distance.
  const placed = [];
  for (const b of bubbles) {
    let x, y, ok = false, tries = 0;
    while (!ok && tries++ < 300) {
      x = 20 + b.r + Math.random() * Math.max(1, w - 40 - 2 * b.r);
      y = 8 + b.r + Math.random() * Math.max(1, h - 16 - 2 * b.r);
      ok = placed.every(p => Math.hypot(p.x - x, p.y - y) > p.r + b.r + 14);
    }
    if (!ok && placed.length) { // fallback: stack horizontally with spacing
      x = placed.reduce((acc, p) => Math.max(acc, p.x + p.r), 20 + b.r) + 18;
      y = h / 2;
    }
    b.x = x; b.y = y;
    b.vx = (Math.random() - 0.5) * 0.5;   // px per frame — slow drift
    b.vy = (Math.random() - 0.5) * 0.35;
    placed.push(b);
  }
}

function startArenaPhysics(arena, bubbles) {
  if (!bubbles.length) return;
  const size = arenaSize(arena);
  placeWithoutOverlap(bubbles, size.w, size.h);

  let raf = null;
  function tick() {
    const { w, h } = arenaSize(arena);
    // Move + edge bounce
    for (const b of bubbles) {
      b.x += b.vx; b.y += b.vy;
      if (b.x - b.r < 2)   { b.x = 2 + b.r;   b.vx = Math.abs(b.vx); }
      if (b.x + b.r > w-2) { b.x = w-2 - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < 2)   { b.y = 2 + b.r;   b.vy = Math.abs(b.vy); }
      if (b.y + b.r > h-2) { b.y = h-2 - b.r; b.vy = -Math.abs(b.vy); }
    }
    // Pairwise separation — hard no-overlap guarantee
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], b = bubbles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minD = a.r + b.r + 10;
        if (dist < minD) {
          const push = (minD - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          // soften: exchange a little velocity along the normal
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel > 0) { a.vx -= nx * rel * 0.6; a.vy -= ny * rel * 0.6; b.vx += nx * rel * 0.6; b.vy += ny * rel * 0.6; }
        }
      }
    }
    for (const b of bubbles) {
      b.el.style.left = `${b.x - b.r}px`;
      b.el.style.top = `${b.y - b.r}px`;
    }
    if (bubbles.length) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  ARENAS.set(arena, { bubbles, raf: () => raf });
}

// ── Spawn one bubble (returns its physics record) ────────────
function spawnBubble(arena, cfg) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'insight-bubble';
  btn.setAttribute('aria-label', `Pop insight bubble: ${cfg.id}`);
  const r = cfg.size / 2;
  btn.style.setProperty('--bubble-size', cfg.size + 'px');
  btn.style.setProperty('--bubble-color', cfg.color);
  btn.innerHTML = `<span class="bubble-icon" aria-hidden="true">${cfg.icon}</span>`;

  const rec = { el: btn, r, cfg, x: -999, y: -999, vx: 0, vy: 0 };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popBubble(btn, cfg);
    // remove from physics list so it stops drifting / colliding
    const a = ARENAS.get(arena);
    if (a) { const i = a.bubbles.indexOf(rec); if (i >= 0) a.bubbles.splice(i, 1); }
  });
  arena.appendChild(btn);
  return rec;
}

// ── Pop: sound + particles + modal ───────────────────────────
function popBubble(el, cfg) {
  const r = el.getBoundingClientRect();
  playPop();
  burst(r.left + r.width / 2, r.top + r.height / 2, cfg.color);
  el.classList.add('is-popped');
  setTimeout(() => el.remove(), 350);
  const modal = cfg.modal ? cfg.modal() : null;
  if (modal) openModal(modal);
}

// ── WebAudio "crisp pop" ─────────────────────────────────────
function playPop() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;

    // Short noise burst (the "snap")
    const len = 0.09, sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, sr * len, sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2.5);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const nGain = audioCtx.createGain();
    nGain.gain.setValueAtTime(0.5, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + len);
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    noise.connect(hp).connect(nGain).connect(audioCtx.destination);
    noise.start(t);

    // Tiny tonal "bloop" right after (pitch drop = bubble feel)
    const osc = audioCtx.createOscillator();
    const oGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.12);
    oGain.gain.setValueAtTime(0.25, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(oGain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.15);
  } catch { /* audio unavailable — stay silent */ }
}

// ── Canvas particle burst ────────────────────────────────────
function ensureFxCanvas() {
  if (fxCanvas) return;
  fxCanvas = document.createElement('canvas');
  fxCanvas.className = 'bubble-fx-canvas';
  fxCanvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fxCanvas);
  fxCtx = fxCanvas.getContext('2d');
  resizeFx();
  window.addEventListener('resize', resizeFx);
}
function resizeFx() {
  if (!fxCanvas) return;
  fxCanvas.width = window.innerWidth;
  fxCanvas.height = window.innerHeight;
}
function burst(x, y, color) {
  ensureFxCanvas();
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 * i) / N + Math.random() * 0.4;
    const sp = 2.2 + Math.random() * 4.2;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1.2,
      r: 2 + Math.random() * 3.5,
      life: 1,
      color: Math.random() < 0.75 ? color : '#ffffff'
    });
  }
  if (!fxRunning) {
    fxRunning = true;
    requestAnimationFrame(tickFx);
  }
}
function tickFx() {
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12;               // gravity
    p.vx *= 0.97; p.vy *= 0.97;
    p.life -= 0.032;
    fxCtx.globalAlpha = Math.max(0, p.life);
    fxCtx.fillStyle = p.color;
    fxCtx.beginPath();
    fxCtx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    fxCtx.fill();
  }
  fxCtx.globalAlpha = 1;
  if (particles.length) requestAnimationFrame(tickFx);
  else { fxRunning = false; fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height); }
}

// ── Lightweight takeaway modal ───────────────────────────────
function openModal({ icon, title, body }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'bubble-modal-backdrop';
  backdrop.innerHTML = `
    <div class="bubble-modal glass" role="dialog" aria-modal="true" aria-label="${title}">
      <button class="bubble-modal-close" type="button" aria-label="Close insight">✕</button>
      <div class="bubble-modal-icon" aria-hidden="true">${icon}</div>
      <div class="bubble-modal-title">${title}</div>
      <div class="bubble-modal-body">${body}</div>
      <div class="bubble-modal-hint">💡 Pop the other bubbles for more bite-sized insights</div>
    </div>`;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelector('.bubble-modal-close').addEventListener('click', closeModal);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('is-open'));
  document.addEventListener('keydown', escClose);
  function escClose(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escClose); } }
}
function closeModal() {
  const existing = document.querySelector('.bubble-modal-backdrop');
  if (existing) existing.remove();
}
