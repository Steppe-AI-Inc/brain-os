
## 136. The budget could still brick a channel, and the imperative tier read statements as commands in both languages — FIXED (2026-09-08)

**Found by** independent verifier #61 (campaign #121) on candidate `4f44544` / index.ts `3d1baeaa…`, which
returned FAIL and NOT DEPLOYMENT READY. Report and artifacts on `verify-4f44544-campaign121` at `a725c49`.
Two of the four P1s were caused by the fixes for verifier #60's findings, which is exactly what an
independent round is for.

**V61-D1 (P1) — one long answer could permanently hard-stop a channel.** `conversationHistory` was pinned at
a floor of 1 by `Math.max(1, floor)` while every other optional collection could reach 0, and a single
history row carries the raw prior command and the raw prior summary with no bound anywhere on the write path
(a reply is capped only by `max_tokens: 8192`). So one accepted turn with a large reply made every later turn
in that channel a refusal: measured, the command `hi` shipped at 14,595 tokens with every other array already
empty. **Closed twice over**, because either fix alone leaves the hole: history rows are bounded where the
pack is built — truthfully, with a marker, the full text staying on the work order — and the final trim pass
may now take history to 0 like any other tier-4 narrative.

**V61-D2 (P1) — the floor-0 pass discarded the entity named this turn.** The V60-D2 closure merged the
named-this-turn rows at the head, which protects them from a head-slicing trim but not from the floor-0 pass
that empties `companies`/`people`/`tasks`/`goals` outright. Measured: the named company and person gone, and
the turn still shipping at 10,861 tokens, so the founder receives an answer built on a pack in which the
entity they just named is absent. `OPERATING_TRUTH_MODEL.md` §4.4 lists "exact canonical entity and action
state for the targets of this turn" as minimum safe context and `MINIMUM_SAFE_CONTEXT` did not contain it.
**Closed** by carrying the resolved rows in their own protected key, `namedTargets` — the contract clause
implemented literally instead of approximated by trim ordering.

**V61-D6 (P1) — 22 of 22 ordinary Mongolian turns had their truthful answer destroyed.** The Cyrillic tier
matched `\S*`-suffixed stems anywhere with no position rule, so it also matched derived nouns and participles
— нэмэлт (additional), өөрчлөлт (a change), архивласан (archived, attributive), Устгасан, Томилогдсон,
Цуцлагдсан, Хасагдсан — and the exact stem хаа, which is also the ordinary word in хаа сайгүй (everywhere).
`нэрийг` was in the stem list at all, though it is the accusative of нэр, a noun. Meanwhile every veto path
was ASCII-only, so nothing could rescue them, and Mongolian questions routinely carry no question mark.
Deployed v92 answers all 22 correctly, so this was a truth regression against production. **Closed** by
removing `нэрийг`, requiring verb-final position (which is where the source comment already said Mongolian
puts its verbs — the reason the tier was exempt from the English head rule), rejecting participles, verbal
nouns and infinitives by their surface morphology, and adding a Mongolian read veto for question words,
sentence-final question particles and the copular/negative endings that make a clause a statement.

**V61-D7 (P1) — 29 of 29 English statements and noun phrases read as commands.** The imperative tier required
only `^verb\b\s+\S`, so it never distinguished a verb at the head of a command from a noun at the head of a
noun phrase: "Archive policy needs a review before year end", "Delete key on my keyboard is broken", "Order
confirmation arrived this morning", "Share price fell after the announcement". **Closed** by requiring two
things at once, because the shapes differ in two ways: the object head must REFER (determiner phrase, proper
noun, identifier, quoted string, pronoun, number, product noun, or a lone token) AND the clause must not
continue into a finite main verb. Capitalisation is deliberately not the discriminator — founders capitalise
their commands too.

**V61-D3 (P2) — two authoritative "shown" numbers in one pack.** `counts.<x>Shown` was written before the
trim and protected from it, so a trimmed pack carried `counts.tasksShown = 15` beside
`collections.tasks.shown = 2`. Nothing was fabricated, but the ambiguity is what `context.collections` exists
to remove. **Closed by removing the duplicate, not by syncing it**: syncing was tried first and broke the
verifier's own C3 contract, since `counts` is protected and syncing mutates it — the conflict was the signal
that a second envelope should not exist. Totals stay in `counts`; shown and truncated live only in
`context.collections`; the prompt was repointed.

**V61-D8 (P2) — evidence failed open.** Four sites read `r.postconditionPassed !== false`, recording a
VERIFIED envelope when the field is missing or null. Not exploitable against today's security-definer RPCs,
which return a real boolean, but the opposite of the rule the V60-D7 closure states. **Closed:** all reads are
`=== true`. Absent evidence is not evidence.

**V61-D9 (P2) — a postcondition taken from the write's own return.** `reassign_person` and `assign_task`
reported the postcondition from "an id came back". `.select('id')` proves a row was touched, not that
`owner_person_id` or the operating company landed. **Closed:** both re-read the field that was supposed to
change and compare it to what was requested.

**Search performed for the same class.** Two further defects were found while fixing these and caught by the
existing corpora before commit: `String.match` returning only the first Cyrillic match meant a compound
Mongolian command was judged on its converb rather than its final verb ("ACME компанийг архивлаад Beta-г
сэргээ"), and a `const` used before its declaration in the same block — a TDZ crash, not a fallback — was
caught by a guard written into the patch script itself.

**Regression.** `qa/scenarios-runner/v61_budget_intent_language_contract.mjs` (23/23, promoted from the
verifier's own suite with the D3 check rewritten to assert the stronger property). Mutation proof
`qa/verification/scratch/p1/mutation_proof_v60_v61.mjs`: **19 mutants, 19 killed, 0 survived**, index.ts
verified byte-identical after every run. Four mutants initially SURVIVED, which is the proof earning its
keep: three guards had no coverage anywhere in the battery, and two assertions checked that machinery
existed without checking that it was used. Both gaps are now closed in
`architecture_context_budget_contract.mjs` (34/34) and `architecture_mutation_envelope_contract.mjs` (39/39).
Corpora after the change: v56 129/0, v57 306/0, v58 48/0, v59 85/0, v60 22/0, v92 parity 46/0.

**Status.** Fixed on the candidate; NOT deployed. Production remains v92 source (function v94). Verifier
#61's FAIL stands against `4f44544`; it says nothing about these bytes.
