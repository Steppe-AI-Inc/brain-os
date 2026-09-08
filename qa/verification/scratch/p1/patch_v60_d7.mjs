// VERIFIER #60 FINDING V60-D7 (P2). The confirmed-plan path ("yes" to a proposed plan) recorded a VERIFIED
// execution envelope for every action it called "completed", deriving success from `changed === true` and
// never reading the `postconditionPassed` that every lifecycle RPC returns. So the plan path reported
// "done." for exactly the case the direct path refuses: the row changed, the postcondition re-read did not
// confirm the intended state. governance/OPERATING_TRUTH_MODEL.md §4.1 makes postcondition_verified the
// thing that admits a mutation-success claim, and one path was not consulting it.
//
// Fix, in two places, both structural:
//   1. executeOneAction returns the RPC's postconditionPassed verbatim, and an explicit false blocks
//      success. Non-RPC paths (a direct UPDATE that returns the row) verify by their own returned row and
//      report postconditionPassed: true only from that evidence.
//   2. The plan evidence loop passes that value through instead of the literal `true`.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- 1. the return type carries the postcondition.
must(`async function executeOneAction(supabase: any, action: ExecutionPlanAction): Promise<{ success: boolean; detail: string; raw: unknown }> {`,
`// Every branch reports postconditionPassed from BACKEND EVIDENCE: the RPC's own jsonb field where there is
// one, and the returned row where the operation is a direct write. A branch that cannot establish it says
// false — never true by default (verifier #60, V60-D7; OPERATING_TRUTH_MODEL.md §4.1).
function rpcPostcondition(r: Record<string, unknown>): boolean {
  return r.postconditionPassed === true;
}
async function executeOneAction(supabase: any, action: ExecutionPlanAction): Promise<{ success: boolean; detail: string; raw: unknown; postconditionPassed: boolean }> {`, 'signature');

// ---- every early failure return carries postconditionPassed: false.
s = s.split(`      if (error || !data) return { success: false, detail: error?.message || 'no result', raw: data };`)
     .join(`      if (error || !data) return { success: false, detail: error?.message || 'no result', raw: data, postconditionPassed: false };`);
s = s.split(`      if (error) return { success: false, detail: error.message, raw: null };`)
     .join(`      if (error) return { success: false, detail: error.message, raw: null, postconditionPassed: false };`);
s = s.split(`      if (!data || data.length === 0) return { success: false, detail: 'no matching task or no access', raw: null };`)
     .join(`      if (!data || data.length === 0) return { success: false, detail: 'no matching task or no access', raw: null, postconditionPassed: false };`);

// ---- the lifecycle RPC branches consult the postcondition.
must(`      return { success: r.changed === true || r.reason === 'already_active', detail: String(r.reason || ''), raw: r };`,
`      return { success: (r.changed === true || r.reason === 'already_active') && rpcPostcondition(r), detail: String(r.reason || ''), raw: r, postconditionPassed: rpcPostcondition(r) };`, 'restore_employment');
must(`      return { success: r.changed === true || r.reason === 'already_inactive', detail: String(r.reason || ''), raw: r };`,
`      return { success: (r.changed === true || r.reason === 'already_inactive') && rpcPostcondition(r), detail: String(r.reason || ''), raw: r, postconditionPassed: rpcPostcondition(r) };`, 'end_employment');
must(`      return { success: r.changed === true || String(r.reason || '').startsWith('already_'), detail: String(r.reason || ''), raw: r };`,
`      return { success: (r.changed === true || String(r.reason || '').startsWith('already_')) && rpcPostcondition(r), detail: String(r.reason || ''), raw: r, postconditionPassed: rpcPostcondition(r) };`, 'company lifecycle');
s = s.split(`      return { success: r.changed === true, detail: String(r.reason || ''), raw: r };`)
     .join(`      return { success: r.changed === true && rpcPostcondition(r), detail: String(r.reason || ''), raw: r, postconditionPassed: rpcPostcondition(r) };`);

// ---- the direct-write branches verify from the row they got back.
must(`      return { success: true, detail: 'reassigned', raw: { assignmentId: data } };`,
`      // The RPC returns the assignment id it wrote: that returned id IS the postcondition evidence.
      return { success: true, detail: 'reassigned', raw: { assignmentId: data }, postconditionPassed: typeof data === 'string' && data.length > 0 };`, 'reassign');
must(`      return { success: true, detail: 'assigned', raw: { taskId: data[0].id } };`,
`      // The UPDATE ... select('id') returned the affected row: that row IS the postcondition evidence.
      return { success: true, detail: 'assigned', raw: { taskId: data[0].id }, postconditionPassed: typeof data[0]?.id === 'string' };`, 'assign_task');

// ---- 2. the plan evidence loop passes the measured postcondition through.
must(`          const mapping = PLAN_EVIDENCE[a.operation];
          if (mapping) recordExecution(mapping[0], mapping[1], (a.targetIds || {})[mapping[2]], true);`,
`          const mapping = PLAN_EVIDENCE[a.operation];
          // NOT the literal true, and not the plan's own status word: the postcondition the backend
          // actually reported for this action (verifier #60, V60-D7).
          const planPostcondition = (a as Record<string, unknown>).postconditionPassed === true
            || ((a.result as Record<string, unknown> | null)?.postconditionPassed === true);
          if (mapping) recordExecution(mapping[0], mapping[1], (a.targetIds || {})[mapping[2]], planPostcondition);`, 'plan evidence');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);
