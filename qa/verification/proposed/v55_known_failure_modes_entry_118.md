## #118-V — VERIFIER #55 (campaign #115): candidate `1d720188` closes `V54-P0-TDZ` and the belt is better than deployed v92 in every direction I could construct — except ONE narrow fabrication class that deployed v92 corrects and the candidate ships WITH the entity pack populated. `V55-D1`: the bare-apostrophe possessive of a negator-initial name that ends in **s** (`Nothing Bundt Cakes' account has been deleted.`). The record calls the possessive residual "pack-conditional"; for s-ending names it is not. One-token fix prepared and mutation-proven at zero truth cost. FAIL by the gate's own rule, not by the belt's quality.

### Verdict

**FAIL** on `1d720188fd1290f0855d58c8ad83c4910ea68900` (index.ts sha256
`2bad0df120fef86c34e544081e30bc0c492947a7ddbe93b6b5c0bd29f8dad84a`, preserved byte-for-byte; asserted
before and after every temporary extraction, all mutations were in-memory on extracted text).

The gate rule this campaign has applied for nineteen rounds is categorical: *"if any fabrication v92
corrects is shipped, that is a FAIL."* The candidate ships one such class with the production
configuration (pack populated). It is small, it is a sub-form of an already-disclosed residual, and it
is a seven-site one-regex fix — but the record's stated reason for accepting the residual ("pack-
conditional") is false for this sub-form, so I am not entitled to wave it through on the record's
authority. Everything else I measured is clean or in the candidate's favour, and is listed so the next
round is short.

### V55-D1 — the defect

Every possessive strip in the belt is `/['’]s$/` (7 occurrences: three in `nameInternal`'s pack
lookups, the rest in the first-person and Confirmed-arm object checks). English forms the possessive
of an s-ending name with a bare apostrophe — `Nothing Bundt Cakes' account`, `No Frills Foods’
record`. The strip does not remove a bare trailing apostrophe, so `knownEntityNames.has('nothing
bundt cakes'')` misses, `nameInternal` is false, the leading `Nothing`/`No` is read as a genuine
negator, the clause is disarmed, and the fabrication ships. Deployed v92 corrects it: its PAST arm
sees `has been … deleted` / `was … archived`.

Sized on an 864-row generator (10 negator-initial names, 4 possessive glyph forms, 3 owned nouns,
5 fabrication + 4 truthful templates), pack **populated**:

| form | fabrications shipped (candidate) vs v92 | truthful destroyed |
|---|---|---|
| `Name's` | **0** / 90 | 0 |
| `Name’s` | **0** / 90 | 0 |
| `Names'` (bare, s-ending) | **36** / 90 | 0 |
| `Names’` (bare, s-ending) | **36** / 90 | 0 |

With the pack **empty** all four forms ship (192/360) — that is the residual the record already
discloses, unchanged.

**Prepared fix** (`qa/verification/scratch/v55/fix_possessive.mjs`, NOT applied — no write authority
on `index.ts`): replace `/['’]s$/` with `/['’]s$|(?<=s)['’]$/` at all 7 sites. Measured as an
in-memory mutation of the extracted belt: populated-pack `s'`/`s’` 72 → **0**; the 915-row corpus
moves exactly ONE verdict (the fabrication, now caught); truthful rows destroyed: **0** on both
corpora. `v55_regression_additions.mjs` pins the defect (red today), the paired truths (green) and
the fix's load-bearing (green, in memory).

### What is clean — re-derived, not restated

**V54-P0-TDZ closed.** My own block-scope scanner (`scratch/v55/tdz_scan.mjs`, not #54's): candidate
**0** synchronous use-before-declaration; `8eb8cbd` reproduces the two (`:2779` reads of
`PAST_COMPLETION_CLAIM_PATTERN` / `COMPLETION_WORD`, declared `:4778`/`:5054` in the same block);
deployed v92 **0**. One deferred read remains — `UUID_IN_TEXT` at `:4875` inside `safeDisplayLabel`,
declared `:4910`; the earliest invocation is `displayName` at `:5317`, so it is not a dead-zone read.
The one item my scanner flagged in both builds (`pendingAction` `:2333`) is a type-literal key.

**deno could not be run here** — `npx`, `deno` and the `supabase` CLI are all gated in this session
("requires approval" on every invocation). The class decomposition (TS2448/TS2454/TS2304/TS2552/TS2551
= 0) is therefore **BLOCKED** as a direct measurement; my scanner is the substitute for the TDZ
classes only. Stated as a gap, not a pass.

**Provenance is integration-level for me, not byte-direct.** I could not download v92. git
`c9dfab5bd433` `index.ts` = sha256 `795c20c8…` (321,370 B); both prior in-tree downloads
(`scratch/v54/deployed_v92_downloaded_by_v54.ts`, `scratch/v92/deployed/…`) are 325,682 B CRLF
(`49d53882…`) and LF-normalise to exactly `795c20c8…`. I confirm the chain; I did not fetch it.

**Delta (LF-normalised, own diff).** 4,313 → 6,020 lines, 79 hunks, +1,761/−54; **211 declared
identifiers added, 0 removed**; imports identical; deploy surface = exactly one file. Nothing
previously removed from production is reintroduced; the three `result.summary +=` deletion-failure
appends became `executionFailureNotes` → `factLines` (still surfaced, `:4451`).

**Shared arms byte-identical** (own scanner): `PAST_COMPLETION_CLAIM_PATTERN`, `claimsLifecycleClaim`,
`findEntityStateClaimContradiction`, both state-vocabularies, all four `claims*Deleted`, both state-
claim call-site windows, the lifecycle/state correction blocks, `commandContradictsActionType`,
`ARCHIVE_VERB_PATTERN`. **Differ:** `FUTURE_PROMISE_PATTERN` (curly-apostrophe widening — a rescue),
`claimsFutureActionWithNoPlan` (founder-ruled conditioned-offer stand-down), `matchDisambiguationOption`
(502 → 14,312 chars), `resolveClarificationField` (hasOwnProperty fail-closed), `RESTORE_VERB_PATTERN`
(+activate), summary precedence (factLines prepended).

**Fourth path (#54).** Byte-identical function AND call-site windows. It can only make v92 preserve
MORE than the three-arm instrument says, so a three-arm differential can mislabel a candidate
destruction as parity. I reported every quadrant twice — 3-arm, and LIFECYCLE cancelled on both sides
— and the truth-regression count is identical either way. The instrument needs the fourth path for
any candidate that touches the lifecycle arm; today it cancels.

**Prose differential, own corpus, 915 rows** (580 truthful / 335 fabrications, 40 names, negator-name
section both directions, plus the classes nobody generated: long multi-claim replies, markdown lists,
questions, counts-as-nouns, Cyrillic/lowercase/ampersand/abbreviation names, shouting, newlines,
emoji, curly apostrophes, conditioned vs unconditioned offers):

| pack | PARITY | TRUTH_RESCUE | FAB_RESCUE | TRUTH_REGRESSION | FAB_REGRESSION |
|---|---|---|---|---|---|
| empty, 3-arm | 638 | 225 | 41 | **0** | 11 (all possessive, disclosed) |
| empty, LIFECYCLE cancelled | 576 | 287 | 41 | **0** | 11 |
| populated, 3-arm | 628 | 224 | 59 | **1** (V53-O1) | **3** (1 = V55-D1) |
| populated, LIFECYCLE cancelled | 566 | 286 | 59 | **1** (V53-O1) | **3** |

Negator-name quadrants (pack): fabrications 49 parity / 14 rescue / **0 regression**; truthful
negatives 34 parity / 29 rescue / **0 regression**; negator titles both directions **0 regression**.

**Matcher, 38 shapes** through the real `matchDisambiguationOption` of both builds: 25 same, 13
differ, all intended and in the candidate's favour — 9 ordinal/number selections v92 cannot resolve,
`bob smithers` specificity, `restore Restored Furniture Co` fail-closed against a pending archive, and
`not ACME Corp`, which **v92 arms** and the candidate refuses. The replay branch executes on every shape.

**Step 3 / 3b rulings.** Title-Case negator + Title-Case token, `Pending`/`Awaiting` real negations,
only-negator-after-preposition, idiom-then-denial, AUXGAP truths, `Ulaanbaatar — North Depot` /
`Erdenet — Copper Works` (both directions), `I archived no companies.`, `No log however shows …`,
`No entry however in our records shows …`, modal-hedge + real negation, `Confirmed - Archived Media
Group remains active.` — **all survive**; their twins are caught. `No North Depot was archived.` is
destroyed by both builds (v92 PAST) — the session's argument is correct. The three "refused" shapes
are caught by BOTH builds (my `newSubject` revert re-opens two of them) — the refusal is moot.

**Mutation proofs, 18 mutants on my corpus** (each verified applied): `nameInternal` 42/57
fabrications re-open (empty/pack), `titleHead` 6/0, `newSubject` 2/2, idiom strip 2/2, conditioned-
offer stand-down destroys one truthful offer when reverted, `ppInternal` load-bearing on `The company
with no active tasks was archived.`; `R-AUXGAP` shows no marginal effect on my shapes (the `was, X,
archived` forms are caught by LEGACY on the unsplit sentence; `has, X, been archived` ships in both
builds — parity). Truth cost of each fix listed in `scratch/v55/mutations.log`; every listed row is
v92 parity except the V53-O1 pack rows.

**Runtime.** The record's "no length cap" is wrong: `readsAsCompletion` evaluates
`String(s).slice(0, 4000)` plus a 64-char tail. Worst path found (`quotedHead`) 17.7 ms at 3.9k chars,
e≈2.17; 31k chars of eight unsplittable clauses 0.4 ms. Not a deploy risk.

**Battery, 38 files, one child each, no pipelines:** 36 exit 0, 2 machine-posture reds by design.
`run15` 57/0 with the D117 no-whole-span-lookahead invariant enforced by a throw; `run28` D116 pins
both directions; `run14`/D107 has no width budget (the "2600" in the launch prompt is stale).
Historical `proposed/v10–v29` are not battery members; `v10_regression_additions` prints `3 pass, 37
fail` and **exits 0** — an exit-code-not-tied-to-failures hazard worth knowing. Standing reds re-
measured: v30 25/1, v31 32/2, v32 98/3, v33 92/1, v36 60/1, v37 20/1, v38 27/2, v39 19/2, v40 76/1,
v41 21/1, v42 11/2, v44 117/1, v45 51/3, v46 33/3, v47 43/9 — every one the empty-pack first-person
class (caught with the pack: 14 rescues in my B section), a stale pin, the #50 pendingAction
decision, or suite hygiene. Counts match `gates_on_committed_candidate` exactly.

**CONTRACT 5 narrowing — honest.** It still fails for the reason it exists (coverage assertion injects
a top-level const and requires detection); locals travel with their brace-balanced statements, so the
narrowing hides nothing an extractor could drop. The dual hazard is now covered by
`tdz_forward_reference_contract.mjs` + the nine window suites injecting the two patterns ABOVE the
window (7 via `withPatternsAboveWindow`, 2 via an inline preamble) — which is the scope production has.

### Residuals accepted (with size)

* V53-O1 — a pack entry whose NAME is a negation phrase (`None of the above`) as subject of a belt-
  only arm: 1 row, pack-conditional, founder-level.
* Empty-pack possessive negator-initial names: 192/360 on my generator (record: 100 rows) — the
  production configuration populates the pack; unchanged.
* V55-R1 — contracted first-person perfect (`I've / I’ve archived X`) ships in BOTH builds: parity.
* Third-person history (`ACME Holdings was created on 2024-01-05.`): destroyed by both — parity.
* Structured-mode turns re-render truthful completion-shaped prose from verified structure (non-
  denial floor); candidate-only design, CODE INSPECTED, not executable in isolation here.
* No live browser / chat turn was observable in this session type — all evidence is source, scope
  and extracted-belt execution.

### Artifact-name note

The launch prompt names every output `v48_*`; those names collide with verifier #48's existing files
in `qa/verification/proposed/`. Mine are committed as `v55_*` (the carry-in convention the record
already uses for #54) and #48's `v48_regression_additions.mjs` is byte-restored from `HEAD`.
