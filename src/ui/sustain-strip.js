import { state } from '../state.js';

/**
 * Set the sustain pedal to a normalised value and update the strip UI.
 * Clamped to [0, 1] — 0 = off, 1 = full sustain.
 *
 * @param {number} amount
 */
export function setSustain(amount) {
  state.sustainAmount = Math.max(0, Math.min(1, amount));

  const track = document.getElementById('strip-track');
  const thumb = document.getElementById('strip-thumb');
  const fill  = document.getElementById('strip-fill');
  const th = track.offsetHeight;
  const hh = thumb.offsetHeight;

  thumb.style.bottom = `${state.sustainAmount * (th - hh)}px`;
  fill.style.height  = `${state.sustainAmount * th}px`;
  thumb.style.background = state.sustainAmount > 0
    ? 'radial-gradient(circle at 40% 35%, #93c5fd, #3b82f6)'
    : 'radial-gradient(circle at 40% 35%, #f8fafc, #cbd5e1)';
}

/** Wire up mouse drag events on the sustain strip track. */
export function initSustainStrip() {
  const track = document.getElementById('strip-track');
  let dragging = false;

  const fromY = y => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, 1 - (y - r.top) / r.height));
  };

  track.addEventListener('mousedown', e => {
    dragging = true;
    setSustain(fromY(e.clientY));
    state.savedSustain = state.sustainAmount;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) {return;}
    setSustain(fromY(e.clientY));
    state.savedSustain = state.sustainAmount;
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}
