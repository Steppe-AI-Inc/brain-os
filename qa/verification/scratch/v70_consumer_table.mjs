// VERIFIER #70 INSTRUMENT — the structural question, mechanised.
//   WHICH CONSUMER OF THIS CONCEPT DOES NOT DERIVE FROM ITS DEFINITION?
// Method: for each canonical alternation, take its |-delimited vocabulary. Then scan every
// OTHER line of index.ts for |-delimited tokens and measure how much of the canonical
// vocabulary that line re-spells. A line that re-spells a large fraction of a canonical
// vocabulary WITHOUT naming the canonical constant is a NON-DERIVING CONSUMER.
//
// HARNESS-TRUTH NOTE (the #68 standard): this instrument is line-based and vocabulary-based,
// NOT an AST. It therefore reports CANDIDATES, and every candidate below is then read by hand
// and classified. It cannot miss a duplicate that is spelled with the same words; it CAN
// over-report (e.g. a longer superset list). Both directions are reported.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || path.resolve(here, '../../../supabase/functions/sem-ai-command/index.ts');
const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split(/\r?\n/);

function vocabOf(name) {
  // collect the full declaration (may span concatenated lines) then split on top-level |
  const start = lines.findIndex((l) => new RegExp('^\\s*const ' + name + '\\s*=').test(l));
  if (start < 0) throw new Error('canonical not found: ' + name);
  let buf = '';
  for (let i = start; i < lines.length; i++) {
    buf += lines[i];
    if (/;\s*$/.test(lines[i])) break;
  }
  // strip comment-only continuation lines
  buf = buf.replace(/^\s*\/\/.*$/gm, '');
  const strs = [...buf.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  const joined = strs.join('');
  const toks = joined.split('|').map((t) => t.trim()).filter(Boolean);
  return { start: start + 1, decl: buf, tokens: toks };
}

// A token like "compan(?:y|ies)" or "permissions?" -> the literal word core used for matching.
function core(t) {
  return t
    .replace(/\(\?:[^)]*\)/g, '')
    .replace(/[\\^$.*+?()[\]{}]/g, '')
    .replace(/’/g, "'")
    .trim()
    .toLowerCase();
}

const CANON = [
  'ENTITY_NOUN_ALTERNATION',
  'REQUEST_FRAME_ADDRESSED',
  'REQUEST_FRAME_ALTERNATION',
  'REQUEST_FRAME_DELIBERATIVE',
  'CONFIRMATION_ALTERNATION',
  'MUTATION_VERB_ALTERNATION',
  'AMBIGUOUS_MUTATION_VERB_ALTERNATION',
  'REQUEST_NEGATED_ALTERNATION',
  'REQUEST_FRAME_READ_VERB',
];

const canon = {};
for (const n of CANON) canon[n] = vocabOf(n);

// derived-name map: which identifiers are themselves built from a canonical
const derivedFrom = {};
for (const n of CANON) derivedFrom[n] = new Set([n]);
// REQUEST_FRAME_ALTERNATION_INTENT derives from ALTERNATION + DELIBERATIVE
derivedFrom.REQUEST_FRAME_ALTERNATION.add('REQUEST_FRAME_ALTERNATION_INTENT');
derivedFrom.REQUEST_FRAME_DELIBERATIVE.add('REQUEST_FRAME_ALTERNATION_INTENT');
derivedFrom.REQUEST_FRAME_ADDRESSED.add('REQUEST_FRAME_ALTERNATION');
derivedFrom.REQUEST_FRAME_ADDRESSED.add('REQUEST_FRAME_ALTERNATION_INTENT');
derivedFrom.MUTATION_VERB_ALTERNATION.add('MUTATION_VERB_ING_STEMS');

const report = [];
for (const n of CANON) {
  const vocab = new Set(canon[n].tokens.map(core).filter((t) => t.length >= 2));
  const declLines = new Set();
  {
    // mark the declaration's own physical lines so we do not report the definition as its own copy
    let i = canon[n].start - 1;
    for (; i < lines.length; i++) { declLines.add(i); if (/;\s*$/.test(lines[i])) break; }
  }
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (declLines.has(i)) continue;
    const L = lines[i];
    if (L.trim().startsWith('//')) continue;
    if (!L.includes('|')) continue;
    // tokens that appear in an alternation position on this line
    const altToks = new Set(
      L.split(/\|/).map((s) => core(s.replace(/.*[/'"`([{,\s]/, ''))).filter((t) => t.length >= 2)
    );
    // also plain word scan for multiword canon tokens (e.g. "work order")
    const low = L.toLowerCase();
    let present = 0;
    for (const v of vocab) {
      if (!v) continue;
      if (v.includes(' ')) { if (low.includes(v)) present++; }
      else if (altToks.has(v)) present++;
      else if (new RegExp('\\|' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\||\\\\b|\\?|\\(|\\s)').test(L)) present++;
    }
    if (present === 0) continue;
    const frac = present / vocab.size;
    const derives = [...derivedFrom[n]].some((d) => L.includes(d));
    if (frac >= 0.25) hits.push({ line: i + 1, present, of: vocab.size, frac: +(frac * 100).toFixed(1), derives, ident: (L.match(/const\s+([A-Za-z0-9_]+)/) || [])[1] || '(inline)' });
  }
  report.push({ canonical: n, vocabSize: vocab.size, hits });
}

console.log('# VERIFIER #70 — CONSUMER DERIVATION TABLE (candidate 31979e8)\n');
for (const r of report) {
  console.log(`## ${r.canonical}  (vocabulary ${r.vocabSize} tokens, declared line ${canon[r.canonical].start})`);
  if (!r.hits.length) { console.log('   no line re-spells >=25% of this vocabulary\n'); continue; }
  for (const h of r.hits) {
    console.log(`   line ${String(h.line).padStart(5)}  ${h.frac.toString().padStart(5)}%  ${h.present}/${h.of}  ${h.derives ? 'DERIVES  ' : '*** DOES NOT DERIVE *** '}${h.ident}`);
  }
  console.log('');
}
