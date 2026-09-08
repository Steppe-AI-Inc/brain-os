// V65-D4 — bring the v56/v57/v58 mutation proofs under the sweep-safety contract, and repair the anchors
// that later rounds invalidated.
//
// A mutation proof whose FIRST anchor is stale throws before measuring anything. v56 and v57 have been in
// that state: they are listed as evidence, they run to an exception, and nobody noticed because nothing
// re-ran them. That is the QA-harness-truth failure the founder's directive names — a tool the deploy
// decision rests on must fail loudly and must not be able to report a cheerful nothing.
import { readFileSync, writeFileSync } from 'node:fs';

const edits = [];
function patch(file, subs) {
  const p = 'qa/verification/scratch/p1/' + file;
  let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  for (const [what, from, to] of subs) {
    if (s.split(from).length - 1 !== 1) throw new Error(file + ' / ' + what + ': anchor missing or not unique');
    s = s.replace(from, to);
    edits.push(file + ': ' + what);
  }
  writeFileSync(p, s.replace(/\n/g, '\r\n'));
}

// ---- the four safety properties the contract checks for, added to every proof -------------------
const GUARD = (n) => `
// MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE / VACUITY_SWEEP_CANNOT_PASS_EMPTY /
// EXPECTED_MUTATION_TARGETS_FOUND (founder directive 2026-09-08 §4; verifier #65 V65-D4). A proof that
// built no mutants has measured nothing, and "0 killed" must never read as success.
if (MUTANTS.length < ${n}) {
  console.log('FAIL TEST HARNESS: ' + MUTANTS.length + ' mutants built, expected at least ${n}');
  process.exit(2);
}
// The candidate must be byte-identical afterwards: every mutation runs against a COPY handed to the suites
// through SEM_INDEX_SRC, so a changed hash means this tool corrupted the thing it was measuring.
const SHA_BEFORE = createHash('sha256').update(readFileSync(SRC)).digest('hex');
`;
const TAIL = `
const SHA_AFTER = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('candidate index.ts unchanged: ' + (SHA_AFTER === SHA_BEFORE) + '  (' + SHA_AFTER + ')');
if (SHA_AFTER !== SHA_BEFORE) process.exit(2);
`;

// ---- v56 ----------------------------------------------------------------------------------------
patch('v56_mutation_proof.mjs', [
  ['import createHash', `import { spawnSync } from 'node:child_process';`,
    `import { spawnSync } from 'node:child_process';\nimport { createHash } from 'node:crypto';`],
  // POLITE_REQUEST was deleted by the #64/#65 convergence; the CONCEPT survives as the question-suppressing
  // frame derived from the one request-frame definition, so the mutant follows the concept to its new home.
  ['m1 follows POLITE_REQUEST to QUESTION_SUPPRESSING_FRAME',
    "mustReplace(s, ` && !POLITE_REQUEST.test(commandText);`, `;`, 'polite')",
    "mustReplace(s, `          && !QUESTION_SUPPRESSING_FRAME.test(commandLower);`, `;`, 'polite')"],
  ['m3 anchor picks up commandImperativePosition',
    'mustReplace(s, `const commandFallbackAllowed = !modelResolvedOtherTarget && `, `const commandFallbackAllowed = `',
    'mustReplace(s, `const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && `, `const commandFallbackAllowed = commandImperativePosition && `'],
  ['m4 anchor uses commandReadLeadEffective',
    'mustReplace(s, ` && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `',
    'mustReplace(s, ` && !commandIsQuestion && !commandNegatedLead && !commandReadLeadEffective && `'],
  ['safety guards', "const SUITES = [resolve(ROOT,", GUARD(8) + "const SUITES = [resolve(ROOT,"],
  ['byte-identity tail', "console.log(`\\nv56_mutation_proof:", TAIL + "console.log(`\\nv56_mutation_proof:"],
  ['exit shape the contract reads', 'process.exit(killed === MUTANTS.length ? 0 : 1);',
    'if (killed !== MUTANTS.length) process.exit(1);'],
]);

// ---- v57 ----------------------------------------------------------------------------------------
patch('v57_mutation_proof.mjs', [
  ['import createHash', `import { spawnSync } from 'node:child_process';`,
    `import { spawnSync } from 'node:child_process';\nimport { createHash } from 'node:crypto';`],
  // RETIRED, not re-pointed: the #57 fix said the model's "other" intent must not veto the request lexicon,
  // and a later closure went further — ONLY the request may veto it, so `modelIntentKind === 'other'` is
  // gone from the veto entirely. There is no current construct this mutant could revert. Inventing a
  // substitute would be fabricating evidence for a property nobody is testing.
  ['m1 retired (its construct was deliberately removed by a later closure)',
    "  ['m1_other_does_not_veto', (s) => mustReplace(s, `modelIntentKind === 'read' || modelIntentKind === 'other');`, `modelIntentKind === 'read');`, 'F1')],\n",
    ''],
  ['m3 anchor matches the current gate',
    'mustReplace(s, `const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `, `const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && `',
    'mustReplace(s, `const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLeadEffective && `, `const commandFallbackAllowed = commandImperativePosition && !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && `'],
  ['m5 follows the polite-question gate to its derived form',
    "mustReplace(s, `          && !/^\\\\s*(?:would you mind|would you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|could you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|can you (?:please )?(?!tell|explain|summari|describe|list|show|remind)|will you|can we|could we|shall we|please)\\\\b/.test(commandLower);`, `;`, 'D6a')",
    "mustReplace(s, `          && !QUESTION_SUPPRESSING_FRAME.test(commandLower);`, `;`, 'D6a')"],
  ['safety guards', "const SUITES = [", GUARD(4) + "const SUITES = ["],
  ['byte-identity tail', "console.log(`\\nv57_mutation_proof:", TAIL + "console.log(`\\nv57_mutation_proof:"],
  ['exit shape the contract reads', 'process.exit(killed === MUTANTS.length ? 0 : 1);',
    'if (killed !== MUTANTS.length) process.exit(1);'],
]);

// ---- v58 (anchors all live; only the safety properties are missing) -------------------------------
patch('v58_mutation_proof.mjs', [
  ['import createHash', `import { spawnSync } from 'node:child_process';`,
    `import { spawnSync } from 'node:child_process';\nimport { createHash } from 'node:crypto';`],
  ['safety guards', "const SUITES = [", GUARD(5) + "const SUITES = ["],
  ['byte-identity tail', "console.log(`\\nv58_mutation_proof:", TAIL + "console.log(`\\nv58_mutation_proof:"],
  ['exit shape the contract reads', 'process.exit(killed === MUTANTS.length ? 0 : 1);',
    'if (killed !== MUTANTS.length) process.exit(1);'],
]);

// Every proof already reports a mutant whose anchor is gone by THROWING from mustReplace, which is stronger
// than continuing. The contract looks for the phrase, so say it where the throw happens.
for (const f of ['v56_mutation_proof.mjs', 'v57_mutation_proof.mjs', 'v58_mutation_proof.mjs']) {
  const p = 'qa/verification/scratch/p1/' + f;
  let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  s = s.replace("throw new Error('mutant anchor not unique: ' + label)",
    "throw new Error('[MUTATION DID NOT APPLY] mutant anchor not unique: ' + label)");
  s = s.replace("throw new Error('mutant did not change the source: ' + name)",
    "throw new Error('[MUTATION DID NOT APPLY] mutant did not change the source: ' + name)");
  writeFileSync(p, s.replace(/\n/g, '\r\n'));
}
console.log('applied ' + edits.length + ' edits:');
for (const e of edits) console.log('  - ' + e);
