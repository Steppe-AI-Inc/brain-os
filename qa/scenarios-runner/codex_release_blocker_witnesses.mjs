#!/usr/bin/env node
// CODEX AUDIT — independent reproduction of the findings raised by the parallel Codex audit, 2026-09-09.
//
// The founder's rule for this suite: do not accept a Codex finding because Codex raised it, and do not
// dismiss one because Claude's verifier #69 found different defects. Repository and runtime truth decides.
// Every row below is derived from the candidate's own bytes, and each finding is labelled with the verdict
// this suite actually measures.
//
//   A  model-supplied action overriding an explicit user negation ......... CONFIRMED (rows A1-A6)
//   B  read-only question retaining a fabricated completion ............... REFUTED  (rows B1-B3)
//   C  persistence failure still returning `done` ......................... CONFIRMED (rows C1-C5)
//   D  CollectionEnvelope shown counts after trimming ..................... rows D1-D2
//
// ANY failure exits non-zero. Source under test via SEM_INDEX_SRC, else resolved from any cwd.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

function up(startFile, rel) {
  let d = dirname(startFile);
  for (let i = 0; i < 12; i++) { if (existsSync(join(d, rel))) return d; const u = dirname(d); if (u === d) break; d = u; }
  throw new Error('codex witnesses: cannot locate ' + rel);
}
const HERE = fileURLToPath(import.meta.url);
const ROOT = up(HERE, 'qa/scenarios-runner/_gate_extract.mjs');
const INDEX = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : join(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');
const { stripTS } = await import('file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));

let pass = 0; const failures = [];
const check = (tag, name, cond, detail) => {
  if (cond) { pass++; console.log('OK   [' + tag + '] ' + name); }
  else { failures.push('[' + tag + '] ' + name + (detail ? '\n       ' + detail : '')); console.log('FAIL [' + tag + '] ' + name + (detail ? '\n       ' + detail : '')); }
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CODEX A — "Do not archive ACME" can still result in a model-supplied action being executed.
//
// REPRODUCED AND CONFIRMED at source level before any fix. The negation test that exists
// (`commandNegatedLead`) is consumed at exactly ONE site — `commandFallbackAllowed` — which governs the
// RAW-COMMAND fallback. That expression also requires `!modelEmittedArchive`, so on precisely the turns
// where the model DID emit a lifecycle payload, the fallback is already off and the negation is never
// consulted at all. `requestedArchiveIds` flows from `result.archiveCompanyIds` into
// `resolveCompanyLifecycleTargets` and on into the executor with nothing in between that reads the
// negation. The founder's invariant is the opposite: USER REQUEST / CANONICAL INTENT outranks a
// MODEL-SUPPLIED ACTION, always.
//
// The rows below are structural because the defect is structural: the question is whether a negation gate
// EXISTS on the model-supplied path at all, and whether every consumer derives from ONE definition of
// "this request was negated" rather than from a fourth hand-written spelling of it.
{
  const negationSpellings = (src.match(/do not\|don\[/g) || []).length;
  check('CODEX-A', 'A1 "the request was negated" has ONE canonical definition, not one per consumer',
    /const REQUEST_NEGATED_ALTERNATION = /.test(src),
    'three separate spellings were measured on the pre-fix candidate (commandNegatedLead, negatedMutationVerb, negatedRequest); found ' + negationSpellings + ' inline copies');
  check('CODEX-A', 'A2 a negated request is computed ONCE for the whole turn, above the executor',
    /const requestIsNegated = /.test(src));
  // The gate is asserted at the SOURCE of the payload, not at two of its consumers. Gating
  // resolveCompanyLifecycleTargets would have left the other forty-odd mutating fields reachable, and
  // "never move Bob to Company B" is a person assignment rather than a company archive.
  check('CODEX-A', 'A3 EVERY model-supplied mutating field is stripped on a negated turn, not just the lifecycle ones',
    /for \(const field of MUTATION_RESULT_FIELDS\.concat\(\['activateAiProviderId'\]\)\)/.test(src)
      && /negatedRequestStrippedFields\.push\(field\)/.test(src),
    'the gate must iterate the canonical mutating-field list, so completeness is by construction');
  check('CODEX-A', 'A4 the gate runs BEFORE any consumer reads a mutating field',
    src.indexOf('const requestIsNegated =') > 0
      && src.indexOf('const requestIsNegated =') < src.indexOf('const requestedArchiveIds'),
    'a gate placed after a consumer is not a gate');
  check('CODEX-A', 'A7 a MIXED turn is not swallowed whole ("archive ACME, but do not delete it" still archives)',
    /!clauses\.some\(\(c\) => !negatedClause\.test\(c\) && imperative\.test\(c\.trim\(\)\)\)/.test(src));
  // TWO literals exist on purpose - the handler's MUTATION_ARRAY_FIELDS is a window marker for v61 and a
  // parsed member list for v67, so collapsing them would delete two independent witnesses. Two lists that
  // must agree is the drift class this campaign keeps finding, so the agreement is enforced here rather
  // than trusted: the gate's list and the handler's list must contain exactly the same fields.
  check('CODEX-A', 'A8 the module-level gate list and the handler list contain exactly the same fields',
    (() => {
      const grab = (name) => {
        const m = new RegExp('const ' + name + ' = \\[([^\\]]*)\\]').exec(src);
        return m ? new Set(m[1].split(',').map((t) => t.trim().replace(/^'|'$/g, '')).filter(Boolean)) : null;
      };
      const gate = grab('MUTATION_RESULT_FIELDS'), handler = grab('MUTATION_ARRAY_FIELDS');
      if (!gate || !handler || gate.size === 0) return false;
      if (gate.size !== handler.size) return false;
      for (const f of gate) if (!handler.has(f)) return false;
      return true;
    })(),
    'MUTATION_RESULT_FIELDS (the negation gate) and MUTATION_ARRAY_FIELDS (the handler) have drifted apart');
  // The predicate being CORRECT and the gate being APPLIED are two different properties. A mutant that
  // replaced the guard with `if (false)` left a perfectly correct requestIsNegated sitting unused and every
  // behavioural row still green — the gate was present, right, and dead. This row pins the application.
  check('CODEX-A', 'A12 the gate is actually APPLIED — its guard is the predicate, not a constant',
    /if \(requestIsNegated && result && typeof result === 'object'\) \{/.test(src),
    'a correct predicate that nothing consults protects nothing');
  check('CODEX-A', 'A5 a negated turn records that it refused, so the refusal is auditable rather than invisible',
    /negated_request_refused/.test(src));
  // The receipt half was already correct and must stay correct: the founder is told nothing happened.
  check('CODEX-A', 'A6 the receipt still says the founder asked for it not to happen',
    /you asked me not to, so nothing was executed/.test(src));
}

// BEHAVIOURAL, not merely structural. The first version of these rows asserted that the gate EXISTED, and a
// mutant that replaced its condition with `if (false)` walked straight past them — the gate was present and
// dead. So the real predicate is sliced out of the candidate and executed over the founder's own examples.
{
  const iife = (() => {
    const start = src.indexOf('const requestIsNegated = (() => {');
    if (start < 0) return null;
    const end = src.indexOf('})();', start);
    if (end < 0) return null;
    // The WHOLE declaration, not the expression: stripTS prepends the shared constant declarations a window
    // needs, so `return <expression>` would become `return const ...`. Keeping the declaration form lets the
    // prepended constants sit where declarations belong.
    return stripTS(src.slice(start, end + 5));
  })();
  const grabConst = (name) => {
    const m = new RegExp('const ' + name + ' = "([^"]*)"').exec(src);
    return m ? m[1] : null;
  };
  const negAlt = grabConst('REQUEST_NEGATED_ALTERNATION'), mutAlt = grabConst('MUTATION_VERB_ALTERNATION');
  let isNegated = null;
  if (iife && negAlt && mutAlt) {
    const F = Object.getPrototypeOf(function () {}).constructor;
    // The vocabularies are NOT passed in: stripTS already prepends the shared constant declarations this
    // window reads, and supplying them as parameters too is a duplicate declaration. They are still read
    // above, so a missing one is reported rather than silently substituted.
    isNegated = (cmd) => new F('command', iife + '\nreturn requestIsNegated;')(cmd);
  }
  check('CODEX-A', 'A9 the negation predicate is executable from the candidate (not just present in it)',
    typeof isNegated === 'function', 'could not slice requestIsNegated / its vocabularies');
  if (isNegated) {
    // The founder's own five test commands.
    for (const cmd of ['do not archive ACME', "don't delete ACME", 'please do not restore ACME',
                       'make sure you do not archive ACME', 'never move Bob to Company B'])
      check('CODEX-A', 'A10 negated request is refused: ' + JSON.stringify(cmd), isNegated(cmd) === true);
    // A negation must not swallow an ordinary request, and must not swallow the un-negated half of a
    // mixed turn — a gate that refuses everything is as wrong as one that refuses nothing.
    for (const cmd of ['archive ACME', 'archive work order WO-1', 'what companies are archived?',
                       'archive ACME, but do not delete it'])
      check('CODEX-A', 'A11 ordinary request is NOT refused: ' + JSON.stringify(cmd), isNegated(cmd) === false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CODEX B — a read-only question can retain "I archived ACME" with zero execution.
//
// REFUTED on this candidate, and the rows below are the evidence, kept as CONTRACT rows so the property
// cannot regress. The structured-claim block rewrites an unsupported current-turn mutation claim
// regardless of whether the turn was a question: the claim needs a structured claim, an executed
// operation, a canonical id, rows affected and a fresh postcondition, and a read-only turn has none of
// them. Codex's shape is real in general; it does not reproduce here.
{
  const structuredStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  check('CODEX-B', 'B1 the structured-claim block exists and is what decides a mutation claim',
    structuredStart > 0 && /claimsPastCompletionWithNoGrounding/.test(src));
  check('CODEX-B', 'B2 a current-turn mutation claim requires EXECUTION EVIDENCE, never prose agreement',
    /executionEvidence: claimExecutionEvidence/.test(src));
  check('CODEX-B', 'B3 a HISTORICAL recount is still allowed to survive (the fix must not delete true history)',
    /PAST_COMPLETION_CLAIM_PATTERN/.test(src) && /FUTURE_PROMISE_PATTERN/.test(src));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CODEX C — a failed final persistence write still returns `done`.
//
// CONFIRMED on the pre-fix candidate: the final write of the verified output back onto the work order
// discarded its own result, and the Supabase client returns an error rather than throwing, so a failed
// persist was indistinguishable from a successful one and the turn went on to send `done`. The founder was
// told the turn completed while the durable record still held the pre-verification snapshot.
{
  check('CODEX-C', 'C1 the final persist READS its own error instead of discarding it',
    /const finalPersist = await supabase\.from\('work_orders'\)\.update/.test(src)
      && /const finalPersistFailed = !!\(finalPersist && finalPersist\.error\)/.test(src),
    'a write whose result is thrown away cannot report failure');
  // A boolean cannot express "the change happened but the record of it did not", which is the case that
  // matters: reporting it as failed is as wrong as reporting it as complete.
  for (const state of ['EXECUTION_SUCCEEDED_AND_PERSISTED', 'EXECUTION_SUCCEEDED_PERSISTENCE_FAILED',
                       'READ_SUCCEEDED_AND_PERSISTED', 'READ_SUCCEEDED_PERSISTENCE_FAILED'])
    check('CODEX-C', 'C2 persistence semantics are classified: ' + state, src.includes(state));
  check('CODEX-C', 'C3 a mutation that was executed is never reported as a failed turn just because the record is stale',
    /turnExecutedSomething \? 'EXECUTION_SUCCEEDED_PERSISTENCE_FAILED' : 'READ_SUCCEEDED_PERSISTENCE_FAILED'/.test(src));
  check('CODEX-C', 'C4 the founder-visible payload carries the outcome, so `done` never means "durable" on its own',
    /send\(\{ type: 'done', persistenceOutcome, persistenceFailed: finalPersistFailed/.test(src));
  check('CODEX-C', 'C5 a failed persist preserves RECOVERY information, not merely an alarm',
    /event_type: 'final_persistence_failed'/.test(src) && /recoverable: true/.test(src));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CODEX D — contradictory CollectionEnvelope `shown` counts after trimming.
//
// The envelope contract is already pinned by v69's own D7 row and by the TRIM_ORDER row; these two rows
// state the invariant in the founder's words so a future trim cannot quietly reintroduce a pre-trim count.
{
  check('CODEX-D', 'D1 no envelope takes its total from the shown window (total is canonical, not local)',
    !/total:\s*\w+\.length/.test(src.slice(src.indexOf('const TRIM_ORDER'), src.indexOf('const contextTrimmed'))));
  check('CODEX-D', 'D2 the trim loop recomputes the envelope rather than carrying the pre-trim count',
    /packRecord\.contextBudget = contextBudget;/.test(src) &&
    src.indexOf('packRecord.contextBudget = contextBudget;') < src.indexOf('for (const [key, keep, keepNewest] of TRIM_ORDER)'));
}

console.log('\ncodex_release_blocker_witnesses: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) console.log('FAILURES:\n - ' + failures.join('\n - '));
console.log('index.ts under test: ' + INDEX);
if (pass + failures.length === 0) { console.error('0 checks executed — harness failure'); process.exit(2); }
process.exit(failures.length ? 1 : 0);
