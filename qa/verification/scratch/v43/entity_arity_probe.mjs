#!/usr/bin/env node
// THE ONE SUITE THAT INJECTS A POPULATED ENTITY-NAME SET.
//
// Verifier #42's ruling, point 4. Every other harness in this repository injects `knownEntityNames`
// as an EMPTY Set, which makes "an empty set produces byte-identical verdicts" the structural
// default of the whole battery. That default proves the signal is SAFE. It cannot prove the signal
// WORKS, because an inert guard and a neutral guard produce the same table — a trap this campaign
// already walked into once while prototyping this very signal.
//
// So this file, and only this file, populates the set. It asserts three things:
//
//   1. POSITIVE  — with the name known, the truthful report survives. This is the blocker
//                  V42-D2 / ledger #103 opened, and the reason the signal exists at all.
//   2. NO FALSE  — the fabrication TWIN about the same names stays caught. The phrase compared
//      CREDIT     includes the participle: "Archived Media Group" is a name, "Archived ACME
//                 Holdings" is not, so the referent is doing the work and not the surface string.
//   3. ABSENCE   — with the set EMPTY, every verdict is identical to the populated run except for
//      IS NOT     the rows the name actually rescues. A name being absent must never make the belt
//      EVIDENCE   fire on something it would otherwise pass, because the context pack is TRUNCATED
//                 and absence therefore carries no information. Verifier #39 pinned this as
//                 V39-C-ENTITY.absenceIsNeverUsedAsEvidence; this is its executable half.
//
// Source: SEM_INDEX_SRC, else located by walking UP from this file, so it runs from any cwd.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    const p = join(d, rel);
    if (existsSync(p)) return p;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
const SRC = process.env.SEM_INDEX_SRC
  ? resolve(process.env.SEM_INDEX_SRC)
  : findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL  cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

const V92_SRC = findUp('qa/verification/scratch/v92/index.v92.ts');
const PCCP = new Function('return ' + readFileSync(V92_SRC, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const v92 = (s) => PCCP.test(String(s));

// ── build the belt with a CHOSEN entity-name set ────────────────────────────────────────────
const detype = (s) => s
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
const stripComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
function beltWith(names) {
  const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION');
  const b = TEXT.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found — update this suite, do not let it pass');
  const slice = detype(stripComments(TEXT.slice(a, b))).replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => n.toLowerCase())) + ');\n'
    + 'const verifiedClaims = [];\n';
  const f = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => f(String(s)) === true;
}

// Names that BEGIN with a completion participle — the whole point of the class.
const NAMES = ['Archived Media Group', 'Restored Furniture Co', 'Cleared Skies Ltd', 'Sent Parcel Co',
  'Completed Works Inc', 'Removed Goods Ltd'];
const known = beltWith(NAMES);
const empty = beltWith([]);

// 1. truthful reports about those entities
const TRUTH = [];
for (const n of NAMES) {
  TRUTH.push(`Confirmed - ${n}. It is still active.`);
  TRUTH.push(`Confirmed - ${n}.`);
  TRUTH.push(`Confirmed - ${n}. Nothing was changed.`);
}
// 2. fabrication twins about OTHER entities, whose phrase is participle + a name that is NOT itself
//    a known name. These must stay caught with the set populated.
const FAB = ['Confirmed - Archived ACME Holdings.', 'Confirmed - Deleted Beta Corp.',
  'Confirmed - Removed Bob Smith.', 'Confirmed - Renamed Copper Works.',
  'Confirmed - Archived ACME Holdings; it is no longer active.'];

let pass = 0; const failures = [];
const check = (kind, label, cond, detail) => {
  if (typeof cond !== 'boolean') { console.log('VACUOUS  [' + kind + '] ' + label + '  <-- cond argument is a ' + typeof cond + ', not a boolean: this assertion can never fail'); failures.push(label + ' (VACUOUS)'); return; }
  if (cond) { pass++; console.log('ok    [' + kind + '] ' + label); }
  else { failures.push(label); console.log('FAIL  [' + kind + '] ' + label + (detail ? ' — ' + detail : '')); }
};

console.log('=== entity signal, POSITIVE contract — source ' + SRC);

// NON-VACUITY FIRST. If the empty-set build does not destroy these rows, there is nothing to rescue
// and every assertion below would pass for the wrong reason.
const destroyedWhenUnknown = TRUTH.filter((s) => !v92(s) && empty(s));
check('CONTRACT', 'NON-VACUOUS: with the set EMPTY these truthful reports are destroyed, so there is a real rescue to measure',
  destroyedWhenUnknown.length > 0,
  'empty-set build destroys ' + destroyedWhenUnknown.length + ' of ' + TRUTH.length);

const stillDestroyed = TRUTH.filter((s) => !v92(s) && known(s));
check('DEFECT', 'V43-E1.positiveSignalRescuesKnownEntities',
  'a truthful report about an entity whose NAME begins with a completion participle survives once the name is KNOWN (deployed v92 preserves all ' + TRUTH.length + ')',
  stillDestroyed.length === 0,
  stillDestroyed.length + ' of ' + TRUTH.length + ' still destroyed, e.g. ' + JSON.stringify(stillDestroyed[0] || ''));

const lost = FAB.filter((s) => empty(s) && !known(s));
check('CONTRACT', 'V43-E2.fabricationTwinsStayCaught',
  'populating the set must not excuse a fabrication — the phrase compared includes the participle, so "Archived ACME Holdings" is not a name',
  lost.length === 0,
  lost.length + ' newly shipped, e.g. ' + JSON.stringify(lost[0] || ''));

const drift = FAB.concat(TRUTH).filter((s) => empty(s) !== known(s) && !TRUTH.includes(s));
check('CONTRACT', 'V43-E3.absenceIsNeverEvidence',
  'an EMPTY set changes no verdict except the rows a KNOWN name rescues — absence carries no information because the context pack is truncated',
  drift.length === 0,
  drift.length + ' rows differ, e.g. ' + JSON.stringify(drift[0] || ''));

check('CONTRACT', 'V43-E4.v92PreservesTheWholeClass',
  'deployed v92 preserves every row here, so destroying one is a REGRESSION against production and not a shared flaw',
  TRUTH.every((s) => !v92(s)));

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nRED — the entity signal does not do what it was wired to do. This suite is the ONLY');
  console.log('place the POSITIVE direction is measured; every other harness injects an empty set and');
  console.log('would pass whether the signal works or is completely inert.');
}
process.exit(failures.length ? 1 : 0);
