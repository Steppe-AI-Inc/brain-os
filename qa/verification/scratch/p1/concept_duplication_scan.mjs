// DUPLICATED-CONCEPT SCAN — founder directive 2026-09-08 §6.
//
// "If two lists define the same concept: converge them or document why they intentionally differ."
//
// Four twins have now been found by hand, one per round, and each cost a P1: the request frames
// (IMPERATIVE_HEAD_RE / REQUEST_FRAME_PREFIX / POLITE_REQUEST), the confirmation lists
// (isShortAffirmative / CONFIRMATION_COMMAND — which was executing mutations the receipt never saw), the
// mutation-verb heads (FIRST_CLAUSE_VERB / MUTATION_IMPERATIVE_VERB), and the company-status gates. Finding
// the fifth by hand is not a plan.
//
// This scans every named alternation in the Edge function — regex constants and string arrays — and reports
// pairs whose VOCABULARY overlaps beyond a threshold. High overlap is not proof of duplication; it is where
// a human has to decide "converge" or "document why they differ". The output is a worklist, not a verdict.
import { readFileSync } from 'node:fs';

const SRC = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const src = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n');

// Named regex constants and named string-array constants, with their alternation terms.
const defs = new Map();
function addTerms(name, body) {
  const terms = new Set(
    body.split(/[|,]/)
      .map((t) => t.replace(/\\[bsSwWdD]|\(\?[:!=<][^)]*\)|[()[\]{}^$*+?.\\\/'"`]|\s+$|^\s+/g, '').trim().toLowerCase())
      .filter((t) => t.length >= 3 && /^[a-zЀ-ӿ][a-zЀ-ӿ' -]*$/.test(t)),
  );
  if (terms.size >= 5) defs.set(name, terms);
}
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*\/((?:[^/\\\n]|\\.)+)\/[a-z]*/g)) addTerms(m[1], m[2]);
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*"([^"]{40,})"/g)) addTerms(m[1], m[2]);
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*\[([^\]]{40,})\]/g)) addTerms(m[1], m[2].replace(/['"]/g, ''));
// Multi-line string concatenations (the canonical alternations are written this way).
for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]{3,})\s*=\s*("(?:[^"]*)"(?:\s*\n?\s*\+\s*"(?:[^"]*)")+)/g)) {
  addTerms(m[1], m[2].replace(/"\s*\n?\s*\+\s*"/g, '').replace(/"/g, ''));
}

const names = [...defs.keys()].sort();
console.log(`scanned ${names.length} named alternations in ${SRC}\n`);

const jaccard = (a, b) => {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

const pairs = [];
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = defs.get(names[i]); const b = defs.get(names[j]);
    const score = jaccard(a, b);
    if (score >= 0.15) {
      const shared = [...a].filter((t) => b.has(t));
      pairs.push([score, names[i], names[j], a.size, b.size, shared]);
    }
  }
}
pairs.sort((x, y) => y[0] - x[0]);

if (pairs.length === 0) {
  console.log('no pair of named alternations overlaps beyond 15% — no duplicated-concept candidates');
} else {
  console.log('CANDIDATE DUPLICATED CONCEPTS (converge, or document why they intentionally differ):\n');
  for (const [score, a, b, sa, sb, shared] of pairs) {
    console.log(`  ${(score * 100).toFixed(0).padStart(3)}%  ${a} (${sa}) <-> ${b} (${sb})`);
    console.log(`        shared: ${shared.slice(0, 12).join(', ')}${shared.length > 12 ? ` … +${shared.length - 12}` : ''}`);
  }
}
console.log(`\n${pairs.length} candidate pair(s). Overlap is where a decision is required, never the decision itself.`);
