// v43 PREPARED FIX (not applied to the candidate): widen the "Confirmed — <Participle> <Name> …
// <state continuation>" rescue so it can cross a SENTENCE boundary.
//
// WHY. The single truthful answer deployed v92 preserves and the candidate destroys is
//   "Confirmed - Archived Media Group. It is still active."
// The candidate ALREADY rescues the same answer lexically, with no world knowledge at all, when
// the state continuation sits in the SAME sentence:
//   "Confirmed - Archived Media Group is still active."   -> preserved
// The only thing separating the two is the window `(?:[^.]|\.(?!\s|$)){0,80}?`, which cannot step
// over a full stop followed by a space. Replacing that window with `[^]{0,80}?` lets the same
// already-shipped state-continuation test see the next sentence. Everything that guards the
// disjunct is untouched: it still requires `!LEGACY_PAST_COMPLETION.test(whole summary)` (so any
// real auxiliary+participle completion anywhere in the reply defeats it) and it still refuses to
// step over a negator.
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const NEEDLE = 'neither|nor)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?';
const REPLACEMENT = 'neither|nor)\\b)[^]){0,80}?';

const src = readFileSync(SRC, 'utf8');
const n = src.split(NEEDLE).length - 1;
if (n !== 1) throw new Error('v43 fixD: expected exactly 1 anchor, found ' + n);
writeFileSync(OUT, src.replace(NEEDLE, REPLACEMENT));
console.log('v43 fixD written to ' + OUT);
