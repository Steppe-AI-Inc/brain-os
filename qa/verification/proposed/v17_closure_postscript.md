
### Closure postscript (implementing session, after verifier #17) — D127–D129 CLOSED at the next exact SHA

All 39 of verifier #17's cases pass on the fixed source, promoted as
`qa/scenarios-runner/run17_defect_closure_contract.mjs` (43 cases: the 39 plus four closure
holds). Full battery: 28 suites, 0 failures (22 assertion-bearing — the verifier's count,
adopted). Mutation proof `qa/verification/proposed/v17_mutation_proof.mjs`: 14/14, coverage
and limits for D127, D128, D129, plus the two D117 mechanisms re-observed under the new
rule. `v16_mutation_proof` 11/11 with 2 superseded; `v15_mutation_proof` 8/8 with 6
superseded. `deno check`: the identical 23 errors as d724d8c, 0 new.

D128 (P1) — the verifier was right, and the mechanism was mine. run16/D125 made
`and`/`but`/`without`, dashes, parentheses and the colon clause boundaries, and inside a NOUN
PHRASE they are nothing of the sort: "No company named Salt and Pepper Co was archived" was
split at "and", the negator was severed from its verb, and 97 of 130 truthful negatives were
destroyed (0/130 one candidate earlier) — the D112 class again, in the direction index.ts
itself calls the worse one. The fix is not a narrower boundary list. The splitter is back to
sentence punctuation, the comma and the newline, and negation is decided by ORDER: a
negator disarms a clause only when it PRECEDES the completion vocabulary ("no company … was
archived", "is not archived"); a negator that FOLLOWS the verb ("archived – no undo
available", "archived without incident", "archived and no errors occurred") is a qualifier
on a completion that was still asserted, and the belt fires. So D125's four fabrications
stay caught with no phrase-splitting at all. One word had to leave the vocabulary:
"confirmed", because the "Confirmed —" lead would otherwise sit before every negator.
Disclosed residual: a real name that itself begins with a negator word before the verb
("Nothing Bundt Cakes was archived") disarms the belt; evidence remains primary. The
verifier's surviving mutant (`or` as a boundary caught by no suite) is now pinned.

D127 (P2): the code comment claimed the filler was "the pending action's own verbs"; the
set was a static union of every lifecycle verb and every entity noun, so "activate acme"
and "reject acme" were clean selections of an ARCHIVE option and "archive acme tasks" armed
the company. The verbs and nouns admitted are now the winning option's own action family
(`ACTION_FAMILY_VERBS[actionType]`) and its own entity type (`ENTITY_NOUNS[entityType]`) —
the rule the comment described. `RESTORE_VERB_PATTERN` gains plain "activate" (only
"reactivate" was listed); the first cut of that regex, `re?activat`, required a leading
"r" and was caught by the contract written to observe it, which is the point of writing one.

D129 (P3): the product renders "(option N)" (run12/D95) and then refused the reply that
used it. The option's OWN number in the option/# shape is filler now; a bare digit and
another option's number are not, both pinned.

D117 re-observed: under the order rule the D117 corpus no longer depends on the clause
split, which would have left the split unobserved. Two run17 holds pin that a truthful
negative in one sentence (or comma-clause) does not disarm a fabrication in the next, and
the v15 proof's two anchors for that mechanism are marked superseded by them.

Lesson: D125 was a boundary-list answer to a scoping question, and the verifier's corpus of
REAL entity names was what exposed it — the battery had never had one. run17 carries it now.
