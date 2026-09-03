# D105 (P1) — prepared and validated fix for the disambiguation mis-bind

**Status: PREPARED, NOT APPLIED.** Verifier #14 held the `index.ts` SHA lock
(`10db5838…a70d2a`) while this was developed, so it was written and validated against a
COPY of the source. Apply only after that campaign has returned its verdict, then
re-verify on the new SHA — any source modification invalidates a verifier certification.

## The defect

D105 is a **P1 regression I introduced myself** in `f1722f2` while fixing D102. Verifier
#14 confirmed it by A/B across `fdb4564` / `ace9b6a` / `f1722f2`.

The D102 fallback searched **every option's raw label** whenever the normalised pass was
ambiguous:

```js
const exact = options.filter((o) => usable(o) && o.label.trim().length > 0
  && command.trim().toLowerCase().includes(o.label.trim().toLowerCase()));
if (exact.length === 1) return exact[0];
```

With options `[Smith, Smith's Bakery]` and the founder replying `smiths bakery`, the
normalised pass matches BOTH (`smith` is a substring of `smiths`), so the fallback runs.
The raw pass then matches only `Smith` — because `Smith's Bakery` carries an apostrophe the
founder did not type — so it returns **the wrong entity**, and that entity is then armed
into a destructive pending action.

Reproduced, on the real matcher extracted from source:

| case | options | reply | before | expected |
|---|---|---|---|---|
| D105.bakery | Smith, Smith's Bakery | `smiths bakery` | **Smith** | Smith's Bakery |
| D105.founders | Fund, Founders' Fund | `founders fund` | **Fund** | Founders' Fund |
| D105.apostropheTyped | Smith, Smith's Bakery | `smith's bakery` | **null** | Smith's Bakery |

The third row shows the defect is not only a mis-bind: typing the name *exactly* returned
nothing.

## Why this one matters more than its predecessors

Every earlier defect in this family (D78, D86, D91, D93, D100, D102) could only cause a
**dead end** — no option selected, founder re-asked. D105 causes a **mis-bind**: the
founder's "yes" binds to an entity they did not name. That is the Class-B failure the
entire durable-pending-action design exists to prevent, reintroduced by the fix for a
cosmetic collision.

## Root cause

The fallback had no notion of **specificity**. When a reply contains several labels, the
longest one it contains is the one the founder actually named; a shorter one is contained
only incidentally. The original code treated all containments as equally good and then
used a tie-break rule (raw comparison) whose *purpose* was something else entirely —
distinguishing labels that are normalisation-identical.

## The fix

```js
if (matches.length > 1) {
  const specificity = (o: PendingActionOption) => forMatching(o.label).length;
  const maxLen = Math.max(...matches.map(specificity));
  const longest = matches.filter((o) => specificity(o) === maxLen);
  if (longest.length === 1) return longest[0];
  // Still tied => the labels differ only in presentation (D102's apostrophe pair).
  const rawCommand = command.replace(/\s+/g, ' ').trim().toLowerCase();
  const exact = longest.filter((o) => o.label.trim().length > 0
    && rawCommand.includes(o.label.replace(/\s+/g, ' ').trim().toLowerCase()));
  if (exact.length === 1) return exact[0];
}
return null;
```

Most specific wins; the raw comparison is used **only** to break a tie between
normalisation-identical labels, which is the single situation D102 exists for. Confining
the raw pass to the tied set is what makes the mis-bind *unrepresentable* rather than
merely unlikely — a shorter, non-colliding label can no longer enter that comparison at
all.

## Validation (on the copy, real matcher, 12 cases)

All 12 pass with the fix; 4 fail without it. The set deliberately includes the coverage
this fix must not break:

- **D102 preserved** — `Bob's Co` / `Bobs Co` remain individually selectable by typing
  either exact form.
- **Ambiguity still resolves to nothing** — `the co` against that pair returns null, and
  two genuinely identical labels return null. The fix must never trade a dead end for a
  guess; that trade is the defect it repairs.
- **D93 preserved** — a quoted label is still selectable by typing the name plainly.
- **Shorter-label-alone still works** — replying `smith` with `[Smith, Smith's Bakery]`
  correctly returns Smith.

## On applying

1. Apply to `supabase/functions/sem-ai-command/index.ts`.
2. Promote the 12 probe cases into `qa/scenarios-runner/run14_defect_closure_contract.mjs`
   alongside verifier #14's own regressions.
3. Mutation-prove: reverting to the all-options raw search must reproduce `D105.bakery`
   **by name**, and removing the tie-break must reproduce `D102.apostropheTyped`. Cover the
   guard's LIMITS too — over-broadening the specificity rule (e.g. dropping the uniqueness
   requirement on `longest`) must fail a case, or the guard is half-proven. Verifier #14
   recorded D109 precisely because that uniqueness requirement was unobserved before.
4. Re-run the full battery, commit, and dispatch verifier #15 on the new SHA.
