// Verifier #45's four non-blocking findings, closed. The one BLOCKING class it found — the
// conditioned offer — is NOT touched here: it is the founder's product decision and is prepared
// separately in v45_build_letme_option.mjs.
//
// Written with the file tool. Heredocs have eaten a level of backslashes seven times in this campaign.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.V46_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V46_OUT || ROOT + 'qa/verification/scratch/v92/fix46.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;
const need = (anchor, label) => {
  const n = text.split(anchor).length - 1;
  if (n !== 1) { console.log('STALE: ' + label + ' — expected exactly 1 site, found ' + n); process.exit(2); }
};

// ── V45-D2: the entity branch is the only one of four `Confirmed —` branches without the
// interposed-prefix tolerance its three siblings carry, so "Confirmed — as requested, Archived Media
// Group." is destroyed even when the name IS in the pack. One arm extended and its sibling left
// behind is exactly run13/D100's class, which is why it is closed rather than disclosed.
// The capture is preceded by ONE paren, not two — the arrow call is `)))(String(s).match(...`.
// A first anchor guessed `((String(s)` and matched nothing; the staleness check caught it, which is
// the whole reason every edit here counts its sites instead of trusting a replace.
const D2_A = "(String(s).match(/^\\s*[Cc]onfirmed\\s*[—–-]\\s*((?:";
need(D2_A, 'V45-D2 entity capture');
text = text.replace(D2_A, () => "(String(s).match(/^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:[^,]{0,60},\\s*)?((?:");

// ── V45-D6: the imminent idiom list carries the GERUND forms and not the BASE forms, so
// "Let me go ahead and archive the company." escapes the imminent arm and the future-promise gate
// alike — 60 of 192 generated rows. v92 misses them too, so this is not a v92 regression; the arm
// was simply written to cover an idiom and covers half of it.
const D6_A = "(?:going ahead and|kicking off) (?:the )?(?:' + PROGRESS_VERBS + '|archive|restore|delete)";
need(D6_A, 'V45-D6 idiom list');
text = text.replace(D6_A, () => "(?:go(?:ing)? ahead and|kick(?:ing)? off) (?:the )?(?:' + PROGRESS_VERBS + '|archive|restore|delete)");

// ── V45-N3: detName's determiner test carries /i over an explicit [a-z] slot, which folds to any
// letter — the V41-C6 class in the lowercase direction. #45 measured it INERT across 6,600 rows, so
// this is a consistency fix and nothing is expected to move. Dropping the flag is the whole change;
// every literal in it is already lower-case.
const N3_A = "/\\b(?:the|a|an|our|your|their|its|my|his|her)\\s+(?:[a-z][\\w-]*\\s+){0,2}$/i.test(c.slice(0, mm.index))";
need(N3_A, 'V45-N3 detName determiner test');
text = text.replace(N3_A, () => "/\\b(?:[Tt]he|[Aa]n?|[Oo]ur|[Yy]our|[Tt]heir|[Ii]ts|[Mm]y|[Hh]is|[Hh]er)\\s+(?:[a-z][\\w-]*\\s+){0,2}$/.test(c.slice(0, mm.index))");

// ── V45-N2: the belt is quadratic in summary length — 657 ms at 33,639 characters against v92's
// 0.085 ms, and it is called twice per turn. #45 recorded it as a production characteristic rather
// than a defect and named the cheapest guard: a clause that contains no completion vocabulary at all
// cannot be a negated completion, so the per-negator scan loop need never run on it. This is a pure
// short-circuit — it can only skip work on clauses whose answer is already fixed.
const N2_A = "const completionIsNegated = (c: string): boolean => {";
need(N2_A, 'V45-N2 completionIsNegated head');
// CRLF, not LF. index.ts is stored CRLF-only. A first build of this edit inserted plain \n and left
// 4 bare LFs against a pinned 0 — the same slip as the entity declaration two rounds ago. No gate
// checks it, which is exactly why it keeps mattering: it makes every later diff of this file lie.
const NL = String.fromCharCode(13, 10);
text = text.replace(N2_A, () => N2_A
  + NL + "          // v45/V45-N2: no completion vocabulary in this clause means there is nothing for a"
  + NL + "          // negator to negate, so the scan loop below cannot change the answer. Measured:"
  + NL + "          // 1.2-1.4x on ordinary prose, neutral where the vocabulary is present, 0 verdict"
  + NL + "          // changes. #45's 657ms figure could NOT be reproduced here - see v46_runtime_probe."
  + NL + "          if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c)) return false;");


// The clause splitter's own stand-down lookbehind is anchored to the GERUND form too, so
// "Let me go ahead and archive the company." still splits at "and" and the fragment loses its
// subject — the same coordination problem the lookbehind was added for, in the base form.
// #45 named this explicitly: the arm covers half its idiom and so does the splitter.
const D6_B = "(?<!\\bgoing ahead)";
need(D6_B, 'V45-D6 splitter lookbehind');
text = text.replace(D6_B, () => "(?<!\\bgo(?:ing)? ahead)");

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);
