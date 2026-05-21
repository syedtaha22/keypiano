import { startSound, stopSound, decaySound } from '../audio/piano-model.js';
import { state } from '../state.js';
import { OCT_MIN, OCT_MAX, SUSTAIN_MAX } from '../constants.js';

/**
 * Begin playing a note and highlight the corresponding on-screen key.
 * No-ops silently if the sid is already active or the octave is out of range.
 *
 * @param {number} ni  - Note index 0–11
 * @param {number} oct - Octave number
 * @param {string} sid - Unique sound id, e.g. "kbd_KeyA" or "mouse_4_0"
 */
export function pressNote(ni, oct, sid) {
  if (state.activeSounds.has(sid)) {return;}
  if (oct < OCT_MIN || oct > OCT_MAX) {return;}

  const s = startSound(ni, oct);
  state.activeSounds.set(sid, { s, ni, oct });
  document.querySelectorAll(`.key[data-oct="${oct}"][data-ni="${ni}"]`)
    .forEach(k => k.classList.add('active'));
}

/**
 * Release a note. If the sustain pedal is engaged the note is handed off to
 * sustainedSounds and allowed to decay naturally over the pedal-scaled time;
 * otherwise it stops immediately.
 *
 * @param {string} sid - The same identifier that was passed to pressNote
 */
export function releaseNote(sid) {
  const entry = state.activeSounds.get(sid);
  if (!entry) {return;}

  state.activeSounds.delete(sid);
  document.querySelectorAll(`.key[data-oct="${entry.oct}"][data-ni="${entry.ni}"]`)
    .forEach(k => k.classList.remove('active'));

  if (state.sustainAmount > 0) {
    const decayTime = state.sustainAmount * SUSTAIN_MAX;
    const key       = `${entry.oct}_${entry.ni}`;
    const prev      = state.sustainedSounds.get(key);
    if (prev) {stopSound(prev.s);}
    state.sustainedSounds.set(key, entry);
    decaySound(entry.s, decayTime);
    setTimeout(() => {
      if (state.sustainedSounds.get(key) === entry) {state.sustainedSounds.delete(key);}
    }, decayTime * 1000 + 200);
  } else {
    stopSound(entry.s);
  }
}
