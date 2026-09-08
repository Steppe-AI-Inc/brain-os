// The two pre-P1 web drift guards learn the canonical forms they now sit behind.
import { readFileSync, writeFileSync } from 'node:fs';
function rw(p, fn) { const raw = readFileSync(p, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; const s = raw.replace(/\r\n/g, '\n'); const out = fn(s); if (out === s) throw new Error('no change ' + p); writeFileSync(p, out.replace(/\n/g, nl)); console.log('ok', p); }
function must(s, a, b, l) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(l + ': found ' + n); return s.replace(a, () => b); }

rw('qa/scenarios-runner/org_selector_scoping_coverage.mjs', (s) => must(s,
  '  const sentinel = /activeOrganizationId !== ALL_ORGANIZATIONS_ID/.test(src) || /scopeToActiveOrganization(organizations)/.test(src);',
  String.raw`  const sentinel = /activeOrganizationId !== ALL_ORGANIZATIONS_ID/.test(src) || /scopeToActiveOrganization\(organizations\)/.test(src);`, 'sentinel'));

rw('qa/scenarios-runner/company_ref_no_bare_name_join.mjs', (s) => must(s,
  String.raw`for (const f of files) canonical += (readFileSync(f, 'utf8').match(/companies(?:!\w+)?\(name, status\)/g) || []).length;`,
  String.raw`// P1 (governance/CANONICAL_WORK_CONTRACT.md §4): the joins now import the canonical fragment
// (${'${COMPANY_REF}'} / companyRefVia(...)) instead of repeating the literal; both forms count.
for (const f of files) {
  const t = readFileSync(f, 'utf8');
  canonical += (t.match(/companies(?:!\w+)?\(name, status\)/g) || []).length;
  canonical += (t.match(/\$\{COMPANY_REF\}|companyRefVia\(/g) || []).length;
}`, 'canonical'));
