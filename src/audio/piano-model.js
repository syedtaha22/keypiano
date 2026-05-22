import { getCtx, getMasterGain, noteFreq } from './context.js';
import { state } from '../state.js';

/**
 * Zone definitions for the four acoustic regions of a grand piano.
 *
 * Each zone approximates the physical characteristics of strings in that range:
 *   profile    — harmonic amplitude series (index = harmonic number, 0 = DC/unused)
 *   detunes    — per-string cent offsets producing string coupling / beating
 *   decayTC    — setTargetAtTime time-constant for natural decay while key is held
 *   susLevel   — fraction of peak that a held key decays toward
 *   hammerFreq — bandpass centre frequency for the felt-strike noise burst
 */
export const PIANO_ZONES = [
  {
    name: 'bass', maxFreq: 130, strings: 2,
    detunes: [-1.5, 1.5],
    attack: 0.014, decayTC: 4.5, susLevel: 0.14, release: 0.48,
    hammerFreq: 600,  hammerGain: 0.22,
    profile: [0, 0.28, 0.95, 0.82, 0.60, 0.40, 0.26, 0.16, 0.10, 0.06, 0.03, 0.01],
  },
  {
    name: 'tenor', maxFreq: 500, strings: 3,
    detunes: [-2.2, 0, 2.2],
    attack: 0.010, decayTC: 2.2, susLevel: 0.20, release: 0.30,
    hammerFreq: 1200, hammerGain: 0.18,
    profile: [0, 0.82, 0.52, 0.32, 0.17, 0.10, 0.055, 0.028, 0.012],
  },
  {
    name: 'treble', maxFreq: 2000, strings: 3,
    detunes: [-2.5, 0, 2.5],
    attack: 0.006, decayTC: 0.9, susLevel: 0.10, release: 0.18,
    hammerFreq: 3000, hammerGain: 0.15,
    profile: [0, 0.86, 0.44, 0.27, 0.17, 0.12, 0.08, 0.05, 0.03, 0.015, 0.007],
  },
  {
    name: 'hiTreble', maxFreq: 99999, strings: 3,
    detunes: [-3.0, 0, 3.0],
    attack: 0.003, decayTC: 0.25, susLevel: 0.0, release: 0.06,
    hammerFreq: 7000, hammerGain: 0.12,
    profile: [0, 0.90, 0.34, 0.15, 0.06, 0.02],
  },
];

/**
 * Select the zone whose frequency ceiling first exceeds freq.
 * @param {number} freq - Frequency in Hz
 * @returns {object} A PIANO_ZONES entry
 */
export function getZone(freq) {
  return PIANO_ZONES.find(z => freq < z.maxFreq) ?? PIANO_ZONES[PIANO_ZONES.length - 1];
}

// PeriodicWave instances are expensive to create; cache one per zone.
const waveCache = {};

/**
 * Return (or lazily create) the PeriodicWave for a zone.
 * @param {object} zone
 * @param {AudioContext} ctx
 * @returns {PeriodicWave}
 */
export function getWave(zone, ctx) {
  if (waveCache[zone.name]) {return waveCache[zone.name];}
  const p    = zone.profile;
  const real = new Float32Array(p.length);
  const imag = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) {real[i] = p[i];}
  waveCache[zone.name] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  return waveCache[zone.name];
}

// 80 ms of white noise shared across all hammer-strike events.
let noiseBuffer = null;

/**
 * Return (or lazily create) the shared white-noise AudioBuffer.
 * @param {AudioContext} ctx
 * @returns {AudioBuffer}
 */
export function getNoiseBuffer(ctx) {
  if (noiseBuffer) {return noiseBuffer;}
  const len  = Math.floor(ctx.sampleRate * 0.08);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data  = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) {data[i] = Math.random() * 2 - 1;}
  return noiseBuffer;
}

/**
 * Start a physically-modelled piano note and return a handle to it.
 *
 * Signal chain:
 *   detuned oscillators → per-osc GainNode → note GainNode → masterGain
 *   noise burst         → bandpass filter  → noise GainNode → masterGain
 *
 * Each oscillator is scaled by 1/zone.strings so N detuned strings together
 * equal the loudness of one, preventing amplitude clipping on chords.
 *
 * @param {number} ni  - Note index 0–11
 * @param {number} oct - Octave number
 * @returns {{ oscs: AudioNode[], gainNode: GainNode, zone: object, stopped: boolean }}
 */
export function startSound(ni, oct) {
  const ctx  = getCtx();
  const freq = noteFreq(ni, oct);
  const zone = getZone(freq);
  const now  = ctx.currentTime;
  const wave = getWave(zone, ctx);
  const perG = 1 / zone.strings;

  const attack  = zone.attack  * state.attackMult;
  const decayTC = zone.decayTC * state.decayMult;
  const susLvl  = zone.susLevel * state.susLevelMult;

  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0, now);
  gn.gain.linearRampToValueAtTime(state.volume, now + attack);
  gn.gain.setTargetAtTime(state.volume * susLvl, now + attack, decayTC);
  gn.connect(getMasterGain());

  const oscs = zone.detunes.map(d => {
    const og = ctx.createGain();
    og.gain.value = perG;
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = freq;
    o.detune.value = d * state.detuneScale;
    o.connect(og);
    og.connect(gn);
    o.start(now);
    return o;
  });

  const nb = getNoiseBuffer(ctx);
  const ns = ctx.createBufferSource();
  ns.buffer = nb;
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = zone.hammerFreq;
  nf.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(state.volume * zone.hammerGain, now);
  ng.gain.linearRampToValueAtTime(0, now + 0.042);
  ns.connect(nf);
  nf.connect(ng);
  ng.connect(getMasterGain());
  ns.start(now);
  ns.stop(now + 0.05);
  oscs.push(ns);

  return { oscs, gainNode: gn, zone, stopped: false };
}

/**
 * Release a keyboard-triggered note: cancel natural decay and fade to silence.
 * @param {{ oscs: AudioNode[], gainNode: GainNode, zone: object, stopped: boolean }} s
 */
export function stopSound(s) {
  if (s.stopped) {return;}
  s.stopped = true;
  const ctx = getCtx();
  const now = ctx.currentTime;
  s.gainNode.gain.cancelScheduledValues(now);
  s.gainNode.gain.setValueAtTime(s.gainNode.gain.value, now);
  s.gainNode.gain.linearRampToValueAtTime(0, now + s.zone.release * state.releaseMult);
  setTimeout(() => {
    s.oscs.forEach(o => { try { o.stop(); } catch (_) {} });
  }, (s.zone.release + 0.1) * 1000);
}

/**
 * Slowly decay a sustained note to inaudible over decayTime seconds.
 * Only ever called on keyboard-triggered sounds (activeSounds / sustainedSounds),
 * never on pre-scheduled playback nodes — keeping the two gain paths independent.
 *
 * @param {{ oscs: AudioNode[], gainNode: GainNode, zone: object, stopped: boolean }} s
 * @param {number} decayTime - Seconds until silence
 */
export function decaySound(s, decayTime) {
  if (s.stopped) {return;}
  const ctx = getCtx();
  const now = ctx.currentTime;
  s.gainNode.gain.cancelScheduledValues(now);
  s.gainNode.gain.setValueAtTime(s.gainNode.gain.value, now);
  s.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);
  setTimeout(() => {
    s.stopped = true;
    s.oscs.forEach(o => { try { o.stop(); } catch (_) {} });
  }, decayTime * 1000 + 100);
}
