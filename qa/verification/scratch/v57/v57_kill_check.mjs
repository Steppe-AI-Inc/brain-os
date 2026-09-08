// VERIFIER #57 — prove that v57_regression_additions kills the battery survivors (m8, m10, m15, m16) on MUTANT COPIES
// (SEM_INDEX_SRC; index.ts itself is never touched).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const base = readFileSync(resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8');
const OUT = resolve(ROOT, 'qa/verification/scratch/v57/mutants'); mkdirSync(OUT, { recursive: true });
function mustReplace(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor not unique (${n}) for ${label}`); return s.replace(a, () => b); }
const MUTANTS = [
  ['m8_model_read_no_longer_vetoes', (s) => mustReplace(s, "const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read');", "const lexiconReadVetoed = lexiconVerb !== null && readShaped;", 'm8')],
  ['m10_negated_lead_gate_dropped', (s) => mustReplace(s, " && !commandIsQuestion && !commandNegatedLead && !commandReadLead && ", " && !commandIsQuestion && !commandReadLead && ", 'm10')],
  ['m15_turnVerdict_intent_null', (s) => mustReplace(s, "          mutationIntent: requestedIntent,\r\n          receiptRendered,", "          mutationIntent: null,\r\n          receiptRendered,", 'm15')],
  ['m16_stored_pendingAction_ttl_removed', (s) => mustReplace(s, "const lastTurnPendingFresh = Number.isNaN(lastTurnCreatedAt) || (Date.now() - lastTurnCreatedAt) <= 30 * 60 * 1000;", "const lastTurnPendingFresh = true;", 'm16')],
];
const SUITE = resolve(ROOT, 'qa/verification/proposed/v57_regression_additions.mjs');
let killed = 0;
for (const [name, mutate] of MUTANTS) {
  const p = resolve(OUT, name + '.ts'); writeFileSync(p, mutate(base));
  const r = spawnSync(process.execPath, [SUITE], { cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: p } });
  const text = (r.stdout || '') + (r.stderr || '');
  const contractFails = (text.match(/^FAIL {2}\[CONTRACT\]/gm) || []).length;
  const caught = contractFails > 0;
  if (caught) killed++;
  console.log((caught ? 'KILLED   ' : 'SURVIVED ') + name + '  CONTRACT failures=' + contractFails + '  e.g. ' + ((text.match(/^FAIL {2}\[CONTRACT\] .*/m) || [''])[0]).slice(0, 140));
}
console.log(`v57_kill_check: ${killed}/${MUTANTS.length} battery survivors killed by v57_regression_additions CONTRACT rows`);
process.exit(killed === MUTANTS.length ? 0 : 1);
