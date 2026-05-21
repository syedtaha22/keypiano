/**
 * Shared mutable application state.
 * All modules read and write through this single object so there is one
 * source of truth and no hidden module-level globals.
 */
export const state = {
  currentOctave: 4,
  noteShift:     0,
  volume:        0.7,
  sustainAmount: 0,
  savedSustain:  0.7,
  isPlaying:     false,
  currentScore:  null,

  /** sid → { s, ni, oct }  — notes currently sounding via keyboard/mouse */
  activeSounds:    new Map(),
  /** 'oct_ni' → { s, ni, oct }  — released notes held by sustain pedal */
  sustainedSounds: new Map(),
  /** keyboard event codes currently held down */
  heldCodes:       new Set(),
};

/**
 * Resolve a CODE_MAP definition to its actual {ni, oct}, applying the
 * current octave base and semitone shift.
 *
 * @param {{ ni: number, octOff: number }} def
 * @returns {{ ni: number, oct: number }}
 */
export function shiftedNote(def) {
  const raw = def.ni + def.octOff * 12 + state.noteShift;
  return {
    ni:  ((raw % 12) + 12) % 12,
    oct: state.currentOctave + Math.floor(raw / 12),
  };
}
