import { getCtx, getPlaybackGain, noteFreq } from './context.js';
import { getZone, getWave, getNoiseBuffer, resolveEnvelope } from './piano-model.js';
import { parseNoteName } from '../parsers/kps.js';
import { state } from '../state.js';
import { OCT_MIN, OCT_MAX } from '../constants.js';

/** @type {Array<{oscs: AudioNode[], gainNode: GainNode|null, timers: number[]}>} */
let playbackItems = [];

/**
 * Schedule a single note, fully respecting the current preset, envelope
 * multipliers, detune scale, and waveform — the same parameters that apply
 * to keyboard-triggered notes.
 *
 * Connects to playbackGain (not masterGain) so the sustain system cannot
 * accidentally cancel pre-scheduled gain automation.
 */
export function scheduleNote(ni, oct, audioStart, audioDur) {
  const ctx     = getCtx();
  const bus     = getPlaybackGain();
  const freq    = noteFreq(ni, oct);
  const zone    = getZone(freq);
  const wave    = getWave(zone, ctx);
  const perG    = 1 / zone.strings;
  const peakVol = state.volume * 0.88;

  const { attack, decayTC, susLevel, release, hammerGainMult } = resolveEnvelope(zone);

  const relStart = audioStart + audioDur;

  // Approximate gain at note-off after the natural decay phase
  const gainAtRelease = peakVol * (susLevel + (1 - susLevel) * Math.exp(-audioDur / decayTC));

  const item = { oscs: [], gainNode: null, timers: [] };

  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0, audioStart);
  gn.gain.linearRampToValueAtTime(peakVol, audioStart + attack);
  gn.gain.setTargetAtTime(peakVol * susLevel, audioStart + attack, decayTC);
  gn.gain.setValueAtTime(gainAtRelease, relStart);
  gn.gain.linearRampToValueAtTime(0, relStart + release);
  gn.connect(bus);
  item.gainNode = gn;

  zone.detunes.forEach(d => {
    const og = ctx.createGain();
    og.gain.value = perG;
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = freq;
    o.detune.value = d * state.detuneScale;
    o.connect(og);
    og.connect(gn);
    o.start(audioStart);
    o.stop(relStart + release + 0.15);
    item.oscs.push(o);
  });

  if (hammerGainMult > 0) {
    const nb = getNoiseBuffer(ctx);
    const ns = ctx.createBufferSource();
    ns.buffer = nb;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = zone.hammerFreq;
    nf.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, audioStart - 0.001);
    ng.gain.linearRampToValueAtTime(peakVol * zone.hammerGain * hammerGainMult, audioStart + 0.006);
    ng.gain.linearRampToValueAtTime(0, audioStart + 0.044);
    ns.connect(nf);
    nf.connect(ng);
    ng.connect(bus);
    const safeStart = Math.max(ctx.currentTime + 0.001, audioStart);
    ns.start(safeStart);
    ns.stop(safeStart + 0.06);
    item.oscs.push(ns);
  }

  // Visual key highlight
  const now = ctx.currentTime;
  const sel = `.key[data-oct="${oct}"][data-ni="${ni}"]`;
  item.timers.push(setTimeout(() => {
    if (!state.isPlaying) { return; }
    document.querySelectorAll(sel).forEach(k => k.classList.add('active'));
  }, Math.max(0, (audioStart - now) * 1000)));
  item.timers.push(setTimeout(() => {
    document.querySelectorAll(sel).forEach(k => k.classList.remove('active'));
  }, Math.max(0, (relStart - now) * 1000)));

  playbackItems.push(item);
}

/**
 * Schedule all notes in a score for playback and update transport UI.
 */
export function schedulePlayback(score) {
  stopPlayback();
  if (!score?.notes?.length) { return; }

  const ctx = getCtx();
  const spb = 60 / score.tempo;
  const t0  = ctx.currentTime + 0.25;

  state.isPlaying = true;
  document.getElementById('btn-play').disabled = true;
  document.getElementById('btn-stop').disabled = false;

  score.notes.forEach(n => {
    const info = parseNoteName(n.note);
    if (!info || info.oct < OCT_MIN || info.oct > OCT_MAX) { return; }
    scheduleNote(info.ni, info.oct, t0 + n.time * spb, n.duration * spb);
  });

  const last    = score.notes[score.notes.length - 1];
  const totalMs = (last.time + last.duration) * spb * 1000 + 800;
  const endTimer = setTimeout(stopPlayback, totalMs);
  playbackItems.push({ oscs: [], gainNode: null, timers: [endTimer] });
}

/** Immediately cancel all scheduled playback and silence all playback nodes. */
export function stopPlayback() {
  state.isPlaying = false;

  const now = getCtx().currentTime;
  playbackItems.forEach(item => {
    item.timers.forEach(clearTimeout);
    item.oscs?.forEach(o => { try { o.stop(); } catch (_) {} });
    if (item.gainNode) {
      try {
        item.gainNode.gain.cancelScheduledValues(now);
        item.gainNode.gain.setValueAtTime(0, now);
      } catch (_) {}
    }
  });
  playbackItems = [];

  document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));
  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  if (btnPlay) { btnPlay.disabled = (state.currentScore === null); }
  if (btnStop) { btnStop.disabled = true; }
}
