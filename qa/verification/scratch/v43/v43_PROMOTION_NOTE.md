# v43 PROMOTION NOTE — what to adopt, in what order, and what each item costs

Verifier #43, campaign #103. Candidate `0007a02abd1855f438ccf9e5c735ac0ea42ae4ff`,
`supabase/functions/sem-ai-command/index.ts` sha256
`7b9fd136cdc0379b2efeb56e2adf0738df8c980e6b7153cea43900d65405c0cd` — **unchanged; nothing in this
note has been applied**. Verdict **FAIL**, EDGE STATUS **NOT DEPLOYMENT READY**, production stays
v92.

---

## Order

### 1. FIRST, before any Edge change — fix the suite, because it is why nobody saw the rest

`qa/verification/proposed/v43_entity_signal_positive_contract.FIXED.mjs`
→ replaces `qa/scenarios-runner/entity_signal_positive_contract.mjs`.

Only the `check()` helper changes. It now finds the boolean among its arguments and prints
`VACUOUS` + fails when there is not one. The four call sites are deliberately left alone, so the
diff is small and the fix protects future call sites too.

* on the candidate: **5 passed, 0 failed** (the assertions really do hold — the signal works)
* on a mutant with the signal disabled: **4 passed, 1 failed** — the property the suite never had

Do not "fix" this by editing the four call sites only. The helper is the guard.

### 2. THEN the two Edge fixes that clear the deploy blockers

Both are built from the shipped bytes by a script that asserts its anchor is unique and refuses
otherwise. Run them in order; each takes an input path and an output path.

```
node qa/verification/scratch/v43/v43_build_fixD3.mjs  supabase/functions/sem-ai-command/index.ts  /tmp/a.ts
node qa/verification/scratch/v43/v43_build_fixE.mjs   /tmp/a.ts                                    /tmp/b.ts
```

**fix D3** — the CONFIRMED disjunct's state-continuation window gets a *second* alternative that may
cross exactly one sentence boundary, only into a sentence opening with an anaphor (It/They/This/
That), only towards a strong state verb (remains/stays/continues/still/exists), with a
case-insensitive negator block and a Title-Case-object requirement. The original branch is byte-
identical inside the new group.

> Do **not** take the shortcut. Widening the existing window to `[^]` was tried and measured: it
> ships `run15/D117.suffixDisarms.4` and `.5` — `"Confirmed — Removed Bob Smith. There is no undo."`
> — because `is` in the next sentence satisfies the bare-copula branch.

**fix E** — three lookbehinds `(?<!\bis )(?<!\bare )(?<!\bam )` added to `CONFIRMED_COMPLETION`'s
existing lookbehind chain. A completion participle immediately preceded by a present-tense copula is
a state or a predicate nominal, never the completion event. This is the asymmetry `COMPLETION_VERB`
and run19/D137 already depend on; `CONFIRMED_COMPLETION` was the one place it was never applied.

### 3. THEN the P2, which only matters once the signal is real

```
node qa/verification/scratch/v43/v43_build_fixF.mjs  /tmp/b.ts  /tmp/c.ts
```

**fix F** — the entity rescue is keyed on a prefix match but was applied to the whole reply, so a
fabrication riding along with a known name was excused wholesale. It now requires the text after the
matched `<Participle> <Name>` phrase to carry no other completion participle and not to continue the
object list with a coordinator plus a further proper name.

---

## Measured, on the stacked build `index.fixD3EF.ts`

| gate | candidate | stacked |
|---|---|---|
| battery (36 asserting `.mjs`, child exit codes) | **36 executed / 1 failing** | **36 / 0** |
| `standing_reds_classification_contract` | RED, derived-BLOCKER 1 | **GREEN**, derived-BLOCKER 0 |
| `v43_regression_additions.mjs` (this round) | 36 / 4 | **39 / 1** (the 1 is V43-D4, a QA-file fix) |
| v43 own corpus, 921 rows | truth regression 1 shape, fab regression 0 | **0 / 0** |
| `Confirmed —` generated space, 784 truths | **672 destroyed** | **0 destroyed**, fabrications shipped identical (140/1358, v92 catches 0) |
| v42's own 48-row class, EMPTY pack | 36 destroyed | **12** |
| v42's own 48-row class, pack populated | 12 destroyed | **0** |
| v30 / v31 / v32 / v33 / v39 / v41 / v42 gates | 25/1, 33/1, 101/0, 93/0, 21/0, 22/0, 12/1 | **identical** |

v42 stays 12/1 on purpose: the last 12 rows are `"Confirmed - <Name>. Nothing was changed."`, which
really is entity-bound — nothing lexical separates it from `"Confirmed - Archived ACME. Nothing was
changed."` — and the entity signal closes it.

---

## What NOT to do

* **Do not deploy the candidate as committed.** Two truthful-answer classes deployed v92 preserves
  are destroyed by it: 672 of 784 in one generated space, 96 of 112 in the other.
* **Do not record either of them as a "disclosed residual".** Both are closable, both were measured,
  and that word is exactly what let a blocker sit red through four verifiers (ledger #102).
* **Do not read `entity_positive_contract: 5/0` from any prior checkpoint as evidence.** Until the
  helper is fixed, four of those five assertions cannot fail.
* **Do not treat provenance as closed.** `functions download` is still refused by the verifier
  session's command classifier; the deployed-v92 link is integration-level (version 92, CI entrypoint
  path, a deploy 44 s after `c9dfab5b`, both committed reference copies hashing to `795c20c8…`). One
  `functions download` from an unrestricted shell closes it, and it should happen before any deploy
  is called done.
* **Do not remove V41-F1.** Ledger #106's retraction of the "144" is confirmed (0 of 17,160 in a
  general space) — but the fix is still load-bearing on the bare-subject shape (22 of 352), and
  `V43-C8` now fails if it becomes a no-op *or* if it is removed.

---

## Still open after all three fixes

1. **V43-D4** until the suite fix lands.
2. **The 12 entity-bound rows** in v42's class, closed by the signal when the name is in the pack.
   `knownEntityNames` is built from companies + people + tasks + `runtimeLabels` only — **projects,
   goals, departments, approvals, documents and proposals are never in it**, so the equivalent
   truthful report about those resources is never rescued. That is a one-line extension
   (`projectTitleById`, `goalTitleById`, `departmentNameById`) and it is the obvious next item.
3. **28 of 168 negator-name fabrications** in progressive shapes (`"I'm now archiving No Limits
   Inc."`, `"Archived No Limits Inc — no undo available."`): `nameInternal` needs an auxiliary and the
   progressive arm has none. v92 misses them too, so not a v92 regression — but it is the direction
   `NEG-NAME` was built for and it is not fully closed.
4. **CONTRACT 5's second coverage assertion** (`mutated === TEXT || …`). One token from fail-loud.
   `V43-C7` makes the anchor's existence a measured fact in the meantime.
5. **The CRLF blob.** The committed `index.ts` is CRLF where v92's is LF, so the whole file differs
   at byte level for a 1,738/52-line semantic change. Inert for Deno, but it defeats any source-hash
   provenance check and `.gitattributes` pins `eol=lf` for the v92 reference copies and not for
   `index.ts` itself. Worth deciding deliberately rather than inheriting.
