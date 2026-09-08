#!/usr/bin/env node
// VERIFIER #35 — PREPARED FIX (scratch only; the candidate is untouched). Rebuilds fix39/index.ts from the
// pristine candidate by exact string splices, asserting every anchor is found exactly once.
//
//  A. R-AUXGAP made SCOPE-AWARE: the separate arm (a bare negator-lexicon test on a sentence prefix) is
//     REMOVED. Instead the interposed adverbial is COLLAPSED on the whole summary before the clause split
//     ("X was, as requested, archived" -> "X was archived"), so the ordinary clause pipeline — idiom strip,
//     split, hedge blanking, completionIsNegated with every scope rule — decides it. A contraction that
//     immediately governs the auxiliary (couldn't/wouldn't/… have been) is never collapsed, which is v92's
//     own "immediate government" semantics. "had been" is deliberately NOT collapsed: no clause arm covers
//     it (v92 does not either), and letting the name rule near a v92-preserved "had been" negative is how
//     "No Business Unit had been archived." would be destroyed.
//  B. nameInternal also recognises a capitalised run governing "<participle> successfully" (BUG-002's own
//     second form), so "No Limits Inc archived successfully." is caught like "No Limits Inc was archived."
//  C. A period INSIDE a token ("Trade-book.ai", "node.js") is not a sentence boundary: the clause splitter,
//     the CONFIRMED-arm clause split and the status guard's span treat "." as a boundary only before
//     whitespace or end of text.
//  D. The Confirmed-status guard: the state verb may not have a PRONOUN subject (it/they/…), and the span
//     between the participle and the state verb may not cross ";" or ", and/but" — an apposition or a
//     coordinated NAME still crosses.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
let root = HERE; while (!existsSync(join(root, 'supabase/functions/sem-ai-command/index.ts'))) root = dirname(root);
const SRC = join(root, 'supabase/functions/sem-ai-command/index.ts');
let s = readFileSync(SRC, 'utf8');
const NL = s.includes('\r\n') ? '\r\n' : '\n';
const SKIP = process.env.FIX39_SKIP || ''; // mutation proof: skip every splice whose label starts with this letter
function splice(label, from, to) {
  if (SKIP && label.startsWith(SKIP)) { console.log('SKIPPED', label); return; }
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: anchor found ${n} times (need exactly 1)`);
  s = s.replace(from, to);
  console.log('spliced', label);
}
const AUX = 'was|were|has been|have been';
// Inside a SINGLE-quoted string in index.ts an apostrophe must be written \' — a double backslash would end
// the string. Written as a character class of the straight and curly apostrophes.
const CONTR = "(?:couldn|wouldn|shouldn|won|can|isn|wasn|weren|hasn|haven|didn|don)[\\'’]?t";
// A1: remove the separate R-AUXGAP arm (one whole line).
if (!(SKIP && 'A1'.startsWith(SKIP))) {
  const re = /\r?\n          \|\| \(\(mg\) => mg !== null && ![^\r\n]*\)\)\)(?=\r?\n)/;
  const m = s.match(re); if (!m) throw new Error('A1: AUXGAP arm not found');
  if (s.split(m[0]).length - 1 !== 1) throw new Error('A1: AUXGAP arm anchor not unique');
  s = s.replace(re, ''); console.log('spliced A1 (AUXGAP arm removed)');
}
// A2: collapse the interposition on the whole summary at the head of the clause arm.
splice('A2 collapse interposition',
  "          || String(s).replace(/^\\s*(?:(?:no problem|",
  "          || String(s).replace(new RegExp('(?<!\\\\b" + CONTR + "\\\\s)(?<!\\\\b" + CONTR + "\\\\s(?:have|has)\\\\s)(\\\\b(?:" + AUX + ")\\\\b)\\\\s*[,—–]\\\\s*(?:[^.]|\\\\.(?!\\\\s|$)){0,30}?[,—–]\\\\s*(?=' + COMPLETION_PARTICIPLE.source.slice(2) + ')', 'gi'), '$1 ').replace(/^\\s*(?:(?:no problem|");
// B: nameInternal's subjectRun also accepts "<participle> successfully".
splice('B successfully-governed subject run',
  "const subjectRun = /^\\s+(?:[A-Z][\\w&.’'-]*\\s+){0,5}?[A-Z][\\w&.’'-]*\\s+(?:was|were|has|have|had|been)\\b/.test(after);",
  "const subjectRun = new RegExp(\"^\\\\s+(?:[A-Z][\\\\w&.’'-]*\\\\s+){0,5}?[A-Z][\\\\w&.’'-]*\\\\s+(?:(?:was|were|has|have|had|been)\\\\b|\" + COMPLETION_PARTICIPLE.source.slice(2) + \"\\\\s+successfully\\\\b)\").test(after);");
// C1: clause splitter — a period is a boundary only before whitespace/end.
splice('C1 clause splitter period',
  ".split(/[.!?,\\x3b\\n]+|:\\s|\\s(?:and|but)\\s+",
  ".split(/(?:[!?,\\x3b\\n]|\\.(?=\\s|$))+|:\\s|\\s(?:and|but)\\s+");
// C2: CONFIRMED-arm clause split.
splice('C2 confirmed-arm split period',
  ".split(/[.!?,\\x3b\\n]|:\\s/).pop() ?? ''))",
  ".split(/[!?,\\x3b\\n]|\\.(?=\\s|$)|:\\s/).pop() ?? ''))");
// D (+C3): status guard — pronoun subject excluded, span cannot cross ";" or ", and/but", token-internal period allowed.
splice('D status guard',
  "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)[^.]){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?:is|are|was|were|has|have|had)\\b(?!",
  "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)(?!\\x3b)(?!,\\s*(?:and|but)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?<!\\b(?:it|they|this|that|he|she|we|you|i)\\s)(?:is|are|was|were|has|have|had)\\b(?!");
// E: a negator inside a RELATIVE CLAUSE of the subject ("The company that had no open tasks was archived")
//    modifies the subject, like ppInternal's prepositional phrase; the completion outside it is still asserted.
//    The relativizer must sit within four tokens before the negator. Symmetric with the existing rule that a
//    relativizer BETWEEN the negator and the verb keeps the negator in scope ("no record THAT X was archived").
splice('E relInternal',
  "            const quotedHead = /[\"“‘']\\s*$/.test(c.slice(0, mm.index)) && /^\\s*\\S/.test(after);",
  "            const relInternal = /\\w,?\\s+(?:that|which|who|whom|whose)\\s+(?:[\\w’'-]+\\s+){0,4}$/i.test(c.slice(0, mm.index)) && !(/^(?:not|never|nowhere)$/i.test(mm[0]) && /\\b(?:is|are|was|were|has|have|had|been|being|do|does|did|can|could|will|would|should|may|might|must)\\s+$/i.test(c.slice(0, mm.index))) && !/^(?:isn|aren|wasn|weren|hasn|haven|didn|don|cannot|can)/i.test(mm[0]);\r\n            const quotedHead = /[\"“‘']\\s*$/.test(c.slice(0, mm.index)) && /^\\s*\\S/.test(after);");
splice('E relInternal in the skip list',
  "if (nameInternal || objectName || titleHead || ppInternal || newSubject || quotedHead || adjective || fewQuant || detName) continue;",
  "if (nameInternal || objectName || titleHead || ppInternal || relInternal || newSubject || quotedHead || adjective || fewQuant || detName) continue;");
if (NL === '\n') s = s.replace('$/i.test(c.slice(0, mm.index));\r\n            const quotedHead', '$/i.test(c.slice(0, mm.index));\n            const quotedHead');
const out = process.env.FIX39_OUT || join(HERE, 'fix39'); mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.ts'), s);
console.log('wrote', join(out, 'index.ts'), 'line endings:', NL === '\r\n' ? 'CRLF' : 'LF');
