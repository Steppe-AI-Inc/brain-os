#!/usr/bin/env node
// VERIFIER #37 — PREPARED FIX (scratch only; the candidate index.ts is untouched). Rebuilds fix43/index.ts from the
// pristine candidate 395c438 (sha ba50feff…) by exact string splices; every anchor must occur exactly once.
// FIX43_SKIP=<label-prefix> omits one splice (mutation proof). FIX43_OUT=<dir> chooses the output dir.
//
//  F1. A comma-isolated interposed phrase between a SUBJECT and its predicate ("No company, however, is being
//      archived") is REMOVED before the clause split, so the subject's negator stays in the clause with the
//      predicate. Only when the text after the second comma opens with an auxiliary/evidential, only when the phrase
//      itself carries no negator (", not FuelMetrix," stays split), only <=40 chars, no parentheses. The phrase is
//      dropped rather than kept: keeping its words put lowercase tokens between a negator-led NAME and its auxiliary
//      ("No Limits Inc as far as I can see was archived") and blinded nameInternal — 45 v92-corrected fabrications
//      shipped on the first version of this splice. With the phrase gone, "No Limits Inc was archived" is caught
//      exactly as it is without the phrase, and "No company is being archived" is negated exactly as without it.
//  F2a. The interposed-adverbial collapse uses deployed v92's exact window, [^.]{0,30}, in both its lookahead and
//      its content — so it can no longer manufacture a completion (across a token-internal period such as
//      "Trade-book.ai" / "v2.1") that v92 never sees, which the LEGACY-gated scope excuses then honoured.
//  F2b. A blanked parenthetical keeps its LENGTH (spaces), so the distance v92 measures between auxiliary and
//      participle is preserved instead of collapsed to one space.
//  F3.  The run30 dash-form R-IDIOM strip is RE-ADDED ahead of the D181 strip: it was not dead — it carried the
//      first-person and progressive arms ("No problem — I archived ACME.", "No worries — I'm now archiving ACME."),
//      caught at f64b280 and shipped by 395c438 (115 rows on my idiom family, 0 truth cost measured).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.FIX43_SRC || (() => { let r = HERE; while (!existsSync(join(r, 'supabase/functions/sem-ai-command/index.ts'))) r = dirname(r); return join(r, 'supabase/functions/sem-ai-command/index.ts'); })();
let s = readFileSync(SRC, 'utf8');
const SKIP = process.env.FIX43_SKIP || '';
function splice(label, from, to) {
  if (SKIP && label.startsWith(SKIP)) { console.log('SKIPPED', label); return; }
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: anchor found ${n} times (need exactly 1)`);
  s = s.replace(from, to);
  console.log('spliced', label);
}
const BS = '\\';
// F2a — collapse window == v92's [^.]{0,30}
splice('F2a collapse window',
  "(?=(?:[^.]|\\\\.(?!\\\\s|$)){0,30}\\\\b' + COMPLETION_PARTICIPLE.source.slice(2) + ')\\\\s*[,—–]\\\\s*(?:[^.]|\\\\.(?!\\\\s|$)){0,30}?[,—–]\\\\s*(?=",
  "(?=[^.]{0,30}\\\\b' + COMPLETION_PARTICIPLE.source.slice(2) + ')\\\\s*[,—–]\\\\s*[^.]{0,30}?[,—–]\\\\s*(?=");
// F3 — re-add the dash-form idiom strip directly before the D181 determiner-led strip
const STRIP = ".replace(/^" + BS + "s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:" + BS + "s+at all)?" + BS + "s*[—–-]" + BS + "s*)+/i, '')";
const D181 = ".replace(/^" + BS + "s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:" + BS + "s+at all)?" + BS + "s+(?=(?:the|a|an|our|their|my|its|his|her)" + BS + "s+" + BS + "w)/i, (i0, o0, t0) =>";
splice('F3 dash-form idiom strip re-added', D181, STRIP + D181);
// F1 — re-join a comma-isolated interposed phrase between subject and predicate, before the split
splice('F1 comma-isolated interposed phrase',
  "(LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0)).split(",
  "(LEGACY_PAST_COMPLETION.test(t0.slice(o0 + i0.length)) ? '' : i0)).replace(/,\\s*(?:(?:(?!\\b(?:not|never|no|nobody|nothing|none|neither|nor)\\b)[^,.\\x3b:!?()]){1,40}?),\\s*(?=(?:is|are|was|were|has|have|had|isn|aren|wasn|weren|hasn|haven|shows?|showed|indicates?|indicated|confirms?|confirmed|suggests?|suggested|reports?|reported)\\b)/gi, ' ').split(");
// F2b — blanked parenthetical keeps its length
splice('F2b parenthetical keeps length', ".map((c) => c.replace(/\\([^()]*\\)/g, ' ')", ".map((c) => c.replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))");
const out = process.env.FIX43_OUT || join(HERE, 'fix43'); mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.ts'), s);
console.log('wrote', join(out, 'index.ts'));
