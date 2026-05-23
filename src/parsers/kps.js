/**
 * Parse a note name string into a note index and octave number.
 *
 * Accepts Unicode symbols (C♯4, B♭5) and ASCII equivalents (C#4, Bb5).
 *
 * @param {string} name
 * @returns {{ ni: number, oct: number } | null}  null if the string is malformed
 */
export function parseNoteName(name) {
  if (typeof name !== 'string') { return null; }
  const m = name.match(/^([A-G])(♯|♭|#|b)?(\d+)$/);
  if (!m) {return null;}
  let base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  if (m[2] === '#' || m[2] === '♯') {base++;}
  if (m[2] === 'b' || m[2] === '♭') {base--;}
  return { ni: ((base % 12) + 12) % 12, oct: parseInt(m[3]) };
}

/**
 * Parse a KeyPiano Score (.kps) JSON string.
 *
 * KPS format:
 * {
 *   "title":  "Example",
 *   "tempo":  120,
 *   "notes":  [{ "note": "C4", "time": 0.0, "duration": 1.0 }, ...]
 * }
 * time and duration are in quarter-note beats, not seconds.
 *
 * @param {string} text - Raw contents of a .kps file
 * @returns {{ title: string, tempo: number, notes: Array } | null}
 */
export function parseKPS(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (_) { return null; }
  if (!obj || !Array.isArray(obj.notes)) {return null;}
  const notes = obj.notes.filter(
    n => n && typeof n.note === 'string' && typeof n.time === 'number' && typeof n.duration === 'number'
  );
  return {
    title: obj.title ?? 'Untitled',
    tempo: (typeof obj.tempo === 'number' && obj.tempo > 0) ? obj.tempo : 120,
    notes,
  };
}
