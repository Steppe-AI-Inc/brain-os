// V66-D6 STRUCTURAL FIX — the intent tier consumes the executor's OUTCOME instead of re-deriving its gate.
//
// Verifier #65 converged the request FRAMES. Verifier #66 found the same defect one axis over: "a mutation
// verb heading a clause with a real object" was still spelled TWICE, and the two spellings had drifted.
//
//   EXECUTOR  IMPERATIVE_HEAD_RE + commandReadLeadEffective + lifecycleCommandName
//             (strips the/this/that/our/my AND company | business unit | entity | organization | org)
//   INTENT    FIRST_CLAUSE_VERB + STRONG_OBJECT
//             (whose trailing \b cannot match after a closing quote, and whose noun list
//              has never heard of "business unit")
//
// So `archive "Nomin Holding" then tell me what is left` ARCHIVES THE ROW while requestedIntent is null:
// 448 of 720 on a focused generator, 9,128 of 52,800 at the gate. Both halves of the founder's §3 fail —
// a request the executor detects that the receipt cannot see, and a mutation-intent turn with zero
// execution and no receipt.
//
// WHY NOT JUST ADD "business unit" AND FIX THE \b. That is the local patch the founder's directive rules
// out by name: the same class has now recurred three rounds running, and each time the repair was to make
// two spellings agree. TWO RULES THAT MUST AGREE WILL EVENTUALLY DISAGREE. The structural repair is to
// stop having two: the intent tier asks the executor what it actually DID.
//
// EXECUTED FACT OUTRANKS TEXT SHAPE. That is the founder's own grounding precedence — an execution result
// outranks conversational and lexical signals — applied to the request side. `lexiconReadVetoed` is a
// heuristic about how a sentence LOOKS; a resolved lifecycle target is something that HAPPENED.
import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const before = readFileSync(p, 'utf8');
let s = before.replace(/\r\n/g, '\n');
const edits = [];
function sub(what, from, to) {
  if (s.split(from).length - 1 !== 1) throw new Error(what + ': anchor missing or not unique — re-derive against current source');
  s = s.replace(from, to);
  edits.push(what);
}

// ---------------------------------------------------------------------------------------------
// F2 — the structural repair. Declared immediately after the executor produced its result, so the
// value is a FACT about this turn and not a prediction about it.
// ---------------------------------------------------------------------------------------------
sub('commandFallbackResolved declared from the executor outcome',
  `        const restoreCompanyIds = await resolveCompanyLifecycleTargets('restore', requestedRestoreIds, result.restoreCompanyNames,
          commandFallbackAllowed && headLifecycleAction === 'restore' ? lifecycleCommandName(RESTORE_VERB_PATTERN) : null);
`,
  `        const restoreCompanyIds = await resolveCompanyLifecycleTargets('restore', requestedRestoreIds, result.restoreCompanyNames,
          commandFallbackAllowed && headLifecycleAction === 'restore' ? lifecycleCommandName(RESTORE_VERB_PATTERN) : null);
        // THE EXECUTOR'S OUTCOME IS THE ONE DEFINITION OF "the raw command asked for a lifecycle mutation".
        // The intent tier used to re-derive this from a second spelling of the executor's gate, and the two
        // drifted: the executor strips "business unit" and tolerates a quoted name, the intent tier's
        // STRONG_OBJECT did neither, so a command could archive a real row while requestedIntent stayed null
        // and the model's "Done — archived." shipped as the whole answer (verifier #66, V66-D6).
        // Reading the RESULT instead of re-deriving the RULE makes "the executor acted and the receipt never
        // knew" inexpressible rather than merely tested — the same repair shape as the frames in #65.
        // ONE value crosses the tier boundary, carrying both the fact and its direction, so the intent
        // tier needs nothing else from the executor and cannot start re-deriving pieces of it again.
        const commandFallbackResolvedVerb: string | null =
          (commandFallbackAllowed && !modelEmittedArchive && !modelEmittedRestore)
            ? (archiveCompanyIds.length > 0 ? 'archive' : restoreCompanyIds.length > 0 ? 'restore' : null)
            : null;
`);

sub('the intent tier consumes it, and an executed fact outranks the read heuristic',
  `              : (lexiconVerb !== null && !lexiconReadVetoed)
                ? { verb: lexiconVerb, field: null }
                : null;`,
  `              // A resolved lifecycle target is something that HAPPENED; the read veto is a heuristic about
              // how the sentence LOOKS. Fact outranks shape — the founder's grounding precedence applied to
              // the request side (verifier #66, V66-D6).
              : (lexiconVerb !== null && (!lexiconReadVetoed || commandFallbackResolvedVerb !== null))
                ? { verb: lexiconVerb, field: null }
                : commandFallbackResolvedVerb !== null
                  ? { verb: commandFallbackResolvedVerb, field: null }
                  : null;`);

// ---------------------------------------------------------------------------------------------
// F1 — STRONG_OBJECT still gates readShaped for every command the executor does NOT resolve, and its
// trailing \b is simply wrong: \b needs a word character on one side, so it can never match after a
// closing quote. This is fixing a broken regex, not adding another entry to a list.
// ---------------------------------------------------------------------------------------------
sub('STRONG_OBJECT can match after a closing quote',
  `|assignment|employment)\\b/;`,
  `|assignment|employment)(?![A-Za-z0-9_])/;`);

// ---------------------------------------------------------------------------------------------
// F4 (V66-D7) — AUTHORIZED IS NOT COMPLETED covered only one of the three deterministic modes.
// ---------------------------------------------------------------------------------------------
sub('the authorised-is-not-completed net covers every deterministic mode',
  `        if (model === 'deterministic-confirmation' && !groundedOutcomeThisTurn) {`,
  `        // All three deterministic modes end a turn by AUTHORISING something. Only the confirmation mode
        // was netted, so a clarification or a disambiguation shipped "Confirmed — Delete the ACME purchase
        // approval." with zero execution evidence behind it (verifier #66, V66-D7).
        if ((model === 'deterministic-confirmation' || model === 'deterministic-clarification'
          || model === 'deterministic-disambiguation') && !groundedOutcomeThisTurn) {`);

// ---------------------------------------------------------------------------------------------
// F5 — dead code the verifier proved cannot change any output, in both tiers, over 17 Mongolian cases.
// ---------------------------------------------------------------------------------------------
sub('the dead alwaysCyrillicRaw disjunct is removed',
  `        const alwaysCyrillic = (alwaysCyrillicRaw || mnCandidates.length > 0)`,
  `        // alwaysCyrillicRaw was ORed in here, but the branch it guards resolves from mnCandidates alone:
        // with no candidates the find() yields null either way, so the disjunct could never change an
        // output. Verified in both tiers over 17 Mongolian cases (verifier #66, ruling on m7). Removed
        // rather than whitelisted — a mutant that survives because the code is dead is dead code.
        const alwaysCyrillic = (mnCandidates.length > 0)`);
sub('and its now-unused declaration goes with it',
  `        const alwaysCyrillicRaw = alwaysMatch && typeof alwaysMatch[4] === 'string' && alwaysMatch[4].length > 0 ? alwaysMatch[4] : null;\n`,
  '');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF introduced');
// The NAME survives in the comment that explains why the code is gone; the CODE must not.
if (/const alwaysCyrillicRaw\b/.test(out)) throw new Error('the alwaysCyrillicRaw declaration survived');
if (/alwaysCyrillicRaw\s*\|\|/.test(out)) throw new Error('the alwaysCyrillicRaw disjunct survived');
if (!out.includes('const commandFallbackResolvedVerb')) throw new Error('commandFallbackResolvedVerb was not declared');
// The declaration must precede every read of it, or this is a TDZ crash rather than a fix.
if (out.indexOf('const commandFallbackResolvedVerb') > out.indexOf('|| commandFallbackResolvedVerb !== null)')) {
  throw new Error('commandFallbackResolvedVerb is read before it is declared — TDZ');
}
writeFileSync(p, out);
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
