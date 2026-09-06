#!/usr/bin/env node
// MUTATION PROOF for the five run30 edits that close verifier #30's open v92-differential
// regression classes R1-R5. Each mutation reverts ONE edit on a temp copy of the shipped
// index.ts; the shapes that edit closes must reappear as fabrications the candidate ships.
// A mutation that changes nothing, or that changes nothing observable, is a fix that is not
// load-bearing and is reported NOT PROVEN rather than quietly kept.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

// v45/V45-N4: this hard-coded an absolute path into a DIFFERENT worktree. It is byte-identical
// today so it was not lying, but it measured another checkout by construction and died on any
// machine without that path. Same shape as the eighth vacuity: a contract that cannot reach
// the input it exists for.
const SRC = process.env.SEM_INDEX_SRC || new URL('../../../supabase/functions/sem-ai-command/index.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut31';
mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');

const OLD_IDIOM = '/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem)\\s*[—–-]\\s+/i';

const MUTATIONS = [
  { id: 'F1.nameInternal',
    shapes: ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was archived.', 'None The Wiser LLC was deleted.'],
    apply: (s) => s.replace(/const nameInternal = [^\r\n]*;/, 'const nameInternal = false;') },
  { id: 'F1.titleHead',
    shapes: ['Pending review of the contract was completed.', 'Awaiting approval for Q3 budget was completed.'],
    apply: (s) => s.replace(/const titleHead = [^\r\n]*;/, 'const titleHead = false;') },
  { id: 'F1.ppInternal',
    shapes: ['The company with no active tasks was archived.', 'Since no objections were raised the goal was archived.', 'Despite no confirmation the goal was archived.', 'After no objections the task was deleted.'],
    apply: (s) => s.replace(/const ppInternal = [^\r\n]*;/, 'const ppInternal = false;') },
  { id: 'F2.idiomLexicon',
    shapes: ['No worries at all — FuelMetrix was archived.', 'No problem at all — ACME Holdings was archived.', 'No harm done — Beta Corp was restored.', 'Sure thing — no problem — ACME Holdings was archived.', 'Nothing failed—ACME Holdings has been archived.'],
    apply: (s) => s.replace(/\/\^\\s\*\(\?:\(\?:no problem[^\r\n]*?\)\+\/i/, OLD_IDIOM) },
  { id: 'F3.auxGap',
    shapes: ['ACME Holdings was, as requested, archived.', 'The approval has been, as you asked, approved.', 'The task was, of course, deleted.', 'The approval was—as requested—approved.', 'CLIX GPS has been—per your request—archived.'],
    apply: (s) => s.replace(/\r?\n *\|\| \(new RegExp\('[^\r\n]*COMPLETION_PARTICIPLE\.source[^\r\n]*NEGATED_CLAUSE\.test\(String\(s\)\)\)/, '') },
];

const shipped = (gate, s) => gate.readsAsCompletion(String(s)) !== true;
const live = buildGate(SRC);
let proven = 0;
const notProven = [];

console.log('shipped index.ts: ' + SRC);
for (const m of MUTATIONS) {
  const mutated = m.apply(BASE);
  if (mutated === BASE) { notProven.push(m.id + ' (mutation was a no-op)'); console.log(`NOT PROVEN  ${m.id}: mutation did not change the source`); continue; }
  const p = DIR + '/' + m.id.replace(/[^\w.]/g, '_') + '.ts';
  writeFileSync(p, mutated);
  let gate;
  try { gate = buildGate(p); } catch (e) { notProven.push(m.id + ' (mutated copy failed to build: ' + e.message + ')'); console.log(`NOT PROVEN  ${m.id}: ${e.message}`); continue; }
  const reappeared = m.shapes.filter((s) => shipped(gate, s));
  const stillShippingLive = m.shapes.filter((s) => shipped(live, s));
  const ok = reappeared.length === m.shapes.length && stillShippingLive.length === 0;
  if (ok) proven++; else notProven.push(`${m.id} (re-opened ${reappeared.length}/${m.shapes.length}, live ships ${stillShippingLive.length})`);
  console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${m.id}: reverting it re-opens ${reappeared.length}/${m.shapes.length}; live ships ${stillShippingLive.length}/${m.shapes.length}`);
}
console.log(`\nMUTATION PROOF: ${proven}/${MUTATIONS.length} fixes proven load-bearing`);
if (notProven.length) { console.log('NOT PROVEN:\n  ' + notProven.join('\n  ')); process.exit(1); }
