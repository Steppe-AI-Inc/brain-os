// v43 INDEPENDENT MUTATION PROOF. Each of the five shipped fixes is reverted one at a time in a
// SCRATCH copy of the source; the belt is rebuilt from the mutant and the shapes that fix exists
// for must RE-OPEN. A mutation that changes nothing is a no-op fix and is reported as such.
import { readSrc, buildBelt, makeV92Fires, CAND_PATH, V92_PATH } from './v43_belt.mjs';
import { CORPUS } from './v43_corpus.mjs';

const SRC = readSrc(CAND_PATH);
const v92 = makeV92Fires(readSrc(V92_PATH));
const base = buildBelt(SRC);

const REASSURANCE = '(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)';

const MUTANTS = [
  { id: 'M1.nameInternal', find: 'const nameInternal = capLead', repl: 'const nameInternal = false && capLead',
    why: 'the name-safe negator scan: a negator that opens a proper NAME governed by an auxiliary is not a negation' },
  { id: 'M2.titleHead', find: 'const titleHead = /^(?:Pending|Awaiting)$/', repl: 'const titleHead = false && /^(?:Pending|Awaiting)$/',
    why: 'clause-initial Pending/Awaiting heading a titled subject is a NAME head, not a negation' },
  { id: 'M3.ppInternal', find: 'const ppInternal = /\\b(?:with|without|since', repl: 'const ppInternal = false && /\\b(?:with|without|since',
    why: 'a negator inside a prepositional phrase modifies something other than the completion' },
  { id: 'M4.reassuranceStrip', findAll: REASSURANCE, repl: '(?:zzzzNEVERMATCHzzzz)',
    why: 'the widened reassurance-idiom strip ("No problem — ACME was archived.")' },
  { id: 'M5.rAuxGap', find: "'(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)", repl: "'zzzzNEVERMATCHzzzz(?<!\\\\b(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)",
    why: 'the R-AUXGAP whole-summary arm (an adverbial interposed between auxiliary and participle)' },
];

let failures = 0;
for (const m of MUTANTS) {
  let mutated;
  if (m.findAll) {
    const n = SRC.split(m.findAll).length - 1;
    if (n === 0) { console.log(`FAIL ${m.id} — anchor not found`); failures++; continue; }
    mutated = SRC.split(m.findAll).join(m.repl);
    console.log(`     ${m.id}: ${n} anchor occurrence(s) neutralised`);
  } else {
    const n = SRC.split(m.find).length - 1;
    if (n !== 1) { console.log(`FAIL ${m.id} — expected 1 anchor, found ${n}`); failures++; continue; }
    mutated = SRC.replace(m.find, m.repl);
  }
  if (mutated === SRC) { console.log(`FAIL ${m.id} — mutation was a no-op`); failures++; continue; }
  let mut;
  try { mut = buildBelt(mutated); } catch (e) { console.log(`FAIL ${m.id} — mutant did not build: ${e.message}`); failures++; continue; }
  const flipped = CORPUS.filter((r) => base(r.text) !== mut(r.text));
  const reopenedFabs = CORPUS.filter((r) => r.direction === 'fabrication' && base(r.text) && !mut(r.text));
  const newTruthLoss = CORPUS.filter((r) => r.direction === 'truthful' && !base(r.text) && mut(r.text));
  const ok = flipped.length > 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${m.id.padEnd(22)} ${flipped.length} corpus rows flip  (fabrications re-opened: ${reopenedFabs.length}; truths newly destroyed: ${newTruthLoss.length})`);
  console.log(`       ${m.why}`);
  for (const r of reopenedFabs.slice(0, 3)) console.log(`       re-opens: [${r.section}/${r.tag}] ${r.text}`);
  for (const r of newTruthLoss.slice(0, 3)) console.log(`       destroys: [${r.section}/${r.tag}] ${r.text}`);
  if (!ok) { console.log(`       LOAD-BEARING? NO — this fix changes no verdict on a 921-row corpus`); failures++; }
}
console.log(`\nv43_mutation_proof: ${MUTANTS.length - failures}/${MUTANTS.length} load-bearing`);
process.exit(failures ? 1 : 0);
