#!/usr/bin/env node
// ARCHITECTURE CONTRACT — organization scope resolved once (governance/CANONICAL_WORK_CONTRACT.md §5).
//
// Pages never hand-write the "All Organizations" sentinel comparison; they call
// scopeToActiveOrganization / resolveOrgScope from web/lib/data/org-scope.ts. The helper's
// semantics are executed here: multi-membership + company => that company; sentinel or single
// membership => no page-level filter; no membership => none.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

const ALLOWED = new Set(['web/lib/data/org-scope.ts', 'web/lib/data/organizations.ts', 'web/lib/data/organizations-types.ts']);
function walk(dir, out = []) { for (const n of readdirSync(dir)) { const p = join(dir, n); if (n === 'node_modules' || n === '.next') continue; if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); } return out; }
const offenders = []; let adopters = 0;
for (const p of walk(resolve(ROOT, 'web'))) {
  const rel = p.replace(/\\/g, '/').slice(ROOT.replace(/\\/g, '/').length + 1);
  const t = readFileSync(p, 'utf8');
  if (/scopeToActiveOrganization\(|resolveOrgScope\(/.test(t) && !ALLOWED.has(rel)) adopters++;
  if (ALLOWED.has(rel)) continue;
  const code = t.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  // A comparison against the sentinel in page/data code is the hand-written scope rule.
  if (/[!=]==\s*ALL_ORGANIZATIONS_ID|ALL_ORGANIZATIONS_ID\s*[!=]==/.test(code)) offenders.push(rel);
}
check('no page or data file compares against the organization sentinel directly', offenders.length === 0, offenders.join(', '));
check('pages resolve scope through the helper (' + adopters + ' adopters)', adopters >= 15);

// Execute the helper.
const src = readFileSync(resolve(ROOT, 'web/lib/data/org-scope.ts'), 'utf8').replace(/\r\n/g, '\n');
// Targeted pre-strips (the generic signature and the union type block), then the shared detyper.
const pre = src
  .replace(/^import .*$/gm, '')
  .replace(/^export type OrgScope =[\s\S]*?;\n/m, '')
  .replace(/scopeQuery<Q extends \{ eq: \(column: string, value: string\) => Q \}>\(query: Q, scope: OrgScope, column = "company_id"\): Q/, 'scopeQuery(query, scope, column = "company_id")')
  // a comma inside a generic defeats the parameter stripper — collapse the Pick<> annotations first
  .replace(/Pick<OrganizationContext, "activeOrganizationId" \| "memberships">/g, 'any')
  .replace(/Pick<OrganizationContext, "activeOrganizationId">/g, 'any')
  .replace(/^export /gm, '');
const js = 'const ALL_ORGANIZATIONS_ID = "__all__";\n' + stripTS(pre);
if (/[:<]\s*(OrgScope|OrganizationContext|Pick<)/.test(js)) throw new Error('harness: TypeScript survived stripping — fix the pre-strip, do not let this pass');
const api = new Function(js + '\n; return { resolveOrgScope, scopeToActiveOrganization, inScope, scopeQuery };')();
const two = [{ id: '__all__' }, { id: 'c1' }];
check('multi-membership + company => that company', api.scopeToActiveOrganization({ activeOrganizationId: 'c1', memberships: two }) === 'c1');
check('multi-membership + sentinel => no filter', api.scopeToActiveOrganization({ activeOrganizationId: '__all__', memberships: two }) === null);
check('single membership => no filter (RLS alone)', api.scopeToActiveOrganization({ activeOrganizationId: 'c1', memberships: [{ id: 'c1' }] }) === null);
check('no membership => none', api.resolveOrgScope({ activeOrganizationId: null }).kind === 'none' && api.inScope({ kind: 'none' }, 'c1') === false);
check('inScope agrees with the scope', api.inScope({ kind: 'all' }, 'x') === true && api.inScope({ kind: 'company', companyId: 'c1' }, 'c2') === false);

console.log(`\narchitecture_org_scope_helper_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
