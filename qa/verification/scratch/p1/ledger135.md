
## 135. The context-budget fix did not close its own class, and the never-silent receipt could be switched off by the model it polices — FIXED (2026-09-08)

**Found by** independent verifier #60 (campaign #120) on candidate `9e39a47` / index.ts `5d4e853c…`, which
returned FAIL and NOT DEPLOYMENT READY. Its full report and artifacts are on `verify-9e39a47-campaign120`
at commit `26748fd`. Every finding below was measured by the verifier against the real sliced source, not
inferred, and every closure below is pinned by a mutant.

**V60-D1 (P1) — a floor is a row count, not a byte count.** The trim loop skipped any collection already at
or below its floor and had no pass after it, so a workspace with few rows but long free text still sat over
the cap with nothing left to trim. `approvals` was not a `TRIM_ORDER` key at all. Measured with the real
block and production's own estimator: 20 pending approvals with 600-character reasons produced 12,730
tokens post-trim, a 3,000-character memory fact 12,912, and a 20,000-character command 14,963 — each of them
the incident's own `{"error":"Token preflight hard stop"}` with no answer. Worse, there was a 755-token band
in which deployed v92 answers and the candidate refuses, with zero trims possible: a regression against
production, not an intended departure. **Closed** by making `approvals` trimmable and adding two further
passes with harder floors (2, then 0) that run only when the first cannot reach the budget. Emptying an
optional collection stays truthful: the envelope keeps the real total with `truncated: true`, and any named
entity is still resolved server-side.

**V60-D1 residual (found this session) — the refusal itself was not actionable.** A command larger than the
budget can never be trimmed to fit, and that is a legitimate refusal, but the founder received a bare number.
It now states which input could not be reduced, what to do about it, and that nothing was changed. The
inventory suite asserts an oversized command and an oversized workspace get different, actionable messages.

**V60-D2 (P1) — the budget discarded the row the founder had just named.** The targeted named-entity lookups,
added to close the 2026-08-30 "test4" fabrication, were merged at the array TAIL while the trim slices the
HEAD. The named task and goal were already lost at the shipped cap on an ordinary workspace; all four went in
a floor-shaped one, taking the belt's entity-signal rescue with them. **Closed** by merging named rows first,
at all four sites.

**V60-D3 (P1) — the model could switch off the gate that polices it.** `requestIntent` is emitted by the
model and is prompt text, not a schema-enforced field, and a declared `kind:"read"` or `"other"` vetoed the
request lexicon outright: 37 of 37 imperative mutation requests shipped a fabricated completion verbatim.
**Closed** by removing model-emitted intent from the veto entirely. The model's classification may ADD intent
it recognises; only request-side evidence can remove it. This is `OPERATING_TRUTH_MODEL.md` §3 applied
literally, and it reverses `v59` contract C4b, which had asserted the veto — see the note in that suite.

**V60-D4 (P1) — 33 of 37 ordinary business imperatives were outside the request lexicon.** With the model
emitting no classification, `cancel`, `schedule`, `send`, `publish`, `share`, `upload`, `duplicate`, `copy`,
`grant`, `notify`, `pay`, `import` and twenty more shipped the fabrication. Measured end to end against v92
on the shipped summary across 920 pairs, 290 (31.5%) were cases where v92 corrects and the candidate ships.
**Closed** by an imperative-position tier: the founder's command, with ordinary request frames stripped,
beginning with a mutation verb in base form and carrying an object. Position is a property of what was ASKED
and cannot be switched off by the component being policed. A verb the product cannot execute from chat lands
here by design and gets a truthful "no change was made" receipt, which is the right answer to "email the
report to the client" and far better than the model's own "Sent."

**V60-D7 (P2) — one execution path never read its own postcondition.** `executeOneAction` derived success
from `changed === true` and the confirmed-plan path then recorded a VERIFIED envelope for any action it
called "completed", so the plan path reported "done." for exactly the case the direct path refuses. **Closed**
by carrying `postconditionPassed` through every branch, from the RPC's own jsonb where there is one and from
the returned row where the write is direct, and by passing that value to `recordExecution` instead of `true`.

**V60-D8/D9 (P2) — a guard that only saw the shapes it already knew.** The collection-envelope contract
derived its key list from a value-shape regex, so an array written as an expression entered the pack with no
envelope and no trim entry while the whole battery stayed green; the verifier proved it by adding
`salaryBands: (approvals.data||[]).slice(0,20)` and watching nothing fail. **Closed** by inverting it: every
key in the pack literal is enumerated and must be either a declared scalar or a collection that carries
shown/total/truncated AND a place in the trim order. A key nobody classified now fails loudly, whatever
shape its value is written in.

**V60-D5 (P3) — "same estimator" was asserted by matching two different string literals.** The loop measured
`{command, pack}` while the preflight measures `{command, contextPack}`, a different object shape, for a
measured gap of 19-145 tokens, and the assertion passed anyway. **Closed** on both sides: the loop measures
the preflight's shape, and the contract now compares the argument shapes the two expressions actually build.

**Root cause, in the verifier's words and confirmed here: the same measurement error as #133, one level up.**
The trim was measured on a fixture where everything was trimmable, and the belt-vs-v92 differential had since
campaign #90 compared the matcher rather than the shipped summary — which is why "0 fabrication regressions"
was reported four times while 31.5% of the corpus was shipping. A fixture that cannot fail is not a
measurement.

**Search performed for the same class.** Two further defects of exactly this kind were found and fixed here
before the verifier's own findings were addressed: the trim loop measured the pack before attaching a field
whose size grows with the number of trims, and the headroom fixture left 20 of 24 collections empty (ledger
#134). The whole-request gate inventory now enumerates and classifies every gate.

**Regression.** `qa/scenarios-runner/v60_budget_intent_and_plan_evidence_contract.mjs` (22/22, promoted from
the verifier's own suite with only its D8 probe rewritten from implementation to behaviour),
`architecture_context_budget_contract.mjs` (30/30), `request_gate_inventory_contract.mjs` (28/28),
`architecture_collection_envelope_contract.mjs` (84/84, inverted). Mutation proof
`qa/verification/scratch/p1/mutation_proof_v60.mjs`: **9 mutants, 9 killed, 0 survived**, index.ts verified
byte-identical after every run. Intent corpora after the change: v56 129/0, v57 306/0, v58 48/0, v59 85/0,
v92 parity 46/0, open regressions 28/0.

**Two defects were introduced by these fixes and caught by the existing corpora before commit**, which is
the corpora doing their job: a capitalised weekday read as a proper-noun object ("the store will reopen
Monday"), and a negated imperative losing its intent when the verb-anywhere tier became position-gated ("do
not archive Alpha" must yield a "you asked me not to" receipt, never a fabricated confirmation). Both are
fixed and pinned.

**Status.** Fixed on the candidate; NOT deployed. Production remains v92 source (function v94). A fresh
independent verifier and a fresh founder authorization are required before any redeploy. Verifier #60's
verdict stands as FAIL against `9e39a47`; it says nothing about these bytes.
