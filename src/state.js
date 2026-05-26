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
  playbackStartAudioTime: 0,
  playbackDuration:       0,
  playbackPausePosition:  0,

  /** sid → { s, ni, oct }  — notes currently sounding via keyboard/mouse */
  activeSounds:    new Map(),
  /** 'oct_ni' → { s, ni, oct }  — released notes held by sustain pedal */
  sustainedSounds: new Map(),
  /** keyboard event codes currently held down */
  heldCodes:       new Set(),

  /* ── Envelope multipliers (applied to zone base values) ── */
  attackMult:    1.0,
  decayMult:     1.0,
  susLevelMult:  1.0,
  releaseMult:   1.0,
  detuneScale:   1.0,

  /* ── Oscillator preset ── */
  waveformPreset: 'piano',
  harmonicBright: 0.5,

  /* ── Metronome ── */
  metronomeEnabled:   false,
  metronomeBPM:       120,
  metronomeBeatsPerBar: 4,

  /* ── Upper piano (dual dock) ── */
  upperOctave:    6,
  upperNoteShift: 0,

  /* ── Layout ── */
  dualDock: false,
  vizMode:  'scope',

  /* ── Accent colour (CSS custom property) ── */
  accentKey: 'gold',

  /* ── Keyboard mode ── */
  strictRows:     false,
  whiteKeyStart:  21,   // white key index where A starts in strict mode (21 = C4)
  proMode:        false, // three-row mode: Q=O-1, A=O, Z=O+1; Shift=black keys

  /* ── Key zoom (octaves visible in the piano viewport) ── */
  visibleOctaves: 3,
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
