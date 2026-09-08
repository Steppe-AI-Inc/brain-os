// Web UI for the P1 package: BUG-011 (manager picker semantics), BUG-013 (archived-parent
// policy on People controls), BUG-014 (archived affordance discoverability), and COMPANY_REF
// adoption across every child->companies join (architecture contract).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
function rw(p, fn) {
  const raw = readFileSync(p, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; const s = raw.replace(/\r\n/g, '\n');
  const out = fn(s); if (out === s) return false; writeFileSync(p, out.replace(/\n/g, nl)); console.log('ok', p); return true;
}
function must(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(label + ': found ' + n); return s.replace(a, () => b); }

// ---- people.ts: getPeople returns the current manager id too (BUG-011 preselect) ----
rw('web/lib/data/people.ts', (s) => {
  s = must(s, `  if (data.length === 0) return data.map((p) => ({ ...p, manager_name: null as string | null }));`,
    `  if (data.length === 0) return data.map((p) => ({ ...p, manager_name: null as string | null, manager_person_id: null as string | null }));`, 'empty');
  s = must(s, `    .select("person_id, operating_company_id, is_primary, state, manager:people!person_assignments_manager_person_id_fkey(full_name)")`,
    `    .select("person_id, operating_company_id, is_primary, state, manager_person_id, manager:people!person_assignments_manager_person_id_fkey(full_name)")`, 'select');
  s = must(s, `    return { ...p, manager_name: best?.manager?.full_name ?? null };`,
    `    // BUG-011 (Work-PC, 2026-09-07): the set-manager sheet must show and pre-select the
    // current manager it says it will replace — the id rides along with the name.
    return { ...p, manager_name: best?.manager?.full_name ?? null, manager_person_id: best?.manager_person_id ?? null };`, 'merge');
  return s;
});

// ---- people-table.tsx: archived-parent policy on controls; picker semantics ----
rw('web/app/(app)/people/people-table.tsx', (s) => {
  s = must(s, `import { ArchivedCompanyBadge } from "@/components/archived-company-badge";`,
    `import { ArchivedCompanyBadge } from "@/components/archived-company-badge";
import { parentPolicy } from "@/lib/policy/archived-parent";`, 'import');
  s = must(s, `  manager_name: string | null;
};`, `  manager_name: string | null;
  manager_person_id: string | null;
};`, 'type');
  // set-manager control: gated by the ONE archived-parent policy (BUG-013)
  s = must(s, `                    className={p.active !== false && p.company_id ? "flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-secondary/60" : "cursor-default"}
                    disabled={p.active === false || !p.company_id}
                    title={p.active === false ? undefined : !p.company_id ? "Assign a company first — managers are per-organization" : "Set manager"}
                    onClick={() => {
                      setManagerFor(p);
                      setManagerChoice(null);
                    }}
                  >
                    {p.manager_name ?? "—"}
                    {p.active !== false && p.company_id && <UserCog className="h-3 w-3 text-muted-foreground opacity-0 group-hover/row:opacity-70" />}`,
`                    className={p.active !== false && parentPolicy(p.companies, p.company_id).canActOnChild ? "flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-secondary/60" : "cursor-default"}
                    disabled={p.active === false || !parentPolicy(p.companies, p.company_id).canActOnChild}
                    // BUG-013 (Work-PC, 2026-09-07): lifecycle-dependent controls consult the ONE
                    // archived-parent policy (lib/policy/archived-parent.ts) — an archived parent
                    // disables set-manager / invite / onboarding with the same visible reason.
                    title={p.active === false ? undefined : (parentPolicy(p.companies, p.company_id).reason ?? "Set manager")}
                    onClick={() => {
                      setManagerFor(p);
                      // BUG-011: pre-select the current manager the sheet says it will replace.
                      setManagerChoice(p.manager_person_id);
                    }}
                  >
                    {p.manager_name ?? "—"}
                    {p.active !== false && parentPolicy(p.companies, p.company_id).canActOnChild && <UserCog className="h-3 w-3 text-muted-foreground opacity-0 group-hover/row:opacity-70" />}`, 'set-manager');
  s = must(s, `                        title={p.email ? "Invite to log in" : "Add an email before inviting"}
                        disabled={!p.email || (isPending && invitingId === p.id)}`,
`                        title={!parentPolicy(p.companies, p.company_id).canActOnChild ? (parentPolicy(p.companies, p.company_id).reason ?? "Unavailable") : p.email ? "Invite to log in" : "Add an email before inviting"}
                        disabled={!p.email || !parentPolicy(p.companies, p.company_id).canActOnChild || (isPending && invitingId === p.id)}`, 'invite');
  s = must(s, `                      title="Generate 1-week onboarding plan"
                      disabled={isPending && generatingId === p.id}`,
`                      title={parentPolicy(p.companies, p.company_id).parentState === "archived" ? (parentPolicy(p.companies, p.company_id).reason ?? "Unavailable") : "Generate 1-week onboarding plan"}
                      disabled={parentPolicy(p.companies, p.company_id).parentState === "archived" || (isPending && generatingId === p.id)}`, 'onboarding');
  // picker: reasoned empty state, current manager visible, no-op save disabled
  s = must(s, `        title={\`Set manager for \${managerFor?.full_name ?? ""}\`}
        saveDisabled={!managerChoice}`,
`        title={\`Set manager for \${managerFor?.full_name ?? ""}\`}
        saveDisabled={!managerChoice || managerChoice === (managerFor?.manager_person_id ?? null)}`, 'saveDisabled');
  s = must(s, `            <SelectContent>
              {/* Org-scoped by construction: only CURRENT employees of the SAME company
                  are offered — the server action re-checks both against a real read, so
                  this filter is convenience, not the authority. */}
              {people
                .filter((c) => c.id !== managerFor?.id && c.company_id === managerFor?.company_id && c.active !== false)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                    {c.role_title ? \` — \${c.role_title}\` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Manager relationships are per-organization. Changing it replaces {managerFor?.full_name}
            &apos;s current manager in {managerFor?.companies?.name ?? "this company"}; it can&apos;t be cleared from here yet.
          </p>`,
`            <SelectContent>
              {/* Org-scoped by construction: only CURRENT employees of the SAME company
                  are offered — the server action re-checks both against a real read, so
                  this filter is convenience, not the authority. A person is never offered
                  as their own manager (governance/CANONICAL_WORK_CONTRACT.md §6). */}
              {people
                .filter((c) => c.id !== managerFor?.id && c.company_id === managerFor?.company_id && c.active !== false)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                    {c.role_title ? \` — \${c.role_title}\` : ""}
                  </SelectItem>
                ))}
              {people.filter((c) => c.id !== managerFor?.id && c.company_id === managerFor?.company_id && c.active !== false).length === 0 && (
                // BUG-011: a silent empty picker is a defect — say why it is empty.
                <div className="px-2 py-1.5 text-xs text-muted-foreground" data-testid="manager-picker-empty">
                  No other active people in {managerFor?.companies?.name ?? "this company"} — add someone to this company first.
                </div>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground" data-testid="manager-current">
            Current manager: {managerFor?.manager_name ?? "none"}.
          </p>
          <p className="text-xs text-muted-foreground">
            Manager relationships are per-organization. Saving replaces {managerFor?.full_name}
            &apos;s current manager in {managerFor?.companies?.name ?? "this company"}; it can&apos;t be cleared from here yet.
          </p>`, 'picker');
  return s;
});

// ---- companies page: the archived view is the UI restore affordance; make it discoverable ----
rw('web/app/(app)/companies/page.tsx', (s) => {
  s = must(s, `import { getCompanies, getOrganizationRelationships } from "@/lib/data/companies";`,
    `import { getCompanies, getOrganizationRelationships, getArchivedCompanies } from "@/lib/data/companies";`, 'import');
  s = must(s, `  const [companies, relationships] = await Promise.all([getCompanies(), getOrganizationRelationships()]);`,
    `  const [companies, relationships, archived] = await Promise.all([getCompanies(), getOrganizationRelationships(), getArchivedCompanies()]);`, 'fetch');
  s = must(s, `          <Link href="/companies/archived" className={buttonVariants({ variant: "outline" })}>
            <Archive className="h-4 w-4" />
            Archived
          </Link>`,
`          {/* BUG-014 (Work-PC, 2026-09-07): the Archived view holds the Restore control; the
              count makes the affordance discoverable instead of a bare label. */}
          <Link href="/companies/archived" className={buttonVariants({ variant: "outline" })} data-testid="companies-archived-link">
            <Archive className="h-4 w-4" />
            Archived ({archived.length})
          </Link>`, 'link');
  return s;
});

// ---- COMPANY_REF adoption: every child->companies join imports the canonical fragment ----
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '.next') continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
let adopted = 0;
for (const p of walk('web')) {
  if (p.replace(/\\/g, '/').endsWith('web/lib/data/company-ref.ts')) continue;
  rw(p, (s) => {
    if (!s.includes('companies(name, status)')) return s;
    let out = s.replace(/"([^"\n]*?)companies\(name, status\)([^"\n]*?)"/g, (m, a, b) => '`' + a + '${COMPANY_REF}' + b + '`');
    if (out === s) return s;
    if (!/import \{[^}]*\bCOMPANY_REF\b[^}]*\} from "@\/lib\/data\/company-ref"/.test(out)) {
      const lines = out.split('\n'); let last = -1;
      for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
      lines.splice(last + 1, 0, 'import { COMPANY_REF } from "@/lib/data/company-ref";');
      out = lines.join('\n');
    }
    adopted++;
    return out;
  });
}
console.log('COMPANY_REF adopted in', adopted, 'files');
