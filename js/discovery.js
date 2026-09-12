// discovery.js — Section 3a objective cards: 1-tap 3D flip reveal,
// Card 1 X-ray hover lens (pure CSS mask — no per-frame canvas cost),
// and two-way sync between the cards and the shared chart selection.

import { state, setState, applyStoryPreset, STORY_PRESETS } from './state.js';

export function initDiscovery() {
  document.querySelectorAll('.dc3-card').forEach(card => {
    // ── 1-tap flip + two-way preset binding (single click, zero lag) ──
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-finding')) return;  // evidence button → handled in main.js
      card.classList.toggle('is-flipped');

      // Selecting a card binds its states to map & scatter; clicking
      // the active card again de-selects everything.
      const pid = card.dataset.preset;
      if (state.activeStoryPreset === pid) {
        setState({ selectedStates: [], activeStoryPreset: null });
      } else {
        applyStoryPreset(pid);
      }
    });

    // Keyboard parity (no multi-click requirement anywhere)
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });

    // ── Card 1: instant X-ray hover lens (CSS mask hole follows cursor) ──
    const front = card.querySelector('.dc3-front');
    if (card.dataset.lens === 'on' && front) {
      let queued = false, lx = 0, ly = 0;
      front.addEventListener('pointermove', e => {
        const r = front.getBoundingClientRect();
        lx = (e.clientX - r.left) / r.width * 100;
        ly = (e.clientY - r.top) / r.height * 100;
        if (!queued) {                       // ≤1 style write per frame
          queued = true;
          requestAnimationFrame(() => {
            front.style.setProperty('--mx', lx + '%');
            front.style.setProperty('--my', ly + '%');
            queued = false;
          });
        }
      });
      front.addEventListener('pointerleave', () => {
        front.style.setProperty('--mx', '-100%');
        front.style.setProperty('--my', '-100%');
      });
    }
  });
}

// ── Two-way sync: shared selection state → card highlight ────
export function syncObjectiveCards(s) {
  document.querySelectorAll('.dc3-card').forEach(card => {
    const pid = card.dataset.preset;
    const preset = STORY_PRESETS.find(p => p.id === pid);
    const single = s.selectedStates.length === 1 ? s.selectedStates[0] : null;
    const activeByPreset = s.activeStoryPreset === pid;
    const activeByState = !s.activeStoryPreset && !!single && !!preset && preset.states.includes(single);
    card.classList.toggle('is-active', !!(activeByPreset || activeByState));
  });
}

export function presetForState(stateName) {
  return STORY_PRESETS.find(p => p.states.includes(stateName)) || null;
}