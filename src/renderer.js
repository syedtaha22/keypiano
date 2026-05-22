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
import { getAnalyser } from './audio/context.js';
import { startMetronome, stopMetronome } from './audio/metronome.js';

/* ── Keyboard ─────────────────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  if (e.repeat) { return; }

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
  if (!def || state.heldCodes.has(e.code)) { return; }
  state.heldCodes.add(e.code);
  const info = shiftedNote(def);
  pressNote(info.ni, info.oct, `kbd_${e.code}`);
});

document.addEventListener('keyup', e => {
  if (!CODE_MAP[e.code]) { return; }
  state.heldCodes.delete(e.code);
  releaseNote(`kbd_${e.code}`);
});

/* ── Octave controls ──────────────────────────────────────────────────── */

document.getElementById('btn-down').addEventListener('click', () => {
  if (state.currentOctave > OCT_MIN) { state.currentOctave--; state.noteShift = 0; refreshOctaveUI(); }
});
document.getElementById('btn-up').addEventListener('click', () => {
  if (state.currentOctave < OCT_MAX) { state.currentOctave++; state.noteShift = 0; refreshOctaveUI(); }
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
    state.currentScore = score;
    document.getElementById('piece-title').textContent = score.title ?? file.name;
    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-stop').disabled = true;
  };

  if (isMidi) { reader.readAsArrayBuffer(file); }
  else        { reader.readAsText(file); }
  e.target.value = '';
});

document.getElementById('btn-play').addEventListener('click', () => {
  if (state.currentScore) { schedulePlayback(state.currentScore); }
});
document.getElementById('btn-stop').addEventListener('click', stopPlayback);

/* ── Record (stub) ────────────────────────────────────────────────────── */

document.getElementById('btn-record').addEventListener('click', function () {
  this.classList.toggle('recording');
});

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
  }
});

/* ── Waveform visualizer ──────────────────────────────────────────────── */

function startVizLoop() {
  const canvas  = document.getElementById('waveform-canvas');
  const ctx2d   = canvas.getContext('2d');
  const analyser = getAnalyser();
  const bufLen  = analyser.fftSize;
  const timeBuf = new Uint8Array(bufLen);
  const freqBuf = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    requestAnimationFrame(draw);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (!W || !H) { return; }
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W;
      canvas.height = H;
    }

    ctx2d.fillStyle = '#09090b';
    ctx2d.fillRect(0, 0, W, H);

    if (state.vizMode === 'scope') {
      analyser.getByteTimeDomainData(timeBuf);
      ctx2d.strokeStyle = 'rgba(196,154,42,0.9)';
      ctx2d.lineWidth   = 1.5;
      ctx2d.shadowColor = 'rgba(196,154,42,0.35)';
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
      const bars  = 96;
      const barW  = W / bars;
      const gold  = 'rgba(196,154,42,';
      for (let i = 0; i < bars; i++) {
        const h = (freqBuf[i] / 255) * H;
        const a = 0.4 + (freqBuf[i] / 255) * 0.55;
        ctx2d.fillStyle = gold + a + ')';
        ctx2d.fillRect(Math.floor(i * barW), H - h, Math.max(1, barW - 1), h);
      }
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
    case 'detune':       return `${Math.round((v * 2 - 1) * 100)}¢`;
    case 'harmonic':     return `${Math.round(v * 100)}%`;
    case 'attack':       return `${(0.1 + v * 3.9).toFixed(1)}×`;
    case 'decay':        return `${(0.1 + v * 3.9).toFixed(1)}×`;
    case 'sustain-level':return `${(v * 2).toFixed(1)}×`;
    case 'release':      return `${(0.1 + v * 3.9).toFixed(1)}×`;
    case 'reverb':       return `${Math.round(v * 100)}%`;
    case 'room':         return `${Math.round(v * 100)}%`;
    case 'bass-eq':      return `${Math.round((v * 2 - 1) * 12)}dB`;
    case 'treble-eq':    return `${Math.round((v * 2 - 1) * 12)}dB`;
    case 'master-vol':   return `${Math.round(v * 100)}%`;
    case 'sus-pedal':    return v < 0.01 ? 'Off' : `${Math.round(v * 100)}%`;
    default:             return `${Math.round(v * 100)}%`;
  }
}

function applyKnobValue(id, v) {
  switch (id) {
    case 'detune':        state.detuneScale    = v * 2;                    break;
    case 'attack':        state.attackMult     = 0.1 + v * 3.9;            break;
    case 'decay':         state.decayMult      = 0.1 + v * 3.9;            break;
    case 'sustain-level': state.susLevelMult   = v * 2;                    break;
    case 'release':       state.releaseMult    = 0.1 + v * 3.9;            break;
    case 'master-vol': {
      state.volume = v;
      document.getElementById('volume-slider').value  = Math.round(v * 100);
      document.getElementById('volume-value').textContent = `${Math.round(v * 100)}%`;
      break;
    }
    case 'sus-pedal': {
      setSustain(v);
      break;
    }
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

/* ── Init ─────────────────────────────────────────────────────────────── */

buildPiano();
initSustainStrip();
setSustain(0);
refreshOctaveUI();
updateViewport();
setupDropdowns();
setupKnobs();
startVizLoop();
