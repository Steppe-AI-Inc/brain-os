// CODEX FINDING C — CONFIRMED, and closed here.
//
// THE DEFECT, from the candidate's own bytes: the final write of the VERIFIED output back onto the work
// order is
//
//     await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);
//
// with its result discarded. The Supabase client does not throw on a failed write - it returns an error in
// the response - so a failed final persist is indistinguishable here from a successful one, and the very
// next statements send `{ type: 'done' }` with the full result payload. The founder is told the turn
// completed; the durable record still holds the RPC's PRE-VERIFICATION snapshot. Founder-visible output and
// canonical persisted state diverge, silently, exactly as Codex described.
//
// THE INVARIANT (founder, 2026-09-09): VERIFIED_RESPONSE must not report durable completion if required
// final persistence failed. Persistence semantics are CLASSIFIED, never collapsed into `done`:
//
//     EXECUTION_SUCCEEDED_AND_PERSISTED     the turn mutated something and the record is durable
//     EXECUTION_SUCCEEDED_PERSISTENCE_FAILED the mutation HAPPENED; the record of it did not
//     EXECUTION_FAILED                       nothing was executed
//     READ_SUCCEEDED_AND_PERSISTED           a read turn whose verified output is durable
//     READ_SUCCEEDED_PERSISTENCE_FAILED      a read turn whose verified output is not
//
// EXECUTION_SUCCEEDED_PERSISTENCE_FAILED is the case that matters and the one a boolean cannot express: the
// mutation is real and must NOT be reported as failed, while the durable record is stale and must NOT be
// reported as complete. The turn keeps its recovery information - the work order id and what was executed -
// so the state is repairable rather than merely regrettable.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const EXPECT_IN = process.env.SEM_EXPECT_INPUT_SHA256;
const rawIn = readFileSync(p);
if (EXPECT_IN && createHash('sha256').update(rawIn).digest('hex') !== EXPECT_IN) throw new Error('refusing: unexpected input sha');
let s = rawIn.toString('utf8').replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(what + ': anchor ' + (n === 0 ? 'missing' : 'not unique (' + n + ')'));
  s = s.replace(from, () => to);
  edits.push(what);
}

sub('the final persist is CHECKED and classified, never assumed',
  `        await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);`,
  `        // CODEX FINDING C. This write used to discard its own result. The Supabase client returns an
        // error rather than throwing, so a failed final persist looked exactly like a successful one and the
        // turn went on to send { type: 'done' } — founder-visible output diverging from canonical persisted
        // state, silently. The error is read, and what the turn REPORTS follows from it.
        const finalPersist = await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);
        const finalPersistFailed = !!(finalPersist && finalPersist.error);
        // A turn that MUTATED something and then failed to record it is not a failed turn and is not a
        // completed one. Collapsing either way is a lie in a different direction, which is why this is a
        // classification and not a boolean.
        const turnExecutedSomething = claimExecutionEvidence.some((e) => !e.error);
        const persistenceOutcome = finalPersistFailed
          ? (turnExecutedSomething ? 'EXECUTION_SUCCEEDED_PERSISTENCE_FAILED' : 'READ_SUCCEEDED_PERSISTENCE_FAILED')
          : (turnExecutedSomething ? 'EXECUTION_SUCCEEDED_AND_PERSISTED' : 'READ_SUCCEEDED_AND_PERSISTED');
        if (finalPersistFailed) {
          // RECOVERY INFORMATION, not just an alarm: the work order id and the operations that really ran
          // are what a later repair needs, and they exist only here.
          await supabase.from('audit_logs').insert({
            actor_profile_id: profile.id, actor_role: profile.role,
            event_type: 'final_persistence_failed', entity_type: 'work_order', entity_id: workOrder.id,
            company_id: primaryCompanyId,
            message: 'The verified output could not be persisted; the durable record is stale',
            metadata: { persistenceOutcome, executedOperationCount: claimExecutionEvidence.filter((e) => !e.error).length,
              error: String(finalPersist?.error?.message || 'unknown'), recoverable: true },
          }).catch(() => {});
        }`);

sub('the done payload reports the persistence outcome instead of an unqualified completion',
  `        send({ type: 'done', result, workOrder, createdTasks,`,
  `        // The founder-visible text must match the actual state (founder, 2026-09-09). \`done\` alone cannot
        // say "the change happened but the record of it did not", so the outcome rides with it and a failed
        // persist is never reported as durable completion.
        send({ type: 'done', persistenceOutcome, persistenceFailed: finalPersistFailed, result, workOrder, createdTasks,`);

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
if (out.includes(String.fromCharCode(8))) throw new Error('a backspace character is present');
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
console.log('sha256 ' + createHash('sha256').update(readFileSync(p)).digest('hex'));
