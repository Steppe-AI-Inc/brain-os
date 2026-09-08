
### Closure postscript (implementing session, after verifier #19) — D134–D138 CLOSED and D131 residual cut from 9 to 4

All 61 of verifier #19's cases pass on the fixed source, promoted as
`qa/scenarios-runner/run19_defect_closure_contract.mjs` (62 cases: the 61 plus a source
invariant pinning the D138 call site). Full battery: 30 suites, 0 failures. Mutation proof
`v19_mutation_proof.mjs`: 11/11 (coverage and limits for D134, D135, D136, D137, D138, and
the R9b negation/splitter). `v18` 9/9 with 3 superseded, `v17`/`v16`/`v15` unchanged.
`deno check`: the identical pre-existing errors as d724d8c, 0 new.

D134 (P1): the D130 fix made CONFIRMED_COMPLETION a whole-string test but checked negation
on clause[0] only, so a truthful "Confirmed — <benign>, <verb> was not <done>." had its
negator ignored and the true answer destroyed. Negation is now checked on the clause that
CONTAINS the matched completion word — the substring up to the end of the CONFIRMED match,
last clause — so "Confirmed — as requested, Restored Bob Smith." stays caught and the
truthful negatives survive.

D135 (P2): "no" was ordinal filler, so "no option 2" armed archiveCompanyIds while "acme,
no" correctly dead-ended. "no" is out of the ordinal filler. D136 (P3): an ordinal reply
that is ALSO a company's whole name ("option 2" with a company named "Option 2 Ltd") is
ambiguous and dead-ends to the LLM rather than guessing. D137 (P2, inherited): present-tense
"is/are <participle>" is a STATE, not a completion event; EXECUTION_IN_PROGRESS now fires on
present tense only when explicitly progressive, so "test3 is archived. Should I restore it?"
survives. D138 (P3, inherited): the matched option's own label is removed from the command
before the contradiction check, so a company named "Restored Furniture Co" (or
"Reactivated Metals LLC") can be selected by typing its name.

D131 (R9b): the "proven irreducible" claim from run18 was disproven for 5 of the 9
residuals. A boundary that fires only before a lowercase non-auxiliary token (inside a real
name that token is capitalised; in a verb-phrase coordination it is an auxiliary), plus a
relative-clause-aware negation (a `that/which/who` between the negator and the verb, or no
finite auxiliary before the negator, means the negator scopes over the verb) catches those
5 with zero real names destroyed and zero new false positives on the verifier's 61-case
corpus. run18's `D131.irreducibleResidual` pins are cut from 9 to the 4 genuinely hard ones
(the separator is followed by a capitalised name token); the ledger wording is corrected
from "proven irreducible" to "a documented residual, and here is exactly which four."

Lesson carried: adopting the verifier's own measured R9b rule — rather than re-defending the
"irreducible" framing — is what the loop is for. The verifier disproved a claim I made, and
the fix was to believe the measurement. The one harness cost (run14/D107's 500-char
source-slicing window could not span the longer predicate) was fixed by widening the window,
per the verifier's explicit instruction, never by shortening the predicate to fit it.
