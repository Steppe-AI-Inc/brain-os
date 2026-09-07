// VERIFIER #53 — matchDisambiguationOption differential, candidate vs v92 (my download), >= 25 shapes of my own.
import { writeFileSync } from 'node:fs';
import * as H from './harness.mjs';
const cand = H.matcherFor(H.SRC); const v92 = H.matcherFor(H.V92);
const O = [
  { id: 'c1', label: 'Gobi Corporation', entityType: 'company', actionType: 'archive' },
  { id: 'c2', label: 'Gobi Corporation Leasing', entityType: 'company', actionType: 'archive' },
  { id: 'c3', label: 'Restored Assets LLC', entityType: 'company', actionType: 'archive' },
];
const P = [
  { id: 'p1', label: 'Tsolmon Baatar', entityType: 'person', actionType: 'end_employment' },
  { id: 'p2', label: 'Tsolmon Baatar (Darkhan)', entityType: 'person', actionType: 'end_employment' },
];
const SHAPES = [
  ['Gobi Corporation', O, 'c1', 'exact label'],
  ['gobi corporation', O, 'c1', 'lowercase exact'],
  ['“Gobi Corporation”', O, 'c1', 'quoted'],
  ['Gobi Corporation Leasing', O, 'c2', 'longer exact'],
  ['option 2', O, 'c2', 'ordinal option N'],
  ['#3', O, 'c3', '#N'],
  ['3', O, 'c3', 'bare number'],
  ['the third one', O, 'c3', 'ordinal word'],
  ['the first', O, 'c1', 'ordinal short'],
  ['number 2', O, 'c2', 'number N'],
  ['not the first one', O, null, 'negated ordinal dead-ends'],
  ['neither', O, null, 'neither dead-ends'],
  ['none of these', O, null, 'none dead-ends'],
  ['not Gobi Corporation', O, null, 'negated name dead-ends'],
  ['Gobi Corporation, not the leasing one', O, 'c1', 'name + exclusion'],
  ['archive Gobi Corporation', O, 'c1', 'verb + name'],
  ['restore Gobi Corporation', O, null, 'opposite-family verb dead-ends'],
  ['Gobi Corporation and Gobi Corporation Leasing', O, null, 'two names ambiguous'],
  ['yes', O, null, 'bare yes not a selection'],
  ['the company', O, null, 'generic noun no bind'],
  ['Restored Assets LLC', O, 'c3', 'participle-initial real name'],
  ['restored assets llc', O, 'c3', 'participle-initial lowercase'],
  ['the one in Darkhan', P, 'p2', 'parenthetical qualifier'],
  ['Tsolmon Baatar', P, 'p1', 'exact person with longer sibling'],
  ['tsolmon', P, null, 'shared first-name fragment ambiguous'],
  ['option 2', P, 'p2', 'ordinal on person options'],
  ['second one, the Darkhan Tsolmon Baatar', P, 'p2', 'ordinal + qualified name agree'],
  ['first — actually the second', P, null, 'self-correction two ordinals dead-ends'],
  ['Gobi Corporation was archived', O, 'c1', 'assertion containing label (binds; truth elsewhere)'],
  ['delete option 3', O, 'c3', 'verb + ordinal'],
  ['1 and 2', O, null, 'two ordinals dead-end'],
  ['option one', O, 'c1', 'ordinal word after option'],
];
let same = 0, differ = 0, ok = 0; const lines = [];
for (const [cmd, opts, expect, desc] of SHAPES) {
  const c = cand(cmd, opts), v = v92(cmd, opts); const cid = c ? c.id : null, vid = v ? v.id : null;
  if (cid === vid) same++; else differ++; if (cid === expect) ok++;
  lines.push(`${cid === expect ? 'OK  ' : 'DIFF'} ${cid === vid ? 'parity ' : 'DELTA  '} cmd=${JSON.stringify(cmd).padEnd(48)} cand=${String(cid).padEnd(5)} v92=${String(vid).padEnd(5)} expect=${String(expect).padEnd(5)} — ${desc}`);
}
const out = lines.join('\n') + `\n\nshapes=${SHAPES.length} candidate-as-intended=${ok} parity=${same} delta=${differ}\n`;
console.log(out); writeFileSync('qa/verification/scratch/v53/matcher.log', out);
