// FOUNDER DIRECTIVE 2026-09-08 §1 and §6 — ONE BUSINESS/GRAMMAR CONCEPT → ONE CANONICAL DEFINITION →
// MULTIPLE CONSUMERS. Never: the same concept as separately maintained copies.
//
// Auditing the paths the directive names (executor request detection, intent derivation, polite/request
// framing, confirmation paths, fallback paths) found the request-frame twin already removed and TWO MORE.
//
// 1. CONFIRMATION — and this one is live, not theoretical. Two lists decide what a bare affirmative means:
//
//      isShortAffirmative   (executor)  yes yep yeah YUP confirm confirmed go-ahead go-for-it do-it
//                                       EXECUTE proceed sure okay ok
//      CONFIRMATION_COMMAND (intent)    yes yep yeah y ok okay sure confirm(ed) correct affirmative
//                                       go-ahead do-it proceed please-do go-for-it approved  + option N
//
//    "yup" and "execute" are in the EXECUTOR list and not the intent list. A founder answering "yup" to an
//    armed plan therefore EXECUTES REAL MUTATIONS while the receipt tier never sees a confirmation — which
//    is exactly the founder's §3 prohibition: "request detected by executor but invisible to receipt logic".
//    Verifier #64 flagged isShortAffirmative as the most dangerous guard in the file for a related reason.
//
//    Converged onto one alternation. The direction matters: the executor now uses the canonical set and the
//    intent tier uses the canonical set PLUS the option-number branch, so intent ⊇ executor by construction
//    and the dangerous gap cannot reopen. The option branch is a documented, deliberate difference:
//    choosing "option 2" confirms a disambiguation, it does not authorise a bulk plan.
//
// 2. MUTATION VERB AT THE HEAD OF A CLAUSE — FIRST_CLAUSE_VERB and MUTATION_IMPERATIVE_VERB are the same
//    concept in two spellings (stems vs whole words), and they had already drifted: the first-clause list is
//    missing roughly seventy verbs the imperative list carries. Converged onto the canonical verb list.
//
// DELIBERATE DIFFERENCES, documented rather than converged:
//   * MUTATION_VERB_ALWAYS group 1 is a narrower LIFECYCLE subset with inflections, matched anywhere in
//     the command rather than at a head. Different matching rule, different purpose.
//   * IMPERATIVE_LEAD (in the belt) classifies a clause of the MODEL'S REPLY, not the founder's request.
//     Same words, opposite subject; merging them would tie a request rule to a reply rule.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- the canonical definitions, beside the frame definition they join.
must(`function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }`,
`// THE ONE DEFINITION OF A BARE AFFIRMATIVE — "execute what is pending". Two consumers: the executor's
// bulk_confirmation / multi_action_plan gate, and the request-intent tier that arms the never-silent
// receipt. They were separate lists, and "yup" and "execute" were in the EXECUTOR one only — so answering
// "yup" to an armed plan executed real mutations that the receipt tier never saw (founder directive
// 2026-09-08 §3: a request the executor detects must never be invisible to the receipt logic).
// The intent tier additionally accepts "option 2" style choices; that is a deliberate difference, recorded
// here, because choosing an option confirms a disambiguation rather than authorising a bulk plan.
const CONFIRMATION_ALTERNATION = "yes|yep|yeah|yup|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative"
  + "|go ahead|go for it|do it|execute|proceed|please do|approved";
function estimateTokens(x: unknown){ return Math.ceil(JSON.stringify(x).length / 4); }`, 'confirmation alternation');

// ---- consumer 1: the executor gate.
must(`        const isShortAffirmative = /^(yes|yep|yeah|yup|confirm|confirmed|go ahead|go for it|do it|execute|proceed|sure|okay|ok)[.!]?$/i.test(command.trim());`,
`        // Built from the ONE definition (founder directive §1). This is the gate that turns a bare "yes"
        // into real mutations, so it must never recognise an affirmative the receipt tier does not.
        const isShortAffirmative = new RegExp('^(?:' + CONFIRMATION_ALTERNATION + ')[.!]?$', 'i').test(command.trim());`, 'executor gate');

// ---- consumer 2: the intent tier, canonical set plus the option branch.
must(`        const CONFIRMATION_COMMAND = /^\\s*(?:yes|yep|yeah|y|ok|okay|sure|confirm(?:ed)?|correct|affirmative|go ahead|do it|proceed|please do|go for it|approved)\\b[\\s,.!—–-]*(?:(?:go ahead|go|do it|proceed|please|now|thanks|then)[\\s,.!—–-]*)*$|^\\s*(?:option|choice|number|the)?\\s*(?:\\d+|one|two|three|four|five|[a-e]|first|second|third|fourth|last)(?:\\s+(?:one|option|choice))?\\s*[.!]?\\s*$/i;`,
`        // The SAME canonical set as the executor gate, plus the option-number branch — so the intent tier
        // is a superset of the executor by construction and "the executor acted, the receipt never knew"
        // is not expressible (founder directive §1 and §3).
        const CONFIRMATION_COMMAND = new RegExp('^\\\\s*(?:' + CONFIRMATION_ALTERNATION + ')\\\\b[\\\\s,.!—–-]*(?:(?:go ahead|go|do it|proceed|please|now|thanks|then)[\\\\s,.!—–-]*)*$'
          + '|^\\\\s*(?:option|choice|number|the)?\\\\s*(?:\\\\d+|one|two|three|four|five|[a-e]|first|second|third|fourth|last)(?:\\\\s+(?:one|option|choice))?\\\\s*[.!]?\\\\s*$', 'i');`, 'intent tier');

// ---- the two mutation-verb head lists become one.
must(`        const FIRST_CLAUSE_VERB = /^\\s*(?:archiv|un-?archiv|restor|reactivat|delet|remov|renam|retitl|reassign|unassign|approv|reject|declin|activat|deactivat|invit|revok|enabl|disabl|promot|demot|hir|fir|terminat|dismiss|onboard|merg|split|reopen|bring|creat|add|assign|set|updat|chang|edit|clos|complet|finish|cancel|mark|mov|transfer|end|send|schedul|publish|shar|upload|grant|notify|email|pay|import|export)\\w*/i;`,
`        // The same concept as MUTATION_IMPERATIVE_VERB — "a mutation verb at the head of a clause" — in a
        // second spelling, and already drifted: this list was missing ~70 verbs the other carries. One
        // definition, two consumers (founder directive §1).
        const FIRST_CLAUSE_VERB = MUTATION_IMPERATIVE_VERB;`, 'first clause verb');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
if (out.indexOf('const CONFIRMATION_ALTERNATION') > out.indexOf('const isShortAffirmative')) throw new Error('the canonical set is declared after its first consumer');
writeFileSync(p, out); console.log('applied', n);
