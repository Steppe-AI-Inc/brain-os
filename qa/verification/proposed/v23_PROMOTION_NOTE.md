# v23 PROMOTION NOTE — campaign #83, verifier #23

Candidate `82d4d7715e17b520b14165ba23a726d7cdf3b586` (closure `4476c92`), index.ts sha256
`e802227b2944585fa7ff6989030c4d96b84f61ea1e778405195af157d9e449f3`.
**Verdict: FAIL.** Two new truth-degradation regressions (D155 P2, D156 P3), one pre-existing
undisclosed P2-shaped hole (D157). Both new defects have a **measured** safe close below.
Production is untouched at `sem-ai-command` v92 and nothing here is live.

---

## 1. What to promote as-is

| file | destination | note |
|---|---|---|
| `v23_regression_additions.mjs` | `qa/scenarios-runner/run23_defect_closure_contract.mjs` | Resolves index.ts via `SEM_INDEX_SRC` → `../../../supabase/…` → `../../supabase/…`, so it works from `proposed/` and from `scenarios-runner/` unchanged. Imports nothing from `qa/scenarios-runner` and nothing from `v22_*.mjs`. ANY failure exits non-zero. |
| `v23_known_failure_modes_entry_83.md` | append to `qa/KNOWN_FAILURE_MODES.md` as `## #83` | No preamble; drops straight in after the run22 postscript. |

**Current state of the regression file:**
- on `82d4d77` (this candidate): **274 pass / 42 fail** — 42 `[DEFECT]`, 0 `[RESIDUAL]`, 0 `[CONTRACT]`.
- on the prepared fix below: **310 pass / 6 fail** — 6 `[DEFECT]` (3× D156 residue + 3× D157), 0 `[RESIDUAL]`, 0 `[CONTRACT]`.

`[DEFECT]` entries are *supposed* to be red on this candidate. They turn green when the defect is
genuinely closed. Do not "fix" them by editing the expectations.

## 2. Housekeeping that must land in the same commit

1. **Re-point `run22_defect_closure_contract.mjs`'s header.** It was promoted into
   `qa/scenarios-runner/` on this candidate but still declares itself pinned against `be8d9ca` /
   sha `272de3a4…` and still says *"A green run on this candidate would mean this file is not
   doing its job."* It is green here by design. Update the header to `4476c92` / `82d4d77` /
   `e802227b…` and reword that sentence. Mechanically harmless, actively misleading to read.
2. **If you adopt FIX-B**, run22's `[RESIDUAL] D152.residual.restoredOrderIdiomFP` pin moves
   (the FP disappears) and run22 goes red on exactly that one line. Update it in the same commit
   — the D149 rule. That is the *only* battery failure the prepared fix produces.

---

## 3. FIX-A — D156, one line, no new `const`, zero measured cost

**Where:** `completionIsNegated`'s first disjunct (index.ts ~line 5590).

```diff
- return n >= m.index || /\b(?:that|which|who|whom)\b/i.test(c.slice(n, m.index))
+ return n >= m.index || /\b(?:that|which|who|whom|show(?:s|ed)?|prove(?:s|d)?|indicate(?:s|d)?|say(?:s|ing)?|state(?:s|d)?|record(?:s|ed)?|confirm(?:s|ed)?|establish(?:es|ed)?|suggest(?:s|ed)?|report(?:s|ed)?|mention(?:s|ed)?|note(?:s|d)?)\b/i.test(c.slice(n, m.index))
```

**Rationale (the same rule the disjunct already encodes, extended one step).** The existing
relativizer test says: if `that`/`which`/`who`/`whom` sits between the negator and the completion
verb, the verb is *inside* the negated noun phrase and the negator still scopes over it. An
**evidential/reporting verb** does the same job with a zero-complementiser — `No log however
[shows [ACME was archived]]` is `No log however shows THAT ACME was archived` with `that`
dropped, which English does freely. A subordinator like `however` between them is then a
sentence adverb, not a clause link.

**Measured** (my extractor, real predicates):

| axis | candidate | FIX-A |
|---|---|---|
| D156 evidential-complement truthful destroyed / 12 | 11 | **0** |
| D147b clause-initial leaks caught / 6 | 6 | **6** |
| D151 re-added-lexicon truthful protected / 15 | 15 | **15** |
| D139 zero-relativizer negatives destroyed / 4 | 0 | **0** |
| D146 truthful negatives destroyed / 4 | 0 | **0** |
| D144 fabrications caught / 15 | 15 | **15** |
| D145 truthful destroyed / 12 | 0 | **0** |
| my 98-truthful corpus destroyed | 1 | **1** |
| my 65-fabrication corpus missed | 1 | **1** |

Full 32-suite battery: unchanged, 0 failures.

**Residue FIX-A does not close (3 cases, disclose them):** the quoted-proposition-subject shape,
where the completion clause is itself the *subject* of the matrix predicate — `No log exists and
ACME was archived cannot be confirmed.`, `Nothing was found and ACME was archived remains
unverified.`, `No entry survived and Beta Corp was deleted is unconfirmed.` These need the
completion clause to be recognised as a subject NP, which is beyond a lexical belt. Pin them
`[RESIDUAL]`; the pre-existing `There is no record, so ACME was archived is not something I can
confirm.` is the same shape and is destroyed at **every** SHA measured, so this is a known,
long-standing family, not something FIX-A introduces.

---

## 4. FIX-B — D155, one regex fragment, no new `const`

**Where:** the object test at the tail of the D152 arm inside `LEGACY_PAST_COMPLETION`
(index.ts ~line 5413).

```diff
- ...(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\s+\S
+ ...(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\s+(?:the\s+|that\s+|this\s+)?(?:(?-i:[A-Z])|company\b|employee\b|person\b|task\b|goal\b|project\b|department\b|approval\b|document\b|account\b)
```

**Rationale.** `\s+\S` means "any non-space character", so the arm cannot tell `I deleted Beta
Corp.` from `I deleted my draft note before sending.` A completion CLAIM names an entity: either
a capitalised proper name, or one of this product's own entity-type nouns (which is how
`I successfully deleted the company.` — a real D144 fabrication — stays caught). Because
`LEGACY_PAST_COMPLETION` carries `/i`, a bare `[A-Z]` would be case-**insensitive** and buy
nothing; `(?-i:[A-Z])` is a V8 regexp **modifier group** that turns case-sensitivity off for
just that class.

**Measured:**

| axis | candidate | FIX-B |
|---|---|---|
| D155 truthful first-person non-entity destroyed / 24 | 24 | **0** |
| D144 fabrications caught / 15 | 15 | **15** |
| D145 truthful clarifying questions destroyed / 12 | 0 | **0** |
| my 98-truthful corpus destroyed | 1 | **1** |
| my 65-fabrication corpus missed | 1 | **1** |

Full 32-suite battery on FIX-A + FIX-B: **31 clean, 1 failure** — run22's
`D152.residual.restoredOrderIdiomFP` pin, which is the pin moving as intended (see §2.2).
No new `const`, so run15/16/17/18's named-const assembly is untouched — I confirmed that
constraint is real: run15 (line ~106) builds its belt from an explicit `grab('const X =', ';')`
list, so a genuinely new `const` would be silently dropped and `readsAsCompletion` would fail to
evaluate. The closure was right about that.

### ⚠️ The one thing to check before adopting FIX-B

**`(?-i:…)` is verified on Node v24.19.0 only. There is no `deno` on the verification machine's
`PATH`, so I could not confirm the Edge runtime accepts it.** Run this first, in the same Deno
version the function deploys under:

```
deno eval "new RegExp('(?-i:[A-Z])','i'); console.log('modifiers OK')"
```

If it throws, do **not** ship FIX-B as written — the regex would fail to construct at module
load and take the whole function down. Modifier-free fallback, in order of preference:

1. **Move the object test out of the `/i` regex.** Keep the arm in `LEGACY_PAST_COMPLETION` for
   detection, and add the case-sensitive object check as an inline expression inside
   `readsAsCompletion`'s body (an inline `new RegExp('…','')` — *not* a new top-level `const`, so
   run15/16/17/18 stay intact; their `grab('const readsAsCompletion =', ';')` slices to the first
   `;`, so the expression must contain none).
2. **Entity-noun allowlist only** (drop the `(?-i:[A-Z])` alternative). This keeps
   `I successfully deleted the company.` and loses the proper-name fabrications
   (`I deleted Beta Corp.`) — roughly 12 of 15. Strictly worse than option 1, but still strictly
   better than shipping D155.
3. **Revert the arm** (run21's judgment). Costs all 15 D144 catches — but note those 15 are
   **also missed at `b32e0e4` and `0969852`**, so reverting is *not* a regression against any
   baseline, only a lost improvement. This is the safe floor if 1 and 2 are both blocked.

Do **not** solve D155 with a blocklist of discourse nouns (`draft`, `wording`, `formatting`, …).
That is the incomplete-blocklist class this ledger has struck down repeatedly, most explicitly at
run16/D123.

---

## 5. D157 — not fixed here, and it needs a decision not a patch

`RESTORE_VERB_PATTERN` (which decides "the label is a bare opposite verb") contains
`bring\s+(it\s+)?back` and `un-?archiv(e|ed|ing)`; the imperative test immediately after it uses
the inline `/\b(?:restore|unarchive|reactivate|activate)\b/i`, which contains neither. So
`Bring Back` ← `"bring back"`, `Bring It Back` ← `"bring it back"` and `Un-Archive` ←
`"un-archive it"` all **arm `archiveCompanyIds` on a restore intent**. Pre-existing at `b32e0e4`
and `0969852`, so not a regression — but it is D148's exact shape, and D148 was P1.

Two lexicons deciding one thing will keep producing this, and D154 (`revive`/`reopen`/`undelete`)
is the same class from the other side. The closure's stated answer — the **D136 ambiguity
dead-end** rather than a longer blocklist — is right. The minimum interim change is to make the
imperative test reuse `RESTORE_VERB_PATTERN`/`ARCHIVE_VERB_PATTERN` instead of carrying a second
hand-written copy, which closes D157 without touching D154's scope. I did **not** measure that
variant; treat it as a direction, not a prepared fix.

---

## 6. Coverage gaps in THIS campaign — disclosed, not skipped

- **`deno check` NOT RE-DERIVED** — no `deno` on `PATH`. The closure's "23 == baseline, 0 new" is
  recorded as unverified, and FIX-B's runtime compatibility is Node-verified only.
- **No browser / live-AI-chat verification.** This campaign is a source-level verification of a
  candidate that is not deployed (production is v92); there is no deployed build carrying these
  bytes to drive through a browser. UI and live-AI-chat truth checks are therefore **BLOCKED**,
  not passed — they become meaningful only after a deploy, which this run has no authority to do.
- **No database or RLS verification** was attempted; this change touches neither. The only
  production contact was one read-only `supabase functions list`.
- Everything measured here drives the real extracted predicates in-process. That is
  `UNIT VERIFIED` / `CODE INSPECTED` strength for the belt and matcher, and `LIVE VERIFIED` only
  for the read-only production version check. Nothing here is `E2E VERIFIED`.

## 7. Reproduce any of it

```
node qa/verification/proposed/v23_regression_additions.mjs          # 274/42 on this candidate
SEM_INDEX_SRC=<fixed-copy> node qa/verification/proposed/v23_regression_additions.mjs   # 310/6
```
The campaign's working harnesses (own extractor, corpus, cross-SHA tables, mutation harness,
fix probes, battery runner) are under `qa/verification/scratch/v23/`.
