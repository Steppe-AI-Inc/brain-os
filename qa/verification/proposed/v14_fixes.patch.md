# Prepared fixes — verifier #14, campaign #74, base `f1722f2`

**PREPARED, NOT APPLIED.** Campaign rule 1 requires `supabase/functions/sem-ai-command/index.ts`
to end this run at sha256 `10db58385071d8f07fcd96ed65929be6b15bbeda3d197f4dae92327acba70d2a`,
so nothing here was committed to the source. Each fix below was applied to the real file,
measured against the full 25-suite battery and this campaign's corpora, then restored with a
sha assertion. Evidence scripts are named per fix.

Applied together (A2 + B + C), `qa/verification/proposed/v14_regression_additions.mjs` goes
from `34 pass / 29 fail` to `59 pass / 4 fail` (the four remaining are D113, which needs a
product decision, not a patch), and **all 25 committed suites stay green**.
Evidence: `qa/verification/scratch/v14_fix_acceptance.mjs`.

---

## A concurrent session proposed its own D106 fix mid-campaign — verified here, and it needs one more guard

`qa/verification/proposed/v14_d105_matcher_fix.patch.md` and `v14_d105_matcher_probe.mjs`
appeared in the working tree **while this campaign was running**, written by the implementing
session. Its own validation is not evidence, so I applied its diff to the real source and
measured it (`qa/verification/scratch/v14_verify_concurrent_fix.mjs`).

**It is better than my FIX-C.** Its "most specific match wins" rule closes all three
mis-bindings *and* resolves four cases that both `ace9b6a` and my equality-only fix
dead-end (`smiths bakery`, `smith's bakery`, `founders fund`, `obrien logistics`). All 25
committed suites green; all six of my `D106` cases pass.

**But on its own it GUESSES when a reply mentions more than one option label**, and picks
the longest even when the reply explicitly excludes it:

| reply | options | concurrent fix | correct |
|---|---|---|---|
| `move the tasks from acme to acme holdings` | `Acme`, `Acme Holdings` | **`Acme Holdings`** | null — names both |
| `archive acme, leave acme holdings alone` | `Acme`, `Acme Holdings` | **`Acme Holdings`** | null — the reply **excludes** it |
| `alpha co and beta co` | `Alpha Co`, `Beta Co` | **`Alpha Co`** | null — names both |

`f1722f2` returns null for all three today, so this would be a **new** defect of the
run9/D32 "the reply's own words say otherwise" class, arriving through a new door. Two
bookkeeping notes on that file: its `D105` number **collides** with the existing D105
(P3, bookkeeping) in entry #73, and its 12-case probe does not include any multi-mention
case, which is why its own validation reads clean.

### FIX-C2 (RECOMMENDED) — specificity, plus the residual-mention guard

```js
  if (matches.length > 1) {
    // run14/D106: specificity first — when a reply contains several labels, the LONGEST is
    // the one the founder named and a shorter one is contained only incidentally. But
    // longest-wins alone guesses whenever a reply genuinely mentions more than one option
    // ("archive acme, leave acme holdings alone"), so the winner must be the ONLY option
    // still mentioned once its own text is removed. A reply naming several options is
    // ambiguous and must dead-end, exactly as it did before D102.
    const specificity = (o) => forMatching(o.label).length;
    const maxLen = Math.max(...matches.map(specificity));
    const longest = matches.filter((o) => specificity(o) === maxLen);
    if (longest.length === 1) {
      const rest = normalizedCommand.split(forMatching(longest[0].label)).join(' ');
      return matches.some((o) => o !== longest[0] && rest.includes(forMatching(o.label))) ? null : longest[0];
    }
    // Still tied => the labels differ ONLY in presentation (D102's apostrophe pair). This is
    // the single situation the raw comparison exists for, and confining it to the tied set is
    // what makes the D106 mis-bind unrepresentable rather than merely unlikely.
    const rawCommand = command.replace(/\s+/g, ' ').trim().toLowerCase();
    const exact = longest.filter((o) => o.label.trim().length > 0
      && rawCommand.includes(o.label.replace(/\s+/g, ' ').trim().toLowerCase()));
    if (exact.length === 1) return exact[0];
  }
  return null;
```

Measured (`qa/verification/scratch/v14_fixC2_test.mjs`): **13/13 adversarial cases correct** —
all three mis-bindings closed, all four previously-dead-ended cases now resolved, all three
multi-mention replies back to a safe dead end, D102's apostrophe pair still individually
selectable in both directions, `smith` alone still selects `Smith`, two identical labels
still null. **All 25 committed suites green.** Forward-looking CONTRACTs
`D106.hold.mentionsBothEntities`, `D106.hold.replyExcludesTheLongest`,
`D106.hold.mentionsTwoDistinctOptions` in the regression file pin the three dead ends so this
cannot regress.

---

## FIX-C (superseded by FIX-C2, kept for the record) — the raw fallback must not reach outside the matching set

`supabase/functions/sem-ai-command/index.ts`, in `matchDisambiguationOption`.

```diff
   if (matches.length > 1) {
-    const exact = options.filter((o) => usable(o) && o.label.trim().length > 0
-      && command.trim().toLowerCase().includes(o.label.trim().toLowerCase()));
+    // run14/D106: the fallback must DISAMBIGUATE the already-matching set, never reach
+    // outside it, and it must compare whole labels rather than test containment. Filtering
+    // `options` with `.includes()` let a SHORT option that is merely a raw substring of the
+    // founder's reply win over the longer option they actually named — "smiths bakery"
+    // selected "Smith" over "Smith's Bakery" and armed archiveCompanyIds with it. Equality
+    // over `matches` also fixes the case D102 was raised for and did not close: typing the
+    // exact apostrophe name now selects it instead of dead-ending.
+    const exact = matches.filter((o) => o.label.trim().toLowerCase() === command.trim().toLowerCase());
     if (exact.length === 1) return exact[0];
   }
```

Measured (`qa/verification/scratch/v14_ab_matcher.mjs`, 10 probes × 3 SHAs):

| probe | `ace9b6a` | `f1722f2` | with FIX-C |
|---|---|---|---|
| `smiths bakery` → `Smith` / `Smith's Bakery` | dead end | **MIS-BIND** | dead end |
| `founders fund` → `Fund` / `Founders' Fund` | dead end | **MIS-BIND** | dead end |
| `obrien logistics` (3 options) | dead end | **MIS-BIND** | dead end |
| `smith's bakery` (exact name typed) | dead end | dead end | **selects correctly** |
| `acme holdings` → `Acme` / `Acme Holdings` | dead end | dead end | **selects correctly** |
| `founders' fund` → `Founders Fund` / `Founders' Fund` | dead end | correct | correct |
| `acme` → `Acme` / `Acme` (truly ambiguous) | null | null | null |

Strictly better than both prior SHAs on every probe.

---

## FIX-B — D112 (P2): CONFIRMED_COMPLETION must not fire on a negation or a noun

```diff
-        const CONFIRMED_COMPLETION = /^\s*confirmed\s*[—–-]\s*.*\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\b/i;
+        // run14/D112: the original `.*` carried no negation handling and no part-of-speech
+        // constraint, so the belt fired on a completion word used in a NEGATION ("the
+        // company is not archived"), as a NOUN ("the archived list", "3 archived
+        // companies") or in an explicit not-done statement ("still pending, not
+        // approved") — nine truthful founder-facing answers of sixteen, each replaced with
+        // "I can't actually do that from chat", which is itself false. A negator anywhere
+        // in the predicate disarms the belt, and a completion word directly preceded by a
+        // determiner or a cardinal is a noun, not a claim.
+        const CONFIRMED_COMPLETION = /^\s*confirmed\s*[—–-]\s*(?![^]*\b(?:not|never|no|nothing|none|without|pending|awaiting|isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|hasn['’]?t|haven['’]?t|didn['’]?t|don['’]?t)\b)[^]*?(?<!\bthe )(?<!\ba )(?<!\ban )(?<!\bany )(?<!\byour )(?<!\bmy )(?<!\bour )(?<!\d )\b(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|cleared|sent|moved|granted|declined)\b/i;
```

Measured (`qa/verification/scratch/v14_negation_fp.mjs`): new false positives **9/16 → 0/16**.
`Confirmed — Restored Bob Smith.` and `Confirmed — the company (option 1).` are still
corrected; `Confirmed — the company you asked about is in Ulaanbaatar.` still survives. All
25 committed suites green.

The four remaining FPs in that corpus (`"Confirmed — nothing was archived."`, `"…no
companies were deleted."`, `"…the request was rejected, so nothing happened."`, `"…that
company was never archived."`) fire via `LEGACY_PAST_COMPLETION`, are present on `ace9b6a`
too, and are out of scope for this fix — the same negation blindness one belt further up.
Worth its own pass; not attributable to `f1722f2`.

---

## FIX-A2 — D114 (P2): keep BOTH axes, and make the second one clause-position

```diff
+          // run14/D114: FIX-3b REPLACED run12's first-person belt rather than adding to it,
+          // and thereby reopened exactly the class that belt closed — 13 of 20 natural
+          // interrogative-led first-person assertions that ace9b6a caught now ship. The two
+          // axes are complementary, not alternatives. And the first-person axis itself needs
+          // CLAUSE POSITION, not bare person: in every legitimate D98 clarification the
+          // completion sits inside a noun phrase ("the tasks we completed", "the ones I
+          // removed", "the company I archived"); in every assertion it is the main
+          // predicate. The lookbehind is what encodes that, and D98's seven committed cases
+          // are what observe it.
+          const FIRST_PERSON_MAIN_CLAUSE_COMPLETION = /(?<!\b(?:the|a|an|all|any|some|those|these|our|your|my|their|both|each|every)\s\w{1,24}\s)\b(i|we)\s+(?:\w+ly\s+|just\s+|already\s+|have\s+|has\s+|had\s+){0,2}(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\b/i;
+          if (FIRST_PERSON_MAIN_CLAUSE_COMPLETION.test(q)) return null;
           if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;
```

Measured (`qa/verification/scratch/v14_fixA2_test.mjs`):

| axis | `fdb4564` | `ace9b6a` | `f1722f2` | with FIX-A2 |
|---|---|---|---|---|
| curated interrogative-led first-person assertions leaking | 20/20 | 0/20 | **13/20** | **1/20** |
| my 25-case assertion corpus leaking | 22/25 | 17/25 | 3/25 | **1/25** |
| my 27-case clarification corpus destroyed | 3/27 | 6/27 | 5/27 | 5/27 (0 new) |

All 25 committed suites green, including all seven D98 cases.

**Rejected alternative, recorded so it is not retried:** the obvious blanket
`FIRST_PERSON_COMPLETION` re-add (no lookbehind) breaks 8 committed D98 cases —
`"Which of the tasks we completed should be reopened?"`, `"Do you want the ones I removed
restored?"`, `"Did you mean the company I archived last week?"`, `"Should I reopen the goal
we closed in July?"`. Measured, not assumed. That is the swap that has caught three
consecutive campaigns; `D114.hold.0`–`D114.hold.6` in the regression file exist to catch a
fourth attempt.

---

## Not fixed here, on purpose

* **D113** (corroboration gated on the lexical `COMPLETION_WORD` test) needs a product
  decision — corroborate *all* labels or keep a lexical gate — not a regex. See the
  promotion note.
* **D107, D108, D109, D110, D111** are observability defects. Their remedy *is*
  `v14_regression_additions.mjs`; no source change is required and none is proposed.
* **D115** is a six-line deletion in `qa/KNOWN_FAILURE_MODES.md` (lines 6931–6936),
  deliberately left to the promoting session rather than done by the verifier.
