// D105 probe — runs the REAL matchDisambiguationOption out of a COPY of index.ts
// (the live file is under a running verifier's SHA lock and must not be touched).
import { readFileSync } from 'node:fs';
const SRC = process.argv[2];
const GATE = 'C:/Users/Dell/dev/brain-os/qa/scenarios-runner/_gate_extract.mjs';
const { stripTS } = await import('file://' + GATE);
const src = readFileSync(SRC, 'utf8');
const mStart = src.indexOf('function matchDisambiguationOption');
const mEnd = src.indexOf('\n}', mStart);
const matchFn = new Function('command', 'options',
  stripTS(src.slice(mStart, mEnd + 2)) + '\n; return matchDisambiguationOption(command, options);');

const O = (label, id) => ({ label, id, entityType: 'company' });
const SMITH = O('Smith', 'id-smith');
const BAKERY = O("Smith's Bakery", 'id-bakery');
const FUND = O('Fund', 'id-fund');
const FOUNDERS = O("Founders' Fund", 'id-founders');
const BOBS_A = O("Bob's Co", 'id-bobs-apostrophe');
const BOBS_B = O('Bobs Co', 'id-bobs-plain');
const ACME = O('ACME', 'id-acme');
const GLOBEX = O('Globex', 'id-globex');
const QUOTED = O('\u201CAdvanced Closed Systems\u201D', 'id-acs');

const CASES = [
  // D105 (P1) — the reply names the SPECIFIC entity; a shorter label it happens to
  // contain must never win.
  ['D105.bakery', 'smiths bakery', [SMITH, BAKERY], 'id-bakery'],
  ['D105.bakeryRev', 'smiths bakery', [BAKERY, SMITH], 'id-bakery'],
  ['D105.founders', 'founders fund', [FUND, FOUNDERS], 'id-founders'],
  ['D105.apostropheTyped', "smith's bakery", [SMITH, BAKERY], 'id-bakery'],
  // D102 — the case the raw fallback exists for: normalisation-identical labels.
  ['D102.apostropheTyped', "bob's co", [BOBS_A, BOBS_B], 'id-bobs-apostrophe'],
  ['D102.plainTyped', 'bobs co', [BOBS_A, BOBS_B], 'id-bobs-plain'],
  // Genuine ambiguity must still resolve to NOTHING, never to a guess.
  ['amb.neither', 'the co', [BOBS_A, BOBS_B], null],
  ['amb.trueDuplicate', 'smith', [SMITH, O('Smith', 'id-smith-2')], null],
  ['amb.shortOnly', 'smith', [SMITH, BAKERY], 'id-smith'],
  // Unchanged behaviour.
  ['basic.acme', 'acme', [ACME, GLOBEX], 'id-acme'],
  ['basic.none', 'initech', [ACME, GLOBEX], null],
  ['D93.quoted', 'advanced closed systems', [QUOTED, ACME], 'id-acs'],
];

let pass = 0, fail = 0;
for (const [id, cmd, opts, expectId] of CASES) {
  let got;
  try { got = matchFn(cmd, opts); } catch (e) { got = { id: 'THREW ' + e.message }; }
  const gotId = got ? got.id : null;
  const ok = gotId === expectId;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(22)} reply=${JSON.stringify(cmd).padEnd(18)} -> ${String(gotId)}  (expected ${String(expectId)})`);
}
console.log(`\n${SRC.split(/[\\/]/).pop()}: ${pass} pass, ${fail} fail`);
