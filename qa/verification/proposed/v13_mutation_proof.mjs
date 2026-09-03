#!/usr/bin/env node
// v13 MUTATION PROOF
// Every guard added for verifier #13's defects is deliberately broken here, one at a
// time, against a COPY of index.ts. A guard that no case can observe is a vacuous
// guard — this project has shipped that class ten times — so a mutation that does not
// flip its own case to FAIL is reported as UNPROVEN, not quietly tolerated.
//
// Run: node qa/verification/proposed/v13_mutation_proof.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const SRC = join(REPO, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SUITE = join(HERE, 'v13_regression_additions.mjs');
const original = readFileSync(SRC, 'utf8');
const workdir = mkdtempSync(join(tmpdir(), 'v13mut-'));

// Each mutation names the guard it disables and the case IDs that MUST flip to FAIL.
// `find` is a RegExp, not a literal: the working tree is CRLF, so every literal
// multi-line anchor silently matches nothing (this harness's own first run lost three
// mutations to exactly that). It must match exactly once, or the mutation is reported
// as a STALE ANCHOR — a no-op mutation is indistinguishable from a working guard.
const MUTATIONS = [
  {
    name: 'drift gate loses the "Confirmed — <completion>" arm',
    find: /\|\| CONFIRMED_COMPLETION\.test\(s\)\r?\n(\s*)\|\| REFERENCELESS_CONFIRMATION\.test\(s\);/,
    replace: '$1|| REFERENCELESS_CONFIRMATION.test(s);',
    expectFail: ['D100.replay'],
  },
  {
    name: 'drift gate loses the referenceless-confirmation arm',
    find: /\r?\n\s*\|\| REFERENCELESS_CONFIRMATION\.test\(s\);/,
    replace: ';',
    expectFail: ['D103.falseConfirmation'],
  },
  {
    name: 'legacyProseFallback reverts to its own private pattern list (the arm-drift bug itself)',
    find: /&& !claimsFutureActionWithNoPlan\r?\n(\s*)&& readsAsCompletion\(String\(result\.summary \|\| ''\)\);/,
    replace: "&& !claimsFutureActionWithNoPlan\n$1&& (LEGACY_PAST_COMPLETION.test(String(result.summary || '')) || EXECUTION_IN_PROGRESS.test(String(result.summary || '')));",
    expectFail: ['D100.replay', 'D103.falseConfirmation'],
  },
  {
    name: 'REFERENCELESS_CONFIRMATION loses its end-anchor (would swallow substantive confirmations)',
    find: /\(\\s\*\\\(option\\s\+\\d\+\\\)\)\?\\s\*\[\.!\]\?\\s\*\$\/i;/,
    replace: '(\\s*\\(option\\s+\\d+\\))?/i;',
    expectFail: [],
    expectHoldFail: true, // must break a CONTRACT case, not a DEFECT case
  },
  {
    name: 'matchDisambiguationOption loses the raw-label collision fallback',
    find: /const exact = options\.filter\(\(o\) => usable\(o\) && o\.label\.trim\(\)\.length > 0/,
    replace: 'const exact = [].filter((o) => usable(o) && o.label.trim().length > 0',
    expectFail: ['D102.apostrophePair'],
  },
  {
    name: 'safeQuestionFragment loses the interrogative-lead belt (FIX-3b)',
    find: /if \(COMPLETION_WORD\.test\(q\) && !INTERROGATIVE_LEAD\.test\(q\)\) return null;/,
    replace: 'if (COMPLETION_WORD.test(q)) return null;',
    expectFail: [],
    expectHoldFail: true, // over-broad: drops legitimate clarifications (run12/D92 holds)
  },
  {
    name: 'option label loses corroboration against the canonical read (D100)',
    find: /!COMPLETION_WORD\.test\(safeLabel\) \|\| bare\(safeLabel\) === bare\(derivedLabel\)/,
    replace: '!COMPLETION_WORD.test(safeLabel) || true',
    expectFail: ['D100.restored.0', 'D100.closed.1'],
  },
];

const runSuite = (srcPath) => {
  try {
    return execFileSync(process.execPath, [SUITE], {
      env: { ...process.env, SEM_INDEX_SRC: srcPath },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return String(e.stdout || '') + String(e.stderr || '');
  }
};

const failedIds = (out) => new Set(
  out.split(/\r?\n/).filter((l) => /^FAIL\s/.test(l)).map((l) => l.split(/\s+/)[1]));
const holdFailed = (out) => [...failedIds(out)].filter((id) => /\.hold\./.test(id) || /^V\d+\./.test(id));

// Baseline: the unmutated source must have ZERO failures, or nothing below means anything.
const base = runSuite(SRC);
const baseFails = failedIds(base);
if (baseFails.size > 0) {
  console.log('BASELINE NOT CLEAN — mutation proof is meaningless until these pass:');
  console.log([...baseFails].join(', '));
  process.exit(1);
}
console.log('baseline: 0 failures on unmutated source\n');

let unproven = 0;
for (const m of MUTATIONS) {
  const hits = (original.match(new RegExp(m.find.source, m.find.flags.includes('g') ? m.find.flags : m.find.flags + 'g')) || []).length;
  if (hits !== 1) {
    console.log(`STALE ANCHOR  ${m.name}\n              anchor found ${hits}x, expected exactly 1 — mutation not applied`);
    unproven++;
    continue;
  }
  const mutPath = join(workdir, `index.${MUTATIONS.indexOf(m)}.ts`);
  writeFileSync(mutPath, original.replace(m.find, m.replace), 'utf8');
  const out = runSuite(mutPath);
  const got = failedIds(out);
  const missing = m.expectFail.filter((id) => !got.has(id));
  const holds = holdFailed(out);

  if (m.expectHoldFail) {
    if (holds.length === 0) {
      console.log(`UNPROVEN      ${m.name}\n              expected a CONTRACT/hold case to break; none did`);
      unproven++;
    } else {
      console.log(`PROVEN        ${m.name}\n              breaks contract case(s): ${holds.join(', ')}`);
    }
    continue;
  }
  if (missing.length > 0) {
    console.log(`UNPROVEN      ${m.name}\n              expected FAIL for ${missing.join(', ')} — did not reproduce (guard is unobserved)`);
    unproven++;
  } else {
    console.log(`PROVEN        ${m.name}\n              breaks: ${m.expectFail.join(', ')}`);
  }
}

console.log(`\nv13_mutation_proof: ${MUTATIONS.length - unproven}/${MUTATIONS.length} guards proven observable, ${unproven} unproven`);
process.exit(unproven === 0 ? 0 : 1);
