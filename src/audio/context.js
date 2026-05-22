/** @type {AudioContext|null} */
let audioCtx = null;
/** @type {GainNode|null} */
let masterGain = null;
/** @type {GainNode|null} */
let playbackGain = null;
/** @type {DynamicsCompressorNode|null} */
let compressor = null;
/** @type {AnalyserNode|null} */
let analyser = null;

/**
 * Returns the shared AudioContext, creating it on first call.
 * Lazy-initialised to satisfy the browser autoplay policy — the context
 * must not be created until the first user gesture.
 *
 * Two separate gain buses are wired to the compressor:
 *   masterGain   — keyboard/mouse-triggered notes (sustain system writes here)
 *   playbackGain — pre-scheduled file playback (isolated; sustain cannot interfere)
 *
 * @returns {AudioContext}
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

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(compressor);

    playbackGain = audioCtx.createGain();
    playbackGain.gain.value = 1.0;
    playbackGain.connect(compressor);
  }
  if (audioCtx.state === 'suspended') {audioCtx.resume();}
  return audioCtx;
}

/** Gain bus for keyboard/mouse notes. */
export function getMasterGain() {
  getCtx();
  return masterGain;
}

/**
 * Dedicated gain bus for pre-scheduled playback.
 * Isolated from masterGain so decaySound() cannot interfere with
 * pre-scheduled AudioParam automation on playback nodes.
 */
export function getPlaybackGain() {
  getCtx();
  return playbackGain;
}

/** AnalyserNode for waveform/spectrum visualisation. */
export function getAnalyser() {
  getCtx();
  return analyser;
}

/**
 * Convert a note index + octave to frequency in Hz using equal temperament.
 * Middle C (C4) = 261.63 Hz. A4 = 440 Hz.
 *
 * @param {number} ni  - Note index 0–11 (C=0 … B=11)
 * @param {number} oct - Octave number (middle C is octave 4)
 * @returns {number}
 */
export function noteFreq(ni, oct) {
  return 440 * Math.pow(2, ((oct + 1) * 12 + ni - 69) / 12);
}
