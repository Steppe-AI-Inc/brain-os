#!/usr/bin/env node
// VERIFIER #36 — PREPARED FIX (scratch only; the candidate is untouched). Rebuilds fix40/index.ts from the
// pristine candidate f64b280 by exact string splices, asserting every anchor is found exactly once.
// FIX40_SKIP=<label-prefix> omits one splice (mutation proof). FIX40_OUT=<dir> chooses the output dir.
//
//  A. The interposed-adverbial COLLAPSE reaches exactly as far as deployed v92's gate: a lookahead requires the
//     participle within 30 characters of the auxiliary (v92's own [^.]{0,30}), so an adverbial whose content
//     is 27-30 chars and CARRIES the negation ("was, as far as anyone can tell not, archived") is no longer
//     discarded. Shapes inside v92's window stay collapsed (differential-neutral in both directions).
//  B. The Confirmed-status guard: the run35 pronoun-subject and ";"/", and" restrictions are removed (they
//     destroyed "Confirmed — Archived Media Group; it is still a customer."), and the status excuse applies
//     only when NO v92-style completion (LEGACY_PAST_COMPLETION) occurs anywhere in the summary — which is
//     exactly when deployed v92 shows the answer. A whole-summary test in the ARMING direction only.
//  C1. ppInternal excuses a negator only when the clause carries a v92-reachable completion; a progressive
//     "Since no company is being archived, …" keeps its negator (v92 has no progressive arm).
//  C2. The D181 determiner-led idiom strip applies only when the remainder carries a v92-reachable completion;
//     "No issues the team reported are being archived." keeps its negator.
//  D. newSubject's capitalised name run admits a token-internal period ("Trade-book.ai"), matching subjectRun.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.FIX40_SRC || (() => { let r = HERE; while (!existsSync(join(r, 'supabase/functions/sem-ai-command/index.ts'))) r = dirname(r); return join(r, 'supabase/functions/sem-ai-command/index.ts'); })();
let s = readFileSync(SRC, 'utf8');
const SKIP = process.env.FIX40_SKIP || '';
function splice(label, from, to) {
  if (SKIP && label.startsWith(SKIP)) { console.log('SKIPPED', label); return; }
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: anchor found ${n} times (need exactly 1)`);
  s = s.replace(from, to);
  console.log('spliced', label);
}
// A — collapse reach = v92's window
splice('A collapse reach',
  "(\\\\b(?:was|were|has been|have been)\\\\b)\\\\s*[,—–]\\\\s*(?:[^.]|\\\\.(?!\\\\s|$)){0,30}?[,—–]\\\\s*(?=' + COMPLETION_PARTICIPLE.source.slice(2) + ')', 'gi'), '$1 ')",
  "(\\\\b(?:was|were|has been|have been)\\\\b)(?=(?:[^.]|\\\\.(?!\\\\s|$)){0,30}\\\\b' + COMPLETION_PARTICIPLE.source.slice(2) + ')\\\\s*[,—–]\\\\s*(?:[^.]|\\\\.(?!\\\\s|$)){0,30}?[,—–]\\\\s*(?=' + COMPLETION_PARTICIPLE.source.slice(2) + ')', 'gi'), '$1 ')");
// B — status guard: excuse only when no v92-style completion exists anywhere; restrictions from run35 D removed
splice('B1 status guard gated on LEGACY',
  "|| (!/^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:[^,]{0,60},\\s*)?(?:Archived|",
  "|| (!(!LEGACY_PAST_COMPLETION.test(String(s)) && /^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:[^,]{0,60},\\s*)?(?:Archived|");
splice('B2 status guard restrictions removed',
  "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)(?!\\x3b)(?!,\\s*(?:and|but)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?<!\\b(?:it|they|this|that|he|she|we|you|i)\\s)(?:is|are|was|were|has|have|had)\\b(?!",
  "(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)(?:[^.]|\\.(?!\\s|$))){0,80}?\\b(?:(?:remains|remain|stays|stay|continues|continue|still|exists|looks|appears|seems)\\b|(?:is|are|was|were|has|have|had)\\b(?!");
splice('B1b status guard close paren (one logical splice with B1)',
  "\\b))/.test(String(s)) && CONFIRMED_COMPLETION.test(String(s))",
  "\\b))/.test(String(s))) && CONFIRMED_COMPLETION.test(String(s))");
// C1 — ppInternal only where a v92-reachable completion is in the clause
splice('C1 ppInternal',
  "const ppInternal = /\\b(?:with|without|since|despite|after|before|besides|regarding|about|following|given|amid|notwithstanding|barring|excepting)\\s+$/i.test(c.slice(0, mm.index));",
  "const ppInternal = /\\b(?:with|without|since|despite|after|before|besides|regarding|about|following|given|amid|notwithstanding|barring|excepting)\\s+$/i.test(c.slice(0, mm.index)) && LEGACY_PAST_COMPLETION.test(c);");
// C2 — D181 strip only where the remainder carries a v92-reachable completion
splice('C2 idiom determiner strip',
  ".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i, '')",
  ".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i, (i0, o0, t0) => (LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0))");
// D — newSubject capitalised run admits a token-internal period
splice('D newSubject period',
  "(/(?:\\b[A-Z][\\w&’'-]*(?:\\s+[A-Z][\\w&’'-]*){0,4}|\\b(?:the|that|this",
  "(/(?:\\b[A-Z][\\w&.’'-]*(?:\\s+[A-Z][\\w&.’'-]*){0,4}|\\b(?:the|that|this");
// E — "confirmed" is in deployed v92's participle list; COMPLETION_PARTICIPLE (which the collapse reads) lacked it,
//     so "The approval was, as requested, confirmed." shipped while v92 corrects it.
splice('E confirmed participle',
  "const COMPLETION_PARTICIPLE = /\\b(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added)\\b/i;",
  "const COMPLETION_PARTICIPLE = /\\b(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|declined|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|added|confirmed)\\b/i;");
const out = process.env.FIX40_OUT || join(HERE, 'fix40'); mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.ts'), s);
console.log('wrote', join(out, 'index.ts'));
