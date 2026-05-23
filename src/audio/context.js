/** @type {AudioContext|null} */ let audioCtx       = null;
/** @type {GainNode|null} */    let masterGain     = null;
/** @type {GainNode|null} */    let playbackGain   = null;
/** @type {GainNode|null} */    let mixerBus       = null;
/** @type {BiquadFilterNode|null} */ let bassFilter = null;
/** @type {BiquadFilterNode|null} */ let trebleFilter = null;
/** @type {GainNode|null} */    let dryGain        = null;
/** @type {ConvolverNode|null} */ let reverb        = null;
/** @type {GainNode|null} */    let reverbWet      = null;
/** @type {DynamicsCompressorNode|null} */ let compressor = null;
/** @type {AnalyserNode|null} */ let analyser       = null;

function buildImpulse(duration) {
  if (!audioCtx) { return; }
  const len = Math.floor(audioCtx.sampleRate * Math.max(0.05, duration));
  const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  reverb.buffer = buf;
}

/**
 * Shared AudioContext, lazy-created on first user gesture.
 *
 * Signal chain:
 *   masterGain  ──┐
 *                  ├─► mixerBus → bassFilter → trebleFilter ─┬─► dryGain ──────► compressor → analyser → destination
 *   playbackGain ──┘                                          └─► reverb → reverbWet ──────────────────────────────────┘
 */
export function getCtx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;

    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value      = 8;
    compressor.ratio.value     = 4;
    compressor.attack.value    = 0.003;
    compressor.release.value   = 0.30;
    compressor.connect(analyser);
    analyser.connect(audioCtx.destination);

    bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type            = 'lowshelf';
    bassFilter.frequency.value = 200;
    bassFilter.gain.value      = 0;

    trebleFilter = audioCtx.createBiquadFilter();
    trebleFilter.type            = 'highshelf';
    trebleFilter.frequency.value = 4000;
    trebleFilter.gain.value      = 0;

    bassFilter.connect(trebleFilter);

    dryGain = audioCtx.createGain();
    dryGain.gain.value = 1.0;
    trebleFilter.connect(dryGain);
    dryGain.connect(compressor);

    reverb = audioCtx.createConvolver();
    reverbWet = audioCtx.createGain();
    reverbWet.gain.value = 0;
    trebleFilter.connect(reverb);
    reverb.connect(reverbWet);
    reverbWet.connect(compressor);
    buildImpulse(1.8);

    mixerBus = audioCtx.createGain();
    mixerBus.gain.value = 1.0;
    mixerBus.connect(bassFilter);

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(mixerBus);

    playbackGain = audioCtx.createGain();
    playbackGain.gain.value = 1.0;
    playbackGain.connect(mixerBus);
  }
  if (audioCtx.state === 'suspended') { audioCtx.resume(); }
  return audioCtx;
}

export function getMasterGain()   { getCtx(); return masterGain; }
export function getPlaybackGain() { getCtx(); return playbackGain; }
export function getAnalyser()     { getCtx(); return analyser; }

/** Wet reverb mix — amount 0..1 */
export function setReverb(amount) {
  getCtx();
  reverbWet.gain.setTargetAtTime(amount * 0.9, audioCtx.currentTime, 0.08);
}

/** Reverb room size — size 0..1 maps to 0.3s..5s impulse */
let roomDebounce = null;
export function setRoomSize(size) {
  getCtx();
  clearTimeout(roomDebounce);
  roomDebounce = setTimeout(() => buildImpulse(0.3 + size * 4.7), 120);
}

/** Bass EQ gain in dB (-12..+12) */
export function setBassEQ(db) {
  getCtx();
  bassFilter.gain.setTargetAtTime(db, audioCtx.currentTime, 0.05);
}

/** Treble EQ gain in dB (-12..+12) */
export function setTrebleEQ(db) {
  getCtx();
  trebleFilter.gain.setTargetAtTime(db, audioCtx.currentTime, 0.05);
}

/**
 * Convert a note index + octave to frequency in Hz (equal temperament).
 * A4 = 440 Hz, C4 = 261.63 Hz.
 */
export function noteFreq(ni, oct) {
  return 440 * Math.pow(2, ((oct + 1) * 12 + ni - 69) / 12);
}
