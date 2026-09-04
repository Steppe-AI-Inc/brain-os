
### Closure postscript (implementing session, after verifier #18) — D130–D133 CLOSED at the next exact SHA, with one residual documented and proven irreducible

All 56 of verifier #18's cases pass on the fixed source, promoted as
`qa/scenarios-runner/run18_defect_closure_contract.mjs`. Full battery: 29 suites, 0
failures. Mutation proof `v18_mutation_proof.mjs`: 12/12 (coverage and limits for D130,
D131, D132, D133, plus the D118 negation and D122 fail-closed that this campaign moved).
`v17` 7/7 (+7 superseded), `v16` 11/11 (+2), `v15` 4/4 (+10) — the superseded anchors are
the belt/D122 regions this campaign redesigned, each pointing to v18. `deno check`: the
identical pre-existing errors as d724d8c, 0 new (see the commit message for counts).

D130 (P1): run17/D128's order rule compared the negator to the first COMPLETION WORD, and a
completion word used as a NOUN ("the archived list") or in a NAME ("Closed Loop Systems")
sat before the negator and was mistaken for the verb, destroying 24/26 real names. The
comparison is now against the VERBAL completion only — an auxiliary governing a past
participle (`COMPLETION_VERB`), never a bare noun/name. Present-tense "is/are archived" is a
STATE, deliberately excluded, which is what lets "ACME is archived but was not deleted."
survive. Negation lives in one helper, `completionIsNegated`, applied per clause.

D132 (P2): `ACTION_FAMILY_VERBS`/`ENTITY_NOUNS` and `resolveClarificationField`'s table are
bare object literals indexed by a model-authored string, so a prototype key
("constructor", "__proto__", "toString") returned an inherited function — a raw crash in
the matcher and a truthy garbage field in the resolver. All three now fail closed via
`hasOwnProperty`. D133 (P3): the product renders "(option N)", so a reply that is only an
ordinal reference to an option ("option 2", "#2", "the second one", a bare "2") selects it
when in range; a bare digit beside a name ("acme 2") and another option's number still
dead-end.

D131 (P2) — the honest part. Nine of the verifier's fabrications survive the belt. Each has
its only separator in `and`/`but`/a spaced dash — tokens that occur inside real company
names the same suite requires to survive ("Salt and Pepper Co", "Ulaanbaatar — North
Depot"). run18 pins each residual next to the required-survive answer the same boundary
would destroy: catching the fabrication would reopen D130, a P1 that destroys true answers.
The verifier's own suite is internally contradictory on the `and` boundary
(`D128.hold.nounPhraseNegativesSurvive` forbids splitting on "and";
`D131."There were no errors and ACME was archived"` requires it), which is the proof that no
regex separates the two. Per index.ts's standing rule (destroying a true answer is the
worse failure) and because this belt is defense-in-depth with the structured-evidence path
primary, the residual is left to evidence and documented, not closed by reopening D130.
`legacyProseFallback` fires only when there is no supporting mutation claim; a real mutation
turn re-renders from verified structure regardless, so an un-caught fabrication in prose
does not reach the founder as a verified success.

Lesson: eight consecutive campaigns have oscillated this lexical belt between false
positives and false negatives, and #78 is where the two directions were shown to be
lexically inseparable for the residual class. The durable position — analogous to how D119
ended the lexical-label saga — is that the belt is a high-precision backstop that must
never destroy a true answer, and the primary defense is the structured-claim re-render.
