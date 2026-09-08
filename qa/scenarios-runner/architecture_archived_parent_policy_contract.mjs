#!/usr/bin/env node
// ARCHITECTURE CONTRACT — archived-parent policy (governance/CANONICAL_WORK_CONTRACT.md §4).
//
//   * one policy module in the web app and one Edge mirror, agreeing on the decisions;
//   * every child->companies join under web/ goes through the canonical fragment
//     (COMPANY_REF / companyRefVia), never a hand-written `companies(name, status)` literal —
//     the 25th hand-written join is how BUG-001/BUG-006 recur;
//   * the People surface consults the policy for its lifecycle-dependent controls
//     (set manager, invite, onboarding) — BUG-013;
//   * the policy itself: archived parent => cannot act, not offered, visible reason; missing
//     parent => cannot act, offered, visible reason; active => everything allowed.
//
// Static + module-executed, no network.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// 1. The policy modules exist and agree.
const web = read('web/lib/policy/archived-parent.ts');
const edge = read('supabase/functions/_shared/parent-policy.ts');
check('web policy module exports parentPolicy / canActOnParent', /export function parentPolicy\(/.test(web) && /export function canActOnParent\(/.test(web));
check('edge mirror exports parentPolicy / canActOnParent', /export function parentPolicy\(/.test(edge) && /export function canActOnParent\(/.test(edge));
for (const reason of ['Company is archived — restore it first', 'Assign a company first']) check('both copies carry the reason ' + JSON.stringify(reason), web.includes(reason) && edge.includes(reason));
// Execute the Edge copy (plain TS -> strip types crudely: it is annotation-light by design).
const edgeJs = edge.replace(/^export type [\s\S]*?;\n\n/gm, '').replace(/: (?:string|ParentState|ParentPolicy|boolean)(?: \| null| \| undefined)*/g, '').replace(/export (const|function) /g, '$1 ');
const policy = new Function(edgeJs + '\n; return { parentPolicy, canActOnParent, parentStateOf };')();
const archived = policy.parentPolicy('archived', 'c1');
check('archived parent: cannot act, not offered, reason, badge', archived.canActOnChild === false && archived.offerInActiveLists === false && archived.reason === 'Company is archived — restore it first' && archived.badge === 'parent archived');
const missing = policy.parentPolicy(null, null);
check('missing parent: cannot act, still offered, reason', missing.canActOnChild === false && missing.offerInActiveLists === true && missing.reason === 'Assign a company first');
const active = policy.parentPolicy('active', 'c1');
check('active parent: everything allowed', active.canActOnChild === true && active.offerInActiveLists === true && active.reason === null && active.badge === null);
check('planning/paused is NOT archived', policy.parentPolicy('planning', 'c1').canActOnChild === true && policy.parentPolicy('paused', 'c1').canActOnChild === true);

// 2. No hand-written child->companies join literal under web/ (outside the canonical module and comments).
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '.next') continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const offenders = [];
let importers = 0;
for (const p of walk(resolve(ROOT, 'web'))) {
  const rel = p.replace(/\\/g, '/').slice(ROOT.replace(/\\/g, '/').length + 1);
  if (rel.endsWith('web/lib/data/company-ref.ts')) continue;
  const t = readFileSync(p, 'utf8');
  if (/from "@\/lib\/data\/company-ref"/.test(t)) importers++;
  const code = t.split('\n').filter((l) => !/^\s*\/\//.test(l) && !/^\s*\*/.test(l)).join('\n');
  if (/["'`][^"'`\n]*companies\(name(?:,\s*status)?\)[^"'`\n]*["'`]/.test(code) && !/\$\{COMPANY_REF\}|companyRefVia\(/.test(code)) offenders.push(rel);
}
check('every child->companies join goes through COMPANY_REF (' + importers + ' importers)', offenders.length === 0 && importers >= 20, 'hand-written joins in: ' + offenders.join(', '));

// 3. The People surface consults the policy for its lifecycle-dependent controls.
const people = read('web/app/(app)/people/people-table.tsx');
check('people table imports the policy', /from "@\/lib\/policy\/archived-parent"/.test(people));
check('set-manager control gated by the policy', /disabled=\{p\.active === false \|\| !parentPolicy\(p\.companies, p\.company_id\)\.canActOnChild\}/.test(people));
check('invite control gated by the policy', /disabled=\{!p\.email \|\| !parentPolicy\(p\.companies, p\.company_id\)\.canActOnChild/.test(people));
check('onboarding control gated by the policy', /parentPolicy\(p\.companies, p\.company_id\)\.parentState === "archived"/.test(people));
check('manager picker never offers the subject and explains an empty list', /c\.id !== managerFor\?\.id/.test(people) && /manager-picker-empty/.test(people));
check('current manager visible and pre-selected in the sheet', /manager-current/.test(people) && /setManagerChoice\(p\.manager_person_id\)/.test(people));

console.log(`\narchitecture_archived_parent_policy_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
