// resolveOrgScope adoption: the 18 pages that hand-wrote the sentinel ternary now call one helper
// (governance/CANONICAL_WORK_CONTRACT.md §5). Semantics preserved exactly: a multi-membership user
// is scoped to the active company; the "All Organizations" sentinel and single-membership users
// keep the unscoped query.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
function rw(p, fn) { const raw = readFileSync(p, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; const s = raw.replace(/\r\n/g, '\n'); const out = fn(s); if (out === s) return false; writeFileSync(p, out.replace(/\n/g, nl)); console.log('ok', p); return true; }

// 1. the helper
rw('web/lib/data/org-scope.ts', (s) => s.replace(`/** For in-memory rows (already RLS-scoped) — the same rule applied client-side. */`,
`/**
 * The page rule: a user with more than one membership sees the active company only; the
 * "All Organizations" sentinel and single-membership users keep the unscoped (RLS-only) query.
 * Returns the company id to filter on, or null for no page-level filter.
 */
export function scopeToActiveOrganization(context: Pick<OrganizationContext, "activeOrganizationId" | "memberships">): string | null {
  const scope = resolveOrgScope(context);
  return context.memberships.length > 1 && scope.kind === "company" ? scope.companyId : null;
}

/** For in-memory rows (already RLS-scoped) — the same rule applied client-side. */`));

// 2. the pages
function walk(dir, out = []) { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); } return out; }
const TERNARY = /const scopeToActiveOrg =\n\s+organizations\.memberships\.length > 1 && organizations\.activeOrganizationId !== ALL_ORGANIZATIONS_ID\n\s+\? organizations\.activeOrganizationId\n\s+: null;/;
let n = 0;
for (const p of walk('web/app')) {
  rw(p, (s) => {
    if (!TERNARY.test(s)) return s;
    let out = s.replace(TERNARY, 'const scopeToActiveOrg = scopeToActiveOrganization(organizations);');
    out = out.replace(/import \{ ALL_ORGANIZATIONS_ID \} from "@\/lib\/data\/organizations-types";\n/, 'import { scopeToActiveOrganization } from "@/lib/data/org-scope";\n');
    if (/ALL_ORGANIZATIONS_ID/.test(out) && !/import \{[^}]*ALL_ORGANIZATIONS_ID/.test(out)) throw new Error('sentinel still used without import in ' + p);
    n++;
    return out;
  });
}
console.log('pages adopted', n);
