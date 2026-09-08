# v24 PROMOTION NOTE — verifier #24, campaign #84

Candidate under test: `89a1ac9` (closure `e6a4d02`), index.ts sha256
`bf5e757f4e813b20a11a074d894192685946e1ef469b8e59647cc67c54118066`.
**Verdict: FAIL** — D158 (P2), a regression against `4476c92` that partially reopens D147b.
Ledger entry to append: `qa/verification/proposed/v24_known_failure_modes_entry_84.md`.

`index.ts` was **not modified** by this campaign. sha256 asserted at preflight, before and after
every mutation, and at the end — identical throughout. Nothing was deployed; production
`sem-ai-command` remains **v92 / `33255b31…`**, read-only-verified.

---

## 1. FIX-C — the one change this campaign asks for (D158)

**One line**, in `completionIsNegated`'s first disjunct (index.ts ~line 5590).

```diff
-          return n >= m.index || /\b(?:that|which|who|whom|show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?)\b/i.test(c.slice(n, m.index))
+          return n >= m.index || /\b(?:that|which|who|whom)\b|(?<!was )(?<!were )(?<!is )(?<!are )(?<!am )(?<!be )(?<!been )(?<!being )(?<!has )(?<!have )(?<!had )\b(?:show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?)\b/i.test(c.slice(n, m.index))
```

**Why it is the right shape.** The four true relativizers stay unconditional — they are
unambiguously subordinating. The twelve evidential verbs are admitted only when they are *not*
immediately preceded by a passive/perfect auxiliary, i.e. only when they are the **active,
complement-taking** predicate FIX-A was written for. `No log however SHOWS ACME was archived` keeps
its complement reading; `No errors were REPORTED and ACME was archived` does not.

**Measured** (candidate vs the identical candidate with only that replacement, both driven through
the real extracted `readsAsCompletion`):

| axis | candidate | FIX-C | `4476c92` |
|---|---|---|---|
| D158 passive-evidential fabrications CAUGHT | 0/11 | **11/11** | 11/11 |
| D156 evidential-complement negatives SURVIVE | 13/13 | **13/13** | 0/13 |
| D147b non-evidential leaks CAUGHT | 8/8 | **8/8** | 8/8 |
| my 32 truthful first-person NOT destroyed | 32/32 | **32/32** | 19/32 |
| my 25 first-person completions CAUGHT | 25/25 | **25/25** | 25/25 |
| `v24_regression_additions.mjs` | 196 / 11 fail | **207 / 0 fail** | — |
| full 32-suite battery | 0 failing suites | **0 failing suites** | — |

**No pin has to move in the same commit.** Unlike the last two campaigns, FIX-C moves no
`[RESIDUAL]` anywhere in the battery — run23's own residual pins all stay at their pinned values.

**Deno risk: none new.** FIX-C adds only FIXED-LENGTH lookbehind groups. `LEGACY_PAST_COMPLETION`
already ships four of them (`(?<!may )(?<!might )(?<!could )(?<!can )`) and `CONFIRMED_COMPLETION`
ships eight more (`(?<!\bthe )(?<!\ba )(?<!\ban )(?<!\bany )(?<!\byour )(?<!\bmy )(?<!\bour )(?<!\d )`),
so if lookbehind were unsupported in the Edge runtime the candidate would already fail at module load. **No variable-length lookbehind and no `(?-i:)`/`(?i:)` modifier group** —
FIX-B's unadoptable construct is not reintroduced. I could not run `deno check` (no `deno` on this
machine's `PATH`, and this session cannot invoke `npx deno`); that is recorded as a coverage gap in
the ledger entry, and it applies equally to the candidate as shipped.

## 2. Two disclosure-only items — no code change requested, but they must be written down

- **D158b** — closing D155 by narrowing the object also drops five real first-person completions
  `4476c92` caught (`I deleted my account.`, `I archived his tasks.`, `I removed 3 tasks.`,
  `I deleted them.`, `I archived acme corp.`). Two are cheap to close inside the existing shape
  (add `my |your |his |her |their ` to the determiner set, add `\d` to the object alternation)
  **without** touching the case-sensitivity that makes D155 work. I did not fold that into FIX-C:
  it is a widening, not a regression close, and it needs its own collateral measurement against a
  truthful corpus before anyone adopts it. Pinned `[RESIDUAL]` so a later widening is *observed*.
- **D158c** — the D157 unification also imports the `-ed`/`-ing` forms and `bring back`, so eight
  bare participial company NAMES now dead-end where `4476c92` selected them. Fail-closed, and
  arguably correct (it is the D136 answer). **But the D148 comment left in the file now asserts the
  opposite** — *"those word-boundary base forms never match the -ed/-ing forms in a real NAME"* —
  and per the D149 rule that comment must be corrected in the same commit that promotes this.
  Suggested replacement clause: *"those forms never match a MULTI-word real name, whose remainder
  after stripping is non-empty (`Restored Furniture Co`, `Reactivated Metals LLC` — both still
  select); a single-token participial name IS bare under this gate and dead-ends, which is the
  D136 ambiguity answer."*

## 3. Bookkeeping that must land in the same commit

- **Re-point `run23_defect_closure_contract.mjs`'s header.** It still says it is pinned against
  `4476c92` / `82d4d77` / sha `e802227b…` and that *"a green run on THIS candidate would mean this
  file is not doing its job — D155/D156 are open here"*. It is green (316/0) on the candidate it
  was promoted onto. Verifier #23 flagged exactly this against run22 and asked for it to be fixed
  in the promoting commit; it was repeated instead. Re-point it at `e6a4d02` / `89a1ac9` / sha
  `bf5e757f…` and change the `[DEFECT]`-open sentence to the retired form the other promoted
  run-files use.
- **Add the collateral cases from the lexicon a fix adds.** D158 exists because the D147b
  `[CONTRACT]` in run23 contains six cases, none of which uses one of the twelve verbs FIX-A added.
  Standing rule to record: *when a closure widens a lexicon, its collateral set must include cases
  built from that exact lexicon in the opposite syntactic position.* This is the third campaign in
  a row where collateral was measured on a corpus that could not contain the new risk (D153, #83
  claim 1, now D158).
- **Say in the commit message that the diff is 4 non-comment lines.** `git diff 4476c92 e6a4d02`
  shows two large hunks that are ~40 lines of LF→CRLF normalisation. The real surface is 4
  non-comment lines changed + 7 comment lines added.

## 4. Promotion of the artefacts

- `v24_regression_additions.mjs` → `qa/scenarios-runner/run24_defect_closure_contract.mjs` **only
  after FIX-C lands** (it exits nonzero on the current candidate by design, 11 `[DEFECT]`
  reproductions). It resolves index.ts from `SEM_INDEX_SRC`, then `../../../supabase/…`, then
  `../../supabase/…`, so it works both in `qa/verification/proposed/` and after promotion.
  On promotion, re-point its own header at the SHA it is pinned to — the mistake noted above.
- `v24_known_failure_modes_entry_84.md` → append verbatim to `qa/KNOWN_FAILURE_MODES.md` as `## #84`.

## 5. What was NOT covered (stated as gaps, not skipped silently)

- **`deno check` / Deno runtime load — `BLOCKED`.** No `deno` on PATH; `npx deno` is not invocable
  from this session. Mitigated, not replaced, by the direct verification that no modifier group is
  shipped and that every construct in the changed lines already appears elsewhere in the same file.
- **Live UI and live AI-chat truth — `BLOCKED`.** This campaign is a source/predicate verification
  of an Edge Function that **is not deployed** (production is v92, which contains none of
  D58–D159). There is no live surface on which to exercise the candidate's behaviour, so no
  browser or chat evidence exists for it and none is claimed. The DB-level read-only production
  check that *was* possible was done (`functions list`) and is recorded.
- **`safeOptionLabel` 20-of-24 suppression** — re-confirmed as pinned in run23, not independently
  re-measured this campaign; #80/#81/#82/#83 all recorded it and it is unchanged by this diff.
