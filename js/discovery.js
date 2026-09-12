// discovery.js — Section 3a learning cards: clean click-to-flip 3D reveal
// and two-way sync between the cards and the shared chart selection.
// (No mouse-move / X-ray lens scripts — flip is the only interaction.)

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