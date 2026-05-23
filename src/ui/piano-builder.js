import {
  WKW, BKW, OCT_MIN, OCT_MAX,
  WHITE_NOTE_INDICES, BLACK_NOTE_DEFS, NOTE_NAMES,
} from '../constants.js';
import { pressNote, releaseNote } from './interactions.js';

/**
 * Build and insert all piano key DOM elements into the target container.
 * White keys are rendered as flex children; black keys are absolutely
 * positioned over them using precomputed pixel offsets.
 *
 * @param {string} [targetId='piano'] - ID of the container element
 */
export function buildPiano(targetId = 'piano') {
  const piano = document.getElementById(targetId);
  const wDiv  = document.createElement('div');
  wDiv.className = 'white-keys';

  const blacks = [];
  let wIdx = 0;

  for (let oct = OCT_MIN; oct <= OCT_MAX; oct++) {
    for (let wi = 0; wi < WHITE_NOTE_INDICES.length; wi++) {
      const ni = WHITE_NOTE_INDICES[wi];

      const key = document.createElement('div');
      key.className   = 'key white-key';
      key.dataset.oct = oct;
      key.dataset.ni  = ni;

      const nm = document.createElement('span');
      nm.className   = 'note-name';
      nm.textContent = NOTE_NAMES[ni] + oct;

      const lb = document.createElement('span');
      lb.className = 'key-label';

      key.appendChild(nm);
      key.appendChild(lb);
      wDiv.appendChild(key);

      // Place any black keys that sit on top of this white key
      BLACK_NOTE_DEFS.forEach(([bni, bwi]) => {
        if (bwi !== wi) {return;}
        const bk = document.createElement('div');
        bk.className   = 'key black-key';
        bk.dataset.oct = oct;
        bk.dataset.ni  = bni;
        bk.style.left  = `${wIdx * WKW - BKW / 2}px`;
        const bnm = document.createElement('span');
        bnm.className   = 'note-name';
        bnm.textContent = NOTE_NAMES[bni] + oct;
        const bl = document.createElement('span');
        bl.className = 'key-label';
        bk.appendChild(bnm);
        bk.appendChild(bl);
        blacks.push(bk);
      });

      wIdx++;
    }
  }

  piano.appendChild(wDiv);
  blacks.forEach(b => piano.appendChild(b));
  addKeyMouseListeners(piano);
}

/**
 * Attach mousedown / mouseup / mouseleave handlers to every .key element
 * inside the given piano container.
 *
 * @param {Element} [container=document] - Scope for querySelector
 */
export function addKeyMouseListeners(container = document) {
  container.querySelectorAll('.key').forEach(key => {
    const oct = parseInt(key.dataset.oct);
    const ni  = parseInt(key.dataset.ni);
    const sid = `mouse_${oct}_${ni}`;
    let held  = false;

    key.addEventListener('mousedown',  ev => { ev.preventDefault(); held = true;  pressNote(ni, oct, sid); });
    key.addEventListener('mouseup',    ()  => { if (!held) {return;} held = false; releaseNote(sid); });
    key.addEventListener('mouseleave', ()  => { if (!held) {return;} held = false; releaseNote(sid); });
  });
}
