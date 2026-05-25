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
 * Schedule all notes in a score for playback, optionally starting from an
 * offset (in seconds) into the score — used for pause/resume and seeking.
 *
 * @param {object} score
 * @param {number} [startOffset=0] - seconds into the score to start from
 */
export function schedulePlayback(score, startOffset = 0) {
  stopPlayback();
  if (!score?.notes?.length) { return; }

  const ctx = getCtx();
  const spb = 60 / score.tempo;
  const t0  = ctx.currentTime + 0.40; // 400ms buffer gives more margin under CPU load

  state.isPlaying = true;
  // Encode the seek offset into playbackStartAudioTime so the rAF timeline
  // loop computes elapsed = ctx.currentTime - playbackStartAudioTime correctly.
  state.playbackStartAudioTime = t0 - startOffset;
  state.playbackPausePosition  = 0;

  // Restore fill to seek position immediately (stopPlayback reset it to 0).
  const tlFillEarly = document.getElementById('tl-fill');
  if (tlFillEarly && state.playbackDuration > 0) {
    tlFillEarly.style.width = `${(startOffset / state.playbackDuration * 100).toFixed(1)}%`;
  }

  // Pre-filter and pre-compute all playable events into a flat array.
  // This is done once up front so the batch callbacks stay cheap.
  const pending = [];
  for (const n of score.notes) {
    const noteStart = n.time * spb;
    const noteEnd   = noteStart + n.duration * spb;
    if (noteEnd <= startOffset) { continue; }
    const info = parseNoteName(n.note);
    if (!info || info.oct < OCT_MIN || info.oct > OCT_MAX) { continue; }
    pending.push({
      ni:         info.ni,
      oct:        info.oct,
      audioStart: t0 + Math.max(0, noteStart - startOffset),
      audioDur:   noteEnd - Math.max(noteStart, startOffset),
    });
  }

  let schedIdx = 0;

  // Sliding-window scheduler: only create Web Audio nodes for the next
  // 30 seconds of audio at a time. Re-fires every 8 s so large files
  // (thousands of notes) don't create tens of thousands of nodes at once.
  function scheduleBatch() {
    if (!state.isPlaying) { return; }
    const until = ctx.currentTime + 30;
    while (schedIdx < pending.length && pending[schedIdx].audioStart <= until) {
      const { ni, oct, audioStart, audioDur } = pending[schedIdx++];
      scheduleNote(ni, oct, audioStart, audioDur);
    }
    if (schedIdx < pending.length) {
      const batchTimer = setTimeout(scheduleBatch, 8000);
      playbackItems.push({ oscs: [], gainNode: null, timers: [batchTimer] });
    }
  }

  scheduleBatch();

  const last    = score.notes[score.notes.length - 1];
  const totalMs = (last.time + last.duration) * spb * 1000 + 800 - startOffset * 1000;
  state.playbackDuration = (last.time + last.duration) * spb;

  const btnPs = document.getElementById('btn-playstop');
  if (btnPs) { btnPs.classList.add('playing'); btnPs.setAttribute('aria-label', 'Pause'); }
  const endTimer = setTimeout(stopPlayback, Math.max(0, totalMs));
  playbackItems.push({ oscs: [], gainNode: null, timers: [endTimer] });
}

/**
 * Pause playback at the current position. The position is stored in
 * state.playbackPausePosition so resume/seek can pick it back up.
 * Unlike stopPlayback, the timeline fill is NOT reset to zero.
 */
export function pausePlayback() {
  if (!state.isPlaying) { return; }

  const ctx     = getCtx();
  const elapsed = Math.max(0, ctx.currentTime - state.playbackStartAudioTime);
  state.playbackPausePosition = Math.min(elapsed, state.playbackDuration);
  state.isPlaying = false;
  state.playbackStartAudioTime = 0;

  playbackItems.forEach(item => {
    item.timers.forEach(clearTimeout);
    item.oscs?.forEach(o => { try { o.stop(); } catch (_) {} });
    if (item.gainNode) {
      try {
        item.gainNode.gain.cancelScheduledValues(ctx.currentTime);
        item.gainNode.gain.setValueAtTime(0, ctx.currentTime);
      } catch (_) {}
    }
  });
  playbackItems = [];

  document.querySelectorAll('.key.active').forEach(k => k.classList.remove('active'));

  const btnPs = document.getElementById('btn-playstop');
  if (btnPs) {
    btnPs.classList.remove('playing');
    btnPs.setAttribute('aria-label', 'Play');
  }
  // Intentionally do NOT reset tl-fill or tl-elapsed — they stay at pause position.
}

/** Immediately cancel all scheduled playback, silence nodes, and reset transport. */
export function stopPlayback() {
  state.isPlaying = false;
  state.playbackStartAudioTime = 0;
  state.playbackPausePosition  = 0;

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

  const btnPs = document.getElementById('btn-playstop');
  if (btnPs) {
    btnPs.classList.remove('playing');
    btnPs.setAttribute('aria-label', 'Play');
    btnPs.disabled = (state.currentScore === null);
  }
  const tlFill    = document.getElementById('tl-fill');
  const tlElapsed = document.getElementById('tl-elapsed');
  const tlPh      = document.getElementById('tl-ph');
  if (tlFill)    { tlFill.style.width = '0%'; }
  if (tlElapsed) { tlElapsed.textContent = '0:00'; }
  if (tlPh)      { tlPh.style.left = '0%'; }
}
