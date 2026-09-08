#!/usr/bin/env node
// ID PROVENANCE SURVIVES THE TRIM — the V62-D1 / V63-D2 property, pinned behaviourally.
//
// WHY THIS SUITE EXISTS. The clean extended vacuity sweep on the frozen candidate reported 28 survivors,
// and six of them were STRUCTURAL — including straight REVERTS OF TWO NAMED P1 FIXES:
//
//   STRUCT packIdSet forgets the trim provenance          (V62-D1 revert)  -> survived every suite
//   STRUCT archivedCompanyIds forgets the trim provenance (V63-D2 revert)  -> survived every suite
//   STRUCT archivedCompanyIds ignores namedTargets                          -> survived every suite
//
// Six suites mention provenance by name. None of them exercised it, so all three fixes could have been
// deleted and the whole battery would have stayed green — the vacuous-guard class the campaign keeps
// finding, this time on top of fixes that were themselves P1s.
//
// THE PRODUCT PROPERTY. The context budget trims optional rows out of the pack. The ids of trimmed rows
// must still count as PRESENT for every gate that asks "was this id in the pack?", because absence from a
// truncated window is not evidence of non-existence — telling the founder a stored plan's targets "no
// longer resolve to a real record" because a display window was trimmed is a false statement about
// canonical state. Provenance is the server-side record of what the trim removed.
//
// The windows are sliced from the real source. Nothing here re-implements product logic.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = process.env.SEM_INDEX_SRC || resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
};

const detype = (t) => t
  .replace(/\(\.\.\.(\w+): string\[\]\): Set<string>/g, '(...$1)')
  .replace(/: Set<string>/g, '').replace(/\(contextPack as any\)/g, 'contextPack')
  .replace(/\((\w+): any\)/g, '($1)').replace(/: string\b/g, '');

/** The whole `function <name>(` declaration, brace-balanced — never the first line only. */
function fn(name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error(name + ' not found — update this suite, do not let it pass');
  let d = 0, started = false;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') { d++; started = true; }
    else if (src[i] === '}') { d--; if (started && d === 0) return detype(src.slice(at, i + 1)); }
  }
  throw new Error(name + ': unbalanced');
}
/** A `const <name> = ...;` statement, bracket-balanced. */
function stmt(name) {
  const at = src.indexOf('const ' + name + ' = ');
  if (at < 0) throw new Error(name + ' not found — update this suite, do not let it pass');
  let d = 0;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return detype(src.slice(at, i + 1));
  }
  throw new Error(name + ': unterminated');
}

// EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE: a suite that sliced nothing has not passed.
const packSrc = fn('packIdSet'); const planSrc = fn('planIdSet'); const archSrc = stmt('archivedCompanyIds');
check('the three windows were sliced from source and are non-trivial',
  packSrc.length > 120 && planSrc.length > 120 && archSrc.length > 80,
  'packIdSet=' + packSrc.length + ' planIdSet=' + planSrc.length + ' archivedCompanyIds=' + archSrc.length);

const TRIMMED = 'aaaaaaaa-1111-4000-8000-000000000000';
const NAMED = 'bbbbbbbb-2222-4000-8000-000000000000';

const build = (body, ret) => (contextPack, contextProvenance) =>
  new Function('contextPack', 'contextProvenance', body + '\nreturn ' + ret + ';')(contextPack, contextProvenance);

// ---- V62-D1: a stored plan's targets survive a trim that emptied the display window -----------------
for (const [label, body] of [['packIdSet', packSrc], ['planIdSet', planSrc]]) {
  const idSet = build(body, label + "('companies', 'archivedCompanies')");
  // The pack is EMPTY: this is exactly the saturated-workspace case the budget produces.
  check(label + ': an id the TRIM removed is still present (V62-D1)',
    idSet({ companies: [], archivedCompanies: [] }, { companies: [TRIMMED] }).has(TRIMMED),
    'absence from a truncated window is not evidence of non-existence — the gate would refuse a real target');
  check(label + ': an id that arrived only via namedTargets is present',
    idSet({ companies: [], archivedCompanies: [], namedTargets: { companies: [{ id: NAMED }] } }, {}).has(NAMED),
    'server-side named targets are resolved outside the pack and must count as present');
  // The negative half, so the property cannot be "closed" by making the set accept everything.
  check(label + ': an id in neither the pack, the provenance nor namedTargets is ABSENT',
    !idSet({ companies: [], archivedCompanies: [] }, {}).has(TRIMMED),
    'a set that answers yes to everything gates nothing');
}

// ---- V63-D2: archived status survives the same trim --------------------------------------------------
{
  const archived = (pack, prov) => build(archSrc, 'archivedCompanyIds')(pack, prov);
  check('archivedCompanyIds: an archived company the TRIM removed is still known archived (V63-D2)',
    archived({ companies: [], archivedCompanies: [] }, { archivedCompanies: [TRIMMED] }).has(TRIMMED),
    'the archived-parent gate REFUSES on this set, so forgetting a trimmed row silently allows the write it exists to block');
  check('archivedCompanyIds: an archived company that arrived only via namedTargets is known archived',
    archived({ companies: [], archivedCompanies: [],
      namedTargets: { companies: [{ id: NAMED, status: 'archived' }] } }, {}).has(NAMED),
    'a named target resolved server-side carries its real status and must be honoured');
  check('archivedCompanyIds: an ACTIVE company is not in the archived set',
    !archived({ companies: [{ id: NAMED, status: 'active' }], archivedCompanies: [] }, {}).has(NAMED),
    'the negative half — a set that contains everything blocks everything');
}

console.log(`\nprovenance_survives_trim_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
