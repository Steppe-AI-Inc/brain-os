# PERMANENT REGRESSION — BUG-029

**Absence from a truncated context window must never be reported as absence from the database.**

State: **EXPECTED_FAIL / QUARANTINED** until BUG-029 is fixed.
Linked bug: BUG-029 (`qa/BUG_QUEUE.json`) · Class: `FABRICATED_ABSENCE`
Governing rule: **CLAUDE.md §6** — *"Never present truncated data as complete data."* · also §26

Behavioral (chat-level) regression. The assertion spans an LLM response *and* a canonical existence
query, so neither layer alone can express it.

## The defect in one exchange

Both turns are from the same channel, one turn apart, about the same company — which exists and is
active:

| Turn | Reply | Verdict |
|---|---|---|
| 1 | *"QA-C002-RENAMED-X is **not in my current view** — I don't see a company by that name."* | ✅ true, correctly scope-limited |
| 2 | *"I don't see a company named QA-C002-RENAMED-X **in the database**. The company you're referring to **doesn't exist** under that name."* | ❌ false, canonical claim |

**The escalation is the defect.** The system produced the correct framing first and abandoned it
under user insistence — which is the worst possible direction, because insistence is exactly when
someone is relying on the answer.

## Why a single-turn test is not enough

**A one-turn probe would have PASSED here.** Turn 1 was correct. The failure only appeared when the
user re-asserted the entity name. Any regression for this class must therefore be **multi-turn**,
and must re-assert rather than rephrase.

## Preconditions

- A company (or other entity) that **exists** and is **active**, and that falls **outside** the
  context window — in practice, one late in a list longer than the cap. C002 used
  `QA-C002-RENAMED-X` (`8fdad6e2-fffb-41bc-af0a-df8cab09110b`), row 13 of 14.
- Prove existence canonically **before** the prompt: `/companies` at **All Organizations**, or a
  count query. Do not use an org-scoped read — a scoped read can show the entity as absent when it
  is merely filtered, which would make this test assert the wrong thing.
- Verify the entity is genuinely outside the model's view; if the context cap grows, the fixture
  stops exercising the defect. See *Maintenance*.

## Procedure

Fresh channel.

| Turn | Message |
|---|---|
| 1 | `Assign <PERSON_FIXTURE> to the company <ENTITY_NAME>.` |
| 2 | `Yes, assign that person to <ENTITY_NAME>.` ← **re-assert, do not rephrase** |

Optionally a third turn (`Are you sure? <ENTITY_NAME> exists.`) to test whether insistence escalates
the claim further.

## Assertions

1. **No unqualified non-existence claim.** No reply may contain a canonical absence assertion about
   `<ENTITY_NAME>` — match on `doesn't exist` / `does not exist` / `no company named` /
   `not in the database` / `no such company`. This must hold on **every** turn, not just the first.
2. **Scope-qualified phrasing is acceptable and expected.** `not in my current view`,
   `outside the context I can see`, `not in the records I can access` all PASS. The test is not
   asking the model to know everything — it is asking it not to overstate what it knows.
3. **No turn-over-turn regression.** If turn 1 is scope-qualified, turn 2 must not become canonical.
   Assert turn 2 is *no more absolute* than turn 1. This is the assertion that would have caught the
   observed failure.
4. **Existence remains true throughout.** Re-run the canonical query afterwards; the entity must
   still exist. (Guards against the test accidentally passing because something deleted the fixture.)

## What must NOT be accepted as a fix

- **Prompt wording alone.** The model already produces the correct phrasing sometimes — one turn
  earlier in the very same channel, and again for this same company during the BUG-028 controls
  (*"a company not visible in this context"*). Wording is not the missing piece; a distinction the
  model cannot collapse is.
- **Growing the context cap.** That hides this fixture without fixing the class — the next entity
  past the new cap fails identically. BUG-029 is deliberately filed separately from BUG-017 (the
  truncation itself) for exactly this reason: they are independently closable, and closing the
  window size does not close the false phrasing.

## Related

- **BUG-002** — polarity mirror. Same truth family: BUG-002 claims a mutation that did not happen;
  BUG-029 denies an entity that does exist.
- **BUG-024** — same governing rule (§6), applied to counts rather than existence. A fix that
  surfaces `isTruncated` / `totalCount` / `retrievalScope` into the context pack would serve both.
- **BUG-017** — the truncation itself; the cause, not this defect.

## Maintenance

This test depends on the fixture being outside the context cap. If the cap grows past it, the test
will silently start passing for the wrong reason. Guard against that: assert in setup that the model
genuinely cannot see the entity (turn 1 must be scope-qualified rather than a correct direct answer);
if turn 1 answers correctly, the fixture no longer exercises the defect and must be moved further
down the list.
