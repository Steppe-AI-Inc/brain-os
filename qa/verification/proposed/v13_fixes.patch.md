# Prepared fixes — verifier #13, campaign #73, base `ace9b6a`

`index.ts` sha256 `021c8989de675035709f48e438d590b2e417677a9625f80a9708cd2dd8a4b786`.

Every hunk below was applied to the REAL `supabase/functions/sem-ai-command/index.ts`,
measured, then reverted; `index.ts` was sha256-verified byte-identical after each
application (harnesses: `qa/verification/scratch/v13_candidate_fixes.mjs`,
`v13_candidate_fixes2.mjs`, `v13_fix_validate.mjs`). **None is applied in the working
tree.** This campaign's write authority is `qa/verification/**`; product edits are the
implementing session's to land.

No fix here needs a database migration. Nothing here requires `supabase db push`.

---

## FIX-3b — closes D98 **and** D99 (the gate blockers), one hunk

`index.ts` ~4776-4777, inside `safeQuestionFragment`. Replace the run12/D92 first-person
belt with an interrogative-lead test. The axis run12 chose was the SUBJECT (`i|we`); the
axis that actually separates a clarification from an assertion is whether the surviving
fragment is INTERROGATIVE-LED. A question that opens with a wh-word or an auxiliary is a
question no matter what vocabulary its subordinate clauses carry; a fragment that opens
with a noun phrase or a bare participle and merely ends in `ok?` is a statement.

```diff
-          const FIRST_PERSON_COMPLETION = /\b(i|we)\s+(?:just\s+|already\s+)?(archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)\b/i;
-          if (FIRST_PERSON_COMPLETION.test(q)) return null;
+          const INTERROGATIVE_LEAD = /^(please\s+)?(who|whom|whose|which|what|when|where|why|how|do|does|did|is|are|was|were|am|can|could|should|shall|will|would|may|might|have|has|had|if)\b/i;
+          if (COMPLETION_WORD.test(q) && !INTERROGATIVE_LEAD.test(q)) return null;
```

Measured on the same corpora across three SHAs (`v13_ab.mjs`):

| | assertion leaks | legit clarifications dropped | legit clarifications truncated |
|---|---|---|---|
| `fdb4564` (last certified) | 20/20 | 1/27 | 0/27 |
| `f4763ef` (#12: DO NOT DEPLOY) | 0/20 | 21/27 | 4/27 |
| `ace9b6a` (this SHA) | **18/20** | **7/27** | 4/27 |
| `ace9b6a` + FIX-3b | **0/20** | **0/27** | 4/27 |

Full committed battery with FIX-3b applied: **23 suites, TOTAL OK=561 FAIL=0, all exit 0**
— including all 70 `run12_defect_closure_contract` cases and all 46 `run11` cases. It is
strictly better than every previous SHA on both axes simultaneously, which is the thing
neither run11 nor run12 achieved.

Residual it does NOT fix: the 4 truncations (a legitimate multi-clause question losing its
leading clause to the run11/D88 comma reduction — see D98 note in the ledger entry). That
is a separate rule and a separate decision.

---

## FIX-1 + FIX-2 — closes D102 (the seam) and D103a (uniqueness), one hunk

`index.ts` ~5009-5020, the run12/D95 collision numbering. Two independent bugs in one
block: the collision key is the RAW label while the matcher compares the STRIPPED form,
and the sequence counter can mint a number that already exists on another option.

```diff
-            const labelCounts = new Map();
-            for (const o of paObj.options) {
-              if (o && typeof o.label === 'string') labelCounts.set(o.label, (labelCounts.get(o.label) || 0) + 1);
-            }
-            let collisionSeq = 0;
-            for (const o of paObj.options) {
-              if (o && typeof o.label === 'string' && labelCounts.get(o.label) > 1) {
-                collisionSeq++;
-                o.label = `${o.label} (option ${collisionSeq})`;
-                pendingActionGatingChanged = true;
-              }
-            }
+            // run13/D102: the collision key must be the SAME normalized form
+            // matchDisambiguationOption compares, or two options that are identical once
+            // presentation characters are stripped stay un-numbered AND mutually
+            // unselectable. run13/D103a: numbering by a running counter can re-mint a
+            // number an already-numbered (replayed) label carries; the option's own index
+            // is unique by construction and stable for a given emitted list.
+            const labelKey = (s) => s.replace(/[“”‘’"']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
+              .replace(/\s*\(option \d+\)$/, '');
+            const labelCounts = new Map();
+            for (const o of paObj.options) {
+              if (o && typeof o.label === 'string') labelCounts.set(labelKey(o.label), (labelCounts.get(labelKey(o.label)) || 0) + 1);
+            }
+            for (let oi = 0; oi < paObj.options.length; oi++) {
+              const o = paObj.options[oi];
+              if (o && typeof o.label === 'string' && labelCounts.get(labelKey(o.label)) > 1) {
+                o.label = `${o.label.replace(/\s*\(option \d+\)$/, '')} (option ${oi + 1})`;
+                pendingActionGatingChanged = true;
+              }
+            }
```

Measured: the quoted-twin pair renders `["Closed Loop Systems (option 1)",
"“Closed Loop Systems” (option 2)"]` instead of two forms that strip to the same string;
the three-option replay case renders `(option 1)/(option 2)/(option 3)` instead of
`(option 1)/(option 2)/(option 1)`. Battery with the hunk applied: **561/561, all exit 0.**

Does NOT close: `D102.apostrophePair` at the matcher level (mitigated only — the gate now
numbers the pair, but `matchDisambiguationOption` in isolation still returns null), and
none of D103b/D103c.

---

## Not fixed here — direction only, deliberately not presented as validated

**D100 (adjectival-led assertion labels).** The principled fix is to stop guessing from the
label's shape at all: accept a label carrying completion vocabulary only when the canonical
read independently agrees it is that entity's real name.

```
const derived = (typeof o.id === 'string' && o.id ? displayName(…, o.id) : `option ${oi + 1}`);
const safe = safeOptionLabel(o.label);
const bare = (s) => String(s).replace(/[“”‘’"']/g, '').trim().toLowerCase();
o.label = (safe && (!COMPLETION_WORD.test(safe) || bare(safe) === bare(derived))) ? safe : derived;
```

Applied as written this turns the battery RED (3 suites: `run10`, `run11`, `run12`),
because committed contracts pin an adjectival-led name surviving when the entity is ABSENT
from the canonical read — where `derived` is the typed fallback and there is nothing to
agree with. It needs a decision (accept the label when no canonical name exists at all, or
change those contracts), so it is recorded as a direction, not as a validated patch.
Measured effect on the label corpus is therefore not claimed.

**D101 (`advanced|integrated` unreachable).** Trivially removable, but the right question
is which of the two lists is wrong — the words may have been intended for
`COMPLETION_WORD`. That is a product decision, not a verifier's.

**D103b/D103c.** Structural: an option whose id is absent from `contextPack.companies`
cannot execute (`contextCompanyIds` filter, index.ts:2993-2995) yet can be confirmed
("Confirmed — the company (option 1).", index.ts:2549). The honest fix is to drop
un-nameable options from a disambiguation set entirely rather than number them — an
option the system cannot name and cannot act on is not an option.
