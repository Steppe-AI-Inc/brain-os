// Two of verifier #44's four remaining groups, attempted with measurement.
// V44-D3 (the `let me` deferred offer) is NOT touched here: #44 routed it to the founder as a
// product decision about whether that arm should fire at all, and it is not mine to settle.
//
// V44-D4 (NOTE ON THE CASE TEST) — the agent list is DETERMINERS ONLY, with no [A-Z] alternative.
// EXECUTION_IN_PROGRESS is built with the 'i' flag, so an [A-Z] inside it is case-folded and matches
// any letter: the guard would have stood down on "by me" as well, which is the opposite of its
// purpose. That is verifier #40's finding exactly, and verifier #41's V41-C6 contract caught it here
// within one run. Under /i no explicit capital test can work at all.
//
// V44-D4 — "Records are being archived nightly by the platform, not by me." v92 preserves it; the
// passive-progressive arm destroys it. #44's F3 added a relative-clause lookbehind, which does not
// reach a generic habitual. The structural signal here is an AGENTIVE BY-PHRASE naming someone who
// is not this turn: a passive whose agent is stated and is not first person is, by construction, not
// a claim that THIS turn did it. That is the same asymmetry the first-person arms already rely on.
//
// V44-D6 — "The approval for Pending review of the Q3 ledger has been approved." A task/approval
// title beginning with Pending/Awaiting, appearing after a preposition rather than clause-initially.
// titleHead only fires clause-initially, and neither adjective nor detName can reach it, so any
// completion claim about such a title is uncatchable. The rule: a capitalised Pending/Awaiting
// directly after a preposition heads a NAME, exactly as titleHead already treats the clause-initial
// case — the position changes, the reading does not.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.V45_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V45_OUT || ROOT + 'qa/verification/scratch/v92/fix45.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// ── V44-D4: a stated non-first-person agent means this turn is not the actor ─────────────────
// Applied to the passive-progressive arm only, by extending the guard chain rather than the arm.
// The anchor must be UNIQUE to the is/are-being branch. A first version used the tail
// "|moved|granted|declined)' +", which the was/were branch ALSO ends with — so the guard landed on
// the wrong alternation entirely and the target sentence still fired, while a branch nobody meant to
// touch quietly gained a lookahead. The is/are-being branch is the one carrying closed|cleared|sent,
// so that is what identifies it. An anchor that matches the wrong site is not a weaker fix, it is a
// different one.
const D4_ANCHOR = "|closed|cleared|sent|moved|granted|declined)' +";
const d4n = text.split(D4_ANCHOR).length - 1;
if (d4n !== 1) { console.log('STALE: expected exactly 1 is/are-being branch tail, found ' + d4n); process.exit(2); }
const D4_NEW = "|closed|cleared|sent|moved|granted|declined)(?![^.]{0,60}?\\\\bby (?:the|a|an|our|their|its))' +";
text = text.replace(D4_ANCHOR, () => D4_NEW);

// ── V44-D6: Pending/Awaiting after a preposition heads a title, not a negation ───────────────
// titleHead's existing clause-initial form is left exactly as it is; this adds the post-preposition
// position beside it, so the same reading applies wherever the title actually sits.
const D6_ANCHOR = "const titleHead = ";
if (!text.includes(D6_ANCHOR)) { console.log('STALE: titleHead not found'); process.exit(2); }
const D6_EXTRA = "const titleHeadAfterPrep = /\\b(?:for|of|on|about|regarding|concerning|in|at|to|from|with)\\s+(?:Pending|Awaiting)\\s+[a-z]/.test(c) && /^[A-Z]/.test(mm[0]); ";
text = text.replace(D6_ANCHOR, () => D6_EXTRA + D6_ANCHOR);
const D6_USE = "if (nameInternal || objectName || titleHead ||";
if (!text.includes(D6_USE)) { console.log('STALE: the skip-condition chain not found'); process.exit(2); }
text = text.replace(D6_USE, () => "if (nameInternal || objectName || titleHead || titleHeadAfterPrep ||");

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);
