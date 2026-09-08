#!/usr/bin/env node
// SHARED-CONTRACT MIRROR DRIFT GUARD — founder directive 2026-09-08 §6, applied across layers.
//
// `supabase/functions/_shared/*` and `web/lib/contracts/*` are deliberate mirrors: the Edge function and the
// web app must agree on what an ExecutionResultEnvelope, a CollectionEnvelope and a lifecycle result ARE.
// Two copies of one concept in two languages of the same repo is the same shape as the twins that cost a P1
// in each of the last four rounds — the difference is only that these were always meant to be two files.
//
// This guard was registered as owed work when the shared contracts were introduced and never written. It is
// written now because the scan for duplicated concepts found real drift in it: the two lifecycle mirrors do
// not export the same names.
//
// A mirror pair must export the same names, or the difference must be REGISTERED with a reason. New drift
// fails; convergence removes entries from the register.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

let pass = 0; const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
};

const PAIRS = [
  ['collection', 'supabase/functions/_shared/collection.ts', 'web/lib/contracts/collection.ts'],
  ['execution', 'supabase/functions/_shared/execution.ts', 'web/lib/contracts/execution.ts'],
  ['lifecycle', 'supabase/functions/_shared/lifecycle.ts', 'web/lib/contracts/lifecycle.ts'],
];

// REGISTERED DIFFERENCES, 2026-09-08. Each needs a decision; none is approved as intentional yet.
const REGISTERED = {
  // The Edge copy models the RESULT of a lifecycle call (a verdict); the web copy models the CALL and its
  // OUTCOME. They describe the same operation from two ends and have drifted into different vocabularies,
  // so a reader cannot tell whether `LifecycleOutcome` and `LifecycleVerdict` are the same thing. They
  // probably should be one shape used from both ends; that is a design decision, recorded here rather than
  // guessed at while a verifier is running.
  lifecycle: new Set(['lifecycleVerdict', 'LifecycleVerdict', 'LifecycleCall', 'LifecycleOutcome']),
};

const exportsOf = (p) => new Set(
  [...readFileSync(p, 'utf8').matchAll(/^export\s+(?:type|interface|function|const|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)]
    .map((m) => m[1]),
);

// EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE (founder directive §4): a guard that found no pairs has not passed.
check('the mirror pairs exist to be compared', PAIRS.every(([, a, b]) => existsSync(resolve(ROOT, a)) && existsSync(resolve(ROOT, b))),
  'a missing mirror is drift of the worst kind — one side simply gone');
if (!PAIRS.every(([, a, b]) => existsSync(resolve(ROOT, a)) && existsSync(resolve(ROOT, b)))) {
  console.log('\nshared_contract_mirror_contract: ' + pass + ' passed, 1 failed'); process.exit(1);
}

for (const [name, aPath, bPath] of PAIRS) {
  const a = exportsOf(resolve(ROOT, aPath));
  const b = exportsOf(resolve(ROOT, bPath));
  const onlyA = [...a].filter((x) => !b.has(x));
  const onlyB = [...b].filter((x) => !a.has(x));
  const undecided = [...onlyA, ...onlyB].filter((x) => !(REGISTERED[name] && REGISTERED[name].has(x)));
  if (onlyA.length || onlyB.length) {
    console.log(`     ${name}: _shared only [${onlyA.join(', ') || '-'}]  web only [${onlyB.join(', ') || '-'}]`
      + (undecided.length ? '  << UNDECIDED' : '  [registered]'));
  }
  check('the ' + name + ' mirrors export the same names, or the difference is registered',
    undecided.length === 0,
    'undecided drift: ' + undecided.join(', ') + ' — converge the mirrors, or register the difference with its reason');
  check('the ' + name + ' mirrors both carry exports at all', a.size > 0 && b.size > 0,
    'an empty side means the file moved and this guard is measuring nothing');
}

// The field lists that actually cross the wire must be identical, whatever the surrounding names are: this
// is the part where drift produces a real product defect rather than a naming inconsistency.
{
  const edge = readFileSync(resolve(ROOT, 'supabase/functions/_shared/collection.ts'), 'utf8');
  const web = readFileSync(resolve(ROOT, 'web/lib/contracts/collection.ts'), 'utf8');
  const fields = (t) => (t.match(/\b(shown|total|truncated|items|order|scope)\b\s*[?]?\s*:/g) || []).map((s) => s.replace(/[?:\s]/g, '')).sort().join(',');
  check('the CollectionEnvelope field set is identical on both sides', fields(edge) === fields(web),
    'edge=[' + fields(edge) + '] web=[' + fields(web) + ']');
}
{
  const edge = readFileSync(resolve(ROOT, 'supabase/functions/_shared/execution.ts'), 'utf8');
  const web = readFileSync(resolve(ROOT, 'web/lib/contracts/execution.ts'), 'utf8');
  const fields = (t) => [...new Set((t.match(/\b(executed|rows_affected|postcondition_verified|canonical_entity_ids|action_type|entity_type|backend_result|error|timestamp)\b/g) || []))].sort().join(',');
  check('the ExecutionResultEnvelope field set is identical on both sides', fields(edge) === fields(web),
    'edge=[' + fields(edge) + '] web=[' + fields(web) + ']');
}

console.log(`\nshared_contract_mirror_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
