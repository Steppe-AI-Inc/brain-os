// VERIFIER #64 FINDINGS V64-D3 and V64-D5.
//
// V64-D3 — the THIRD member of the V63-D2 pair. Two gates that read company status were hardened against
//   the trim in the last two rounds; `companyStatusById`, which decides whether a company is archived for
//   every downstream status question, still read the raw trimmable array. Hardening two of three is how the
//   asymmetry keeps re-appearing: the fix has to be to the SET of gates, not to the ones a finding names.
//   All three now read the same provenance.
//
// V64-D5 — namedTargets is capped at NAMED_LOOKUP_ROW_CAP and carried no envelope, so it is the one
//   collection in the pack that could be truncated silently. OTM §4.3 has no exception for it: a capped
//   collection reports shown/total/truncated, or the model cannot know what it is not being shown.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- D3: the third gate reads the same provenance as the two beside it.
must(`        const companyStatusById = new Map((contextPack?.companies || []).map((c: any) => [c.id, c.status]));`,
`        // The THIRD gate on the same data. contextCompanyIds (trusts) and archivedCompanyIds (refuses) were
        // hardened against the trim in the last two rounds; this one, which answers "is that company
        // archived?" for everything downstream, still read the raw trimmable array (verifier #64, V64-D3).
        // Hardening the gates a finding names, one round at a time, is how the asymmetry keeps coming back.
        const companyStatusById = new Map([
          ...[...(contextPack?.companies || []), ...(contextPack?.archivedCompanies || []),
            ...(((contextPack as any)?.namedTargets || {}).companies || [])]
            .filter((c: any) => c && typeof c.id === 'string')
            .map((c: any) => [c.id, c.status] as [string, string]),
          // A row the budget removed is still known-archived if it came from the archived collection.
          ...(contextProvenance?.archivedCompanies || []).map((id: string) => [id, 'archived'] as [string, string]),
        ]);`, 'company status gate');

// ---- D5: namedTargets carries an envelope like every other capped collection.
must(`  const namedTargets = {
    companies: (namedCompanyLookup.data || []),
    people: (namedPersonLookup.data || []),
    tasks: (namedTaskLookup.data || []),
    goals: (namedGoalLookup.data || []),
    projects: (namedProjectLookup.data || []),
    departments: (namedDepartmentLookup.data || []),
  };`,
`  const namedTargets = {
    companies: (namedCompanyLookup.data || []),
    people: (namedPersonLookup.data || []),
    tasks: (namedTaskLookup.data || []),
    goals: (namedGoalLookup.data || []),
    projects: (namedProjectLookup.data || []),
    departments: (namedDepartmentLookup.data || []),
  };
  // namedTargets is capped at NAMED_LOOKUP_ROW_CAP like every other window, so it reports shown/total/
  // truncated like every other window (OTM §4.3; verifier #64, V64-D5). Without this it was the one
  // collection in the pack that could be cut silently — and it is the one holding the entity the founder
  // just named. The total is the cap when the cap was reached: PostgREST returns no count for these
  // targeted lookups, and "at least this many" is stated as truncated: true rather than as a false exact.
  const namedTargetsEnvelope: Record<string, { shown: number; total: number | null; truncated: boolean }> = {};
  for (const [key, rows] of Object.entries(namedTargets)) {
    namedTargetsEnvelope[key] = {
      shown: (rows as unknown[]).length,
      total: (rows as unknown[]).length < NAMED_LOOKUP_ROW_CAP ? (rows as unknown[]).length : null,
      truncated: (rows as unknown[]).length >= NAMED_LOOKUP_ROW_CAP,
    };
  }`, 'named targets envelope');

must(`    memories: { shown: packMemories.length,`,
     `    namedTargets: namedTargetsEnvelope,\n    memories: { shown: packMemories.length,`, 'envelope in collections');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
