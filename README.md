> **Experiment:** This repository is managed entirely by [Claude](https://claude.ai) (Anthropic's AI assistant). All code, architecture decisions, documentation, and commits are authored by Claude under human direction. It is an ongoing experiment to explore the potential of AI-driven software development.

---

# KeyPiano

A desktop piano that turns your laptop keyboard into a playable instrument. No hardware, no samples, no setup — just open and play.

Built with **Electron** and the **Web Audio API**. Audio is synthesised using a physically-modelled grand piano engine: zone-based harmonic profiles, detuned unison oscillators (string coupling), natural decay envelopes, and bandpass-filtered noise bursts for hammer strikes.

![KeyPiano Studio](screenshot.png)

---

## Features

- **Laptop keyboard → piano keys** — play instantly with A–L and W/E/T/Y/U/O
- **Physical piano model** — four acoustic zones (bass / tenor / treble / hi-treble), detuned string oscillators, hammer noise burst
- **Sustain pedal** — vertical strip on the left; drag or press Space to toggle
- **Octave shifting** — Z / X to step down / up; arrow keys for semitone shift
- **MIDI + KPS file playback** — load any `.mid` or `.kps` file and play it back
- **Visual key highlighting** — on-screen keys light up during keyboard and playback input
- **Volume control** — live slider, takes effect on next note
- **Fullscreen** — F11 or the corner button

---

## Keyboard Layout

```
  W  E     T  Y  U     O
 A  S  D  F  G  H  J  K  L
 C  C♯ D  E♭ E  F  F♯ G  A♭ A  B♭ B  | C  C♯ D
```

| Key | Note | | Key | Note |
|-----|------|-|-----|------|
| `A` | C  | | `G` | G  |
| `W` | C♯ | | `Y` | G♯ |
| `S` | D  | | `H` | A  |
| `E` | E♭ | | `U` | B♭ |
| `D` | E  | | `J` | B  |
| `F` | F  | | `K` | C+1 |
| `T` | F♯ | | `O` | C♯+1 |
|     |    | | `L` | D+1 |

### Transport controls

| Key / Control | Action |
|---|---|
| `Z` / `X` | Octave down / up (resets semitone shift) |
| `←` / `→` | Semitone shift −1 / +1 |
| `Space` | Toggle sustain pedal |
| `F11` | Toggle fullscreen |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Install & Run

```bash
git clone <repo-url>
cd piano-app
npm install
npm start
```

### Loading Score Files

Place `.kps` or `.mid` files in the `scores/` folder (gitignored). Click **Load ♩** in the transport bar to open a file, then **▶** to play.

---

## Project Structure

```
piano-app/
├── src/
│   ├── constants.js           Layout constants and keyboard map
│   ├── state.js               Shared mutable application state
│   ├── audio/
│   │   ├── context.js         AudioContext singleton + gain buses
│   │   ├── piano-model.js     Zone definitions, oscillator synthesis
│   │   └── playback.js        Pre-scheduled KPS/MIDI playback engine
│   ├── parsers/
│   │   ├── midi.js            Standard MIDI File binary parser
│   │   └── kps.js             KeyPiano Score JSON parser
│   ├── ui/
│   │   ├── interactions.js    pressNote / releaseNote
│   │   ├── piano-builder.js   Piano DOM construction
│   │   ├── sustain-strip.js   Sustain strip drag interaction
│   │   └── viewport.js        Octave highlights, labels, scroll
│   ├── renderer.js            Entry point — wires all modules together
│   ├── main.js                Electron main process
│   └── index.html             App shell
├── scores/                    Score files (.kps, .mid) — gitignored
├── docs/                      Project specifications — gitignored
├── .eslintrc.json
├── .prettierrc
├── CONTRIBUTING.md
├── KNOWN_ISSUES.md
├── package.json
└── README.md
```

---

## KPS Format

KeyPiano Score is a simple JSON format for compositions:

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

- `time` and `duration` are in **quarter-note beats**, not seconds
- `note` is name + octave: `C4`, `F♯3`, `B♭4`, `G♯2`
- Simultaneous notes are natural — give them the same `time`

---

## Development

```bash
npm run lint         # ESLint check
npm run lint:fix     # auto-fix
npm run format       # Prettier
```

Architecture notes and contribution guidelines are in `CLAUDE.md`.

---

## Roadmap

- BPM override field in transport bar
- Note velocity (MIDI files embed per-note dynamics)
- Reverb / room simulation
- Piano roll visualiser
- Recording to KPS

---

## License

MIT
