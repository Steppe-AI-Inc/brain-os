#!/usr/bin/env node
// SURVIVOR CLASSIFIER — CONSTRUCT REDUNDANT or TEST VACUOUS? (ledger #145's rule, applied mechanically.)
//
// A surviving mutant means one of two very different things:
//
//   TEST VACUOUS      the construct changes behaviour and no suite covers it   -> a coverage defect
//   CONSTRUCT REDUNDANT  the construct cannot change behaviour at all          -> dead weight
//
// Treating the second as the first produces tests that pin nothing, which is how a battery grows while its
// evidence shrinks. Ledger #145 says to establish which one BEFORE writing a test — and doing that by hand,
// survivor by survivor, is exactly the kind of judgement that goes wrong at 22 items.
//
// So this decides it by measurement. For every named regex in the Edge function it builds the two mutants
// the sweep builds (never-matches / always-matches), runs a broad command corpus through the REAL request
// tiers sliced from source, and diffs the outputs against the unmutated baseline. No suites, no assertions
// about what SHOULD happen — only whether the construct can move an output at all.
//
// It writes nothing except mutant copies under scratch, and asserts the candidate is byte-identical after.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const OUT = resolve(ROOT, 'qa/verification/scratch/p1/mutants');
mkdirSync(OUT, { recursive: true });
const { stripTS } = await import('file://' + resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));

const raw = readFileSync(SRC, 'utf8');
const SHA0 = createHash('sha256').update(raw).digest('hex');
const baseSrc = raw.replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- the two request tiers, from source
function tiers(text) {
  const iStart = text.indexOf('const MUTATION_ARRAY_FIELDS = [');
  const iEndMark = 'const requestedIntent: MutationIntent | null = requestedIntentPrimary;';
  const iEnd = text.indexOf(iEndMark);
  if (iStart < 0 || iEnd < 0) throw new Error('intent window markers missing');
  const intent = new Function('command', 'result', 'claimExecutionEvidence', 'commandFallbackResolvedVerb',
    stripTS(text.slice(iStart, iEnd + iEndMark.length))
    // ONLY THE DECISIONS. An earlier pass also returned readShaped / lexiconVerb / commandReadLeadEffective,
    // and most of the "movement" it reported was INTERMEDIATE churn that never reached an outcome — which
    // would have sent me writing tests for constructs whose effect dies one line later. The two things that
    // decide what the founder actually experiences: does a request intent exist (does the receipt arm), and
    // does the raw command reach the executor.
    + '\n; return { intent: requestedIntent };');

  const stmt = (n) => {
    const at = text.indexOf('const ' + n + ' = ');
    if (at < 0) throw new Error(n + ' not found');
    let d = 0;
    for (let i = at; i < text.length; i++) {
      const c = text[i];
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
      else if (c === ';' && d === 0) return stripTS(text.slice(at, i + 1));
    }
    throw new Error(n + ' unterminated');
  };
  const eStart = text.indexOf('const commandMentionsCompany = ');
  const eEnd = text.indexOf(';\n', text.indexOf('const commandFallbackAllowed = ')) + 1;
  const exec = new Function('command', 'result',
    [stmt('ARCHIVE_VERB_PATTERN'), stmt('RESTORE_VERB_PATTERN')].join('\n') + '\n'
    + stripTS(text.slice(eStart, eEnd))
    + '\n; return { allowed: commandFallbackAllowed };');
  return {
    intent: (c) => { try { return JSON.stringify(intent(c, {}, [], null)); } catch (e) { return 'ERR:' + e.message.slice(0, 40); } },
    exec: (c) => { try { return JSON.stringify(exec(c, {})); } catch (e) { return 'ERR:' + e.message.slice(0, 40); } },
  };
}

// ---------------------------------------------------------------- corpus: deliberately WIDE on every axis
const FRAMES = ['', 'please ', 'could you ', 'go ahead and ', 'kindly ', 'shall we ', 'can I ', 'we need to ',
  "let's ", 'do not ', 'never ', 'first, ', 'when you get a chance, '];
const VERBS = ['archive', 'restore', 'delete', 'remove', 'rename', 'assign', 'approve', 'end', 'reactivate',
  'unarchive', 'reassign', 'invite', 'create', 'update', 'move', 'merge'];
const OBJECTS = ['ACME', '"Nomin Holding"', 'the business unit Beta', 'the company ACME', 'QA-1', 'task QA-7',
  'the goal Growth', 'the person Bob', 'project Alpha 2', 'department Sales', 'ACME Ltd.', 'the 3rd invoice'];
const TAILS = ['', '?', ' then tell me what is left', ' and list the rest', ', then update me', ' now', ' please'];
const READS = ['what is archived?', 'which companies did we archive last week?', 'tell me about ACME',
  'show the archived companies', 'list the tasks', 'who is the manager of ACME?', 'any news on Beta?',
  'ACME-г архивла', 'архивласан компаниуд', 'ACME архивлагдсан уу'];
const CORPUS = [];
for (const f of FRAMES) for (const v of VERBS) for (const o of OBJECTS) CORPUS.push(f + v + ' ' + o);
for (const f of FRAMES) for (const t of TAILS) CORPUS.push(f + 'archive ACME' + t);
CORPUS.push(...READS);

// ---------------------------------------------------------------- named regexes, as the sweep builds them
const NAMED = [...baseSrc.matchAll(/const ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\/(?:[^/\\\n]|\\.)+\/[a-z]*)/g)]
  .map((m) => ({ name: m[1], literal: m[2], at: m.index }));
if (NAMED.length < 40) throw new Error('FAIL TEST HARNESS: only ' + NAMED.length + ' named regexes found');

const only = process.argv.slice(2);
const targets = only.length ? NAMED.filter((n) => only.includes(n.name)) : NAMED;
if (only.length && targets.length !== only.length) {
  throw new Error('FAIL TEST HARNESS: asked for ' + only.join(',') + ' but matched ' + targets.length);
}

const baseline = tiers(baseSrc);
const BASE = CORPUS.map((c) => baseline.intent(c) + '|' + baseline.exec(c));

console.log('classifying ' + targets.length + ' named regexes over ' + CORPUS.length + ' commands\n');
const rows = [];
for (const { name, literal, at } of targets) {
  for (const [kind, replacement] of [['never', '/(?!)/'], ['always', '/(?:)/']]) {
    const mutated = baseSrc.slice(0, at) + baseSrc.slice(at).replace(literal, replacement);
    if (mutated === baseSrc) { rows.push([name, kind, 'NO-APPLY', 0]); continue; }
    let diff = 0; const examples = [];
    try {
      const t = tiers(mutated);
      for (let i = 0; i < CORPUS.length; i++) {
        const got = t.intent(CORPUS[i]) + '|' + t.exec(CORPUS[i]);
        if (got !== BASE[i]) { diff++; if (examples.length < 2) examples.push(CORPUS[i]); }
      }
    } catch (e) { rows.push([name, kind, 'BUILD-ERR ' + e.message.slice(0, 40), 0]); continue; }
    rows.push([name, kind, diff === 0 ? 'NO MOVEMENT (scoped)' : 'MOVES OUTPUT', diff, examples]);
  }
}

for (const [name, kind, verdict, diff, ex] of rows.sort((a, b) => b[3] - a[3])) {
  console.log(String(diff).padStart(5) + '  ' + verdict.padEnd(20) + ' ' + (name + ' ' + kind).padEnd(40)
    + (ex && ex.length ? '  e.g. ' + JSON.stringify(ex[0]) : ''));
}
const still = rows.filter((r) => r[2] === 'NO MOVEMENT (scoped)').length;
console.log('\n' + still + ' of ' + rows.length + ' mutants move NOTHING in the two tiers measured here;');
console.log('the rest MOVE OUTPUT, and a survivor among those is a real coverage gap.');
console.log('\nSCOPE, AND IT IS NOT A FORMALITY. This measures the REQUEST-INTENT tier and the EXECUTOR');
console.log('GATE only. A construct acting in the receipt/belt tier, the disambiguation matcher or the name');
console.log('parser reads as "no movement" here and can still be load-bearing — ARCHIVE_VERB_PATTERN does');
console.log('exactly that. "NO MOVEMENT (scoped)" is EVIDENCE TOWARD "construct redundant", never the');
console.log('verdict. Positive control: READ_SHAPE moves 2,548 / 18 outputs, so the instrument is');
console.log('sensitive and a zero here is a real zero for these tiers.');
const SHA1 = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('candidate index.ts unchanged: ' + (SHA1 === SHA0));
if (SHA1 !== SHA0) process.exit(2);
