/**
 * renderer.js — application entry point
 *
 * Wires together all modules, registers event listeners, and calls the
 * initialisation sequence. Does not contain any audio or parsing logic;
 * those live in their respective modules under audio/ and parsers/.
 */

import { state } from './state.js';
import { CODE_MAP, OCT_MIN, OCT_MAX } from './constants.js';
import { shiftedNote } from './state.js';
import { buildPiano } from './ui/piano-builder.js';
import { initSustainStrip, setSustain } from './ui/sustain-strip.js';
import { refreshOctaveUI, updateViewport } from './ui/viewport.js';
import { pressNote, releaseNote } from './ui/interactions.js';
import { schedulePlayback, stopPlayback } from './audio/playback.js';
import { parseMidi } from './parsers/midi.js';
import { parseKPS } from './parsers/kps.js';

/* ── Keyboard events ───────────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  if (e.repeat) {return;}

  if (e.code === 'ArrowLeft')  { e.preventDefault(); state.noteShift--; refreshOctaveUI(); return; }
  if (e.code === 'ArrowRight') { e.preventDefault(); state.noteShift++; refreshOctaveUI(); return; }

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

  if (e.code === 'KeyZ') {
    if (state.currentOctave > OCT_MIN) { state.currentOctave--; state.noteShift = 0; refreshOctaveUI(); }
    return;
  }
  if (e.code === 'KeyX') {
    if (state.currentOctave < OCT_MAX) { state.currentOctave++; state.noteShift = 0; refreshOctaveUI(); }
    return;
  }
  if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); return; }

  const def = CODE_MAP[e.code];
  if (!def || state.heldCodes.has(e.code)) {return;}
  state.heldCodes.add(e.code);
  const info = shiftedNote(def);
  pressNote(info.ni, info.oct, `kbd_${e.code}`);
});

document.addEventListener('keyup', e => {
  if (!CODE_MAP[e.code]) {return;}
  state.heldCodes.delete(e.code);
  releaseNote(`kbd_${e.code}`);
});

/* ── Octave controls ───────────────────────────────────────────────────── */

document.getElementById('btn-down').addEventListener('click', () => {
  if (state.currentOctave > OCT_MIN) { state.currentOctave--; state.noteShift = 0; refreshOctaveUI(); }
});
document.getElementById('btn-up').addEventListener('click', () => {
  if (state.currentOctave < OCT_MAX) { state.currentOctave++; state.noteShift = 0; refreshOctaveUI(); }
});

/* ── Volume slider ─────────────────────────────────────────────────────── */

document.getElementById('volume-slider').addEventListener('input', function () {
  state.volume = this.value / 100;
  document.getElementById('volume-value').textContent = `${this.value}%`;
});

/* ── Fullscreen ────────────────────────────────────────────────────────── */

function toggleFullscreen() {
  if (!document.fullscreenElement) {document.documentElement.requestFullscreen().catch(() => {});}
  else {document.exitFullscreen().catch(() => {});}
}
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => setTimeout(updateViewport, 100));
window.addEventListener('resize', updateViewport);

/* ── File loading ──────────────────────────────────────────────────────── */

document.getElementById('btn-load').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) {return;}
  const isMidi = /\.(mid|midi)$/i.test(file.name);
  const reader = new FileReader();

  reader.onload = ev => {
    const score = isMidi ? parseMidi(ev.target.result) : parseKPS(ev.target.result);
    if (!score?.notes) {
      document.getElementById('piece-title').textContent = 'load error';
      return;
    }
    state.currentScore = score;
    document.getElementById('piece-title').textContent = score.title ?? file.name;
    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-stop').disabled = true;
  };

  if (isMidi) {reader.readAsArrayBuffer(file);}
  else        {reader.readAsText(file);}
  e.target.value = '';
});

document.getElementById('btn-play').addEventListener('click', () => {
  if (state.currentScore) {schedulePlayback(state.currentScore);}
});
document.getElementById('btn-stop').addEventListener('click', stopPlayback);

/* ── Init ──────────────────────────────────────────────────────────────── */

buildPiano();
initSustainStrip();
setSustain(0);
refreshOctaveUI();
updateViewport();
