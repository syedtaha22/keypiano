import { state } from '../state.js';

/**
 * Set the sustain pedal to a normalised value [0,1] and update the strip UI
 * if it is visible. Works even when the strip is hidden (display:none) because
 * the important side-effect is the state mutation; the DOM update is optional.
 */
export function setSustain(amount) {
  state.sustainAmount = Math.max(0, Math.min(1, amount));

  const track = document.getElementById('strip-track');
  const thumb = document.getElementById('strip-thumb');
  const fill  = document.getElementById('strip-fill');
  if (!track) { return; }

  const th = track.offsetHeight || 160;
  const hh = (thumb && thumb.offsetHeight) || 22;

  if (thumb) {
    thumb.style.bottom     = `${state.sustainAmount * (th - hh)}px`;
    thumb.style.background = state.sustainAmount > 0
      ? 'radial-gradient(circle at 40% 35%, #93c5fd, #3b82f6)'
      : 'radial-gradient(circle at 40% 35%, #f8fafc, #cbd5e1)';
  }
  if (fill) { fill.style.height = `${state.sustainAmount * th}px`; }
}

/** Wire up mouse drag events on the sustain strip track if it is present. */
export function initSustainStrip() {
  const track = document.getElementById('strip-track');
  if (!track) { return; }
  let dragging = false;

  const fromY = y => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, 1 - (y - r.top) / (r.height || 160)));
  };

  track.addEventListener('mousedown', e => {
    dragging = true;
    setSustain(fromY(e.clientY));
    state.savedSustain = state.sustainAmount;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) { return; }
    setSustain(fromY(e.clientY));
    state.savedSustain = state.sustainAmount;
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}
