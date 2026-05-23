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
 * Handles:
 *   - Format 0 (single track) and Format 1 (multi-track)
 *   - Running status
 *   - Tempo meta-events (0x51) — uses the first tempo found
 *   - Note-on with velocity 0 treated as note-off
 *
 * @param {ArrayBuffer} buffer - Raw bytes of a .mid file
 * @returns {{ tempo: number, notes: Array<{note: string, time: number, duration: number}> } | null}
 */
export function parseMidi(buffer) {
  const d = new Uint8Array(buffer);
  let p = 0;

  const u8   = () => d[p++];
  const u16  = () => { const v = (d[p] << 8) | d[p + 1]; p += 2; return v; };
  const u32  = () => { const v = ((d[p] << 24) | (d[p+1] << 16) | (d[p+2] << 8) | d[p+3]) >>> 0; p += 4; return v; };
  const vlen = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7F); } while (b & 0x80); return v; };
  const str4 = () => { let s = ''; for (let i = 0; i < 4; i++) {s += String.fromCharCode(u8());} return s; };

  if (str4() !== 'MThd') {return null;}
  u32(); u16();
  const ntrk = u16();
  const tpb  = u16();
  if (tpb & 0x8000) {return null;} // SMPTE timecode — not supported

  const allNotes = [];
  let tempo = 500000; // default: 120 BPM

  for (let t = 0; t < ntrk; t++) {
    const ct = str4();
    const cl = u32();
    const ce = p + cl;
    if (ct !== 'MTrk') { p = ce; continue; }

    let tick   = 0;
    let lastSt = 0;
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
          tempo = (u8() << 16) | (u8() << 8) | u8();
        } else {
          p += ml;
        }
      } else if (b === 0xF0 || b === 0xF7) {
        // SysEx — skip
        p++;
        p += vlen();
      } else {
        // MIDI channel event (with running status support)
        let st;
        if (b & 0x80) { lastSt = b; p++; st = b; } else { st = lastSt; }
        const tp = st & 0xF0;
        const ch = st & 0x0F;

        if (tp === 0x90) {
          const nt  = u8();
          const vel = u8();
          if (vel > 0) {
            pending[`${nt}_${ch}`] = tick;
          } else {
            // velocity-0 note-on = note-off
            const s0 = pending[`${nt}_${ch}`];
            if (s0 !== undefined) {
              allNotes.push({ note: midiToName(nt), time: s0 / tpb, duration: Math.max(0.125, (tick - s0) / tpb) });
              delete pending[`${nt}_${ch}`];
            }
          }
        } else if (tp === 0x80) {
          const nt = u8(); u8(); // note, velocity (ignored)
          const s0 = pending[`${nt}_${ch}`];
          if (s0 !== undefined) {
            allNotes.push({ note: midiToName(nt), time: s0 / tpb, duration: Math.max(0.125, (tick - s0) / tpb) });
            delete pending[`${nt}_${ch}`];
          }
        } else if (tp === 0xC0 || tp === 0xD0) {
          p++;      // 1 data byte
        } else if (tp === 0xA0 || tp === 0xB0 || tp === 0xE0) {
          p += 2;   // 2 data bytes
        }
      }
    }
    p = ce;
  }

  allNotes.sort((a, b) => a.time - b.time);
  return { tempo: Math.round(60000000 / tempo), notes: allNotes };
}
