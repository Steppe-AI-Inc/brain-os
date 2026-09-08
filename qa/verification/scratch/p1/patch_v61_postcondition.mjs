// VERIFIER #61 FINDINGS V61-D8 and V61-D9 — the postcondition rule was stated but not applied uniformly.
//
// D8 (P2): four sites read `r.postconditionPassed !== false`, which records a VERIFIED envelope when the
//   field is missing or null. The company loops already use `=== true`. Not exploitable against today's
//   security-definer RPCs, which do return a real boolean — but it is the opposite of the rule the closure
//   of V60-D7 states, and a mutant of it survived the whole battery. Evidence must fail CLOSED: absent
//   evidence is not evidence.
//
// D9 (P2): `reassign_person` and `assign_task` reported the postcondition from the write's own return
//   value — "an id came back". OPERATING_TRUTH_MODEL §4.1 defines a postcondition as state observed after
//   executing, by fresh re-read. `.select('id')` proves a row was touched, not that owner_person_id or the
//   operating company actually landed. Both now re-read the field that was supposed to change and compare
//   it to what was requested.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- D8: fail closed, everywhere.
const before = s;
s = s.split('if (r.changed === true && r.postconditionPassed !== false) recordExecution(')
     .join('if (r.changed === true && r.postconditionPassed === true) recordExecution(');
if (s === before) throw new Error('D8: no fail-open site found');
n += 4;

// ---- D9: the postcondition is a fresh re-read of the field that was supposed to change.
must(`      const { data, error } = await supabase.rpc('set_person_assignment', {
        p_person_id: t.personId,
        p_operating_company_id: t.operatingCompanyId,
        p_legal_employer_company_id: t.legalEmployerCompanyId || null,
      });
      if (error || !data) return { success: false, detail: error?.message || 'no result', raw: data, postconditionPassed: false };
      // The RPC returns the assignment id it wrote: that returned id IS the postcondition evidence.
      return { success: true, detail: 'reassigned', raw: { assignmentId: data }, postconditionPassed: typeof data === 'string' && data.length > 0 };`,
`      const { data, error } = await supabase.rpc('set_person_assignment', {
        p_person_id: t.personId,
        p_operating_company_id: t.operatingCompanyId,
        p_legal_employer_company_id: t.legalEmployerCompanyId || null,
      });
      if (error || !data) return { success: false, detail: error?.message || 'no result', raw: data, postconditionPassed: false };
      // POSTCONDITION = state observed after executing, by FRESH RE-READ (OTM §4.1). A returned id proves a
      // row was written, not that the assignment landed on the company that was asked for (verifier #61,
      // V61-D9). Re-read the row and compare the field that was supposed to change.
      const reread = await supabase.from('person_assignments')
        .select('id,operating_company_id,legal_employer_company_id,state')
        .eq('id', data).maybeSingle();
      const landed = !!reread.data
        && reread.data.operating_company_id === t.operatingCompanyId
        && (t.legalEmployerCompanyId ? reread.data.legal_employer_company_id === t.legalEmployerCompanyId : true);
      return { success: true, detail: landed ? 'reassigned' : 'reassign_postcondition_not_confirmed',
        raw: { assignmentId: data, postcondition: reread.data || null }, postconditionPassed: landed };`, 'reassign re-read');

must(`      const { data, error } = await supabase.from('tasks')
        .update({ owner_type: 'human', owner_person_id: t.personId, owner_agent_id: null })
        .eq('id', t.taskId)
        .select('id');
      if (error) return { success: false, detail: error.message, raw: null, postconditionPassed: false };
      if (!data || data.length === 0) return { success: false, detail: 'no matching task or no access', raw: null, postconditionPassed: false };
      // The UPDATE ... select('id') returned the affected row: that row IS the postcondition evidence.
      return { success: true, detail: 'assigned', raw: { taskId: data[0].id }, postconditionPassed: typeof data[0]?.id === 'string' };`,
`      const { data, error } = await supabase.from('tasks')
        .update({ owner_type: 'human', owner_person_id: t.personId, owner_agent_id: null })
        .eq('id', t.taskId)
        .select('id');
      if (error) return { success: false, detail: error.message, raw: null, postconditionPassed: false };
      if (!data || data.length === 0) return { success: false, detail: 'no matching task or no access', raw: null, postconditionPassed: false };
      // Fresh re-read of the field that was supposed to change, not the write's own return (V61-D9).
      const taskAfter = await supabase.from('tasks').select('id,owner_type,owner_person_id').eq('id', t.taskId).maybeSingle();
      const assigned = !!taskAfter.data && taskAfter.data.owner_person_id === t.personId && taskAfter.data.owner_type === 'human';
      return { success: true, detail: assigned ? 'assigned' : 'assign_postcondition_not_confirmed',
        raw: { taskId: data[0].id, postcondition: taskAfter.data || null }, postconditionPassed: assigned };`, 'assign re-read');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.includes('postconditionPassed !== false')) throw new Error('a fail-open read survived');
writeFileSync(p, out); console.log('applied', n);
