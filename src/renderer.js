import { state } from './state.js';
import {
  CODE_MAP, OCT_MIN, OCT_MAX, WKW, NI_TO_WHITE_POS,
  BOTTOM_ROW_CODES, TOP_ROW_CODES, MAX_WK_START,
  PRO_MAP, WHITE_TO_SHARP, NOTE_NAMES,
  whiteKeyAt, getStrictTopRow,
} from './constants.js';
import { shiftedNote } from './state.js';
import { buildPiano } from './ui/piano-builder.js';
import { initSustainStrip, setSustain } from './ui/sustain-strip.js';
import { refreshOctaveUI, refreshUpperOctaveUI, updateViewport, applyKeyZoom } from './ui/viewport.js';
import { pressNote, releaseNote } from './ui/interactions.js';
import { schedulePlayback, pausePlayback, stopPlayback } from './audio/playback.js';
import { parseMidi } from './parsers/midi.js';
import { parseKPS } from './parsers/kps.js';
import { getCtx, getAnalyser, setReverb, setRoomSize, setBassEQ, setTrebleEQ, getRecordingStream } from './audio/context.js';
import { clearWaveCache } from './audio/piano-model.js';
import { startMetronome, stopMetronome } from './audio/metronome.js';

/* ── Keyboard ─────────────────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  if (e.repeat) { return; }

  if (e.ctrlKey && e.code === 'KeyH') {
    e.preventDefault();
    const overlay = document.getElementById('promode-overlay');
    if (overlay && overlay.classList.contains('visible')) {
      hideKeyLayoutPopup();
    } else {
      showKeyLayoutPopup();
    }
    return;
  }

  if (e.code === 'ArrowLeft') {
    e.preventDefault();
    if (state.proMode) {
      if (state.currentOctave > OCT_MIN + 1) { state.currentOctave--; refreshOctaveUI(); }
    } else if (state.strictRows) {
      if (state.whiteKeyStart >= 7) { state.whiteKeyStart -= 7; refreshOctaveUI(); }
    } else {
      if (state.currentOctave > OCT_MIN) { state.currentOctave--; state.noteShift = 0; refreshOctaveUI(); }
    }
    return;
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    if (state.proMode) {
      if (state.currentOctave < OCT_MAX - 1) { state.currentOctave++; refreshOctaveUI(); }
    } else if (state.strictRows) {
      if (state.whiteKeyStart + 7 <= MAX_WK_START) { state.whiteKeyStart += 7; refreshOctaveUI(); }
    } else {
      if (state.currentOctave < OCT_MAX) { state.currentOctave++; state.noteShift = 0; refreshOctaveUI(); }
    }
    return;
  }
  if (e.code === 'ArrowUp') {
    e.preventDefault();
    if (state.strictRows) {
      if (state.whiteKeyStart < MAX_WK_START) { state.whiteKeyStart++; refreshOctaveUI(); }
    } else if (!state.proMode) {
      state.noteShift++; refreshOctaveUI();
    }
    return;
  }
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (state.strictRows) {
      if (state.whiteKeyStart > 0) { state.whiteKeyStart--; refreshOctaveUI(); }
    } else if (!state.proMode) {
      state.noteShift--; refreshOctaveUI();
    }
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (state.sustainAmount > 0) {
      state.savedSustain = state.sustainAmount;
      setSustain(0);
    } else {
      setSustain(state.savedSustain > 0 ? state.savedSustain : 0.5);
    }
    return;
  }

  if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); return; }

  // ── Pro-mode note input ──────────────────────────────────────────────
  if (state.proMode) {
    const def = PRO_MAP[e.code];
    if (!def || state.heldCodes.has(e.code)) { return; }
    let ni = def.ni;
    if (e.shiftKey) {
      const sharp = WHITE_TO_SHARP[ni];
      if (sharp === undefined) { return; } // E or B position — no black key
      ni = sharp;
    }
    state.heldCodes.add(e.code);
    const oct = state.currentOctave + def.octOff;
    pressNote(ni, oct, `kbd_${e.code}`);
    return;
  }

  // ── Normal / strict-rows note input ─────────────────────────────────
  if (!CODE_MAP[e.code] || state.heldCodes.has(e.code)) { return; }
  state.heldCodes.add(e.code);

  let info;
  if (state.strictRows) {
    const bi = BOTTOM_ROW_CODES.indexOf(e.code);
    const ti = TOP_ROW_CODES.indexOf(e.code);
    if (bi !== -1) {
      info = whiteKeyAt(state.whiteKeyStart + bi);
    } else if (ti !== -1) {
      info = getStrictTopRow(state.whiteKeyStart)[ti]; // null = gap, no black key here
    }
    if (!info) { return; }
  } else {
    info = shiftedNote(CODE_MAP[e.code]);
  }
  pressNote(info.ni, info.oct, `kbd_${e.code}`);
});

document.addEventListener('keyup', e => {
  if (state.proMode) {
    if (!PRO_MAP[e.code]) { return; }
    state.heldCodes.delete(e.code);
    releaseNote(`kbd_${e.code}`);
    return;
  }
  if (!CODE_MAP[e.code]) { return; }
  state.heldCodes.delete(e.code);
  releaseNote(`kbd_${e.code}`);
});

// Release all held keys when the window loses focus (e.g. Alt-Tab) so notes
// don't get stuck when keyup events are missed.
window.addEventListener('blur', () => {
  state.heldCodes.forEach(code => releaseNote(`kbd_${code}`));
  state.heldCodes.clear();
});

/* ── Octave controls (lower) ──────────────────────────────────────────── */

document.getElementById('btn-down').addEventListener('click', () => {
  if (state.proMode) {
    if (state.currentOctave > OCT_MIN + 1) { state.currentOctave--; refreshOctaveUI(); }
  } else if (state.strictRows) {
    if (state.whiteKeyStart >= 7) { state.whiteKeyStart -= 7; refreshOctaveUI(); }
  } else {
    if (state.currentOctave > OCT_MIN) { state.currentOctave--; state.noteShift = 0; refreshOctaveUI(); }
  }
});
document.getElementById('btn-up').addEventListener('click', () => {
  if (state.proMode) {
    if (state.currentOctave < OCT_MAX - 1) { state.currentOctave++; refreshOctaveUI(); }
  } else if (state.strictRows) {
    if (state.whiteKeyStart + 7 <= MAX_WK_START) { state.whiteKeyStart += 7; refreshOctaveUI(); }
  } else {
    if (state.currentOctave < OCT_MAX) { state.currentOctave++; state.noteShift = 0; refreshOctaveUI(); }
  }
});

/* ── Octave controls (upper piano) ───────────────────────────────────── */

document.getElementById('btn-down-upper').addEventListener('click', () => {
  if (state.upperOctave > OCT_MIN) { state.upperOctave--; refreshUpperOctaveUI(); }
});
document.getElementById('btn-up-upper').addEventListener('click', () => {
  if (state.upperOctave < OCT_MAX) { state.upperOctave++; refreshUpperOctaveUI(); }
});

/* ── Key zoom (dock) ─────────────────────────────────────────────────── */

function updateZoomLabel() {
  const el = document.getElementById('zoom-value');
  if (el) { el.textContent = `${state.visibleOctaves} oct`; }
  document.getElementById('btn-zoom-out').disabled = (state.visibleOctaves <= 1);
  document.getElementById('btn-zoom-in').disabled  = (state.visibleOctaves >= 7);
}

document.getElementById('btn-zoom-out').addEventListener('click', () => {
  if (state.visibleOctaves > 1) {
    state.visibleOctaves--;
    updateZoomLabel();
    applyKeyZoom(state.visibleOctaves);
  }
});
document.getElementById('btn-zoom-in').addEventListener('click', () => {
  if (state.visibleOctaves < 7) {
    state.visibleOctaves++;
    updateZoomLabel();
    applyKeyZoom(state.visibleOctaves);
  }
});

/* ── Volume slider (dock) ─────────────────────────────────────────────── */

document.getElementById('volume-slider').addEventListener('input', function () {
  const v = this.value / 100;
  state.volume = v;
  document.getElementById('volume-value').textContent = `${this.value}%`;
  syncKnobVisual('master-vol', v);
});

/* ── Fullscreen ───────────────────────────────────────────────────────── */

function toggleFullscreen() {
  if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); }
  else { document.exitFullscreen().catch(() => {}); }
}
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => setTimeout(updateViewport, 100));
window.addEventListener('resize', updateViewport);

/* ── File loading ─────────────────────────────────────────────────────── */

document.getElementById('btn-load').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) { return; }
  const isMidi = /\.(mid|midi)$/i.test(file.name);
  const reader = new FileReader();

  reader.onload = ev => {
    const score = isMidi ? parseMidi(ev.target.result) : parseKPS(ev.target.result);
    if (!score?.notes) {
      document.getElementById('piece-title').textContent = 'load error';
      return;
    }
    stopPlayback(); // cancel any in-progress playback + reset transport
    state.currentScore = score;
    state.playbackPausePosition = 0;
    document.getElementById('piece-title').textContent = score.title ?? file.name;
    document.getElementById('btn-playstop').disabled = false;
    document.getElementById('btn-playstop').setAttribute('aria-label', 'Play');
    document.getElementById('btn-export').disabled = false;
    if (score.notes.length) {
      const spb = 60 / score.tempo;
      const last = score.notes[score.notes.length - 1];
      state.playbackDuration = (last.time + last.duration) * spb;
    }
    document.getElementById('tl-total').textContent = fmtTime(state.playbackDuration);
    document.getElementById('tl-elapsed').textContent = '0:00';
    document.getElementById('tl-fill').style.width = '0%';
    const tlPhLoad = document.getElementById('tl-ph');
    if (tlPhLoad) { tlPhLoad.style.left = '0%'; }
    buildTimelineTicks();
    document.getElementById('timeline').classList.add('has-score');
  };

  if (isMidi) { reader.readAsArrayBuffer(file); }
  else        { reader.readAsText(file); }
  e.target.value = '';
});

document.getElementById('btn-playstop').addEventListener('click', () => {
  if (state.isPlaying) {
    pausePlayback();
  } else if (state.playbackPausePosition > 0 && state.currentScore) {
    schedulePlayback(state.currentScore, state.playbackPausePosition);
  } else if (state.currentScore) {
    schedulePlayback(state.currentScore, 0);
  }
});

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/* ── Dropdowns ────────────────────────────────────────────────────────── */

function setupDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dd => {
    const trigger = dd.querySelector('[id^="btn-"]');
    const menu    = dd.querySelector('.dd-menu');
    if (!trigger || !menu) { return; }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = menu.classList.contains('open');
      document.querySelectorAll('.dd-menu.open').forEach(m => m.classList.remove('open'));
      if (!wasOpen) { menu.classList.add('open'); }
    });

    menu.addEventListener('click', e => e.stopPropagation());
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dd-menu.open').forEach(m => m.classList.remove('open'));
  });
}

/* ── Settings ─────────────────────────────────────────────────────────── */

document.getElementById('chk-note-names').addEventListener('change', function () {
  document.body.classList.toggle('hide-names', !this.checked);
});
document.getElementById('chk-key-hints').addEventListener('change', function () {
  document.body.classList.toggle('hide-hints', !this.checked);
});
document.getElementById('chk-strict-rows').addEventListener('change', function () {
  state.strictRows = this.checked;
  if (this.checked) {
    state.proMode = false;
    document.getElementById('chk-pro-mode').checked = false;
    const aNote  = shiftedNote(CODE_MAP['KeyA']);
    const oct    = Math.max(OCT_MIN, Math.min(OCT_MAX, aNote.oct));
    const wkPos  = NI_TO_WHITE_POS[aNote.ni];
    state.whiteKeyStart = Math.max(0, Math.min(MAX_WK_START, (oct - OCT_MIN) * 7 + wkPos));
    showKeyLayoutPopup();
  } else {
    hideKeyLayoutPopup();
  }
  refreshOctaveUI();
});

/* ── Pro mode ─────────────────────────────────────────────────────────── */

let pmKeyDismiss = null;

function showKeyLayoutPopup() {
  const overlay = document.getElementById('promode-overlay');
  if (!overlay) { return; }
  const popup = document.getElementById('promode-popup');

  popup.classList.remove('mode-normal', 'mode-strict');
  if (!state.proMode) {
    popup.classList.add(state.strictRows ? 'mode-strict' : 'mode-normal');
  }

  overlay.classList.add('visible');
  syncPopupLabels(); // populate all labels from current state

  if (pmKeyDismiss) { document.removeEventListener('keydown', pmKeyDismiss); }
  pmKeyDismiss = (e) => {
    if (e.ctrlKey && e.code === 'KeyH') { return; }
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) { return; }
    hideKeyLayoutPopup();
  };
  document.addEventListener('keydown', pmKeyDismiss);
}

function hideKeyLayoutPopup() {
  const overlay = document.getElementById('promode-overlay');
  if (overlay) { overlay.classList.remove('visible'); }
  if (pmKeyDismiss) { document.removeEventListener('keydown', pmKeyDismiss); pmKeyDismiss = null; }
}

function syncPopupLabels() {
  const overlay = document.getElementById('promode-overlay');
  if (!overlay || !overlay.classList.contains('visible')) { return; }
  const o = state.currentOctave;
  if (state.proMode) {
    document.getElementById('pm-oct-q').innerHTML = `Octave <em>${o - 1}</em>`;
    document.getElementById('pm-oct-a').innerHTML = `Octave <em>${o}</em> — centre`;
    document.getElementById('pm-oct-z').innerHTML = `Octave <em>${o + 1}</em>`;
  } else if (state.strictRows) {
    const wks = state.whiteKeyStart;
    document.querySelectorAll('#pm-strict [data-strict-bidx]').forEach(el => {
      const { ni } = whiteKeyAt(wks + parseInt(el.dataset.strictBidx));
      const noteEl = el.querySelector('.pmk-n');
      if (noteEl) { noteEl.textContent = NOTE_NAMES[ni]; }
    });
    const topRow = getStrictTopRow(wks);
    document.querySelectorAll('#pm-strict [data-strict-tidx]').forEach(el => {
      const info = topRow[parseInt(el.dataset.strictTidx)];
      const noteEl = el.querySelector('.pmk-n');
      if (noteEl) { noteEl.textContent = info ? NOTE_NAMES[info.ni] : '—'; }
      el.style.opacity = info ? '' : '0.15';
    });
  } else {
    const baseOct = shiftedNote(CODE_MAP['KeyA']).oct;
    document.getElementById('pm-oct-normal').innerHTML = `Octave <em>${baseOct}</em>`;
    document.getElementById('pm-oct-normal-plus').innerHTML = `Octave <em>${baseOct + 1}</em>`;
    document.querySelectorAll('#pm-normal .pm-kb-key[data-code]').forEach(el => {
      const def = CODE_MAP[el.dataset.code];
      if (!def) { return; }
      const noteEl = el.querySelector('.pmk-n');
      if (noteEl) { noteEl.textContent = NOTE_NAMES[shiftedNote(def).ni]; }
    });
  }
}


document.getElementById('chk-pro-mode').addEventListener('change', function () {
  state.proMode = this.checked;
  if (this.checked) {
    state.strictRows = false;
    document.getElementById('chk-strict-rows').checked = false;
    state.currentOctave = Math.max(OCT_MIN + 1, Math.min(OCT_MAX - 1, state.currentOctave));
    showKeyLayoutPopup();
  } else {
    hideKeyLayoutPopup();
  }
  refreshOctaveUI();
});

document.getElementById('pm-close').addEventListener('click', hideKeyLayoutPopup);
document.getElementById('promode-overlay').addEventListener('click', hideKeyLayoutPopup);
document.getElementById('promode-popup').addEventListener('click', e => e.stopPropagation());

/* ── Metronome ────────────────────────────────────────────────────────── */

function restartMetronome() {
  stopMetronome();
  startMetronome(state.metronomeBPM, state.metronomeBeatsPerBar);
}

document.getElementById('btn-bpm-down').addEventListener('click', () => {
  state.metronomeBPM = Math.max(20, state.metronomeBPM - 1);
  document.getElementById('bpm-value').textContent = state.metronomeBPM;
  if (state.metronomeEnabled) { restartMetronome(); }
});
document.getElementById('btn-bpm-up').addEventListener('click', () => {
  state.metronomeBPM = Math.min(300, state.metronomeBPM + 1);
  document.getElementById('bpm-value').textContent = state.metronomeBPM;
  if (state.metronomeEnabled) { restartMetronome(); }
});
document.getElementById('metro-toggle').addEventListener('click', () => {
  state.metronomeEnabled = !state.metronomeEnabled;
  document.getElementById('metro-tog').classList.toggle('on', state.metronomeEnabled);
  document.getElementById('btn-metronome').classList.toggle('lit', state.metronomeEnabled);
  if (state.metronomeEnabled) { restartMetronome(); }
  else                         { stopMetronome(); }
});
document.getElementById('metro-timesig').addEventListener('change', function () {
  state.metronomeBeatsPerBar = parseInt(this.value);
  if (state.metronomeEnabled) { restartMetronome(); }
});

/* ── Layout toggle ────────────────────────────────────────────────────── */

document.getElementById('btn-layout-single').addEventListener('click', () => {
  if (state.dualDock) {
    state.dualDock = false;
    document.getElementById('btn-layout-single').classList.add('active');
    document.getElementById('btn-layout-dual').classList.remove('active');
    document.getElementById('piano-area-upper').classList.add('hidden');
    updateViewport();
  }
});

document.getElementById('btn-layout-dual').addEventListener('click', () => {
  if (!state.dualDock) {
    state.dualDock = true;
    document.getElementById('btn-layout-dual').classList.add('active');
    document.getElementById('btn-layout-single').classList.remove('active');
    const upperArea = document.getElementById('piano-area-upper');
    upperArea.classList.remove('hidden');
    if (!document.querySelector('#piano-upper .key')) {
      buildPiano('piano-upper');
    }
    updateViewport();
    refreshUpperOctaveUI();
  }
});

/* ── Waveform visualizer ──────────────────────────────────────────────── */

// Cached so getComputedStyle is not called on every animation frame.
let cachedAccent = '#c49a2a';
function refreshAccentCache() {
  cachedAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c49a2a';
}

function startVizLoop() {
  const canvas    = document.getElementById('waveform-canvas');
  const ctx2d     = canvas.getContext('2d');
  const analyser  = getAnalyser();
  const bufLen    = analyser.fftSize;
  const timeBuf   = new Uint8Array(bufLen);
  const freqBuf   = new Uint8Array(analyser.frequencyBinCount);
  const tlFill    = document.getElementById('tl-fill');
  const tlElapsed = document.getElementById('tl-elapsed');
  const tlPh      = document.getElementById('tl-ph');

  function draw() {
    requestAnimationFrame(draw);

    if (state.isPlaying && state.playbackDuration > 0) {
      const elapsed = Math.max(0, getCtx().currentTime - state.playbackStartAudioTime);
      const clamped = Math.min(elapsed, state.playbackDuration);
      const pct     = `${(clamped / state.playbackDuration * 100).toFixed(1)}%`;
      tlFill.style.width    = pct;
      tlElapsed.textContent = fmtTime(clamped);
      if (tlPh) { tlPh.style.left = pct; }
    }
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (!W || !H) { return; }
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W;
      canvas.height = H;
    }

    ctx2d.fillStyle = '#09090b';
    ctx2d.fillRect(0, 0, W, H);

    const accent = cachedAccent;

    if (state.vizMode === 'scope') {
      analyser.getByteTimeDomainData(timeBuf);
      ctx2d.strokeStyle = accent;
      ctx2d.lineWidth   = 1.5;
      ctx2d.shadowColor = accent;
      ctx2d.shadowBlur  = 5;
      ctx2d.beginPath();
      const step = bufLen / W;
      for (let x = 0; x < W; x++) {
        const idx = Math.floor(x * step);
        const y   = (timeBuf[idx] / 128.0) * (H / 2);
        if (x === 0) { ctx2d.moveTo(x, y); }
        else          { ctx2d.lineTo(x, y); }
      }
      ctx2d.stroke();
    } else {
      analyser.getByteFrequencyData(freqBuf);
      const bars = 96;
      const barW = W / bars;
      ctx2d.fillStyle = accent;
      for (let i = 0; i < bars; i++) {
        const h = (freqBuf[i] / 255) * H;
        ctx2d.globalAlpha = 0.4 + (freqBuf[i] / 255) * 0.55;
        ctx2d.fillRect(Math.floor(i * barW), H - h, Math.max(1, barW - 1), h);
      }
      ctx2d.globalAlpha = 1;
    }
  }
  draw();
}

document.getElementById('btn-viz-scope').addEventListener('click', () => {
  state.vizMode = 'scope';
  document.getElementById('btn-viz-scope').classList.add('active');
  document.getElementById('btn-viz-spectrum').classList.remove('active');
});
document.getElementById('btn-viz-spectrum').addEventListener('click', () => {
  state.vizMode = 'spectrum';
  document.getElementById('btn-viz-spectrum').classList.add('active');
  document.getElementById('btn-viz-scope').classList.remove('active');
});

/* ── Preset buttons ───────────────────────────────────────────────────── */

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.waveformPreset = btn.dataset.preset;
    clearWaveCache();
  });
});

/* ── Knobs ────────────────────────────────────────────────────────────── */

const ARC_SWEEP = 84.823;
const ARC_TOTAL = 113.097;

function knobArcDash(v) {
  const fill = v * ARC_SWEEP;
  return `${fill.toFixed(3)} ${(ARC_TOTAL - fill).toFixed(3)}`;
}

function formatKnobVal(id, v) {
  switch (id) {
    case 'detune':        return `${Math.round((v * 2 - 1) * 100)}¢`;
    case 'harmonic':      return v < 0.06 ? 'Sine' : v > 0.94 ? 'Bright' : `${Math.round(v * 100)}%`;
    case 'attack':        return `${Math.round(0.1 + v * v * 99.9)}×`;
    case 'decay':         return `${(0.1 + v * 3.9).toFixed(1)}×`;
    case 'sustain-level': return `${(v * 2).toFixed(1)}×`;
    case 'release':       return `${(0.1 + v * 3.9).toFixed(1)}×`;
    case 'reverb':        return `${Math.round(v * 100)}%`;
    case 'room':          return `${(0.3 + v * 4.7).toFixed(1)}s`;
    case 'bass-eq':       return `${Math.round((v * 2 - 1) * 12)}dB`;
    case 'treble-eq':     return `${Math.round((v * 2 - 1) * 12)}dB`;
    case 'master-vol':    return `${Math.round(v * 100)}%`;
    case 'sus-pedal':     return v < 0.01 ? 'Off' : `${Math.round(v * 100)}%`;
    default:              return `${Math.round(v * 100)}%`;
  }
}

function applyKnobValue(id, v) {
  switch (id) {
    case 'detune':        state.detuneScale    = v * 2;                    break;
    case 'harmonic':      state.harmonicBright = v; clearWaveCache();       break;
    case 'attack':        state.attackMult     = 0.1 + v * v * 99.9;       break;
    case 'decay':         state.decayMult      = 0.1 + v * 3.9;            break;
    case 'sustain-level': state.susLevelMult   = v * 2;                    break;
    case 'release':       state.releaseMult    = 0.1 + v * 3.9;            break;
    case 'reverb':        setReverb(v);                                     break;
    case 'room':          setRoomSize(v);                                   break;
    case 'bass-eq':       setBassEQ((v * 2 - 1) * 12);                     break;
    case 'treble-eq':     setTrebleEQ((v * 2 - 1) * 12);                   break;
    case 'master-vol': {
      state.volume = v;
      document.getElementById('volume-slider').value  = Math.round(v * 100);
      document.getElementById('volume-value').textContent = `${Math.round(v * 100)}%`;
      break;
    }
    case 'sus-pedal': setSustain(v); break;
  }
}

function syncKnobVisual(id, v) {
  const wrap = document.querySelector(`.knob-wrap[data-knob="${id}"]`);
  if (!wrap) { return; }
  wrap.dataset.value = v;
  const fill = wrap.querySelector('.k-fill');
  const cap  = wrap.querySelector('.knob-cap');
  const disp = wrap.querySelector('.knob-val');
  if (fill) { fill.setAttribute('stroke-dasharray', knobArcDash(v)); }
  if (cap)  { cap.style.transform = `rotate(${(-135 + v * 270).toFixed(1)}deg)`; }
  if (disp) { disp.textContent = formatKnobVal(id, v); }
}

function setupKnobs() {
  document.querySelectorAll('.knob-wrap[data-knob]').forEach(wrap => {
    const id  = wrap.dataset.knob;
    const cap = wrap.querySelector('.knob-cap');
    if (!cap) { return; }

    let dragging = false;
    let startY   = 0;
    let startVal = 0;

    cap.addEventListener('mousedown', e => {
      dragging = true;
      startY   = e.clientY;
      startVal = parseFloat(wrap.dataset.value ?? '0.5');
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) { return; }
      const dy = startY - e.clientY;
      const v  = Math.max(0, Math.min(1, startVal + dy / 150));
      wrap.dataset.value = v;
      syncKnobVisual(id, v);
      applyKnobValue(id, v);
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  });
}

/* ── Piano drag scroll ────────────────────────────────────────────────── */

function setupPianoDrag(vpId, pianoId) {
  const vp = document.getElementById(vpId);
  if (!vp) { return; }

  let dragging = false;
  let lastX    = 0;

  vp.addEventListener('mousedown', e => {
    if (e.button !== 1) { return; } // middle mouse button only
    e.preventDefault(); // suppress browser auto-scroll cursor
    dragging = true;
    lastX    = e.clientX;
    vp.style.cursor = 'grabbing';
    vp.classList.add('dragging');
    const p = document.getElementById(pianoId);
    if (p) { p.style.transition = 'none'; }
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) { return; }
    const piano  = document.getElementById(pianoId);
    if (!piano) { return; }
    const delta  = e.clientX - lastX;
    lastX        = e.clientX;
    const totalW = 49 * WKW;
    const vw     = vp.offsetWidth;
    const m      = piano.style.transform.match(/translateX\(([^p]+)px\)/);
    const cur    = m ? parseFloat(m[1]) : 0;
    piano.style.transform = `translateX(${Math.min(0, Math.max(-(totalW - vw), cur + delta)).toFixed(1)}px)`;
  });

  document.addEventListener('mouseup', e => {
    if (!dragging || e.button !== 1) { return; }
    dragging = false;
    vp.style.cursor = 'grab';
    vp.classList.remove('dragging');
    const p = document.getElementById(pianoId);
    if (p) { p.style.transition = ''; }
  });
}

/* ── Blender-style pane resize ────────────────────────────────────────── */

function setupPaneResize() {
  const area = document.getElementById('studio-area');

  /* Vertical divider — resizes left/right columns */
  const rhV = document.getElementById('rh-v');
  if (rhV && area) {
    let dragging = false;
    let startX   = 0;
    let startLeft = 0;

    rhV.addEventListener('mousedown', e => {
      dragging  = true;
      startX    = e.clientX;
      startLeft = rhV.getBoundingClientRect().left - area.getBoundingClientRect().left - 8;
      rhV.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) { return; }
      const available = area.offsetWidth - 16 - 6;
      const newLeft   = Math.max(120, Math.min(available - 120, startLeft + (e.clientX - startX)));
      area.style.gridTemplateColumns = `${newLeft}px 6px 1fr`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) { return; }
      dragging = false;
      rhV.classList.remove('dragging');
    });
  }

  /* Horizontal divider — resizes top/bottom rows */
  const rhH = document.getElementById('rh-h');
  if (rhH && area) {
    let dragging = false;
    let startY   = 0;
    let startTop = 0;

    rhH.addEventListener('mousedown', e => {
      dragging = true;
      startY   = e.clientY;
      startTop = rhH.getBoundingClientRect().top - area.getBoundingClientRect().top - 8;
      rhH.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) { return; }
      const available = area.offsetHeight - 16 - 6;
      const newTop    = Math.max(60, Math.min(available - 60, startTop + (e.clientY - startY)));
      area.style.gridTemplateRows = `${newTop}px 6px 1fr`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) { return; }
      dragging = false;
      rhH.classList.remove('dragging');
    });
  }

  /* Dock resize grip — drag up to make piano keys taller via CSS variable */
  const dockGrip = document.getElementById('dock-resize');
  if (dockGrip) {
    let dragging = false;
    let startY   = 0;
    let startWKH = 200;

    const getWKH = () => {
      const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--wkh'));
      return isNaN(v) ? 200 : v;
    };

    dockGrip.addEventListener('mousedown', e => {
      dragging  = true;
      startY    = e.clientY;
      startWKH  = getWKH();
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) { return; }
      const dy     = startY - e.clientY;
      const newWKH = Math.max(80, Math.min(340, startWKH + dy));
      document.documentElement.style.setProperty('--wkh', `${newWKH}px`);
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  }
}

/* ── Accent colour picker ─────────────────────────────────────────────── */

const ACCENT_PALETTES = {
  gold:    { hex: '#c49a2a', br: '#d4aa3a', r: 196, g: 154, b: 42  },
  blue:    { hex: '#3b82f6', br: '#60a5fa', r: 59,  g: 130, b: 246 },
  emerald: { hex: '#10b981', br: '#34d399', r: 16,  g: 185, b: 129 },
  rose:    { hex: '#f43f5e', br: '#fb7185', r: 244, g: 63,  b: 94  },
};

function setupAccentPicker() {
  document.querySelectorAll('.accent-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.accent;
      const p   = ACCENT_PALETTES[key];
      if (!p) { return; }
      const root = document.documentElement;
      root.style.setProperty('--accent',      p.hex);
      root.style.setProperty('--accent-br',   p.br);
      root.style.setProperty('--accent-dim',  `rgba(${p.r},${p.g},${p.b},0.35)`);
      root.style.setProperty('--accent-glow', `rgba(${p.r},${p.g},${p.b},0.14)`);
      root.style.setProperty('--accent-tr',   `rgba(${p.r},${p.g},${p.b},0.06)`);
      state.accentKey = key;
      refreshAccentCache();
      document.querySelectorAll('.accent-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

/* ── Timeline ruler ticks ─────────────────────────────────────────────── */

function buildTimelineTicks() {
  const ticksEl = document.getElementById('tl-ticks');
  const subsEl  = document.getElementById('tl-subs');
  if (!ticksEl || !subsEl) { return; }

  const dur   = state.playbackDuration;
  const BEATS = 16;
  const SUBS  = 64;

  ticksEl.innerHTML = '';
  subsEl.innerHTML  = '';

  for (let i = 0; i < BEATS; i++) {
    const b = document.createElement('div');
    b.className = 'tl-beat' + (i % 4 === 0 ? ' bar' : '');
    if (i > 0 && i % 4 === 0 && dur > 0) {
      const lbl = document.createElement('span');
      lbl.className   = 'tl-lbl';
      lbl.textContent = fmtTime((i / BEATS) * dur);
      b.appendChild(lbl);
    }
    ticksEl.appendChild(b);
  }

  for (let i = 0; i < SUBS; i++) {
    const s = document.createElement('div');
    s.className = 'tl-sub';
    subsEl.appendChild(s);
  }
}

/* ── Seekable timeline ────────────────────────────────────────────────── */

function setupTimeline() {
  const track = document.getElementById('tl-track');
  if (!track) { return; }
  let seeking = false;

  function seekTo(fraction) {
    if (!state.currentScore || state.playbackDuration <= 0) { return; }
    const pos = Math.max(0, Math.min(state.playbackDuration, fraction * state.playbackDuration));
    const pct = `${(fraction * 100).toFixed(1)}%`;
    state.playbackPausePosition = pos;
    document.getElementById('tl-fill').style.width    = pct;
    document.getElementById('tl-elapsed').textContent = fmtTime(pos);
    const ph = document.getElementById('tl-ph');
    if (ph) { ph.style.left = pct; }
    if (state.isPlaying) { schedulePlayback(state.currentScore, pos); }
  }

  track.addEventListener('mousedown', e => {
    if (!state.currentScore) { return; }
    seeking = true;
    const rect = track.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('mousemove', e => {
    if (!seeking) { return; }
    const r = document.getElementById('tl-track').getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  });
  document.addEventListener('mouseup', () => { seeking = false; });
}

/* ── Audio export ─────────────────────────────────────────────────────── */

function encodeWAV(channels, sampleRate) {
  const numCh          = channels.length;
  const numFrames      = channels[0].length;
  const bps            = 16;
  const bytesPerSample = bps / 8;
  const blockAlign     = numCh * bytesPerSample;
  const dataSize       = numFrames * blockAlign;
  const buf  = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const str  = (s, o) => { for (let i = 0; i < s.length; i++) { view.setUint8(o + i, s.charCodeAt(i)); } };

  str('RIFF', 0);  view.setUint32(4,  36 + dataSize, true);
  str('WAVE', 8);
  str('fmt ', 12); view.setUint32(16, 16,         true);
  view.setUint16(20, 1,          true);
  view.setUint16(22, numCh,      true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bps,        true);
  str('data', 36); view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let f = 0; f < numFrames; f++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][f]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return buf;
}

function setupExport() {
  const btn = document.getElementById('btn-export');
  if (!btn) { return; }

  btn.addEventListener('click', () => {
    if (!state.currentScore || btn.disabled) { return; }

    const fmt       = document.getElementById('export-fmt')?.value ?? 'webm';
    const stopDelay = (state.playbackDuration + 1.5) * 1000;
    const title     = (state.currentScore.title ?? 'keypiano-export').replace(/[/\\:*?"<>|]/g, '_');

    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Recording…';
    document.getElementById('btn-playstop').disabled = true;

    if (fmt === 'wav') {
      const ctx        = getCtx();
      const sampleRate = ctx.sampleRate;
      const processor  = ctx.createScriptProcessor(4096, 2, 2);
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      const wavCh = [[], []];

      processor.onaudioprocess = e => {
        wavCh[0].push(new Float32Array(e.inputBuffer.getChannelData(0)));
        wavCh[1].push(new Float32Array(e.inputBuffer.getChannelData(1)));
      };

      getAnalyser().connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      schedulePlayback(state.currentScore, 0);

      setTimeout(() => {
        processor.disconnect();
        silentGain.disconnect();

        const len    = wavCh[0].reduce((a, c) => a + c.length, 0);
        const merged = [new Float32Array(len), new Float32Array(len)];
        let off = 0;
        wavCh[0].forEach((c, i) => {
          merged[0].set(c, off);
          merged[1].set(wavCh[1][i], off);
          off += c.length;
        });

        const wavBuf = encodeWAV(merged, sampleRate);
        const blob   = new Blob([wavBuf], { type: 'audio/wav' });
        const url    = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href = url; a.download = `${title}.wav`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);

        btn.disabled = false;
        btn.querySelector('.btn-label').textContent = 'Export';
        document.getElementById('btn-playstop').disabled = false;
      }, stopDelay);
    } else {
      const stream   = getRecordingStream();
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks   = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) { chunks.push(e.data); } };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `${title}.webm`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        btn.disabled = false;
        btn.querySelector('.btn-label').textContent = 'Export';
        document.getElementById('btn-playstop').disabled = false;
      };

      recorder.start();
      schedulePlayback(state.currentScore, 0);
      setTimeout(() => { if (recorder.state !== 'inactive') { recorder.stop(); } }, stopDelay);
    }
  });
}

/* ── Init ─────────────────────────────────────────────────────────────── */

buildPiano();
initSustainStrip();
setSustain(0);
refreshOctaveUI();
updateViewport();
updateZoomLabel();
setupDropdowns();
setupKnobs();
setupPianoDrag('piano-viewport', 'piano');
setupPianoDrag('piano-viewport-upper', 'piano-upper');
setupPaneResize();
setupAccentPicker();
refreshAccentCache();
setupTimeline();
setupExport();
startVizLoop();
