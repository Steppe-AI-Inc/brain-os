// VERIFIER #69 — THE STRUCTURAL QUESTION, ATTACKED.
// For every consumer the concept map says does NOT derive from its canonical definition, find the request
// shape that reaches it and measure what the founder actually receives (product's own final-claim block).
import { turnClaim, NO_CHANGE } from './pipeline.mjs';
import { turn } from './tiers_harness.mjs';
import fs from 'node:fs';

const src = fs.readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8');
const VERBS = src.match(/const MUTATION_VERB_ALTERNATION = "([^"]+)"/)[1].split('|');
const FAB = 'Done — completed.';
const FIX = [{ name: 'ACME', status: 'active' }, { name: 'Beta', status: 'archived' }];
const out = {};

const measure = (label, cmds) => {
  const ships = [];
  for (const c of cmds) {
    const t = turn(c, { fixture: FIX });
    const r = turnClaim({ command: c, summary: FAB });
    const shipped = r.summary === FAB;
    if (shipped) ships.push(c);
  }
  out[label] = { n: cmds.length, shipped: ships.length, examples: ships.slice(0, 12) };
  console.log(label.padEnd(46) + String(ships.length).padStart(4) + ' / ' + String(cmds.length).padStart(4) + ' fabrications shipped');
  return ships;
};

// ---- C1. MN_LOAN_VERB (line 6193, 39 verbs) vs MUTATION_VERB_ALTERNATION (118)
measure('MN loan verb "<verb> хийнэ үү"', VERBS.map((v) => `ACME-г ${v} хийнэ үү`));
measure('MN loan verb "<verb> хий"', VERBS.map((v) => `ACME-г ${v} хий`));

// ---- C2. lastClauseIsMutation inline stem list (line 6064): a READ clause first, mutation clause last
measure('read-first, mutation-last: "list ... and <verb> ACME"', VERBS.map((v) => `list the companies and ${v} ACME`));
measure('read-first, mutation-last: "show me X, then <verb> ACME"', VERBS.map((v) => `show me the report, then ${v} ACME`));

// ---- C3. IMPERATIVE_LEAD (line 5965, 26 verbs) — executor-side lead
measure('bare imperative "<verb> ACME" (control)', VERBS.map((v) => `${v} ACME`));

// ---- C4. negation vocabulary spelled twice (3887 executor vs 7086 receipt), non-leading
const NEG = ['make sure you do not {V} ACME', 'I said do not {V} ACME', 'never, ever {V} ACME', 'ACME: do not {V}',
  'under no circumstances {V} ACME', 'whatever you do, do not {V} ACME'];
measure('non-leading negation shapes', NEG.flatMap((f) => ['archive', 'restore', 'delete', 'promote', 'suspend'].map((v) => f.replace('{V}', v))));

// ---- C5. the modifier boundary, systematically: N modifiers before an entity noun, no determiner
const MODS = ['old', 'stale', 'expired', 'duplicate', 'legacy', 'draft'];
const NOUNS = ['work order WO-1', 'task QA-1', 'purchase approval A-1', 'business unit Beta', 'project Alpha'];
for (const k of [0, 1, 2, 3]) {
  measure(`imperative object with ${k} modifier(s), no determiner`,
    NOUNS.map((n) => `archive ${MODS.slice(0, k).join(' ')}${k ? ' ' : ''}${n}`));
  measure(`imperative object with ${k} modifier(s), determiner`,
    NOUNS.map((n) => `archive the ${MODS.slice(0, k).join(' ')}${k ? ' ' : ''}${n}`));
}

// ---- C6. punctuation directly after the verb
measure('punctuation after the verb', ['Archive: the work order WO-1', 'archive: the task QA-1', 'archive - the work order WO-1',
  'Archive — the purchase approval A-1', 'archive; the task QA-1', 'archive... the work order WO-1', 'Archive: the old work order WO-1']);

fs.writeFileSync('qa/verification/scratch/v69/dup_probe.json', JSON.stringify(out, null, 1));
console.log('\nDETAIL');
for (const [k, v] of Object.entries(out)) if (v.shipped) console.log('  ' + k + ': ' + JSON.stringify(v.examples));
