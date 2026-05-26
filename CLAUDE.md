# KeyPiano — Claude Code Project Context

This file is read automatically by Claude Code when you open this project.
It contains everything you need to understand the codebase and continue development.

---

## What this project is

**KeyPiano** is an Electron desktop application that turns a laptop keyboard into a playable piano. The user presses A–L (and W/E/T/Y/U/O) to play notes, can shift octaves and semitone offset with Z/X/arrow keys, and can load MIDI or KPS files for playback.

The audio engine is a physically-modelled grand piano synthesiser built entirely with the Web Audio API — no samples, no external libraries. It uses zone-based harmonic profiles, detuned unison oscillators (string coupling), natural string decay envelopes, and a bandpass-filtered noise burst per note (hammer simulation).

---

## Tech stack

- **Electron** (contextIsolation: true, nodeIntegration: false)
- **Web Audio API** — all synthesis is done in the browser/renderer process
- **Vanilla JS** — no frontend framework, no bundler yet
- **KPS format** — a custom JSON note format (see below)

---

## File structure

```
piano-app/
├── src/
│   ├── constants.js      — Immutable layout + keyboard-map constants
│   ├── state.js          — Shared mutable app state + shiftedNote()
│   ├── audio/
│   │   ├── context.js    — AudioContext singleton; masterGain + playbackGain buses
│   │   ├── piano-model.js— Zone definitions, oscillator synthesis, startSound/stopSound/decaySound
│   │   └── playback.js   — Pre-scheduled KPS/MIDI playback engine
│   ├── parsers/
│   │   ├── midi.js       — Standard MIDI File binary parser
│   │   └── kps.js        — KPS JSON parser + parseNoteName
│   ├── ui/
│   │   ├── interactions.js  — pressNote / releaseNote (bridges audio ↔ DOM)
│   │   ├── piano-builder.js — Piano DOM construction + mouse event wiring
│   │   ├── sustain-strip.js — Sustain strip drag interaction
│   │   └── viewport.js      — Octave highlights, key labels, scroll
│   ├── renderer.js       — Entry point: keyboard/button listeners + init
│   ├── main.js           — Electron main process (window creation only)
│   └── index.html        — App shell (loads renderer.js as ES module)
├── scores/               — Composition files (.kps, .mid) — gitignored
├── docs/                 — Project specs and issue tracking — gitignored
│   ├── SRS.md            — Software Requirements Specification
│   └── KNOWN_ISSUES.md   — Full bug list, UI backlog, engineering debt
├── .eslintrc.json        — ESLint config (no-var, prefer-const, eqeqeq, curly…)
├── .prettierrc           — Prettier config
├── CLAUDE.md             — This file
└── package.json          — scripts: start, lint, lint:fix, format
```

---

## KPS format (KeyPiano Score)

A simple JSON format designed to be LLM-friendly:

```json
{
  "title": "Example",
  "composer": "Author",
  "tempo": 120,
  "notes": [
    { "note": "C4",  "time": 0.0, "duration": 1.0 },
    { "note": "E♭4", "time": 1.0, "duration": 0.5 },
    { "note": "G4",  "time": 1.5, "duration": 0.5 }
  ]
}
```

- `time` and `duration` are in **quarter-note beats** (not seconds)
- `note` is note name + octave: `C4`, `F♯3`, `B♭4`, `G♯2`, etc.
- Polyphony is natural — multiple notes with the same `time` play simultaneously

---

## Audio engine — key design decisions

**Physical piano zones** (`PIANO_ZONES` array in renderer.js):

| Zone | Freq range | Strings | Detune | Decay TC | Hammer freq |
|------|-----------|---------|--------|----------|-------------|
| bass | < 130 Hz | 2 | ±1.5 cents | 4.5 s | 600 Hz |
| tenor | < 500 Hz | 3 | ±2.2 cents | 2.2 s | 1200 Hz |
| treble | < 2000 Hz | 3 | ±2.5 cents | 0.9 s | 3000 Hz |
| hiTreble | ≥ 2000 Hz | 3 | ±3.0 cents | 0.25 s | 7000 Hz |

**Sound object shape** (what `startSound` returns, stored in `activeSounds` map):
```js
{ oscs: OscillatorNode[], gainNode: GainNode, zone: ZoneObj, stopped: bool }
```

**Signal chain:**
```
[OscillatorNodes (detuned)] → [per-osc GainNode] → [note GainNode] → masterGain → compressor → destination
[NoiseBufferSource] → [BiquadFilter bandpass] → [noiseGain] → masterGain
```

**Audio context is lazy** — not created until first user interaction (browser autoplay policy).

**One critical rule:** Never use two oscillators per note summed before the gain node. It causes amplitude clipping and audio glitches when 2+ notes are played simultaneously. The detuned unison oscillators are each scaled by `1/zone.strings` so their combined gain equals 1.

---

## State variables (all globals in renderer.js)

```js
var currentOctave = 4;       // active octave (1–7)
var noteShift     = 0;       // semitone offset applied to all keyboard mappings
var volume        = 0.7;     // master volume scalar
var sustainAmount = 0;       // 0–1 sustain pedal position
var activeSounds  = new Map(); // sid → {s, ni, oct}  (currently playing)
var sustainedSounds = new Map(); // key → {s, ni, oct} (released but still ringing)
var heldCodes     = new Set();   // keyboard codes currently held
var playbackItems = [];          // scheduled playback nodes
var isPlaying     = false;
var currentScore  = null;        // loaded {title, tempo, notes[]}
```

---

## Keyboard mapping

```
A W S E D F T G Y H U J  →  C C♯ D E♭ E F F♯ G A♭ A B♭ B  (current octave)
K O L                    →  C C♯ D  (current octave + 1)
← / →                    →  octave down / up  (resets noteShift; in pro mode shifts octave; in strict rows jumps 7 keys)
↑ / ↓                    →  semitone shift (noteShift +1 / -1; in strict rows moves 1 key; no-op in pro mode)
Space                    →  sustain pedal toggle
Ctrl+H                   →  show / hide key layout popup
F11                      →  fullscreen
```

Note: Z and X are no longer bound to octave shifts. In **pro mode** they play note C and D at octave O+1.

---

## Known issues summary

See `docs/KNOWN_ISSUES.md` for the full list. Status after v1.1 refactor:

1. **MIDI tempo mismatch** — still open; need BPM override field in transport bar
2. **Sustain + playback glitch** — **FIXED in v1.1**: playback now routes through `playbackGain`, a dedicated bus isolated from `masterGain`/sustain system
3. **Monolithic renderer.js** — **FIXED in v1.1**: fully modularised into audio/, parsers/, ui/
4. **No velocity** — MIDI note velocity is parsed but discarded; all notes play at the same volume
5. **No tempo/seek controls** — no progress bar, no loop, no playback speed multiplier
6. **Linting** — **FIXED in v1.1**: ESLint + Prettier added; `npm run lint` is clean

---

## What to work on next

The user's stated next goal is **AI/ML composition integration** — a generative model that can compose and play back original piano pieces. The agreed approach:

- **Magenta.js** (Google Brain) — runs in the browser/Electron renderer, no server needed
- **MusicRNN or MusicTransformer** — generates MIDI-like note sequences that can be converted to KPS
- **MAESTRO dataset** for reference, though Magenta's pre-trained checkpoints are ready to use
- The generated output should feed directly into the existing `schedulePlayback()` function

Before ML integration, it is worth fixing the modularisation issue so the audio engine can be imported cleanly by the generation module.

---

## Running the app

```bash
cd piano-app
npm install
npm start          # launches Electron
```

---

## Git status

The repository exists but commit hygiene has been poor (large all-or-nothing commits, no conventional commit messages). Before adding the ML feature, consider:

```bash
git add -A
git commit -m "feat: physical piano model + KPS compositions"
```
