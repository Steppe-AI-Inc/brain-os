
### Closure postscript (implementing session, after verifier #15) — D116–D122 CLOSED at the next exact SHA

Every one of verifier #15's 46 cases passes on the fixed source, promoted as
`qa/scenarios-runner/run15_defect_closure_contract.mjs` (48 cases: the 46, plus two LIMIT
holds for the D116 guard). Full battery: 26 suites, 0 failures. Mutation proof
`qa/verification/proposed/v15_mutation_proof.mjs`: 14/14, covering COVERAGE and LIMITS for
D116, D117, D118, D119 and D122. Local `deno check` was run for the first time this
campaign (via `npx deno@2`); the fixed source introduces no type error that `d724d8c` did
not already carry (see the commit message for the exact counts).

D116 (P1): the matcher now dead-ends, BEFORE its single-match return, on any option whose
mention sits in a clause carrying a negator or exclusion word. The negation is never
interpreted — "not acme, the other one" is not resolved to "the other one", because with
three options that is a guess and a guess here archives the wrong company. Two limits are
pinned so the guard cannot be over-broadened silently: the test is clause-scoped ("acme
holdings, no rush" still binds) and the option's own label is removed before the negator
test (a real name containing "no" cannot disarm itself).

D117 + D118: one structural change, not two patches. The whole-summary negation lookahead
is deleted from `CONFIRMED_COMPLETION`; the D112 negator list moves, unchanged, into
`NEGATED_CLAUSE`, and `readsAsCompletion` now splits the summary on sentence punctuation
and the comma and asks, per clause, "not negated AND asserts a completion" — for every
arm. So the belt cannot again be disarmed by boilerplate two sentences later, and a
truthful negative phrased with an auxiliary is no longer destroyed on the arms D112 never
touched. Disclosed residual: a fabrication and a negator in the SAME clause ("Archived
ACME with no issues") still disarms that clause. Evidence, not this belt, remains primary.

D119 — the product decision the verifier put to the founder, taken: the absent-branch
lexical fallback is GONE. Verifier #15 measured it (6/18 assertions shipped verbatim, 10/13
real names destroyed) and it was separating "verbs on the 24-word list" from "verbs off
it", with both kinds on both sides. An option whose id the canonical read cannot name is
now DROPPED from the list before the founder sees it — it could never execute anyway
(run13/D103) — and when nothing is left the pending action degrades to an open question,
since the disambiguation branch requires a non-empty option list. **run8/D72b is RETIRED
on the record**: the trailing-period repair of a name the database cannot corroborate is
not a property worth an unverifiable label. Six committed suites pinned the old
"unresolvable option is shown" behaviour (lifecycle R2, run10 R10.flag.quiet/D78, run12
D95, run13 D103.hold.numbered, run14 D113.hold.absentId, run8 D72/D72b); each is re-pinned
to the reachable shape (in-context options with colliding canonical names still render
distinguishably; out-of-context ones are gone), marked `run15/D119 RE-PIN` inline. The
D78 -> D86 -> D91 -> D100 -> D113 -> D119 sequence ends because the label channel no
longer has a lexical gate at all: a label is the canonical name, or the option is not
offered.

D120 is closed by the same mechanism rather than by adding `EXECUTION_IN_PROGRESS` to the
label channel as proposed. The founder's standing rule applies — do not add another regex
chain where canonical identity exists — and once the label is canonical-or-nothing there
is no channel for a progressive assertion to travel through. The run15 D120 cases observe
this directly.

D121: all 13 of the verifier's CONTRACT cases are committed in run15. D122: the call-site
comment now cites the source-invariant drift guard, and
`issue5_confirmation_action_type_binding.mjs` extracts and executes the REAL
`resolveClarificationField` and its table against the full matrix, so the citation points
at something that observes the product. The mutation proof's M13 confirms the guard line
and the un-coerced access each defend issue #5 alone: a single-line mutant is inert, and
only the two-line behavioural mutant reproduces the defect — reporting a single-line mutant
as "proven" would have been the vacuous-evidence class this ledger keeps recording.

`v14_mutation_proof.mjs`'s three anchors on the retired lookahead and the retired lexical
fallback are marked SUPERSEDED (7/7 of the surviving mutations still proven; the 10/10 at
`d724d8c` stands as the historical record).

Lesson carried forward: the verifier's harness constraints (which literals must survive
extraction, that `readsAsCompletion` must remain one statement) shaped the fix — the
clause splitter writes its semicolon as `\x3b` for exactly that reason. A fix that breaks
the independent harness that found the defect is not a closure; it is an unobserved
change.
