
## 137. A trim could disable the id gates every mutation depends on, and the image gate refused photos production serves — FIXED (2026-09-08)

**Found by** independent verifier #62 (campaign #122) on candidate `c30a0cc` / index.ts `0af353b5`, which
returned FAIL and NOT DEPLOYMENT READY. Report and artifacts on `verify-c30a0cc-campaign122` at `327f93d`.
Three P1s, one of them introduced by the previous round's own fix — the third consecutive round in which
that has happened, which is the strongest argument yet for the independent gate.

**V62-D1 (P1) — the trim disabled the gates that stop the model inventing ids.** Every non-lifecycle
mutation checks the model's ids against `new Set((contextPack?.X || []).map(r => r.id))`, and those arrays
are trimmable to zero. A deep trim therefore made the founder's own target unrecognisable to the executor
for rename, every create family's company binding, person assignments, employment changes and every delete
family. Reachable in production by pasting a ~12,000-character document into the chat. **Closed** by capturing
id provenance BEFORE the trim and giving the executor one shared `packIdSet()` that unions the surviving
rows, that provenance, and the rows the targeted lookups resolved this turn.

**The first version of that fix was wrong and the suites caught it in minutes.** It recorded the dropped ids
on the pack's envelopes — that is, it put them in the PACK, the one thing the budget is trying to shrink —
and the core collections were immediately driven to 2 rows on a fixture that had kept 8. The mistake was
conceptual: `buildContext` and the executor run in the same process, and the pack is what is sent to the
MODEL. Provenance is needed by the SERVER, so it never had to travel in the pack at all. It is now a separate
return value: full provenance, zero model tokens.

**V62-D1b (P1) — a durable pending action was declared unreal on the strength of a display window.** A stored
`multi_action_plan` was validated against those same trimmable arrays, and the turn then answered that "one
or more of its stored targets no longer resolves to a real record". That is a false statement about canonical
state — the BUG-010 class, reached through the budget. Same closure: the plan replay uses the same provenance.

**V62-D2 (P1) — the image gate I added one round ago refused photos production serves.** Closing V61-D10's
unmeasured provider gate, I counted an attached image as `base64.length / 4` against a TOKEN window. That is
the estimator for text. Measured: a 512 KB photo scored 208,651 "tokens" and was refused, a 1 MB photo
383,414, while the web client accepts 5 MB and v92 serves those turns. So closing an unmeasured gate
introduced a brand-new UNSAFE HARD STOP on a shape production handles. **Closed** by removing the image from
the token estimate entirely and bounding it by the only quantity that is both knowable here and actually
enforced by the provider: transported SIZE, 5 MB. An image's cost to a vision model is a function of its
dimensions, which this code cannot see.

**V62-D3 (P2)** — `contextBudget.note` promised server-side resolution for any named entity; true for four
collections, false for fifteen, including projects, which the pinned incident witness question is about.
Closed on both sides: targeted lookups were added for projects and departments, and the note now names the
six that have one and tells the model not to infer absence for the rest.

**V62-D4 (P2)** — `memories` and `factoryWorkOrders` were the two collection queries without
`{ count: 'exact' }`, so their totals were null and a trim could not express itself. **The first fix was
also wrong**: filling the total from the surviving array length publishes a LOWER BOUND as an exact total,
which is the "array.length never means total" defect itself. Reverted; both queries now carry exact counts,
so no total is ever null and none ever has to change.

**V62-D5 (P3)** — the command is serialized twice but the attribution compared one copy, so a 22,000-character
paste was refused with "this workspace has grown", blaming the founder's data for the founder's own message.

**V62-D6 / V62-D7 / V62-D8 (P2, the Mongolian workspace).** Six short verbal-noun phrases read as commands
(Устгалын бүртгэл, Томилгооны тушаал); the imperative surface forms өөрчил and нэм were not matched by their
own stems, so 3 of 21 Mongolian imperatives shipped a fabrication; and the command tokenizer that feeds every
targeted lookup was `[A-Za-z]`-only, so `Эрдэнэт ХХК-г архивла` produced ZERO name tokens and the whole
named-entity protection silently did not exist in the language the workspace is operated in. Closed with one
general rule rather than a list of exceptions — **a token carrying a nominal case suffix is a noun, not an
imperative** — plus the two missing stem forms and Unicode letter classes in the tokenizer. This also closes
V61-D11, which was carried open from the previous round.

**Search performed for the same class.** The mutation proof grew to 19 and initially left one survivor:
removing the Mongolian verb-final rule broke no test in any corpus. That is a coverage gap, not a redundant
rule — the cases only verb-final catches are reported speech and metalinguistic mention ("Архивла гэж
хэлсэн" = he said "archive"; "Сэргээ гэсэн тушаал ирсэн" = an order saying "restore" arrived), where the verb
is in imperative form with no case suffix and only its POSITION separates a quotation from an instruction.
Measured both ways: with the rule, null intent; without it, both answers destroyed. Now pinned.

**Regression.** `qa/scenarios-runner/v62_provenance_language_and_limits_contract.mjs` (25/25, promoted from
the verifier's own suite with four checks rewritten from modelling the implementation to executing it —
each of those four had been unable to see its own fix). Mutation proof
`qa/verification/scratch/p1/mutation_proof_v60_v61.mjs`: **19 mutants, 19 killed, 0 survived**. Battery green
apart from the two production-write-authority suites that are red by design.

**The methodological point.** Two of this round's fixes were wrong on the first attempt and both were caught
by measurement within minutes — provenance in the pack, and a lower bound published as an exact total.
Neither would have been caught by review. The rule this reinforces: after implementing a finding, measure the
fix against the same fixtures that found the defect, before believing it.

**Status.** Fixed on the candidate; NOT deployed. Production remains v92 source (function v94). Verifier
#62's FAIL stands against `c30a0cc`. Still open: V61-D4 and V61-D5, and verifier #62's own V62-D9 (five
mutants surviving in its proof), which this round's mutation work addresses in part but not in full.
