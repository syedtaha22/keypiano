/**
 * Convert a MIDI note number to a note name string.
 * @param {number} n - MIDI note number 0–127
 * @returns {string} e.g. "C4", "F♯3", "B♭5"
 */
export function midiToName(n) {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  return names[n % 12] + (Math.floor(n / 12) - 1);
}

/**
 * Parse a Standard MIDI File binary buffer into a KPS-compatible score object.
 *
 * Fixes over the previous implementation:
 *  - Full tempo map: every FF 51 event is recorded and used for tick→second
 *    conversion, so files with tempo changes play at the correct speed.
 *  - FIFO pending queues: each (note, channel) key holds an array of start
 *    ticks so re-triggered notes are matched correctly instead of overwriting.
 *  - Percussion skip: MIDI channel 10 (index 9) events are consumed and
 *    discarded, preventing noise bursts from drum tracks.
 *  - Unterminated notes are closed at track end rather than silently dropped.
 *  - Returns tempo:60 with time/duration already in seconds so schedulePlayback
 *    treats them correctly (spb = 60/60 = 1.0 → no double-scaling).
 *
 * @param {ArrayBuffer} buffer - Raw bytes of a .mid file
 * @returns {{ tempo: number, notes: Array<{note,time,duration}> } | null}
 */
export function parseMidi(buffer) {
  const d = new Uint8Array(buffer);
  let p = 0;

  const u8   = () => d[p++];
  const u16  = () => { const v = (d[p] << 8) | d[p + 1]; p += 2; return v; };
  const u32  = () => { const v = ((d[p] << 24) | (d[p+1] << 16) | (d[p+2] << 8) | d[p+3]) >>> 0; p += 4; return v; };
  const vlen = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7F); } while (b & 0x80); return v; };
  const str4 = () => { let s = ''; for (let i = 0; i < 4; i++) { s += String.fromCharCode(u8()); } return s; };

  if (str4() !== 'MThd') { return null; }
  u32(); // header length (always 6)
  u16(); // format (0 or 1 — handled uniformly)
  const ntrk = u16();
  const tpb  = u16();
  if (tpb & 0x8000) { return null; } // SMPTE timecode not supported

  // Tempo map — [{tick, usPerBeat}] ordered by tick.
  // Initialised to 120 BPM (500 000 µs/beat); updated by FF 51 meta-events.
  const tempoMap = [{ tick: 0, usPerBeat: 500000 }];

  // Raw notes collected across all tracks before tick-to-second conversion.
  const rawNotes = [];

  for (let t = 0; t < ntrk; t++) {
    const ct = str4();
    const cl = u32();
    const ce = p + cl;
    if (ct !== 'MTrk') { p = ce; continue; }

    let tick   = 0;
    let lastSt = 0;
    // FIFO pending: key `${noteNum}_${ch}` → [startTick, ...]
    const pending = {};

    while (p < ce) {
      tick += vlen();
      const b = d[p];

      if (b === 0xFF) {
        // Meta event
        p++;
        const mt = u8();
        const ml = vlen();
        if (mt === 0x51 && ml === 3) {
          const us   = (u8() << 16) | (u8() << 8) | u8();
          const last = tempoMap[tempoMap.length - 1];
          // Same tick as previous entry — overwrite (last change at a tick wins)
          if (last.tick === tick) { last.usPerBeat = us; }
          else { tempoMap.push({ tick, usPerBeat: us }); }
        } else {
          p += ml;
        }
      } else if (b === 0xF0 || b === 0xF7) {
        // SysEx — skip
        p++;
        p += vlen();
      } else {
        // Channel event with running-status support
        let st;
        if (b & 0x80) { lastSt = b; p++; st = b; } else { st = lastSt; }
        const tp = st & 0xF0;
        const ch = st & 0x0F;

        if (tp === 0x90) {
          const nt  = u8();
          const vel = u8();
          if (ch === 9) { continue; } // discard percussion
          const key = `${nt}_${ch}`;
          if (vel > 0) {
            // FIFO push — preserves earlier start if same note re-triggered
            if (!pending[key]) { pending[key] = []; }
            pending[key].push(tick);
          } else {
            // Velocity-0 note-on = note-off; FIFO pop
            if (pending[key]?.length) {
              rawNotes.push({ noteNum: nt, startTick: pending[key].shift(), endTick: tick });
            }
          }
        } else if (tp === 0x80) {
          const nt = u8(); u8(); // note, release velocity (discarded)
          if (ch === 9) { continue; }
          const key = `${nt}_${ch}`;
          if (pending[key]?.length) {
            rawNotes.push({ noteNum: nt, startTick: pending[key].shift(), endTick: tick });
          }
        } else if (tp === 0xC0 || tp === 0xD0) {
          p++;      // 1 data byte
        } else if (tp === 0xA0 || tp === 0xB0 || tp === 0xE0) {
          p += 2;   // 2 data bytes
        }
      }
    }

    // Close any notes still open at track end (common in some exports)
    for (const key of Object.keys(pending)) {
      const noteNum = parseInt(key.split('_')[0]);
      for (const s0 of pending[key]) {
        rawNotes.push({ noteNum, startTick: s0, endTick: tick });
      }
    }

    p = ce;
  }

  // Ensure tempo map is sorted by tick (should already be, but guard against
  // multi-track files where track 0 isn't the conductor track)
  tempoMap.sort((a, b) => a.tick - b.tick);

  /**
   * Convert an absolute MIDI tick to wall-clock seconds using the tempo map.
   * Each segment between tempo changes uses its own µs/beat rate.
   */
  function tickToSec(tick) {
    let sec      = 0;
    let prevTick = 0;
    let prevUs   = tempoMap[0].usPerBeat;
    for (let i = 1; i < tempoMap.length; i++) {
      if (tempoMap[i].tick >= tick) { break; }
      sec      += (tempoMap[i].tick - prevTick) * prevUs / (tpb * 1e6);
      prevTick  = tempoMap[i].tick;
      prevUs    = tempoMap[i].usPerBeat;
    }
    sec += (tick - prevTick) * prevUs / (tpb * 1e6);
    return sec;
  }

  const notes = rawNotes
    .map(n => ({
      note:     midiToName(n.noteNum),
      time:     tickToSec(n.startTick),
      duration: Math.max(0.05, tickToSec(n.endTick) - tickToSec(n.startTick)),
    }))
    .sort((a, b) => a.time - b.time);

  // Strip leading silence: many MIDI exports start notes seconds after t=0.
  // Subtract the first note's time so playback begins immediately.
  if (notes.length > 0 && notes[0].time > 0.02) {
    const shift = notes[0].time;
    for (const n of notes) { n.time -= shift; }
  }

  // Return tempo:60 so schedulePlayback uses spb = 60/60 = 1.0 and treats
  // time/duration values as seconds directly.
  return { tempo: 60, notes };
}
