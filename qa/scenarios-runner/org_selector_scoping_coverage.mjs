// ORG_SELECTOR_SCOPES_ALL_BUSINESS_SURFACES drift guard (multi-org milestone, P2).
//
// The organization selector is only real if it changes what every business surface
// actually queries, server-side. The failure mode this guards against is quiet partial
// coverage: a new page (or a regressed one) reading a company-scoped table with no
// activeOrganizationId filter renders the whole portfolio while the header claims one
// organization is active — the same lie the Board surface was caught telling by the
// verifier during the original selector milestone.
//
// Three layers, because each can fail independently:
//   1. every org-switchable page computes scopeToActiveOrg AND passes it to a reader
//      (computing it and passing nothing was a real reviewed-out bug shape);
//   2. every reader that accepts activeOrganizationId actually applies it as a
//      company_id filter (accepting and ignoring the param would pass layer 1);
//   3. the scope expression compares against ALL_ORGANIZATIONS_ID, so "All
//      organizations" keeps meaning unscoped rather than scoped-to-a-sentinel.
//
// Scans real source. Runnable with plain node. No deploy, no DB, no network.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '../../web');

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

// Layer 1 — every org-switchable business surface. Deliberately a closed list: adding a
// surface here is part of adding the surface. Identity/admin pages (access, settings,
// models), the org list itself (companies), chat (issue #5 land) and factory-internal
// pages are intentionally absent.
const SURFACES = [
  'app/(app)/approvals/page.tsx',
  'app/(app)/board/page.tsx',
  'app/(app)/dashboard/page.tsx',
  'app/(app)/departments/page.tsx',
  'app/(app)/documents/page.tsx',
  'app/(app)/engineering/page.tsx',
  'app/(app)/finance/page.tsx',
  'app/(app)/goals/page.tsx',
  'app/(app)/integrations/page.tsx',
  'app/(app)/inventory/page.tsx',
  'app/(app)/kpi/page.tsx',
  'app/(app)/memory/page.tsx',
  'app/(app)/people/page.tsx',
  'app/(app)/products/page.tsx',
  'app/(app)/projects/page.tsx',
  'app/(app)/proposals/page.tsx',
  'app/(app)/sales/page.tsx',
  'app/(app)/software/page.tsx',
  'app/(app)/tasks/page.tsx',
];

const notComputing = [];
const notPassing = [];
const notComparingSentinel = [];
for (const rel of SURFACES) {
  let src = '';
  try { src = readFileSync(resolve(WEB, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { /* counts as failing all */ }
  const computes = /const scopeToActiveOrg\s*=/.test(src);
  const passes = /\(\s*scopeToActiveOrg\s*[,)]/.test(src);
  const sentinel = /activeOrganizationId !== ALL_ORGANIZATIONS_ID/.test(src);
  if (!computes) notComputing.push(rel);
  else {
    if (!passes) notPassing.push(rel);
    if (!sentinel) notComparingSentinel.push(rel);
  }
}
check('every org-switchable surface computes scopeToActiveOrg', notComputing.length === 0,
  'These pages render company-scoped data with no org-selector awareness at all:\n       ' + notComputing.join('\n       '));
check('every surface that computes the scope actually passes it to a reader', notPassing.length === 0,
  'Computing the scope and passing nothing leaves the page portfolio-wide while looking scoped:\n       ' + notPassing.join('\n       '));
check('every scope expression treats ALL_ORGANIZATIONS_ID as unscoped', notComparingSentinel.length === 0,
  '"All organizations" must mean no filter, never a filter on the sentinel value:\n       ' + notComparingSentinel.join('\n       '));

// Layer 2 — a reader that accepts activeOrganizationId must apply it. Scan every data
// module; for each exported async function whose parameters mention activeOrganizationId,
// its body (up to the next export) must contain eq("company_id", activeOrganizationId).
const DATA = resolve(WEB, 'lib/data');
const acceptsButIgnores = [];
let appliedCount = 0;
for (const f of readdirSync(DATA).filter((x) => x.endsWith('.ts'))) {
  const src = readFileSync(resolve(DATA, f), 'utf8').replace(/\r\n/g, '\n');
  const fnRe = /export async function (\w+)\(([^)]*)\)([\s\S]*?)(?=\nexport |$)/g;
  let m;
  while ((m = fnRe.exec(src))) {
    const [, name, args, body] = m;
    if (!/activeOrganizationId/.test(args)) continue;
    if (/\.eq\("company_id",\s*activeOrganizationId\)/.test(body)) appliedCount++;
    else acceptsButIgnores.push(`lib/data/${f}:${name}`);
  }
}
check('no reader accepts activeOrganizationId and then ignores it', acceptsButIgnores.length === 0,
  'Accepting the scope and never filtering on it defeats layers 1 and 3 silently:\n       ' + acceptsButIgnores.join('\n       '));
check('scoped readers exist in bulk (>= 15)', appliedCount >= 15,
  'Found ' + appliedCount + '. A sharp drop means the class was reverted rather than maintained.');

console.log(`\norg_selector_scoping_coverage: ${pass}/${pass + failures.length} passed  (scoped readers: ${appliedCount})`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
