# PREPARED FIX for D92 (P1) — verifier #12, campaign #72, base `f4763ef`

**Not applied.** This campaign's write authority is `qa/verification/**` only; the product
edit is the implementing session's to land. Everything below was validated by applying the
change temporarily, running the full battery, and restoring the file with a sha256 check
(`1db385790f42286497540187c7c18e5661d59742eec67dc61cc978e8c8b369ec`, confirmed identical
after the run).

## What is wrong

`supabase/functions/sem-ai-command/index.ts:4762`, added by `f4763ef` as the run11/D88
"belt":

```ts
// run11/D88: and a question whose own surviving text still asserts a completion
// ("ACME deleted everything, ok?" reduced to a tail that still carries it) is
// dropped rather than shipped.
if (COMPLETION_WORD.test(q)) return null;
```

`COMPLETION_WORD` matches a bare *mention* of completion vocabulary, not an *assertion*.
Every clarification question that merely refers to an archived / deleted / completed /
assigned / approved / closed / removed thing is therefore destroyed.

Measured on a realistic clarification corpus: **12 of 20 dropped**, including
`"Who should the task be assigned to?"` and `"Which archived company did you mean?"`.
A/B against the prior certified SHA `fdb4564`: all of them survive there. This is a
**regression introduced by this commit**, not a pre-existing limit.

It also fires on **ordinary turns**, not only correction turns — `result.questions =
envelopeQuestions` (index.ts:4986) runs unconditionally — and it nulls
`pendingAction.question` (index.ts:4962) while the action payload stays armed, which is
the exact shape run10/D84 called out as *"silently dropping the visible prompt while the
destructive action payload stayed armed — worse than what it prevented."*

## Why the blanket test is not needed

Neutralising the belt and running `run11_defect_closure_contract.mjs` produces exactly
**one** failure — `D88.single-letter-shield` (`"I archived ACME B. ok?"`, where the
single-letter abbreviation shield blocks the terminator cut). The other D88 shapes are
already handled by the terminator cut, the comma-clause reduction, and the
`PAST_COMPLETION_CLAIM_PATTERN` belt. A sledgehammer is being used for one narrow shape.

## The change

Replace line 4762 with a **subject + participle** test — a completion participle is only a
claim when a subject precedes it, or when it leads the fragment:

```ts
// run11/D88, narrowed by #72/D92: drop a question that ASSERTS a completion, not one
// that merely MENTIONS completion vocabulary. "Which archived company did you mean?"
// and "Who should the task be assigned to?" are clarifications, not claims; the blanket
// COMPLETION_WORD test destroyed 12 of 20 realistic clarification questions and nulled
// pendingAction.question while the action stayed armed (the run10/D84 shape).
const COMPLETION_ASSERTION_IN_QUESTION = new RegExp(
  '\\b(?:i|we|it|they|this|that|the\\s+\\w+)\\s+(?:just\\s+|already\\s+|now\\s+|successfully\\s+)?(?:'
  + 'archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned'
  + '|approved|rejected|removed|completed|ended|moved|added|granted|confirmed|renamed'
  + '|declined|closed|cleared|sent) '
  + '|^(?:archived|deleted|updated|created|restored|assigned|reassigned|approved|rejected'
  + '|removed|completed|ended|moved|added|granted|confirmed|renamed|declined|cleared|sent)\\b', 'i');
if (COMPLETION_ASSERTION_IN_QUESTION.test(q)) return null;
```

## Validation evidence

Harness: `qa/verification/scratch/v12_candidate_fix.mjs` (applies, runs, restores,
sha-verifies). Corpus: `qa/verification/scratch/v12_corpus.mjs`.

| measure | f4763ef as committed | with this change |
|---|---|---|
| committed battery (22 suites) | all exit 0 | **all exit 0** |
| `run11_defect_closure_contract` (46 cases) | 46/46 | **46/46** |
| legitimate clarifications dropped | **12 / 22** | **0 / 22** |
| assertion leaks (10 attack shapes) | 0 / 10 | **0 / 10** |

The leak set covers `"I archived ACME B. ok?"`, `"I archived ACME, ok?"`,
`"ACME deleted everything, ok?"`, `"Deleted ACME and its tasks, ok?"`,
`"I archived ACME - ok?"`, `"I archived ACME and ok?"`, `"I archived ACME ok?"`,
`"Did you know ACME has been archived?"`, `"I removed 3 people from ACME, ok?"`,
`"ACME Inc. deleted everything, ok?"` — none leak before or after.

## Rollback

Single-hunk, self-contained, no schema/RLS/RPC involvement. Revert = restore the one
`if (COMPLETION_WORD.test(q)) return null;` line. **No DB push is involved.**

## Regression test

`qa/verification/proposed/v12_regression_additions.mjs` — rows `D92.*` (12 dropped
clarifications + the armed-pendingAction case) fail on `f4763ef` by design and pass with
this change; rows `D92.hold.*` are the leak controls that must keep passing.
