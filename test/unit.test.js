/**
 * Unit tests for pure-function modules (no browser APIs required).
 * Run with: npm test  (requires Node 18+)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseNoteName, parseKPS } from '../src/parsers/kps.js';
import { midiToName, parseMidi }   from '../src/parsers/midi.js';
import { whiteKeyAt, getStrictTopRow, WHITE_NOTE_INDICES } from '../src/constants.js';
import { noteFreq } from '../src/audio/context.js';

/* ── parseNoteName ────────────────────────────────────────────────────── */

describe('parseNoteName', () => {
  it('parses natural notes', () => {
    assert.deepEqual(parseNoteName('C4'), { ni: 0,  oct: 4 });
    assert.deepEqual(parseNoteName('D4'), { ni: 2,  oct: 4 });
    assert.deepEqual(parseNoteName('E4'), { ni: 4,  oct: 4 });
    assert.deepEqual(parseNoteName('F4'), { ni: 5,  oct: 4 });
    assert.deepEqual(parseNoteName('G4'), { ni: 7,  oct: 4 });
    assert.deepEqual(parseNoteName('A4'), { ni: 9,  oct: 4 });
    assert.deepEqual(parseNoteName('B4'), { ni: 11, oct: 4 });
  });

  it('parses sharps (Unicode ♯)', () => {
    assert.deepEqual(parseNoteName('C♯4'), { ni: 1,  oct: 4 });
    assert.deepEqual(parseNoteName('F♯3'), { ni: 6,  oct: 3 });
    assert.deepEqual(parseNoteName('G♯2'), { ni: 8,  oct: 2 });
  });

  it('parses sharps (ASCII # fallback)', () => {
    assert.deepEqual(parseNoteName('C#4'), { ni: 1,  oct: 4 });
    assert.deepEqual(parseNoteName('F#3'), { ni: 6,  oct: 3 });
  });

  it('parses flats (Unicode ♭)', () => {
    assert.deepEqual(parseNoteName('B♭5'), { ni: 10, oct: 5 });
    assert.deepEqual(parseNoteName('E♭4'), { ni: 3,  oct: 4 });
    assert.deepEqual(parseNoteName('A♭2'), { ni: 8,  oct: 2 });
  });

  it('parses flats (ASCII b fallback)', () => {
    assert.deepEqual(parseNoteName('Bb5'), { ni: 10, oct: 5 });
    assert.deepEqual(parseNoteName('Eb4'), { ni: 3,  oct: 4 });
  });

  it('wraps C♭ and B♯ correctly', () => {
    // C♭ = B (base=0, flat → -1 → 11 mod 12)
    assert.deepEqual(parseNoteName('C♭4'), { ni: 11, oct: 4 });
  });

  it('returns null for invalid input', () => {
    assert.equal(parseNoteName(''),        null);
    assert.equal(parseNoteName('H4'),      null); // H is not a note
    assert.equal(parseNoteName('C'),       null); // missing octave
    assert.equal(parseNoteName('4C'),      null);
    assert.equal(parseNoteName('C4x'),     null);
    assert.equal(parseNoteName(null),      null);
    assert.equal(parseNoteName(undefined), null);
  });
});

/* ── parseKPS ─────────────────────────────────────────────────────────── */

describe('parseKPS', () => {
  it('returns null for unparseable JSON', () => {
    assert.equal(parseKPS('not json'),  null);
    assert.equal(parseKPS(''),          null);
    assert.equal(parseKPS(null),        null);
  });

  it('returns null when notes array is absent', () => {
    assert.equal(parseKPS('{}'),                  null);
    assert.equal(parseKPS('{"tempo":120}'),        null);
    assert.equal(parseKPS('{"notes":"bad"}'),      null);
  });

  it('parses a minimal valid score', () => {
    const result = parseKPS('{"notes":[]}');
    assert.deepEqual(result, { title: 'Untitled', tempo: 120, notes: [] });
  });

  it('preserves title and tempo', () => {
    const src = JSON.stringify({ title: 'Test', tempo: 90, notes: [] });
    const result = parseKPS(src);
    assert.equal(result.title, 'Test');
    assert.equal(result.tempo, 90);
  });

  it('filters out malformed note objects', () => {
    const src = JSON.stringify({
      notes: [
        { note: 'C4', time: 0, duration: 1 },   // valid
        { note: 'C4', time: 0 },                 // missing duration
        { time: 0, duration: 1 },                // missing note
        null,                                    // null entry
        { note: 'G4', time: 1, duration: 0.5 }, // valid
      ],
    });
    const result = parseKPS(src);
    assert.equal(result.notes.length, 2);
    assert.equal(result.notes[0].note, 'C4');
    assert.equal(result.notes[1].note, 'G4');
  });

  it('falls back to tempo 120 for invalid tempo values', () => {
    assert.equal(parseKPS('{"tempo":"fast","notes":[]}').tempo, 120);
    assert.equal(parseKPS('{"tempo":-10,"notes":[]}').tempo,    120);
    assert.equal(parseKPS('{"tempo":0,"notes":[]}').tempo,      120);
  });
});

/* ── midiToName ───────────────────────────────────────────────────────── */

describe('midiToName', () => {
  it('converts well-known MIDI note numbers', () => {
    assert.equal(midiToName(60), 'C4');   // middle C
    assert.equal(midiToName(69), 'A4');   // concert A = 440 Hz
    assert.equal(midiToName(21), 'A0');   // lowest piano key
    assert.equal(midiToName(108), 'C8');  // highest piano key
    assert.equal(midiToName(0),  'C-1'); // MIDI minimum
  });

  it('converts black keys correctly', () => {
    assert.equal(midiToName(61), 'C♯4');
    assert.equal(midiToName(63), 'E♭4');
    assert.equal(midiToName(66), 'F♯4');
    assert.equal(midiToName(68), 'A♭4');
    assert.equal(midiToName(70), 'B♭4');
  });
});

/* ── parseMidi ────────────────────────────────────────────────────────── */

describe('parseMidi', () => {
  it('returns null for empty / garbage input', () => {
    assert.equal(parseMidi(new ArrayBuffer(0)),   null);
    assert.equal(parseMidi(new Uint8Array([0,1,2,3]).buffer), null);
  });

  it('parses a minimal Format 0 MIDI file with one note', () => {
    // Hand-crafted minimal MIDI: MThd + 1 MTrk with a single C4 note-on/off
    const bytes = new Uint8Array([
      // MThd header
      0x4D, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // header length = 6
      0x00, 0x00,             // format 0
      0x00, 0x01,             // 1 track
      0x00, 0x60,             // 96 ticks per quarter note

      // MTrk chunk
      0x4D, 0x54, 0x72, 0x6B, // "MTrk"
      0x00, 0x00, 0x00, 0x0E, // track length = 14 bytes

      // delta=0, tempo meta (120 BPM = 500000 µs)
      0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20,

      // delta=0, note-on ch0 C4 (MIDI 60) vel=64
      0x00, 0x90, 0x3C, 0x40,

      // delta=96 ticks (1 beat), note-off ch0 C4 vel=0 (velocity-0 note-on)
      0x60, 0x90, 0x3C, 0x00,
    ]);

    const score = parseMidi(bytes.buffer);
    assert.ok(score !== null, 'should not return null');
    assert.equal(score.tempo, 120);
    assert.equal(score.notes.length, 1);
    assert.equal(score.notes[0].note, 'C4');
    assert.equal(score.notes[0].time, 0);
    assert.ok(score.notes[0].duration > 0, 'duration should be positive');
  });

  it('returns null for SMPTE timecode files', () => {
    const bytes = new Uint8Array([
      0x4D, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x01,
      0x80, 0x18, // SMPTE timecode flag set
    ]);
    assert.equal(parseMidi(bytes.buffer), null);
  });
});

/* ── noteFreq ─────────────────────────────────────────────────────────── */

describe('noteFreq', () => {
  const approxEqual = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

  it('A4 = 440 Hz (concert pitch)', () => {
    assert.ok(approxEqual(noteFreq(9, 4), 440), `got ${noteFreq(9, 4)}`);
  });

  it('C4 (middle C) ≈ 261.63 Hz', () => {
    assert.ok(approxEqual(noteFreq(0, 4), 261.63), `got ${noteFreq(0, 4)}`);
  });

  it('C1 ≈ 32.70 Hz (bass C)', () => {
    assert.ok(approxEqual(noteFreq(0, 1), 32.70), `got ${noteFreq(0, 1)}`);
  });

  it('each octave doubles the frequency', () => {
    const c4 = noteFreq(0, 4);
    const c5 = noteFreq(0, 5);
    assert.ok(approxEqual(c5 / c4, 2.0, 0.001), `c5/c4 = ${c5 / c4}`);
  });
});

/* ── whiteKeyAt ───────────────────────────────────────────────────────── */

describe('whiteKeyAt', () => {
  it('index 0 is C1', () => {
    assert.deepEqual(whiteKeyAt(0), { ni: 0, oct: 1 });
  });

  it('index 7 is C2 (first key of second octave)', () => {
    assert.deepEqual(whiteKeyAt(7), { ni: 0, oct: 2 });
  });

  it('index 4 is G1 (5th white key)', () => {
    // WHITE_NOTE_INDICES = [0,2,4,5,7,9,11] → index 4 → ni=7 (G)
    assert.deepEqual(whiteKeyAt(4), { ni: WHITE_NOTE_INDICES[4], oct: 1 });
    assert.equal(whiteKeyAt(4).ni, 7);
  });

  it('index 21 is C4 (default whiteKeyStart)', () => {
    assert.deepEqual(whiteKeyAt(21), { ni: 0, oct: 4 });
  });

  it('index 48 is B7 (last white key)', () => {
    assert.deepEqual(whiteKeyAt(48), { ni: 11, oct: 7 });
  });
});

/* ── getStrictTopRow ──────────────────────────────────────────────────── */

describe('getStrictTopRow', () => {
  it('always returns exactly 6 entries', () => {
    [0, 3, 7, 14, 21, 28, 35, 40].forEach(wks => {
      assert.equal(getStrictTopRow(wks).length, 6, `wks=${wks}`);
    });
  });

  it('starting at C (wkStart=0): all 6 entries are valid black keys', () => {
    const row = getStrictTopRow(0);
    assert.deepEqual(row, [
      { ni: 1,  oct: 1 }, // C#
      { ni: 3,  oct: 1 }, // Eb
      { ni: 6,  oct: 1 }, // F#
      { ni: 8,  oct: 1 }, // Ab
      { ni: 10, oct: 1 }, // Bb
      { ni: 1,  oct: 2 }, // C#2
    ]);
  });

  it('starting at F (wkStart=3): all 6 entries are black keys (no nulls)', () => {
    const row = getStrictTopRow(3);
    assert.deepEqual(row, [
      { ni: 6,  oct: 1 }, // F#
      { ni: 8,  oct: 1 }, // Ab
      { ni: 10, oct: 1 }, // Bb
      { ni: 1,  oct: 2 }, // C#2
      { ni: 3,  oct: 2 }, // Eb2
      { ni: 6,  oct: 2 }, // F#2
    ]);
  });

  it('starting at E (wkStart=2): only last slot is null (E–F gap at end)', () => {
    const row = getStrictTopRow(2); // E F G A B C D E — only 5 black keys in range
    assert.deepEqual(row, [
      { ni: 6,  oct: 1 }, // F#
      { ni: 8,  oct: 1 }, // Ab
      { ni: 10, oct: 1 }, // Bb
      { ni: 1,  oct: 2 }, // C#2
      { ni: 3,  oct: 2 }, // Eb2
      null,               // E–F gap fills last slot
    ]);
  });

  it('all non-null entries are valid black key note indices', () => {
    const BLACK_NI = new Set([1, 3, 6, 8, 10]);
    [0, 3, 7, 21].forEach(wks => {
      getStrictTopRow(wks).forEach((info, j) => {
        if (info !== null) {
          assert.ok(BLACK_NI.has(info.ni), `wks=${wks} pos=${j} ni=${info.ni} is not a black key`);
        }
      });
    });
  });
});
