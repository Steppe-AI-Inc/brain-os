
### Closure postscript (implementing session, after verifier #16) — D123–D126 CLOSED at the next exact SHA

All 50 of verifier #16's cases pass on the fixed source, promoted as
`qa/scenarios-runner/run16_defect_closure_contract.mjs` (53 cases: the 50, one inverted
hold, two path holds). run15 gained seven pipeline cases for D126. Full battery: 27 suites,
0 failures (21 assertion-bearing, 5 self-labelled SUPERSEDED stubs, 1 library — the
verifier's count, adopted). Mutation proof `qa/verification/proposed/v16_mutation_proof.mjs`:
13/13, coverage and limits for D123, D124, D125, D126. `v15_mutation_proof`: 10/10 with
four mutations SUPERSEDED (the retired word list); its 14/14 at `52e830f` stands as the
historical record. `deno check`: 23 errors, the identical set to d724d8c, 0 new.

D123 (P1): the verifier was right that a blocklist of negators can never be complete, and
it was right about the mechanism — a comma decided whether "acme, no" archived a company.
The word list (`NEGATED_MENTION`) is REMOVED rather than extended. The rule is inverted: a
deterministic bind requires a CLEAN SELECTION. Once the chosen label is removed, every
remaining word must be selection filler (affirmatives, articles, the pending action's own
verbs, entity-type nouns); any other word — negator, exclusion, correction, second name,
hedge — dead-ends to the LLM path, which can read intent. Applied on all three paths
(single match, specificity, raw tie-break) and mutation-proven on each. Two contracts are
deliberately INVERTED and recorded: run15's `D116.hold.negatorInAnotherClauseStillBinds`
and the verifier's `D123.hold.negatorInAnotherClauseStillBinds` pinned "acme, no rush"
binding; it now dead-ends, because failing closed costs a round-trip and a wrong bind costs
a company. The word list was not kept "as defence in depth": once the allowlist exists it
can never fire, and an unobservable guard is the class this ledger has recorded eleven
times.

D124 (P1): `canonicalKnowsIt` compared two independently-derived fallback strings
(`TYPED_FALLBACK[...] || 'the record'` against displayName's `the <type>`), so for any type
outside the 22-key map they disagreed and the D119 drop never fired — and `employee` is
executable. "Known" is now decided by the canonical read itself (`canonicalById` or
`lastKnownLabel`), and a small `CANONICAL_TYPE_ALIAS` resolves model-authored type names
(`employee` -> `person`, `organization` -> `company`, ...) so two real, named, in-context
people are shown by name. Anything unlisted keeps its own name and is dropped unless the
read knows it under that name. A LIMIT is pinned: a row created this turn (runtime label)
still resolves and is not dropped.

D125 (P2): the clause splitter knew only `[.!?,;]`. Dashes, colon, parentheses, newline
and `and`/`but`/`without` are boundaries now, with one lookbehind so the "Confirmed —"
lead is not split from its predicate (the mutation proof shows what happens without it:
`Confirmed — Archived ACME.` stops being caught). Residual, disclosed: a negator inside one
bare clause with no separator at all.

D126: run15's D119/D120 cases observed the label loop only; the drop lives after it. run15
now extracts the real pipeline (label loop + drop + D95 numbering) and observes the drop
where it happens, including the MIXED case the verifier's mutant C5 exposed.

Infrastructure findings from this campaign, fixed: the isolated verifier's allowlist lacked
`git add`/`git commit`, so it could not land artifacts on its own branch (landed on its
behalf, then the allowlist extended). The verifier's harness resolves index.ts relative to
its own directory; promotion one level up needed a one-line closure edit.

Lesson: the D116 closure disclosed its clause-scoping limit only in the benign direction.
When a guard has a limit, pin BOTH directions of it, or the destructive one is the one that
goes unobserved.
