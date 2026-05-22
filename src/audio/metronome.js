import { getCtx } from './context.js';

let tickTimer = null;

/**
 * Synthesise a short click at AudioContext time `when`.
 * Accent (beat 1) is higher-pitched and louder.
 */
function scheduleClick(when, accent) {
  const ctx   = getCtx();
  const osc   = ctx.createOscillator();
  const gain  = ctx.createGain();
  osc.frequency.value   = accent ? 1600 : 900;
  gain.gain.setValueAtTime(accent ? 0.22 : 0.12, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.05);
}

/**
 * Start the metronome at the given BPM and time signature.
 * Uses a lookahead scheduler (re-fires every 100 ms) for accurate timing.
 *
 * @param {number} bpm
 * @param {number} beatsPerBar
 */
export function startMetronome(bpm, beatsPerBar) {
  stopMetronome();
  const ctx       = getCtx();
  const interval  = 60 / bpm;       // seconds per beat
  let nextBeat    = ctx.currentTime + 0.05;
  let beatIndex   = 0;
  const schedAhead = 0.12;           // schedule this many seconds ahead

  function tick() {
    while (nextBeat < ctx.currentTime + schedAhead) {
      scheduleClick(nextBeat, beatIndex % beatsPerBar === 0);
      nextBeat  += interval;
      beatIndex += 1;
    }
  }

  tick();
  tickTimer = setInterval(tick, 50);
}

/** Stop the metronome. */
export function stopMetronome() {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
