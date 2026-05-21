/** White key width and black key width in pixels. */
export const WKW = 58;
export const BKW = 36;

/** Octave range limits. */
export const OCT_MIN = 1;
export const OCT_MAX = 7;

/** Maximum sustain decay time in seconds at full pedal. */
export const SUSTAIN_MAX = 4.0;

/** Note indices of the seven white keys within an octave (C D E F G A B). */
export const WHITE_NOTE_INDICES = [0, 2, 4, 5, 7, 9, 11];

/**
 * [noteIndex, whiteKeyPosition] pairs for the five black keys in an octave.
 * Used during piano DOM construction to position black keys over white keys.
 */
export const BLACK_NOTE_DEFS = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]];

/** Maps a note index (0–11) to the position of its nearest white key (0–6). */
export const NI_TO_WHITE_POS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

/** Canonical note names indexed by note index 0–11. */
export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Maps keyboard event codes to piano note definitions.
 * ni      = note index within the octave (0 = C)
 * octOff  = octave offset from currentOctave (0 or 1)
 * label   = key label shown on the on-screen piano key
 */
export const CODE_MAP = {
  KeyA: { ni: 0,  octOff: 0, label: 'A' },
  KeyW: { ni: 1,  octOff: 0, label: 'W' },
  KeyS: { ni: 2,  octOff: 0, label: 'S' },
  KeyE: { ni: 3,  octOff: 0, label: 'E' },
  KeyD: { ni: 4,  octOff: 0, label: 'D' },
  KeyF: { ni: 5,  octOff: 0, label: 'F' },
  KeyT: { ni: 6,  octOff: 0, label: 'T' },
  KeyG: { ni: 7,  octOff: 0, label: 'G' },
  KeyY: { ni: 8,  octOff: 0, label: 'Y' },
  KeyH: { ni: 9,  octOff: 0, label: 'H' },
  KeyU: { ni: 10, octOff: 0, label: 'U' },
  KeyJ: { ni: 11, octOff: 0, label: 'J' },
  KeyK: { ni: 0,  octOff: 1, label: 'K' },
  KeyO: { ni: 1,  octOff: 1, label: 'O' },
  KeyL: { ni: 2,  octOff: 1, label: 'L' },
};
