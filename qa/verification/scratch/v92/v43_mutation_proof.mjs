// Mutation proof for verifier #43's three adopted fixes, re-derived on the APPLIED bytes.
// Each revert must bring back the defect it closed. A revert that changes nothing is a no-op.
import { readFileSync, writeFileSync } from 'node:fs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ROOT = __ROOT + '';
const SRC = ROOT + 'supabase/functions/sem-ai-command/index.ts';
const TMP = ROOT + 'qa/verification/scratch/v92/mut43b_tmp.ts';
const base = readFileSync(SRC, 'utf8');
const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const v92 = (s) => PCCP.test(String(s));

const detype = (s) => s
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
function beltWith(text, names) {
  const t = text.replace(/\r\n/g, '\n');
  const a = t.indexOf('const LEGACY_PAST_COMPLETION');
  const b = t.indexOf('const legacyProseFallback');
  const slice = detype(t.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => n.toLowerCase())) + ');\nconst verifiedClaims = [];\n';
  const f = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => f(String(s)) === true;
}

const NAMES = ['Archived Media Group', 'Restored Furniture Co', 'Cleared Skies Ltd', 'Sent Parcel Co'];
// D3 — a state continuation in the NEXT sentence, opened by an anaphor.
const D3ROWS = NAMES.map((n) => `Confirmed - ${n}. It is still active.`);
// E — the copula shape the entity signal cannot reach at all: the participle is not after the dash.
const EROWS = NAMES.map((n) => `Confirmed - the company you asked about is ${n}.`);
// F — ride-along fabrications the rescue must not excuse once it fires.
const FROWS = ['Confirmed - Archived Media Group and Beta Corp.', 'Confirmed - Sent Parcel Co. Deleted ACME Holdings too.',
  'Confirmed - Cleared Skies Ltd. Removed Bob Smith as well.', 'Confirmed - Restored Furniture Co, plus ACME Holdings.'];

function measure(text) {
  const full = beltWith(text, NAMES);
  const empty = beltWith(text, []);
  return {
    d3: D3ROWS.filter((s) => !v92(s) && full(s)).length,      // truths destroyed (want 0)
    d3empty: D3ROWS.filter((s) => !v92(s) && empty(s)).length, // D3 works WITHOUT the pack
    e: EROWS.filter((s) => !v92(s) && full(s)).length,         // truths destroyed (want 0)
    f: FROWS.filter((s) => full(s)).length,                    // fabrications caught (want all)
  };
}

const b = measure(base);
console.log('=== the applied build ===');
console.log('D3 truths destroyed (pack full) ' + b.d3 + '/' + D3ROWS.length
  + '   (pack EMPTY) ' + b.d3empty + '/' + D3ROWS.length
  + '   E truths destroyed ' + b.e + '/' + EROWS.length
  + '   F ride-along fabrications caught ' + b.f + '/' + FROWS.length);
console.log('');

let ok = 0, total = 0;
function mutate(label, from, to, expect) {
  total++;
  if (!base.includes(from)) { console.log('ANCHOR MISSING  ' + label); return; }
  writeFileSync(TMP, base.split(from).join(to));
  let m;
  try { m = measure(readFileSync(TMP, 'utf8')); }
  catch (e) { console.log('BUILD BROKE  ' + label + ' — ' + e.message.slice(0, 80)); return; }
  const moved = expect(m);
  console.log((moved ? 'LOAD-BEARING' : '*** NO-OP ***') + '  ' + label);
  console.log('     reverted: d3 ' + m.d3 + '/' + D3ROWS.length + '  d3empty ' + m.d3empty + '/' + D3ROWS.length
    + '  e ' + m.e + '/' + EROWS.length + '  fCaught ' + m.f + '/' + FROWS.length);
  if (moved) ok++;
}

// D3 — the anaphor-bounded cross-sentence alternative. Reverting it re-destroys the truths, and it
// does so WITH THE PACK FULL, which is the point: this fix needs no world knowledge at all.
mutate('D3 anaphor-bounded cross-sentence state continuation',
  '\\.\\s+(?:It|They|This|That)\\b', '\\.\\s+(?:ZZZNEVER)\\b',
  (m) => m.d3 > b.d3 || m.d3empty > b.d3empty);

// E — the present-tense copula lookbehinds. A completion participle right after "is/are/am" is a
// STATE, never the event.
mutate('E present-tense copula lookbehinds on CONFIRMED_COMPLETION',
  '(?<!\\bis )(?<!\\bare )(?<!\\bam )', '',
  (m) => m.e > b.e);

// F — the rescue is narrowed to its own span. Reverting it lets a rescued prefix excuse whatever
// rides along behind it, which is a fabrication surface the signal itself creates.
mutate('F narrowing of the entity rescue to its own span',
  ' && !COMPLETION_PARTICIPLE.test(String(s).slice((__m.index ?? 0) + __m[0].length))', '',
  (m) => m.f < b.f);

console.log('');
console.log('MUTATIONS: ' + ok + '/' + total + ' load-bearing, ' + (total - ok) + ' no-op');
process.exit(ok === total ? 0 : 1);
