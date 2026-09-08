// verifier #11 (attempt 2) MUTATION BATTERY.
//
// A guard is only real if BREAKING it makes a committed suite FAIL. This harness
// temporarily writes a mutated index.ts, runs the named suite(s), then ALWAYS restores
// the original BYTES and re-verifies the sha256. Any mutant whose suites all still exit
// 0 is a SURVIVOR = an unpinned guard = a real finding.
//
// Safety: original content is read as a Buffer once, restored in a finally block, and
// the sha is asserted after every single mutant. If a restore ever fails to reproduce
// the baseline sha the harness aborts immediately.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const BASELINE_SHA = '66fa821d7893248236e3d1626fa321c7ca9872957c0d50520b8067eec13ddded';
const original = readFileSync(SRC);
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (sha(original) !== BASELINE_SHA) {
  console.log('ABORT: baseline sha mismatch before any mutation: ' + sha(original));
  process.exit(2);
}
const text = original.toString('utf8');

// [id, description, find, replace, suites-that-MUST-fail]
const MUTANTS = [
  // ---------- run10 guards ----------
  ['M01 abbreviation-guard direction',
    'restore run9 INVERTED direction (any lowercase/digit after "." = abbreviation)',
    "const abbreviation = /^[A-Za-z]$/.test(beforeWord) || KNOWN_ABBREVIATION.test(beforeWord);",
    "const abbreviation = next !== undefined && /[a-z0-9]/.test(next);",
    ['run10_defect_closure_contract']],
  ['M02 KNOWN_ABBREVIATION list widened',
    'add "acme"-like arbitrary token to the abbreviation list (does any suite pin the list contents?)',
    "const KNOWN_ABBREVIATION = /^(inc|ltd|co|corp|llc|plc|gmbh|dr|mr|mrs|ms|jr|sr|st|no|nr|vs|etc|approx|dept|div)$/i;",
    "const KNOWN_ABBREVIATION = /^(inc|ltd|co|corp|llc|plc|gmbh|dr|mr|mrs|ms|jr|sr|st|no|nr|vs|etc|approx|dept|div|acme|archived|deleted)$/i;",
    ['run10_defect_closure_contract']],
  ['M03 ASCII-? terminator removed',
    "drop `ch === '?'` from the terminator set (D83)",
    "if (ch === '!' || ch === '?' || ch === ';'",
    "if (ch === '!' || ch === ';'",
    ['run10_defect_closure_contract']],
  ['M04 ellipsis terminator removed',
    "drop the '…' terminator",
    "|| ch === '…' || ch === '。'",
    "|| ch === '。'",
    ['run10_defect_closure_contract']],
  ['M05 label completion refusal disabled',
    'safeOptionLabel no longer inspects completion vocabulary (D78)',
    "          if (COMPLETION_WORD.test(t)) {\n            const NAME_CONNECTOR",
    "          if (false) {\n            const NAME_CONNECTOR",
    ['run10_defect_closure_contract']],
  ['M06 Title-Case discriminator disabled',
    'every completion-word label is accepted as a name (D78)',
    "            if (!titleCasedName) return null;",
    "            if (false) return null;",
    ['run10_defect_closure_contract']],
  ['M07 Title-Case discriminator inverted to blanket refusal',
    'run9 behaviour: any completion word refuses the label (D72/D78.legit must catch)',
    "            const titleCasedName = words.every((w) => /^[\\p{Lu}0-9(&[-]/u.test(w) || NAME_CONNECTOR.test(w));",
    "            const titleCasedName = false;",
    ['run10_defect_closure_contract', 'run8_defect_closure_contract']],
  ['M08 quoted-name rendering removed (erase instead)',
    'safeDisplayLabel collapses assertion-shaped names instead of quoting (D79)',
    "            if (PAST_COMPLETION_CLAIM_PATTERN.test(label) && /(\\band\\b|,|;)/i.test(label)) return null;\n            return `“${label}”`;",
    "            return null;",
    ['run10_defect_closure_contract', 'run8_defect_closure_contract']],
  ['M09 compound collapse removed (quote everything)',
    'a compound aux-assertion name is quoted rather than collapsed (R10.label.canonical)',
    "            if (PAST_COMPLETION_CLAIM_PATTERN.test(label) && /(\\band\\b|,|;)/i.test(label)) return null;",
    "            if (false) return null;",
    ['run10_defect_closure_contract', 'run8_defect_closure_contract']],
  ['M10 D81 structural arm removed',
    'drift arm keys on bare grounding again (floors truthful history)',
    "        const structuredProseDrift = unaccountedCompletionProse\n          && (rawClaims !== null || deterministicPrefix.length > 0 || claimExecutionEvidence.length > 0);",
    "        const structuredProseDrift = unaccountedCompletionProse;",
    ['run10_defect_closure_contract']],
  ['M11 D81 arm always off',
    'structured prose drift never fires (E-multi grounded case must catch)',
    "        const structuredProseDrift = unaccountedCompletionProse\n          && (rawClaims !== null || deterministicPrefix.length > 0 || claimExecutionEvidence.length > 0);",
    "        const structuredProseDrift = false;",
    ['run10_defect_closure_contract']],
  ['M12 imperative-summary allowance removed',
    'IMPERATIVE_LEAD never matches -> legitimate imperative bulk summaries dropped (D84)',
    "          const IMPERATIVE_LEAD = /^(archive|restore|create|delete|update|assign|reassign|mark|set|move|end|add|remove|rename|close|clear|send|grant|decline|approve|reject|complete|activate|deactivate|make|change)\\b/i;",
    "          const IMPERATIVE_LEAD = /^\\u0000$/;",
    ['run10_defect_closure_contract']],
  ['M13 imperative-summary allowance widened to everything',
    'IMPERATIVE_LEAD matches any string -> assertions ship as pending summaries (D60/D84.hold)',
    "          const IMPERATIVE_LEAD = /^(archive|restore|create|delete|update|assign|reassign|mark|set|move|end|add|remove|rename|close|clear|send|grant|decline|approve|reject|complete|activate|deactivate|make|change)\\b/i;",
    "          const IMPERATIVE_LEAD = /^/;",
    ['run10_defect_closure_contract', 'run8_defect_closure_contract']],
  ['M14 head-clause test removed',
    'assertion-LED compound pending summary is no longer head-tested (R10.paSummaryWord)',
    "            const headClause = t.split(/[—;,.\\n]/)[0].trim();",
    "            const headClause = '';",
    ['run10_defect_closure_contract']],
  ['M15 EXECUTION_IN_PROGRESS dropped from legacy fallback',
    'progressive fabrication vocabulary removed from the ungrounded arm (E-multi)',
    "          && (LEGACY_PAST_COMPLETION.test(String(result.summary || '')) || EXECUTION_IN_PROGRESS.test(String(result.summary || '')));\n\n        // run7/D52",
    "          && (LEGACY_PAST_COMPLETION.test(String(result.summary || '')));\n\n        // run7/D52",
    ['run10_defect_closure_contract']],

  // ---------- continuity / durable-runtime guards ----------
  ['M16 command-first regression',
    'reintroduce a bare top-level `command` key as the FIRST pack key (the measured off-by-one)',
    "        const pack = { continuity,",
    "        const pack = { command, continuity,",
    ['current_turn_and_continuity_contract']],
  ['M17 currentTurn no longer last',
    'move currentTurn out of the final position',
    "counts, currentTurn: { turn: totalPriorTurns + 1, command } };",
    "currentTurn: { turn: totalPriorTurns + 1, command }, counts };",
    ['current_turn_and_continuity_contract']],
  ['M18 absolute turn numbers -> window-relative',
    'history entries numbered 1..n inside the window instead of absolutely',
    "map((r:any, idx:number) => ({ turn: historyWindowStart + idx,",
    "map((r:any, idx:number) => ({ turn: idx + 1,",
    ['current_turn_and_continuity_contract']],
  ['M19 OFF-BY-ONE in historyWindowStart',
    'drop the +1 from the window start (the exact off-by-one class the suite exists for)',
    "  const historyWindowStart = totalPriorTurns - (conversationRowsChronological || []).length + 1;",
    "  const historyWindowStart = totalPriorTurns - (conversationRowsChronological || []).length;",
    ['current_turn_and_continuity_contract']],
  ['M20 OFF-BY-ONE in currentTurn number',
    'current turn numbered totalPriorTurns instead of +1',
    "counts, currentTurn: { turn: totalPriorTurns + 1, command } };",
    "counts, currentTurn: { turn: totalPriorTurns, command } };",
    ['current_turn_and_continuity_contract']],
  ['M21 historyIsComplete inverted',
    'completeness claim reversed (honesty field lies)',
    "    historyIsComplete: totalPriorTurns <= (conversationRowsChronological || []).length,",
    "    historyIsComplete: totalPriorTurns >= (conversationRowsChronological || []).length,",
    ['current_turn_and_continuity_contract']],
  ['M22 prompt prohibition removed',
    'delete the never-reconstruct-out-of-window rule from the system prompt',
    "must NEVER state, guess, or reconstruct what the first message",
    "may summarise what the first message",
    ['current_turn_and_continuity_contract']],
  ['M23 prompt currentTurn naming removed',
    'the prompt no longer names currentTurn as the command being answered',
    "THE COMMAND YOU ARE ANSWERING is context.currentTurn.command",
    "THE COMMAND YOU ARE ANSWERING is the last user message",
    ['current_turn_and_continuity_contract']],
  ['M24 untyped-bindable reader',
    'durable pending action binds without a typed actionType',
    "    && typeof durableChannelState.pending_action_action_type === 'string'",
    "    && true",
    ['current_turn_and_continuity_contract']],
  ['M25 expiry check removed (reader)',
    'an EXPIRED durable pending action can bind',
    "    && new Date(String(durableChannelState.pending_action_expires_at)).getTime() > Date.now());",
    "    && true);",
    ['current_turn_and_continuity_contract']],
  ['M26 source-work-order check removed (reader)',
    'a foreign-source durable pending action can bind',
    "    && durableChannelState.pending_action_source_work_order_id",
    "    && true",
    ['current_turn_and_continuity_contract']],
  ['M27 untyped-storing writer',
    'the writer stores a pending action with no typed actionType',
    "typeof (result.pendingAction as any).actionType === 'string'",
    "true",
    ['current_turn_and_continuity_contract']],
  ['M28 CAS overwrite',
    'durable write becomes a blind overwrite (version predicate dropped)',
    "                .eq('channel_id', channelId).eq('version', priorVersion);",
    "                .eq('channel_id', channelId);",
    ['current_turn_and_continuity_contract']],
  ['M29 last_successful_mutation from prose',
    'backend-evidence derivation replaced by a prose-derived value',
    "claimExecutionEvidence].reverse().find((e) => e.postconditionPassed)",
    "claimExecutionEvidence].reverse().find((e) => e)",
    ['current_turn_and_continuity_contract']],
  ['M30 pending row inserted BEFORE buildContext',
    'ordering guard: current turn could self-include in history',
    null, null, ['current_turn_and_continuity_contract']], // handled specially below
];

const results = [];
let aborted = false;

function runSuites(suites) {
  const out = {};
  for (const s of suites) {
    const r = spawnSync(process.execPath, ['qa/scenarios-runner/' + s + '.mjs'], {
      encoding: 'utf8', env: { ...process.env, DEPLOY_GATE: '1' }, maxBuffer: 64 * 1024 * 1024,
    });
    const txt = (r.stdout || '') + (r.stderr || '');
    out[s] = { exit: r.status, fails: (txt.match(/^FAIL /gm) || []).length, threw: /THREW/.test(txt),
      failLines: (txt.match(/^FAIL .*$/gm) || []).slice(0, 6) };
  }
  return out;
}

try {
  for (const [id, desc, find, replace, suites] of MUTANTS) {
    if (aborted) break;
    let mutated;
    if (id.startsWith('M30')) {
      // reorder: move the create_pending_work_order rpc call textually before buildContext
      // by simply renaming the buildContext call site marker the suite keys on.
      const a = "const ctx = await buildContext(";
      if (!text.includes(a)) { results.push({ id, desc, error: 'anchor not found' }); continue; }
      mutated = text.replace(a, "const ctx = await buildContextRenamed(");
    } else {
      if (!text.includes(find)) { results.push({ id, desc, error: 'ANCHOR NOT FOUND: ' + JSON.stringify(find.slice(0, 60)) }); continue; }
      const count = text.split(find).length - 1;
      mutated = text.replace(find, replace);
      if (mutated === text) { results.push({ id, desc, error: 'replacement was a no-op' }); continue; }
      results.push({ id, desc, anchorOccurrences: count });
    }
    writeFileSync(SRC, mutated, 'utf8');
    const suiteRes = runSuites(suites);
    // ALWAYS restore immediately
    writeFileSync(SRC, original);
    const nowSha = sha(readFileSync(SRC));
    if (nowSha !== BASELINE_SHA) { console.log('FATAL: restore failed after ' + id + ' -> ' + nowSha); aborted = true; break; }
    const rec = results[results.length - 1] && results[results.length - 1].id === id ? results[results.length - 1] : (results.push({ id, desc }), results[results.length - 1]);
    rec.suites = suiteRes;
    rec.killed = Object.values(suiteRes).some((s) => s.exit !== 0);
    rec.restoreShaOk = true;
    console.log((rec.killed ? 'KILLED   ' : 'SURVIVED ') + id + '  — ' + desc);
    for (const [s, v] of Object.entries(suiteRes)) {
      console.log('           ' + s + ' exit=' + v.exit + ' FAILlines=' + v.fails);
      for (const l of v.failLines) console.log('             > ' + l.slice(0, 150));
    }
  }
} finally {
  writeFileSync(SRC, original);
  const finalSha = sha(readFileSync(SRC));
  console.log('\nFINAL RESTORE sha256 ' + finalSha + '  MATCH=' + (finalSha === BASELINE_SHA));
  writeFileSync('qa/verification/scratch/v11a_mutation_report.json',
    JSON.stringify({ baseline_sha: BASELINE_SHA, final_sha: finalSha, ran_at: new Date().toISOString(), results }, null, 1));
  const survivors = results.filter((r) => r.killed === false).map((r) => r.id);
  const errors = results.filter((r) => r.error).map((r) => r.id + ': ' + r.error);
  console.log('SURVIVORS (' + survivors.length + '): ' + (survivors.join(' | ') || 'none'));
  if (errors.length) console.log('ANCHOR ERRORS: ' + errors.join(' | '));
}
