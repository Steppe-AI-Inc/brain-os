
## 138. Eighteen ordinary mutation requests derived no intent, and a repair made in one tier was never carried to its twin — FIXED (2026-09-08)

**Found by** independent verifier #63 (campaign #123) on candidate `24e454f` / index.ts `86620b36`, which
returned FAIL and NOT DEPLOYABLE. Report and artifacts on `verify-24e454f-campaign123` at `327f93d`.

**V63-D3 (P1) — with the model emitting no classification, 18 of 18 ordinary mutation requests derived no
intent at all**, so the never-silent receipt never fired and all 18 fabricated completions reached the
founder verbatim with `receiptRendered: false`. Six distinct mechanisms, two of them introduced by the
previous two rounds' own repairs:

| | Example | Mechanism |
|---|---|---|
| (a) | `archive ACME then tell me` | the imperative IS recognised, then discarded because the last clause is a read. `lastClauseIsMutation` existed; there was no `firstClauseIsMutation` |
| (b) | `quickly archive ACME` | the request-frame prefix is a closed list of politeness frames with no adverb slot |
| (c) | `invite dorj@example.com as engineer` | an email address was not a referring object, so the whole invite family was invisible |
| (d) | `create a work order` | the finite-verb test matched the OBJECT NOUN — work/end/cost are in it |
| (e) | `ok go` | the confirmation follower set had no bare "go" |
| (f) | `ACME-г архивлана уу` | introduced by the V61-D6 repair: every sentence-final уу/үү was read as a question, so the standard Mongolian POLITE IMPERATIVE was discarded after its stem had already matched |

**(a) is the sharpest of the six**: the same defect class had been fixed for the company command-fallback
tier by the v59 hardening and was never carried into the request-intent tier the receipt rule depends on. A
repair made in one of two twins is a repair that will be re-found.

Closed with rules that are general rather than case lists: an adverb slot alongside the politeness frames; a
first-clause mirror of the last-clause rule; email addresses as referring objects; a finite verb never
directly follows a determiner ("a work order" is a noun phrase, "Share price fell" still has its verb); and,
for (f), the verifier's own discriminator — a finite non-past `-на/-нэ/-но/-нө` before `уу/үү` is a polite
imperative, while a participle or infinitive before it is a question.

**The first-clause rule then caused a regression the corpora caught immediately** — "assign a number to each
company and list them" started deriving intent, because starting with a mutation verb is not the same as
having a target. It now requires a STRONGER object than the tier it overrides: the first clause may only
override an explicit "and list them" if it NAMES something (proper noun, identifier, quoted string, email,
pronoun, entity noun). "archive ACME then tell me" names ACME; "assign a number to each company" names
nothing.

**V63-D2 (P2) — an asymmetry running in the unsafe direction.** `contextCompanyIds`, the gate that TRUSTS an
id, was made trim-proof in the previous round; `archivedCompanyIds`, the gate that REFUSES new work under an
archived company, still read the raw trimmed arrays. After a floor pass the id was trusted and no longer
known-archived, so a create landed under an archived parent — on turns that still answered. When two gates
read the same data and only one is hardened, the one that says "no" is the one that must be hardened first.

**V63-D1 (P2) — V62-D4 was not closed.** The exact count had been added to the FALLBACK memories query and
the factory-detail work-order query, but the PRIMARY paths are the `match_memories` RPC and the non-factory
`canonical_work_orders` query, and both envelope literals hardcoded `total: null` regardless. Closed with
separate exact head counts, and by separating two independent facts: **that rows were dropped is certain** —
the loop just dropped them — so `truncated` is now true on any trim, while the total stays null when it is
genuinely unknown rather than being invented from the surviving array length.

**V63-D6 (P2) — a malformed cap silently disabled the gate it configures.** `Number('twelve thousand')` is
NaN and every comparison with NaN is false, so a typo in `SEM_AI_MAX_TOKENS` emptied the whole optional pack
on every turn and reported `overBudget: false`, with no error. The incident record itself invites the founder
to edit that variable. All three caps now go through one NaN-safe parser, and the contract asserts it
behaviourally — a malformed cap must produce the same budget and the same trims as no cap at all.

**V63-D5 / D7 / D8 (P3)** — the minimum-safe assertion is unreachable from the trim loop, which is now stated
plainly in the source instead of left for a reader to assume, and its real reachability (a direct mutation of
a protected key from elsewhere in the block) is DEMONSTRATED by injecting exactly that mutation and requiring
a throw. The platform request-body limit is named in the inventory as a real whole-request gate. The pinned
witness no longer claims a 12,340 calibration it does not have: it is the saturated worst case at ~25,595.

**V63-D4 (P2) — six mutants surviving the whole 57-suite battery, three of them the last two rounds' own P1
fixes, pinned by the presence of a substring that a `false &&` would leave intact.** This is the finding this
round should be judged on, and it was closed generally rather than case by case — see #138b.

**Search performed for the same class.** Moving a Promise.all end marker broke two suites' slices open: they
had pinned the LAST query in the list, so adding two count queries silently extended their slice to the end
of the file and pulled in unrelated lookups. Both now locate the close of the block instead. A slice marker
that fails open is the same shape as an assertion that fails open.

**Regression.** `qa/scenarios-runner/v63_intent_coverage_and_caps_contract.mjs` (27/27, promoted, with four
checks rewritten from modelling the implementation to executing it and the D5 row rewritten to demonstrate
the assertion it is about). Corpora after the change: v56 129/0, v57 306/0, v58 48/0, v59 85/0, v60 22/0,
v61 25/0, v62 25/0, v63 27/0. Battery green apart from the two production-write-authority suites that are red
by design. Mutation proof 19/19. Vacuity sweep 44/44.

**Status.** Fixed on the candidate; NOT deployed. Production remains v92 source (function v94).
