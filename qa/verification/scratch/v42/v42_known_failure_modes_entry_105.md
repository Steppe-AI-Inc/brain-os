## #105-V. VERIFIER #42 — FAIL. The imminent arms were never guarded at all, and nobody had generated their truth direction

Verifier #42 returned **FAIL** on candidate `4f35700127b271d3e8cf68afb3ac0d5f772c4c5f` / index.ts
`ed3983dfb367a4adfd98fc8b160fa7a29ef733e3a4c1d0f44979bc40e66d33b8`. Thirteenth consecutive FAIL.
Own corpus: **669 truthful negatives / 259 fabrications**, generated from its own name and template
pools, with the labelled negator-token-NAME section in both directions. Result:
**135 truth regressions, 0 fabrication regressions**, 230 truths rescued vs v92, 76 extra
fabrications caught. Every number below was measured by re-executing probes from the filesystem,
not carried forward from a prior report.

### V42-D1 (P1, DEPLOY BLOCKER) — the EXECUTION_IN_PROGRESS *imminent* arms have NO subject guard

```
"You are about to archive ACME Holdings — this cannot be undone."      v92 preserves — candidate DESTROYS
"Starting the archive of ACME Holdings requires founder approval."     v92 preserves — candidate DESTROYS
"The finance team is in the process of updating the company."          v92 preserves — candidate DESTROYS
"Are you about to archive ACME Holdings? I cannot do that from chat."  v92 preserves — candidate DESTROYS
```
140 realistic guidance sentences generated (2nd person, 3rd person, conditional, interrogative);
**98 destroyed — 49 of 70 in the proper-name half and 49 of 70 in the lowercase half.** Deployed v92
preserves all 140. The class is **not** casing-dependent, so #41's proper-name lesson does not
explain it and does not cover it.

The last row is the sharpest: a **correct refusal** is replaced by the canned refusal
`"I can't actually do that from chat — nothing was changed…"` and persisted to
`work_orders.output`. The product overwrites a true statement with a false one about itself.

**ROOT CAUSE, read out of the bytes.** `EXECUTION_IN_PROGRESS` (index.ts:5432-5458) carries the
imminent alternations at lines 5453-5457 — `about to|going to|proceeding to|starting to`,
`in the process of`, `going ahead and|kicking off`, `starting the`, `let me`. The three guards
applied to `EXECUTION_IN_PROGRESS` at line 5675 are:

| guard | shape it requires |
|---|---|
| V41-F1 | `^<gerund> … <finite verb>` — anchored at `^` |
| the older object-shaped guard | `^<Gerund> <object pattern>` — anchored at `^` |
| the third-person progressive guard | `<Subject> is/are/was/were <gerund>` |

**Not one of them can fire on an imminent match**, because an imminent match is neither
clause-initial-gerund nor `<Subject> is <gerund>`. The arms were added in run12/D94 to close a
fabrication residual and have never had a guard of any kind.

**THE VACUITY, PROVEN BY GREP, AND IT IS THE SIXTH THIS CAMPAIGN.** The only imminent-arm coverage
anywhere in the entire test estate — 35 suites plus twelve verifier gates — is
`qa/scenarios-runner/run12_defect_closure_contract.mjs:202-203`, and **all of it is first-person
fabrications that must be caught.** Not one row anywhere generates the truth direction of the class.
run40 added `D94.hold.legit.1..3` after #39's finding, but those cover only the GERUND arm. This is
exactly the pattern of ledger #101 (#39) and #104 (#41): an arm validated in the direction it was
built for, in a family nobody re-generated.

### V42-D2 (P1, DEPLOY BLOCKER) — participle-initial ENTITY NAMES, wider than the disclosed row

```
"Confirmed - Archived Media Group. It is still active."                v92 preserves — candidate DESTROYS
"Confirmed - the company you asked about is Archived Media Group."     v92 preserves — candidate DESTROYS
"Confirmed - Archive Archived Media Group?"                            v92 preserves — candidate DESTROYS
"Confirmed - Restored Furniture Co. Nothing was changed."              v92 preserves — candidate DESTROYS
```
48 of 48 generated rows over twelve participle-initial names, and 614 of 654 in the wider probe.
The campaign discloses **one** row of this class. It is a class, and its third member is a
**QUESTION** — which cannot be a past-completion claim under any reading, so at least that member
does not need the entity signal to close. The fabrication twins (`"<Name> was archived."`,
`"I archived <Name>."`) all stay caught, so the referent really is the discriminator for the rest.

### V42-D3 (P3, REPORT-ONLY, shared with v92 — NOT a blocker)

`"No errors were reported and ACME was not archived."` is destroyed by the candidate. **v92 destroys
it too**, so it is a shared cost, not a regression. Pinned paired with a CONTRACT that fails the
instant the class stops being shared, per #41's rule for V41-D3, so it can never sit as furniture.

### WHAT IS GENUINELY CLOSED — confirmed independently, not taken on report

- **The gerund class (#39/#40/#41's defect) is CLOSED.** 3,200 descriptive gerund sentences
  engineered across proper-name and lowercase objects: **0 truth regressions.**
- **v30's and v31's standing reds are NON-BLOCKERS, re-derived from the deploy rule.** v31's
  contracted-negation gap: 480 generated rows (300 name / 180 lower), **0 truth regressions, 0
  fabrication regressions** — a missing negator can only make the belt fire MORE, never ship a
  fabrication. v30's is an inventory pin over belt LOCALS that went stale; its sibling
  truth-regression contract in the same file is green at 62/0.
- **The re-pins are honest.** Seven of the eight re-pinned pairs were re-checked through an
  independently built belt: fabrication caught AND paired real name surviving, asserted in the same
  predicate. (The eighth pair was this verifier's own invented pairing, not the suite's.)
- **run14/D107's character budget is GONE**, not widened to 2600 — it now scans to the statement
  end and throws `readsAsCompletion statement end not found`. Better than the fix described.
- **run15 = 57 pass / 0 fail** and the D117 no-whole-span-lookaround invariant holds.
- **Production row `9dda919c`** (`Project renamed: "X" -> "Y"`) is still caught, parity with v92.
- **203 identifiers added, 0 removed** vs v92. Nothing v92 declared was removed or reintroduced.

### THE CONTRACT 5 NARROWING IS SOUND, AND ITS SECOND COVERAGE ASSERTION IS NOT

The narrowing from a flat pinned sequence to TOP-LEVEL declarations only is **correct and honestly
evidenced**: it is accompanied by two coverage assertions that prove the narrowed detector still
fails for the reason it exists (inject a top-level `const nx` → must be detected) and does not
forbid safe changes (inject a local in `completionIsNegated` → must not trip). The stated reason is
real: the extractor-based suites rebuild the belt from a named list, so a top-level declaration is
silently dropped while a local travels with its brace-balanced function body.

**But the two coverage assertions are asymmetric.** The first requires `mutated !== TEXT` and so
fails loudly if its anchor moves. The second is written `mutated === TEXT || …`, so **if its anchor
`let n = -1;` ever disappears the assertion passes vacuously.** Both anchors exist today, so the
contract is live — but one of them is one refactor away from being furniture, in a campaign whose
defining failure mode is exactly that. Fix: make the second assertion fail-loud too.

### MUTATION PROOF — 8 LOAD-BEARING OF 11, CONTROL HOLDS, AND ONE NUMBER DOES NOT REPRODUCE

Run on COPIES through `SEM_INDEX_SRC`; `index.ts` was never written (sha re-asserted after).
A comment-only control mutation was a no-op, so the scorer is not noise.

| revert | verdict |
|---|---|
| `nameInternal` | LOAD-BEARING — 40 fabrications re-open |
| `titleHead` | LOAD-BEARING — 1 |
| `ppInternal` | LOAD-BEARING — 600 of 17,475 generated sentences change verdict |
| R-IDIOM leading form | LOAD-BEARING — 2 |
| R-IDIOM linker-free form (run32/D181) | LOAD-BEARING — 1 |
| R-AUXGAP contraction lookbehinds | LOAD-BEARING — 1 rescue lost |
| V41-F2 determiner negators | LOAD-BEARING — 4 truths re-destroyed |
| the older object-shaped gerund guard | LOAD-BEARING — 2 truths re-destroyed |
| bare-lowercase new-subject alternative | LOAD-BEARING — 6 fabrications re-open |
| **V41-F1 object-agnostic finite-verb guard** | **load-bearing for 8 of 3,200 shapes only** |

**V41-F1 does not reproduce.** Ledger #104 records "reverting V41-F1 re-opens 144 destroyed truths".
On the shipped bytes, reverting it changes **0 of 17,475** sentences in the general space and
**8 of 3,200** in a space engineered to isolate it — and all 8 are the bare-subject shape
`"Archiving can be undone."`. On every other shape it is fully redundant with the older
object-shaped guard, which is still present: F1 was **added beside** that guard, not, as the ledger
says, a **replacement** of it. The fix is not dead and must not be removed on this evidence alone
(that is the ledger #99 mistake in the other direction) — but the campaign's load-bearing number for
it is corpus-specific and should be restated against the shipped build.

### RULING ON THE ENTITY SIGNAL AND ON #37's PINNED LIST

The verifier was asked to choose among the three recorded options. **Option 1 — reference the
existing name maps inline at the point of use, adding no top-level declaration — with a mandatory
amendment. Option 2 is NOT authorised in this change: #37's list is not edited.**

The amendment matters, and it corrects the design note. Option 1 does **not** leave the extractors
untouched: an inline reference makes the belt slice contain a **free identifier**, so every
extractor-based suite must inject it or throw `ReferenceError`. That is a feature, not a cost —
it is *louder* than the silent-drop failure #37's contract exists to prevent. So:

1. the belt reads the set through **one** free identifier (e.g. `knownEntityNames`);
2. every extractor injects it as an **EMPTY Set by default** — which makes the design note's own
   third control ("an empty set must produce byte-identical verdicts") the *structural default* of
   the entire suite battery rather than a measurement someone has to remember to run;
3. absence-as-evidence therefore cannot creep in, and `V39-C-ENTITY.absenceIsNeverUsedAsEvidence`
   keeps passing by construction;
4. one dedicated non-extractor suite injects a POPULATED set and proves the positive signal.

**But the entity signal is not sufficient for deploy, and the campaign's critical path is wrong.**
It closes V42-D2 and nothing else. **V42-D1 is the larger class (98 of 140 realistic guidance
sentences, ~70%, both halves equally) and no entity-name signal touches it** — the destroyed
sentences do not contain a mis-read entity name, they contain an unguarded imminent phrase. The
critical path to deploy is **V42-D1 first**, then the entity signal for V42-D2.

**A DIRECTION FOR V42-D1, offered, not imposed.** The imminent arms describe an action *not yet
taken*, so they are only an execution claim when the **assistant itself** is the subject. A
first-person-subject requirement on those five alternations (`I|I'm|I am|Let me`, plus the
subjectless clause-initial `Starting the …`/`Kicking off …` fragment) buys back all 98 while
`V42-C1` shows the seven fabrications the arms exist for stay caught. Any such fix must be measured
on **both halves reported separately**, and must keep `V42-C1` green.

### EVIDENCE

Battery **35 executable `.mjs` suites / 34 exit0 / 1 exit1** — matching ledger #104's "35 files /
1 failing"; the launch prompt's premise that ledger #101 reads 34/0 is stale, #104 already corrected
it. Verifier gates re-measured: #32 101/0, #33 93/0, #34 57/0, #35 55/0, #36 61/0, #37 21/0,
#38 29/0, #40 77/0, #41 22/0; RED: v30 25/1, v31 33/1, #39 20/1, `standing_reds_classification_contract`.
**Exactly the expected-red set, no unexpected red.** Deployed function: `sem-ai-command` version 92,
`ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at 1788239725518`. Git `c9dfab5bd433` index.ts sha256 `795c20c82301aba1…` — confirmed by
this verifier.

**PROVENANCE IS INTEGRATION-LEVEL, NOT BYTE-DIRECT, AND THAT IS A REAL GAP.** `supabase functions
download` and `supabase link` are both refused by this session's command classifier, so the deployed
**bundle** could not be decoded to source here. The claim "deployed v92 == git c9dfab5bd433" rests
on the version number, the CI entrypoint path, and a prior campaign's recorded download — it is
**not** proven byte-for-byte in this run. It could not be refuted either. A deploy decision should
close this with one `functions download` from an unrestricted shell.

**CRLF.** The candidate blob is CRLF (5,989 CR pairs); the v92 blob is pure LF. `git diff --stat`
therefore reads 5,989 insertions / 4,312 deletions — the whole file on both sides, and meaningless.
After LF normalisation the real delta is **1,729 added / 52 removed lines**, in exactly one file
under `supabase/functions/`.
