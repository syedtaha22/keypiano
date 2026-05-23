import {
  WKW, OCT_MIN, OCT_MAX, NI_TO_WHITE_POS, CODE_MAP,
  BOTTOM_ROW_CODES, TOP_ROW_CODES,
  whiteKeyAt, getStrictTopRow,
} from '../constants.js';
import { state, shiftedNote } from '../state.js';

/* ── Lower (main) piano ──────────────────────────────────────────── */

export function refreshOctaveUI() {
  document.querySelectorAll('#piano .key').forEach(k => k.classList.remove('octave-active'));
  document.querySelectorAll('#piano .key-label').forEach(l => { l.textContent = ''; });

  if (state.strictRows) {
    const wks = state.whiteKeyStart;
    const strictOct = Math.floor(wks / 7) + OCT_MIN;
    document.getElementById('octave-value').textContent = strictOct;
    document.getElementById('btn-down').disabled = (wks < 7);
    document.getElementById('btn-up').disabled   = (wks + 7 > 40);

    BOTTOM_ROW_CODES.forEach((code, i) => {
      const { ni, oct } = whiteKeyAt(wks + i);
      document.querySelectorAll(`#piano .key[data-oct="${oct}"][data-ni="${ni}"]`)
        .forEach(k => {
          k.classList.add('octave-active');
          const label = k.querySelector('.key-label');
          if (label) { label.textContent = CODE_MAP[code].label; }
        });
    });

    const topRow = getStrictTopRow(wks);
    TOP_ROW_CODES.forEach((code, j) => {
      const info = topRow[j];
      if (!info) { return; }
      document.querySelectorAll(`#piano .key[data-oct="${info.oct}"][data-ni="${info.ni}"]`)
        .forEach(k => {
          k.classList.add('octave-active');
          const label = k.querySelector('.key-label');
          if (label) { label.textContent = CODE_MAP[code].label; }
        });
    });
  } else {
    document.getElementById('octave-value').textContent = state.currentOctave;
    document.getElementById('btn-down').disabled = (state.currentOctave <= OCT_MIN);
    document.getElementById('btn-up').disabled   = (state.currentOctave >= OCT_MAX);

    Object.keys(CODE_MAP).forEach(code => {
      const info = shiftedNote(CODE_MAP[code]);
      if (info.oct < OCT_MIN || info.oct > OCT_MAX) { return; }
      document.querySelectorAll(`#piano .key[data-oct="${info.oct}"][data-ni="${info.ni}"]`)
        .forEach(k => {
          k.classList.add('octave-active');
          const label = k.querySelector('.key-label');
          if (label) { label.textContent = CODE_MAP[code].label; }
        });
    });
  }

  scrollToActiveRange();
}

/* ── Upper piano ─────────────────────────────────────────────────── */

export function refreshUpperOctaveUI() {
  const valEl = document.getElementById('octave-value-upper');
  const dn    = document.getElementById('btn-down-upper');
  const up    = document.getElementById('btn-up-upper');
  if (valEl) { valEl.textContent = state.upperOctave; }
  if (dn)    { dn.disabled = (state.upperOctave <= OCT_MIN); }
  if (up)    { up.disabled = (state.upperOctave >= OCT_MAX); }

  document.querySelectorAll('#piano-upper .key').forEach(k => k.classList.remove('octave-active'));
  document.querySelectorAll(`#piano-upper .key[data-oct="${state.upperOctave}"]`).forEach(k => {
    k.classList.add('octave-active');
  });

  const pianoU = document.getElementById('piano-upper');
  const vpU    = document.getElementById('piano-viewport-upper');
  if (!pianoU || !vpU) { return; }
  const vw     = vpU.offsetWidth;
  const totalW = 50 * WKW;
  const gIdx   = (state.upperOctave - OCT_MIN) * 7;
  let tx = -(gIdx * WKW - Math.floor(vw / 4));
  tx = Math.min(0, Math.max(-(totalW - vw), tx));
  pianoU.style.transform = `translateX(${tx.toFixed(1)}px)`;
}

/* ── Scroll the lower piano to the active keyboard range ─────────── */

export function scrollToActiveRange() {
  const piano  = document.getElementById('piano');
  const vp     = document.getElementById('piano-viewport');
  const vw     = vp.offsetWidth;
  const totalW = 49 * WKW;

  let gIdx;
  if (state.strictRows) {
    gIdx = state.whiteKeyStart;
  } else {
    const aInfo = shiftedNote(CODE_MAP['KeyA']);
    const oct   = Math.max(OCT_MIN, Math.min(OCT_MAX, aInfo.oct));
    gIdx = (oct - OCT_MIN) * 7 + NI_TO_WHITE_POS[aInfo.ni];
  }
  let tx = -(gIdx * WKW - Math.floor(vw / 4));
  tx = Math.min(0, Math.max(-(totalW - vw), tx));
  piano.style.transform = `translateX(${tx.toFixed(1)}px)`;
}

/* ── Recalculate viewport widths ──────────────────────────────────── */

export function updateViewport() {
  const area = document.getElementById('piano-area');
  const containerW = area ? area.offsetWidth : window.innerWidth;

  const vw = Math.min(50 * WKW, Math.max(8 * WKW, containerW - 4));
  document.getElementById('piano-viewport').style.width = `${vw}px`;

  const vpU = document.getElementById('piano-viewport-upper');
  if (vpU) { vpU.style.width = `${vw}px`; }

  scrollToActiveRange();
}
