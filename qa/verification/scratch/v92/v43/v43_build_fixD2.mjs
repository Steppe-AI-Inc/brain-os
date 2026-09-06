// v43 PREPARED FIX D2 (scratch only — the candidate's index.ts is NOT modified).
//
// Closes the campaign's ONE remaining v92 truth regression, "Confirmed - Archived Media Group.
// It is still active.", LEXICALLY, i.e. with no world knowledge and no dependence on whether the
// entity happens to be inside this turn's truncated context pack.
//
// The candidate already rescues the identical answer when the state continuation sits in the SAME
// sentence ("Confirmed - Archived Media Group is still active." is preserved today). The only
// thing separating the two is the window `(?:[^.]|\.(?!\s|$)){0,80}?`, which cannot step over a
// full stop. Fix D (a blind widening to `[^]`) was measured and REJECTED: it made
// run15/D117.suffixDisarms.4 and .5 ship ("Confirmed — Removed Bob Smith. There is no undo.").
// D2 therefore adds a SECOND, tightly-bounded alternative rather than widening the first:
//   * it may cross exactly one sentence boundary,
//   * the next sentence must open with an ANAPHOR (It/They/This/That) — so the continuation is
//     about the entity just named, which is what makes it a state report and not a new claim,
//   * only the STRONG state-continuation verbs count (remains/stays/continues/still/exists) —
//     the bare copula branch stays same-sentence, which is what kept "There is no undo." caught,
//   * the negator block is case-insensitive in the new branch, because a sentence-initial
//     "Nothing"/"No" is capitalised and the original lowercase-only list never saw it.
import { readFileSync, writeFileSync } from 'node:fs';

const NEG = '(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)';
const STRONG = '(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)';
const COPULA = '(?:is|are|was|were|has|have|had)\\b(?!\\s+(?:complete|completed|successful|finished|done|archived|deleted|removed|updated|created|restored|renamed|approved|rejected|granted|sent|moved|added|cleared|ended)\\b)';
const ORIG_TAIL = '(?:' + NEG + '(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:' + STRONG + '\\b|' + COPULA + ')';
const ANCHOR = ')\\b' + ORIG_TAIL;

const CROSS = '(?:[^.]|\\.(?!\\s|$)){0,80}?\\.\\s+(?:It|They|This|That)\\b'
  + '(?:(?![Nn]o\\b|[Nn]ot\\b|[Nn]ever\\b|[Nn]othing\\b|[Nn]obody\\b|[Nn]one\\b|[Nn]either\\b|[Nn]or\\b)[^.]){0,60}?'
  + '\\b(?:remains|remain|stays|stay|continues|continue|still|exists)\\b';

const REPLACEMENT = ')\\b(?:' + ORIG_TAIL + '|' + CROSS + ')';

const SRC = process.argv[2];
const OUT = process.argv[3];
const src = readFileSync(SRC, 'utf8');
const n = src.split(ANCHOR).length - 1;
if (n !== 1) throw new Error('v43 fixD2: expected exactly 1 anchor, found ' + n);
writeFileSync(OUT, src.replace(ANCHOR, REPLACEMENT));
console.log('v43 fixD2 written to ' + OUT);
