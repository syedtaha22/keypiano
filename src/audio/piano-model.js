import { getCtx, getMasterGain, noteFreq } from './context.js';
import { state } from '../state.js';

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
 * Preset overrides applied on top of zone defaults.
 * null = use zone defaults (piano).
 * profile is the full harmonic amplitude array (index = harmonic number).
 * hammerGainMult scales the noise-burst hammer click.
 */
const PRESET_PARAMS = {
  piano: null,

  organ: {
    profile:       [0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0, 1.0, 0, 0.5],
    attack:        0.005,
    decayTC:       9999,
    susLevel:      1.0,
    release:       0.025,
    hammerGainMult: 0,
  },

  brass: {
    profile:       [0, 1.0, 0.90, 0.72, 0.55, 0.38, 0.23, 0.13, 0.06, 0.025],
    attack:        0.055,
    decayTC:       0.55,
    susLevel:      0.72,
    release:       0.14,
    hammerGainMult: 0.5,
  },

  bell: {
    profile:       [0, 1.0, 0.12, 0, 0.55, 0, 0.12, 0, 0.06, 0, 0.02],
    attack:        0.001,
    decayTC:       0.08,
    susLevel:      0.0,
    release:       4.0,
    hammerGainMult: 2.5,
  },
};

export function getZone(freq) {
  return PIANO_ZONES.find(z => freq < z.maxFreq) ?? PIANO_ZONES[PIANO_ZONES.length - 1];
}

/**
 * Resolve the effective envelope for a zone, applying the active preset
 * overrides and current state multipliers. Shared by keyboard and playback.
 */
export function resolveEnvelope(zone) {
  const preset = PRESET_PARAMS[state.waveformPreset];
  return {
    attack:         (preset?.attack   ?? zone.attack)   * state.attackMult,
    decayTC:        (preset?.decayTC  ?? zone.decayTC)  * state.decayMult,
    susLevel:       (preset?.susLevel ?? zone.susLevel) * state.susLevelMult,
    release:        (preset?.release  ?? zone.release)  * state.releaseMult,
    hammerGainMult: preset?.hammerGainMult ?? 1,
  };
}

const waveCache = {};

/** Clear wave cache — call when preset or harmonic brightness changes. */
export function clearWaveCache() {
  Object.keys(waveCache).forEach(k => delete waveCache[k]);
}

/**
 * Apply harmonic brightness multiplier to a profile.
 * bright 0 = pure sine (only fundamental), 0.5 = unchanged, 1 = doubled overtones.
 */
function applyHarmonicBright(profile, bright) {
  const mult = bright * 2;
  return profile.map((v, i) => (i <= 1 ? v : v * mult));
}

export function getWave(zone, ctx) {
  const preset    = PRESET_PARAMS[state.waveformPreset];
  const cacheKey  = `${state.waveformPreset}_${zone.name}`;
  if (waveCache[cacheKey]) { return waveCache[cacheKey]; }

  const baseProfile = preset?.profile ?? zone.profile;
  const p           = applyHarmonicBright(baseProfile, state.harmonicBright);
  const real        = new Float32Array(p.length);
  const imag        = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) { real[i] = p[i]; }
  waveCache[cacheKey] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  return waveCache[cacheKey];
}

let noiseBuffer = null;

export function getNoiseBuffer(ctx) {
  if (noiseBuffer) { return noiseBuffer; }
  const len  = Math.floor(ctx.sampleRate * 0.08);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data  = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) { data[i] = Math.random() * 2 - 1; }
  return noiseBuffer;
}

export function startSound(ni, oct) {
  const ctx    = getCtx();
  const freq   = noteFreq(ni, oct);
  const zone   = getZone(freq);
  const now    = ctx.currentTime;
  const wave   = getWave(zone, ctx);
  const perG   = 1 / zone.strings;
  const env    = resolveEnvelope(zone);

  const { attack, decayTC, susLevel: susLvl, hammerGainMult } = env;

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

  if (hammerGainMult > 0) {
    const nb = getNoiseBuffer(ctx);
    const ns = ctx.createBufferSource();
    ns.buffer = nb;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = zone.hammerFreq;
    nf.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(state.volume * zone.hammerGain * hammerGainMult, now);
    ng.gain.linearRampToValueAtTime(0, now + 0.042);
    ns.connect(nf);
    nf.connect(ng);
    ng.connect(getMasterGain());
    ns.start(now);
    ns.stop(now + 0.05);
    oscs.push(ns);
  }

  return { oscs, gainNode: gn, zone, stopped: false };
}

export function stopSound(s) {
  if (s.stopped) { return; }
  s.stopped = true;
  const ctx     = getCtx();
  const now     = ctx.currentTime;
  const release = resolveEnvelope(s.zone).release;
  s.gainNode.gain.cancelScheduledValues(now);
  s.gainNode.gain.setValueAtTime(s.gainNode.gain.value, now);
  s.gainNode.gain.linearRampToValueAtTime(0, now + release);
  setTimeout(() => {
    s.oscs.forEach(o => { try { o.stop(); } catch (_) {} });
  }, (release + 0.1) * 1000);
}

export function decaySound(s, decayTime) {
  if (s.stopped) { return; }
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
