#!/usr/bin/env node
// DUPLICATED-CONCEPT RATCHET — founder directive 2026-09-08 §6.
//
//   ONE BUSINESS/GRAMMAR CONCEPT -> ONE CANONICAL DEFINITION -> MULTIPLE CONSUMERS
//   "If two lists define the same concept: converge them, or document why they intentionally differ."
//
// Four twins were found by hand, one per round, and each cost a P1 — most recently a confirmation list that
// executed mutations the receipt layer never saw. Finding the fifth by hand is not a plan, so this scans
// every named alternation in the Edge function and measures vocabulary overlap between each pair.
//
// WHAT THIS SUITE DOES, PRECISELY. High overlap is not proof of duplication: COMPLETION_WORD and
// MUTATION_VERB_ALWAYS share "archived" and always will, because one describes a REPLY and the other a
// REQUEST. So this is a RATCHET, not a verdict. The pairs that overlap heavily today are listed below as
// REGISTERED DEBT with the decision still owed; the suite fails when a NEW heavy overlap appears that nobody
// has decided about. Convergence work then removes entries from the list, and it can never grow silently.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n');

let pass = 0; const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
};

const defs = new Map();
function addTerms(name, body) {
  const terms = new Set(
    body.split(/[|,]/)
      .map((t) => t.replace(/\\[bsSwWdD]|\(\?[:!=<][^)]*\)|[()[\]{}^$*+?.\\/'"`]|\s+$|^\s+/g, '').trim().toLowerCase())
      .filter((t) => t.length >= 3 && /^[a-zЀ-ӿ][a-zЀ-ӿ' -]*$/.test(t)),
  );
  if (terms.size >= 5) defs.set(name, terms);
}
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*\/((?:[^/\\\n]|\\.)+)\/[a-z]*/g)) addTerms(m[1], m[2]);
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*"([^"]{40,})"/g)) addTerms(m[1], m[2]);
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*\[([^\]]{40,})\]/g)) addTerms(m[1], m[2].replace(/['"]/g, ''));
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*("(?:[^"]*)"(?:\s*\n?\s*\+\s*"(?:[^"]*)")+)/g)) {
  addTerms(m[1], m[2].replace(/"\s*\n?\s*\+\s*"/g, '').replace(/"/g, ''));
}

// EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE (founder directive §4): a scan that found nothing has not passed.
check('the scan found the named alternations it exists to compare', defs.size >= 30,
  'found ' + defs.size + ' — if the source shape changed, fix this scan; do not let it report green on nothing');
if (defs.size < 30) { console.log('\nconcept_duplication_ratchet_contract: ' + pass + ' passed, ' + failures.length + ' failed'); process.exit(1); }

const jaccard = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i); };
const THRESHOLD = 0.60;
const heavy = [];
const names = [...defs.keys()].sort();
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const score = jaccard(defs.get(names[i]), defs.get(names[j]));
    if (score >= THRESHOLD) heavy.push({ pair: names[i] + ' <-> ' + names[j], score });
  }
}

// REGISTERED DEBT, 2026-09-08. Each of these is a real duplicated concept awaiting a decision; none is
// approved as "intentionally different" yet. They are recorded so the ratchet can fail on anything NEW.
//
//   the completion vocabulary — seven lists describing "words that claim something was done", spread across
//     the belt's tiers: COMPLETION_WORD, COMPLETION_PARTICIPLE, COMPLETION_VERB, CONFIRMED_COMPLETION,
//     LEGACY_PAST_COMPLETION, PAST_COMPLETION_CLAIM_PATTERN, FIRST_PERSON_MAIN_CLAUSE_COMPLETION
//   the future-promise pair — FUTURE_PROMISE_IN_QUESTION and FUTURE_PROMISE_PATTERN, 100% identical
//   the mutation-field pair — MUTATION_ARRAY_FIELDS and OTHER_MUTATION_FIELDS, 91%
const REGISTERED = new Set([
  'FUTURE_PROMISE_IN_QUESTION <-> FUTURE_PROMISE_PATTERN',
  'LEGACY_PAST_COMPLETION <-> PAST_COMPLETION_CLAIM_PATTERN',
  'COMPLETION_PARTICIPLE <-> COMPLETION_WORD',
  'MUTATION_ARRAY_FIELDS <-> OTHER_MUTATION_FIELDS',
  'COMPLETION_PARTICIPLE <-> CONFIRMED_COMPLETION',
  'COMPLETION_WORD <-> CONFIRMED_COMPLETION',
  'COMPLETION_WORD <-> LEGACY_PAST_COMPLETION',
  'COMPLETION_WORD <-> PAST_COMPLETION_CLAIM_PATTERN',
  'COMPLETION_PARTICIPLE <-> COMPLETION_VERB',
  'COMPLETION_PARTICIPLE <-> LEGACY_PAST_COMPLETION',
  'COMPLETION_PARTICIPLE <-> PAST_COMPLETION_CLAIM_PATTERN',
  'CONFIRMED_COMPLETION <-> LEGACY_PAST_COMPLETION',
  'CONFIRMED_COMPLETION <-> PAST_COMPLETION_CLAIM_PATTERN',
  'COMPLETION_VERB <-> COMPLETION_WORD',
  'COMPLETION_VERB <-> CONFIRMED_COMPLETION',
  'COMPLETION_VERB <-> LEGACY_PAST_COMPLETION',
  'COMPLETION_VERB <-> PAST_COMPLETION_CLAIM_PATTERN',
  'COMPLETION_VERB <-> FIRST_PERSON_MAIN_CLAUSE_COMPLETION',
  'COMPLETION_PARTICIPLE <-> FIRST_PERSON_MAIN_CLAUSE_COMPLETION',
  'COMPLETION_WORD <-> FIRST_PERSON_MAIN_CLAUSE_COMPLETION',
  'CONFIRMED_COMPLETION <-> FIRST_PERSON_MAIN_CLAUSE_COMPLETION',
  'FIRST_PERSON_MAIN_CLAUSE_COMPLETION <-> LEGACY_PAST_COMPLETION',
  'FIRST_PERSON_MAIN_CLAUSE_COMPLETION <-> PAST_COMPLETION_CLAIM_PATTERN',
]);

const unregistered = heavy.filter((h) => !REGISTERED.has(h.pair));
for (const h of heavy) {
  console.log(`     ${(h.score * 100).toFixed(0).padStart(3)}%  ${h.pair}${REGISTERED.has(h.pair) ? '  [registered debt]' : '  << NEW'}`);
}
check('no NEW pair of alternations duplicates a concept without a decision',
  unregistered.length === 0,
  'undecided duplicates at >=' + (THRESHOLD * 100) + '% vocabulary overlap: '
  + unregistered.map((h) => h.pair + ' (' + (h.score * 100).toFixed(0) + '%)').join('; ')
  + ' — converge them, or add them to REGISTERED with the reason they intentionally differ');

// The three canonical definitions that convergence has already produced must stay single.
// Each canonical definition this campaign has converged onto. A concept that gets converged and is NOT
// added here is unguarded, which is exactly what happened to ENTITY_NOUN_ALTERNATION: #67 converged seven
// spellings onto it, nobody registered it, and #68 found an EIGHTH surviving in STRONG_OBJECT while all 76
// suites stayed green (V68-D3). Adding a name here is part of converging a concept, not a follow-up.
for (const name of ['REQUEST_FRAME_ALTERNATION', 'CONFIRMATION_ALTERNATION', 'MUTATION_VERB_ALTERNATION',
  'ENTITY_NOUN_ALTERNATION', 'REQUEST_FRAME_ADDRESSED', 'REQUEST_FRAME_DELIBERATIVE']) {
  check('the canonical ' + name + ' is declared exactly once',
    (src.match(new RegExp('const ' + name + '\\s*=', 'g')) || []).length === 1,
    'a second declaration is the twin growing back');
}
check('the converged consumers still derive from the canonical definitions, not from copies',
  /const IMPERATIVE_HEAD_RE = new RegExp\([^\n]*REQUEST_FRAME_ALTERNATION/.test(src)
  && /const REQUEST_FRAME_PREFIX = new RegExp\([^\n]*REQUEST_FRAME_ALTERNATION/.test(src)
  && /const isShortAffirmative = new RegExp\([^\n]*CONFIRMATION_ALTERNATION/.test(src)
  && /const CONFIRMATION_COMMAND = new RegExp\([^\n]*CONFIRMATION_ALTERNATION/.test(src)
  && /const MUTATION_IMPERATIVE_VERB = new RegExp\([^\n]*MUTATION_VERB_ALTERNATION/.test(src)
  && /const FIRST_CLAUSE_VERB = new RegExp\([^\n]*MUTATION_VERB_ALTERNATION/.test(src));

console.log(`\nconcept_duplication_ratchet_contract: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }
