import { WKW, OCT_MIN, OCT_MAX, NI_TO_WHITE_POS, CODE_MAP } from '../constants.js';
import { state, shiftedNote } from '../state.js';

/**
 * Refresh octave-active highlights and keyboard labels for the current
 * octave and semitone shift, then scroll the viewport to centre the range.
 */
export function refreshOctaveUI() {
  document.getElementById('octave-value').textContent = state.currentOctave;
  document.getElementById('btn-down').disabled = (state.currentOctave <= OCT_MIN);
  document.getElementById('btn-up').disabled   = (state.currentOctave >= OCT_MAX);

  document.querySelectorAll('.key').forEach(k => k.classList.remove('octave-active'));
  document.querySelectorAll('.key-label').forEach(l => { l.textContent = ''; });

  Object.keys(CODE_MAP).forEach(code => {
    const info = shiftedNote(CODE_MAP[code]);
    if (info.oct < OCT_MIN || info.oct > OCT_MAX) {return;}
    document.querySelectorAll(`.key[data-oct="${info.oct}"][data-ni="${info.ni}"]`)
      .forEach(k => {
        k.classList.add('octave-active');
        const label = k.querySelector('.key-label');
        if (label) {label.textContent = CODE_MAP[code].label;}
      });
  });

  scrollToActiveRange();
}

/**
 * Translate the #piano element so the active keyboard range is visible
 * and roughly centred in the viewport.
 */
export function scrollToActiveRange() {
  const piano  = document.getElementById('piano');
  const vp     = document.getElementById('piano-viewport');
  const vw     = vp.offsetWidth;
  const totalW = 50 * WKW;

  const aInfo = shiftedNote(CODE_MAP['KeyA']);
  const oct   = Math.max(OCT_MIN, Math.min(OCT_MAX, aInfo.oct));
  const gIdx  = (oct - OCT_MIN) * 7 + NI_TO_WHITE_POS[aInfo.ni];
  let tx = -(gIdx * WKW - Math.floor(vw / 4));
  tx = Math.min(0, Math.max(-(totalW - vw), tx));
  piano.style.transform = `translateX(${tx.toFixed(1)}px)`;

  const pianoU = document.getElementById('piano-upper');
  if (pianoU) { pianoU.style.transform = `translateX(${tx.toFixed(1)}px)`; }
}

/**
 * Recalculate the piano viewport width based on its parent container,
 * then re-scroll to keep the active range visible.
 */
export function updateViewport() {
  const area = document.getElementById('piano-area');
  const ss   = document.getElementById('sustain-strip');
  const containerW = area ? area.offsetWidth : window.innerWidth;
  const sw = ss ? ss.offsetWidth + 14 : 0;
  const vw = Math.min(50 * WKW, Math.max(8 * WKW, containerW - sw - 4));
  document.getElementById('piano-viewport').style.width = `${vw}px`;

  const vpU = document.getElementById('piano-viewport-upper');
  if (vpU) {vpU.style.width = `${vw}px`;}

  scrollToActiveRange();
}
