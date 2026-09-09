# MORNING REPORT — overnight autonomous session, 2026-09-09/10

One report, as asked. Numbers are re-derived, not carried forward.

## DONE

**Verifier #74 returned FAIL on `6fa79b5` / `1ba84df9` and every finding is closed but one.**
It found two P1 fabrication paths. `p{Lu}` fixed the alphabets that HAVE capitals and did nothing for
the ones that do not — Arabic, Hebrew, CJK, Georgian, Thai, Korean, Devanagari — so 72 of 72 measured turns
shipped a claim that work was done when nothing ran. Separately, three constants spelled "a quotation mark
opens a name" and disagreed, because one had been written with escaped apostrophes that collapsed onto a
character already in the class: `archive ‘Acme Holdings’` shipped a fabricated completion in plain ASCII
English, 50 of 160 turns.

Closed this round: V74-D1, D2, D3, D4, D5, H1, H2, H6, O2. The v74 suite went from **81 pass / 33 fail** on
the candidate it failed to **115 / 1**.

Also done, unprompted by #74:
- the `CLAUSE_BOUNDARY` hoist, queued as latent-safe for three rounds and taken because this round added a
  reader above the declaration and the TDZ contract went red
- `candidate_freeze.mjs` — the candidate is now read-only for the life of a verifier round, wired into the
  dispatcher. Written because a prepared-patch script defaulted its target to the candidate and applied
  itself to a file under a running verifier. Restored from git in under a minute; nothing downstream moved.
- the release-package correction on both QA Command Center branches

**QA Command Center: `QA_DIRECTOR_COMMAND` is no longer waiting on you for the string.**
The document said the string was configuration rather than architecture. It was too modest — the repo
determines it: a committed `.claude/agents/qa-director.md`, and the launch shape `verifier-watchdog.sh` has
used for thirty-nine rounds. Derived, written down, and now machine-checked by `director_command.mjs`,
which refuses a wrong command rather than warning about it (supervisor contract 56 → 64 rows).

What is still yours there is not the string: switching it on starts an autonomous agent with `acceptEdits`,
unattended, on the Work PC, against production. Nothing here started one, and this is the Home PC anyway.
Acceptance tests 1–10 remain BLOCKED, and the status suite still reports 0 of 10 executable.

All six QA suites green: 36 / 58 on the command-center branch, 64 / 36 / 37 / 14 on the node branch.

**All six release gates PASS on the new candidate** — battery (0 unclassified red), twelve-mutant proof
(0 surviving, 0 ineffective), harness rename probe (no suite pins a spelling), founder acceptance corpus,
TDZ triage (0 unresolved), and a restore-tested backup.

**One of the four blind suites is converted and measured** (`qa/verification/proposed/` in the main repo, not applied — the
candidate is frozen). Against a mutant that removes "approved" from a live fabrication gate: the pasted-
literal version reports 13 passed / 0 failed and sees nothing; the lifted version reports 12 / 1.

## RUNNING

**Verifier #75** on the new candidate. Dispatch details are in `qa/verification/scratch/verifier75_dispatch.json`.

## BLOCKED — FOUNDER AUTHORITY (2, unchanged, correctly red)

1. `person_assignment_scope_authorization` — needs the prepared DB migration
   `supabase/drafts/202609090001_*.sql` applied. No behavioural proof exists and none should be attempted:
   proving it means performing the cross-tenant write that must never succeed.
2. `production_write_authority` — asserts write authority this PC does not hold. Green here would mean the
   Home PC could write production.

#74 independently re-derived both classifications from first principles and confirmed them.

## BLOCKED — EXTERNAL

None.

## OPEN DEFECT — THIS PC (2, red on purpose)

1. `factory_production_write_inventory` — eleven factory-runner scripts reach the database through
   `supabase db query --linked`, inheriting the machine CLI credential. Code change, not authority.
2. `v74_regression_additions` — one row of 116: four suites name `index.ts` and never open it (zero
   `readFileSync` between them), so no change to the deploy surface can turn them red. Left red so a green
   cannot claim the gap is closed.

## THE ONE DECISION I TOOK THAT #74 REFERRED TO YOU

V74-D1. #74 wrote: "This is a product-semantics decision and I have not made it."

I made it, because the canonical architecture determines it and the trade is not symmetric: **a headline
misread as a request produces a clarification; a request misread as a headline produces a claim that work
was done when nothing executed.** Reaching those tiers already requires a canonical mutation verb at the
head — verified at ALL THREE call sites of the object test, not inferred from one — so what widens is
"English verb + caseless
object", which is overwhelmingly a real command.

Measured both directions afterwards: 0/13 fabrication escapes, 0/10 truthful-read destruction, 0/13
execution-authority leaks, unchanged under case flip.

**If you disagree, this is one constant** (`NAME_INITIAL`) **and reverting it is one edit.**

## ONE THING YOU WILL SEE IN THE PRODUCT

Guard-note wording changed. "not verified against the database" is now "carries no provenance"; "absent
from the database" is now "the record is absent". The old wording matched the product's own citation
detector, so the guard that removes provenance claims was appending one.

## PRODUCTION

Unchanged. Nothing deployed, nothing pushed, no migration applied, no credential created or inserted.
The production Edge function still carries v92 source.

## EXACT FOUNDER AUTHORISATION REQUIRED

**None is blocking right now.** #75 must return a verdict first. When it passes, the next action is a
fresh `ALLOW_FUNCTIONS_DEPLOY=1` scoped to the exact DEPLOY_FILE_SHA256 in the release manifest — and I
will ask for it then, once, with the manifest attached.

Still waiting on you whenever you choose, none of it blocking: the two founder-authority items above, and
the QA node credential (acceptance tests 1–10 remain BLOCKED without it).

## NEXT

1. Act on #75 automatically: FAIL → fix loop → #76; PASS → release package for the exact bytes.
2. The factory-runner ambient-authority fix (eleven scripts) — safe to do while #75 runs; the dispatcher
   and watchdog do not touch the DB.
3. Queue items 5 and 6: the four reimplementation suites, and the arrow parameter-annotation stripper.
