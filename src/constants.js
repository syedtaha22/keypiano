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
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

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

/**
 * Bottom and top row key codes in piano order.
 * Used in strict-rows mode to compute the white/black key mapping.
 */
export const BOTTOM_ROW_CODES = ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL'];
export const TOP_ROW_CODES    = ['KeyW','KeyE','KeyT','KeyY','KeyU','KeyO'];

/**
 * Maximum valid whiteKeyStart index so the 9-key bottom row stays in range.
 * Piano has 7 octaves × 7 white keys = 49 white keys (indices 0–48).
 */
export const MAX_WK_START = 40; // 49 - 9

/**
 * Convert a global white-key index (0 = C1) to {ni, oct}.
 * @param {number} wkIdx
 * @returns {{ ni: number, oct: number }}
 */
export function whiteKeyAt(wkIdx) {
  return {
    ni:  WHITE_NOTE_INDICES[wkIdx % 7],
    oct: Math.floor(wkIdx / 7) + OCT_MIN,
  };
}

/**
 * Pro-mode: three keyboard rows each cover one octave.
 * Q-row = O−1, A-row = O, Z-row = O+1.
 * ni = white-key note index; octOff = octave offset from currentOctave.
 * Shift held on any key → the corresponding black key (see WHITE_TO_SHARP).
 */
export const PRO_MAP = {
  // Q row — octave O−1
  KeyQ: { ni: 0,  octOff: -1, label: 'Q' },
  KeyW: { ni: 2,  octOff: -1, label: 'W' },
  KeyE: { ni: 4,  octOff: -1, label: 'E' },
  KeyR: { ni: 5,  octOff: -1, label: 'R' },
  KeyT: { ni: 7,  octOff: -1, label: 'T' },
  KeyY: { ni: 9,  octOff: -1, label: 'Y' },
  KeyU: { ni: 11, octOff: -1, label: 'U' },
  // A row — octave O
  KeyA: { ni: 0,  octOff: 0, label: 'A' },
  KeyS: { ni: 2,  octOff: 0, label: 'S' },
  KeyD: { ni: 4,  octOff: 0, label: 'D' },
  KeyF: { ni: 5,  octOff: 0, label: 'F' },
  KeyG: { ni: 7,  octOff: 0, label: 'G' },
  KeyH: { ni: 9,  octOff: 0, label: 'H' },
  KeyJ: { ni: 11, octOff: 0, label: 'J' },
  // Z row — octave O+1
  KeyZ: { ni: 0,  octOff: 1, label: 'Z' },
  KeyX: { ni: 2,  octOff: 1, label: 'X' },
  KeyC: { ni: 4,  octOff: 1, label: 'C' },
  KeyV: { ni: 5,  octOff: 1, label: 'V' },
  KeyB: { ni: 7,  octOff: 1, label: 'B' },
  KeyN: { ni: 9,  octOff: 1, label: 'N' },
  KeyM: { ni: 11, octOff: 1, label: 'M' },
};

/**
 * White-key ni → sharp (black-key) ni.
 * Entries for E (4) and B (11) are absent — those positions have no black key.
 */
export const WHITE_TO_SHARP = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 };

/**
 * Given a whiteKeyStart index, return the 6 black keys for the top row.
 * Gaps (E–F, B–C) where no black key exists are returned as null.
 *
 * The six top-row keys (W E T Y U O) correspond to white-key pair offsets
 * [0,1,3,4,5,7] within the nine bottom-row keys, matching the physical
 * keyboard stagger. Offsets 2 and 6 (the R and I positions) are absent
 * because those physical gaps align with the E–F and B–C positions where
 * no black key exists on a piano.
 *
 * @param {number} wkStart
 * @returns {Array<{ni:number, oct:number}|null>}  length always 6
 */
export function getStrictTopRow(wkStart) {
  const result = [];
  for (let i = 0; i < 8 && result.length < 6; i++) {
    const wk1 = whiteKeyAt(wkStart + i);
    const wk2 = whiteKeyAt(wkStart + i + 1);
    const gap = wk2.ni > wk1.ni
      ? wk2.ni - wk1.ni
      : (12 - wk1.ni) + wk2.ni;
    if (gap === 2) { result.push({ ni: wk1.ni + 1, oct: wk1.oct }); }
  }
  while (result.length < 6) { result.push(null); }
  return result;
}
