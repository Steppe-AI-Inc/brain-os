#!/usr/bin/env node
// ARCHITECTURE CONTRACT — capability-impact registry + shared-contract mirrors
// (docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md §5-§6; governance/OPERATING_TRUTH_MODEL.md §4).
//
//   * every shared primitive named in FEATURE_COMPLETENESS_CONTRACT.md §5 has a registry entry;
//   * every registry home path exists;
//   * every registry regression family resolves to at least one file under qa/scenarios-runner;
//   * the web and Edge copies of each shared contract agree on their exported names.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

const reg = readFileSync(resolve(ROOT, 'docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml'), 'utf8').replace(/\r\n/g, '\n');
// Minimal YAML reading for this file's shape: concept keys, homes, regression_families.
const concepts = [...reg.matchAll(/^  (\w+):\n/gm)].map((m) => m[1]).filter((k) => k !== 'entity_types');
check('registry lists concepts', concepts.length >= 8, concepts.join(','));
for (const c of ['execution_result_envelope', 'mutation_receipt', 'collection_envelope', 'grounding_precedence', 'company_lifecycle', 'archived_parent_policy', 'manager_assignment', 'org_scope', 'pending_action']) {
  check('registry has ' + c, concepts.includes(c));
}
const homes = [...reg.matchAll(/^      - ([^\s(]+)(?:\s|$)/gm)].map((m) => m[1]).filter((h) => h !== 'every' && h.includes('/'));
let missingHomes = [];
for (const h of homes) { if (h.includes('*')) continue; if (!existsSync(resolve(ROOT, h))) missingHomes.push(h); }
check('every registry home / surface path exists (' + homes.length + ')', missingHomes.length === 0, missingHomes.join(', '));
const runner = readdirSync(resolve(ROOT, 'qa/scenarios-runner'));
const fams = [...reg.matchAll(/regression_families: \[([^\]]*)\]/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean));
const unresolved = fams.filter((f) => !runner.some((n) => n.startsWith(f) || n.includes(f)));
check('every regression family resolves to a suite (' + fams.length + ')', unresolved.length === 0, unresolved.join(', '));

// Shared contract mirrors: exported names agree.
const PAIRS = [['web/lib/contracts/execution.ts', 'supabase/functions/_shared/execution.ts'], ['web/lib/contracts/collection.ts', 'supabase/functions/_shared/collection.ts'], ['web/lib/policy/archived-parent.ts', 'supabase/functions/_shared/parent-policy.ts']];
const names = (t) => [...t.matchAll(/^export (?:type|function|const) (\w+)/gm)].map((m) => m[1]).sort();
for (const [a, b] of PAIRS) {
  const na = names(readFileSync(resolve(ROOT, a), 'utf8')), nb = names(readFileSync(resolve(ROOT, b), 'utf8'));
  check(`mirror exports agree: ${a} <-> ${b}`, JSON.stringify(na) === JSON.stringify(nb), `web=${na.join(',')} edge=${nb.join(',')}`);
}
// The feature template and the PR template carry the definition of done.
check('feature contract template exists', existsSync(resolve(ROOT, 'docs/architecture/templates/FEATURE_CONTRACT_TEMPLATE.md')));
check('PR template carries the truth checklist', /ExecutionResultEnvelope/.test(readFileSync(resolve(ROOT, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8')));

console.log(`\narchitecture_impact_registry_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
