# v25 PROMOTION NOTE — campaign #85, verifier #25

Candidate `164b3ee08b0f394eeda37a7e5dd39ff860616967`, index.ts sha256
`e88370a92f5dc2e89d2014e3ec2f1267056ba0021732e423736b4065884f5834` (unchanged by this campaign —
asserted at preflight, before/after every mutation, and at the end).

**VERDICT: FAIL.** Do not promote `164b3ee` as the D158 closure. FIX-C closes the eleven sentences
#84 wrote and leaves the same regression against `4476c92` open for every shape with a token
between the auxiliary and the evidential verb (D160), and for every active intransitive evidential
(D160b).

---

## 1. What to do, in order

1. **Apply FIX-D** (below) to `supabase/functions/sem-ai-command/index.ts`. One line replaced;
   it deletes eleven lookbehinds and adds none.
2. **Optionally apply FIX-E** (below) in the same commit — it closes D161, a pre-existing P4 in
   the same defect class, with zero measured collateral.
3. **Promote `qa/verification/proposed/v25_regression_additions.mjs` into
   `qa/scenarios-runner/run25_defect_closure_contract.mjs`**, and **retire
   `run24_defect_closure_contract.mjs`** (its D158 pins are a strict subset of run25's, and its
   case notes are stale — see §4).
4. **Re-point the promoted file's header** at whatever the new candidate sha256 actually is
   before committing, and **update the D160/D160b/D161 `[DEFECT]` notes** to say what is true on
   the candidate it lands on. Do not repeat #23/#24/#25's stale-note papercut a fourth time.
5. **Append `v25_known_failure_modes_entry_85.md` to `qa/KNOWN_FAILURE_MODES.md`** as `## #85`,
   with a run25 closure postscript underneath.
6. **Do not deploy.** Production stays `sem-ai-command` v92 (`ezbr_sha256 33255b31…`), which is
   where I found it and where I left it.

---

## 2. FIX-D — the required change

**File:** `supabase/functions/sem-ai-command/index.ts`
**Location:** the `return` statement of `const completionIsNegated` (the FIX-C line, currently the
only line in the file containing both `return n >= m.index ||` and `(?<!was )`).

Replace that single line with:

```ts
          return n >= m.index || /\b(?:that|which|who|whom)\b/i.test(c.slice(n, m.index)) || /\b(?:show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?)\b/i.test(c.slice(n, m.index).split(/\s(?:and|but)\s|\b(?:although|though|however|therefore)\b/i).pop() ?? '')
```

(the following line, the coordinator/subordinator disjunct, is unchanged).

**Why this and not a wider lookbehind.** Voice is the wrong axis. What makes an evidential
subordinate the completion is that **no clause linker sits between the evidential and the
completion verb** — `No log HOWEVER SHOWS X was archived` keeps its evidential in the last
segment and disarms (D156); `No errors were [ever] REPORTED AND X was archived` and
`No auditor REPORTED AND X was archived` both push it out of the last segment and fire
(D158/D160/D160b). One rule, both sub-families, and it does not care how many adverbs, negators
or contractions the model writes.

**Constraint compliance:** no lookbehind (it removes eleven), no `(?-i:`/`(?i:` modifier group, no
new `const`, still a single statement so run15/16/17/18's source slicers are unaffected,
`beltConstSetUnchanged` in run24 stays green.

**Measured (candidate vs the identical candidate with only that replacement):**

| corpus | candidate | FIX-D | `4476c92` |
|---|---|---|---|
| D160 adverb/contraction/whitespace family (62) — CAUGHT | 5 | **62** | 62 |
| D160b active-intransitive family (28) — CAUGHT | 0 | **28** | 28 |
| D158 #84's eleven — CAUGHT | 11 | **11** | 11 |
| D156 active-complement (17) — SURVIVE | 17 | **17** | 4 |
| my truthful corpus (50) — DESTROYED | 0 | **0** | 5 |
| founder-directed lexical branch (450) | 450/450 | **450/450** | 450/450 |
| full 32-suite battery | 32/32 green | **32/32 green** | — |
| `v25_regression_additions.mjs` | 402/38 | **434/6** | — |

## 3. FIX-E — optional, same commit, closes D161

**Location:** the `.some((c) => …)` arm of `const readsAsCompletion`, immediately before
`(LEGACY_PAST_COMPLETION.test(c) || EXECUTION_IN_PROGRESS.test(c) || …)`.

```ts
            && !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has been|had been|be)\b/i.test(c)
```

Closes D161 (`ACME may possibly have been archived.` and four more hedges stop being destroyed).
Measured: **5 hedges recovered, 0 fabrications lost** on a 14-case modal-bearing fabrication set
including `I can confirm ACME was archived.` and `ACME was archived and you may verify it in the
log.` With FIX-D + FIX-E: **`v25_regression_additions.mjs` 440/0, full battery 32/32 green.**

If FIX-E is *not* taken, the six D161 `[DEFECT]` pins in `v25_regression_additions.mjs` must be
re-labelled `[RESIDUAL]` at their current behaviour before promotion, and D161 must be added to
the postscript's DOCUMENTED RESIDUALS list — not silently dropped.

## 4. Bookkeeping that must land in the same commit

- **Correct the collateral claim.** "Strictly better than `4476c92`" is false. State both
  directions with the corpus size and the SHA: better in the truthful direction, worse in the
  fabrication direction until FIX-D lands.
- **Add D158d to the ledger's residual list.** It is pinned `[RESIDUAL]` in `run24` and appears
  in no ledger entry's disclosure set.
- **Fix `run24`'s (or run25's) D158 case notes** — `"Caught 12/12 at 4476c92; missed 11/12 here"`
  and the per-case `"caught at 4476c92, missed here"` are false on the candidate the file was
  promoted onto.
- **Correct "the file already ships 12 [lookbehinds]"** → the *belt* ships 12; the *file* ships 17
  at `e6a4d02` and 28 at this candidate. (FIX-D takes it back to 17.)
- **`deno check` is still not re-derived by an independent verifier** — two campaigns running.
  Either make `deno` available to the verification environment or stop reporting the number as
  evidence.

## 5. Standing rule this campaign adds

#84 recorded: *"when a closure widens a lexicon, its collateral set must include cases built from
that exact lexicon in the OPPOSITE syntactic position."* That was followed, and it was not enough.
Add:

> **A closure must not adopt the reporting verifier's example sentences as its acceptance
> criteria.** The reporter's examples are a sample of a class, drawn from whatever the reporter
> happened to type. A closure's own corpus must be generated from the CLASS — for a positional or
> adjacency-based fix, that means systematically varying what sits between the tokens the fix
> tests (adverbs, negators, contractions, extra whitespace, the token being absent entirely).
> `run24` pinned D158 with #84's eleven sentences verbatim; all eleven happened to place the
> auxiliary directly against the verb, and the fix was measured "11 → 0" against them while the
> class stayed 5/62.

## 6. Untouched / not verified

- **Production:** read-only checks only. `sem-ai-command` v92 ACTIVE, `ezbr_sha256`
  `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at` 1788239725518 —
  identical to what #75–#84 recorded. Nothing deployed, nothing written.
- **No DB push, no migration, no `supabase db push`** — none was needed; this campaign is entirely
  an Edge-Function source-level verification.
- **`deno check`: BLOCKED** (no `deno` binary, `npx deno` unavailable in this session).
- **No browser / live AI-chat verification was possible in this session** — the candidate is not
  deployed anywhere, so there is no running system exhibiting this code to drive through a UI or
  a chat channel. All evidence here is `UNIT VERIFIED` / `CODE INSPECTED` against the shipped
  predicates extracted from the exact candidate bytes, plus `LIVE VERIFIED` for the read-only
  production version check.
