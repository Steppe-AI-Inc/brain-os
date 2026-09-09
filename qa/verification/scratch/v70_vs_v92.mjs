// VERIFIER #70 — the same corpus through BOTH the candidate and deployed v92 (git c9dfab5bd433).
// v92 is a REFERENCE CORPUS for measuring truth regressions, never the bar.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() { let d = HERE; for (let i = 0; i < 12; i++) { if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d; const up = dirname(d); if (up === d) break; d = up; } throw new Error('root'); }
const ROOT = repoRoot();

async function buildPipeline(srcPath) {
  process.env.SEM_INDEX_SRC = srcPath;
  // fresh module instance per source: the extractor caches shared constants per module load
  const url = 'file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/') + '?v=' + encodeURIComponent(srcPath);
  const { stripTS, withPatternsAboveWindow } = await import(url);
  const src = readFileSync(srcPath, 'utf8').replace(/\r\n?/g, '\n');
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (start < 0 || anchor < 0) throw new Error('window not found in ' + srcPath);
  const slice = withPatternsAboveWindow(src, stripTS(src.slice(start, src.indexOf('};', anchor) + 2)));
  const hasIntent = slice.includes('requestedIntent');
  const fn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
    'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
    slice + '\n; return { summary: result.summary };');
  const DENO = { env: { get: () => undefined } }; const mk = () => new Map();
  return { hasIntent, run: (command, summary) => {
    globalThis.command = command; globalThis.factLines = []; globalThis.lifecycleReports = [];
    globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo' }; globalThis.knownEntityNames = new Set();
    return String(fn({ claims: null, summary, pendingAction: null, questions: undefined }, [], {}, 'gpt', false, false, DENO, mk(), mk(), mk(), mk(), false, '', mk()).summary);
  } };
}

const CAND = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const V92 = resolve(ROOT, 'qa/verification/scratch/v92_index.ts');
const cand = await buildPipeline(CAND);
const v92 = await buildPipeline(V92);
console.log('candidate window has requestedIntent:', cand.hasIntent, '| v92 window has requestedIntent:', v92.hasIntent);

// ── (1) THE ASYMMETRY: the SAME head phrase, with and without a prepositional phrase.
// The candidate's own definition of a headline REQUIRES a prepositional phrase. If the verdict
// flips when the PP is removed, the definition is internally inconsistent — not a matter of taste.
const HEADS = ['Transfer', 'Order', 'Post', 'Close', 'Issue', 'Charge', 'Share', 'Change', 'Schedule'];
const MODS = ['', 'pricing ', 'status ', 'mortem '];
const NOUNS = ['report', 'status', 'record', 'note', 'document'];
let flips = 0, tot = 0, both = 0;
const examples = [];
for (const h of HEADS) for (const m of MODS) for (const nn of NOUNS) {
  const base = `${h} ${m}${nn}`;
  const answer = `The ${m}${nn} was created in June and has not changed since.`;
  const noPP = cand.run(base, answer) === answer;
  const withPP = cand.run(base + ' for the board', answer) === answer;
  tot++;
  if (noPP !== withPP) { flips++; if (examples.length < 6) examples.push(`"${base}" survives=${noPP}  |  "${base} for the board" survives=${withPP}`); }
  if (!noPP && !withPP) both++;
}
console.log(`\n(1) HEADLINE-VETO ASYMMETRY: ${flips}/${tot} phrases change verdict purely by adding "for the board"`);
for (const e of examples) console.log('    ' + e);

// ── (2) TRUTH REGRESSION vs v92 on the same corpus.
let regress = 0, improve = 0, same = 0; const reg = [];
for (const h of HEADS) for (const m of MODS) for (const nn of NOUNS) for (const pp of ['', ' for the board', ' on the Beta deal']) {
  const cmd = `${h} ${m}${nn}${pp}`;
  const answer = `The ${m}${nn} was created in June and has not changed since.`;
  const c = cand.run(cmd, answer) === answer, v = v92.run(cmd, answer) === answer;
  if (v && !c) { regress++; if (reg.length < 8) reg.push(cmd); }
  else if (!v && c) improve++;
  else same++;
}
console.log(`\n(2) vs v92 on ${regress + improve + same} truthful reads: ${regress} TRUTH REGRESSIONS, ${improve} improvements, ${same} identical`);
for (const r of reg) console.log('    regressed: "' + r + '"');
