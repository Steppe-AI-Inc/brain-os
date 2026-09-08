// Second harness pass: explicit request commands per suite (intent-first gate), the D59
// re-reversal, durable-first pendingAction precedence, and the extractor newline repair.
import { readFileSync, writeFileSync } from 'node:fs';
const BS = String.fromCharCode(92);
const NLLIT = BS + 'n'; // the two characters backslash + n
function rw(p, fn) {
  const raw = readFileSync(p, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; const s = raw.replace(/\r\n/g, '\n');
  const out = fn(s); if (out === s) throw new Error('no change: ' + p); writeFileSync(p, out.replace(/\n/g, nl)); console.log('ok', p);
}
function mustReplace(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(label + ': found ' + n); return s.replace(a, () => b); }

// 0. _gate_extract: real newlines inside string literals -> '\n' escapes.
rw('qa/scenarios-runner/_gate_extract.mjs', (s) => {
  s = mustReplace(s, "].join('\n');", "].join('" + NLLIT + "');", 'join');
  s = mustReplace(s, "  return REQUEST_SIDE_DEFAULTS + '\n' + slice;", "  return REQUEST_SIDE_DEFAULTS + '" + NLLIT + "' + slice;", 'ret1');
  if (s.includes("+ REQUEST_SIDE_DEFAULTS + '\n' + slice")) s = s.replace("+ REQUEST_SIDE_DEFAULTS + '\n' + slice", "+ REQUEST_SIDE_DEFAULTS + '" + NLLIT + "' + slice");
  return s;
});

// 1. run helpers: an explicit request command per call (default: a mutation-intent command).
const WRAP = "// P1 (governance/OPERATING_TRUTH_MODEL.md §3): the executor reads the REQUEST. Harness calls\n// default to a mutation-intent command; read-only cases pass command: ''.\nconst run = (opts = {}) => { globalThis.command = typeof opts.command === 'string' ? opts.command : 'archive ACME Holdings'; return run0(opts); };\n";
for (const f of ['run8', 'run10', 'run11', 'run12', 'run13', 'run14']) {
  rw(`qa/scenarios-runner/${f}_defect_closure_contract.mjs`, (s) => mustReplace(s, 'const run = ({ claims = null,', WRAP + 'const run0 = ({ claims = null,', f + ' run'));
}

// 2. run8: read-only cases carry no intent; D59 re-reversed by the founder.
rw('qa/scenarios-runner/run8_defect_closure_contract.mjs', (s) => {
  s = mustReplace(s, "run({ claims: null, evidence: [], grounded: false, summary: 'Here are your companies.' }).summary === 'Here are your companies.');",
    "run({ command: '', claims: null, evidence: [], grounded: false, summary: 'Here are your companies.' }).summary === 'Here are your companies.');", 'D58ok');
  s = mustReplace(s, "run({ claims: null, evidence: [], grounded: true, summary: 'Here are your companies.' }).summary === 'Here are your companies.');",
    "run({ command: '', claims: null, evidence: [], grounded: true, summary: 'Here are your companies.' }).summary === 'Here are your companies.');", 'D68b');
  s = mustReplace(s, `check('D62b a predicate absent from the canonical row is UNKNOWN — no rendered correction',
  run({
    claims:`, `check('D62b a predicate absent from the canonical row is UNKNOWN — no rendered correction',
  run({
    command: '',
    claims:`, 'D62b');
  s = mustReplace(s, `  check('D59 (REVERSED, v92 parity) a fabricated completion + question on a pendingAction turn is NOT corrected — deployed v92 does not correct it either',
    r.summary.includes('has been approved') && r.corrected === false);`,
`  // Founder correction 2026-09-07 (governance/OPERATING_TRUTH_MODEL.md §3 rule 2): the v92-parity
  // reversal does not survive. A fabricated completion on a mutation-intent turn with no verified
  // execution is corrected whether or not a pendingAction (trailing question) is armed.
  check('D59 a fabricated completion + question on a pendingAction turn IS corrected (pendingAction never exempts a claim)',
    !r.summary.includes('has been approved') && r.corrected === true);`, 'D59');
  return s;
});

// 3. run10: legit holds carry no intent; the E-multi bare "yes" IS intent.
rw('qa/scenarios-runner/run10_defect_closure_contract.mjs', (s) => {
  s = mustReplace(s, "() => run({ claims: null, grounded: true, summary: 'ACME was created on 2026-03-01 and has 12 active tasks.' })", "() => run({ command: '', claims: null, grounded: true, summary: 'ACME was created on 2026-03-01 and has 12 active tasks.' })", 'D81.history');
  s = mustReplace(s, "() => run({ claims: null, grounded: true, summary: 'ACME is archived. Should I restore it?' })", "() => run({ command: '', claims: null, grounded: true, summary: 'ACME is archived. Should I restore it?' })", 'D81.state');
  s = mustReplace(s, "() => run({ claims: null, evidence: [], grounded: false, summary: 'The runbook describes executing suites locally.' })", "() => run({ command: '', claims: null, evidence: [], grounded: false, summary: 'The runbook describes executing suites locally.' })", 'EMULTI.legit');
  s = mustReplace(s, "() => { const r = run({ claims: null, evidence: [], grounded: false, summary: 'Confirmed. Executing the plan to reassign CLIX GPS projects and people to SEM LLC.' });", "() => { const r = run({ command: 'yes', claims: null, evidence: [], grounded: false, summary: 'Confirmed. Executing the plan to reassign CLIX GPS projects and people to SEM LLC.' });", 'EMULTI.ungrounded');
  return s;
});

// 4. run11: durable, TTL-guarded state outranks the previous turn's stored output.
rw('qa/scenarios-runner/run11_defect_closure_contract.mjs', (s) => mustReplace(s,
  `C('V11.durable.livePrecedence', 'CONTRACT', 'a live last-turn pendingAction always beats durable state',
  () => readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future() },
    { pendingAction: { kind: 'open_question', question: 'live one' } }, undefined).bound.question === 'live one');`,
  `// P1 (governance/OPERATING_TRUTH_MODEL.md §2, tier 3 over tier 4): the durable, TTL-guarded, fully
// typed channel-state row outranks the previous turn's stored output text.
C('V11.durable.livePrecedence', 'CONTRACT', 'a valid durable pending action beats the last turn\\'s stored pendingAction (durable state outranks stale output)',
  () => readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future() },
    { pendingAction: { kind: 'open_question', question: 'live one' } }, undefined).bound.question !== 'live one');
C('V11.durable.fallback', 'CONTRACT', 'with NO valid durable row the last turn\\'s stored pendingAction still binds',
  () => readerFn(null, { pendingAction: { kind: 'open_question', question: 'live one' } }, undefined).bound.question === 'live one');`, 'livePrecedence'));

// 5. run12: legit gerund prose carries no intent.
rw('qa/scenarios-runner/run12_defect_closure_contract.mjs', (s) => {
  for (const t of ['Assigning an owner is the next step in the workflow.', 'Updating the pricing sheet is on the roadmap for Q3.', 'Processing the request usually takes about three seconds.', 'Finance is currently updating the Q3 forecast spreadsheet.']) {
    s = mustReplace(s, "() => run({ claims: null, evidence: [], grounded: false, summary: '" + t + "' })", "() => run({ command: '', claims: null, evidence: [], grounded: false, summary: '" + t + "' })", 'legit ' + t.slice(0, 12));
  }
  return s;
});

// 6. structured_claim_verification: fabrication corrections are mutation-intent turns.
rw('qa/scenarios-runner/structured_claim_verification.mjs', (s) => mustReplace(s,
  '  return withRequestSideDefaults(stripTS(source.slice(start, end)));',
  "  return 'globalThis.command = \"archive ACME Holdings\";' + String.fromCharCode(10) + withRequestSideDefaults(stripTS(source.slice(start, end)));", 'verification'));
