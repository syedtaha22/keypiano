import {
  WKW, BKW, OCT_MIN, OCT_MAX, NI_TO_WHITE_POS, CODE_MAP,
  BOTTOM_ROW_CODES, TOP_ROW_CODES, PRO_MAP,
  whiteKeyAt, getStrictTopRow,
} from '../constants.js';
import { state, shiftedNote } from '../state.js';

/** Current live key widths — updated by applyKeyZoom(). */
let liveWKW = WKW;
let liveBKW = BKW;

/* ── Lower (main) piano ──────────────────────────────────────────── */

export function refreshOctaveUI() {
  document.querySelectorAll('#piano .key').forEach(k => k.classList.remove('octave-active'));
  document.querySelectorAll('#piano .key-label').forEach(l => { l.textContent = ''; });

  if (state.proMode) {
    document.getElementById('octave-value').textContent = state.currentOctave;
    document.getElementById('btn-down').disabled = (state.currentOctave <= OCT_MIN + 1);
    document.getElementById('btn-up').disabled   = (state.currentOctave >= OCT_MAX - 1);

    for (let off = -1; off <= 1; off++) {
      const oct = state.currentOctave + off;
      if (oct < OCT_MIN || oct > OCT_MAX) { continue; }
      document.querySelectorAll(`#piano .key[data-oct="${oct}"]`).forEach(k => {
        k.classList.add('octave-active');
      });
    }
    Object.keys(PRO_MAP).forEach(code => {
      const def = PRO_MAP[code];
      const oct = state.currentOctave + def.octOff;
      if (oct < OCT_MIN || oct > OCT_MAX) { return; }
      document.querySelectorAll(`#piano .key[data-oct="${oct}"][data-ni="${def.ni}"]`)
        .forEach(k => {
          const label = k.querySelector('.key-label');
          if (label) { label.textContent = def.label; }
        });
    });

    scrollToActiveRange();
    return;
  }

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
  const totalW = 49 * liveWKW;
  const gIdx   = (state.upperOctave - OCT_MIN) * 7;
  let tx = -(gIdx * liveWKW - Math.floor(vw / 4));
  tx = Math.min(0, Math.max(-(totalW - vw), tx));
  pianoU.style.transform = `translateX(${tx.toFixed(1)}px)`;
}

/* ── Scroll the lower piano to the active keyboard range ─────────── */

export function scrollToActiveRange() {
  const piano  = document.getElementById('piano');
  const vp     = document.getElementById('piano-viewport');
  const vw     = vp.offsetWidth;
  const totalW = 49 * liveWKW;

  let gIdx;
  if (state.proMode) {
    const oct = Math.max(OCT_MIN + 1, Math.min(OCT_MAX - 1, state.currentOctave));
    gIdx = (oct - 1 - OCT_MIN) * 7; // start of O-1 octave so all 3 rows are in view
  } else if (state.strictRows) {
    gIdx = state.whiteKeyStart;
  } else {
    const aInfo = shiftedNote(CODE_MAP['KeyA']);
    const oct   = Math.max(OCT_MIN, Math.min(OCT_MAX, aInfo.oct));
    gIdx = (oct - OCT_MIN) * 7 + NI_TO_WHITE_POS[aInfo.ni];
  }
  let tx = -(gIdx * liveWKW - Math.floor(vw / 4));
  tx = Math.min(0, Math.max(-(totalW - vw), tx));
  piano.style.transform = `translateX(${tx.toFixed(1)}px)`;
}

/* ── Recalculate viewport widths ──────────────────────────────────── */

export function updateViewport() {
  const area = document.getElementById('piano-area');
  const containerW = area ? area.offsetWidth : window.innerWidth;
  const vw = Math.max(1, containerW - 4);

  document.getElementById('piano-viewport').style.width = `${vw}px`;
  const vpU = document.getElementById('piano-viewport-upper');
  if (vpU) { vpU.style.width = `${vw}px`; }

  applyKeyZoom(state.visibleOctaves);
}

/**
 * Resize all piano keys so exactly `octavesVisible` octaves fill the viewport.
 * Min 1, max 7 (the full piano).
 */
export function applyKeyZoom(octavesVisible) {
  const vp = document.getElementById('piano-viewport');
  if (!vp) { return; }
  const vpW = vp.offsetWidth;
  if (vpW <= 0) { return; }

  liveWKW = vpW / (octavesVisible * 7);
  liveBKW = liveWKW * (BKW / WKW);

  const root = document.documentElement;
  root.style.setProperty('--wkw', `${liveWKW.toFixed(2)}px`);
  root.style.setProperty('--bkw', `${liveBKW.toFixed(2)}px`);
  root.style.setProperty('--piano-total-w', `${(49 * liveWKW).toFixed(2)}px`);

  document.querySelectorAll('#piano .black-key[data-wki], #piano-upper .black-key[data-wki]').forEach(bk => {
    const wki = parseInt(bk.dataset.wki);
    bk.style.left = `${(wki * liveWKW - liveBKW / 2).toFixed(2)}px`;
  });

  scrollToActiveRange();
  refreshUpperOctaveUI();
}
