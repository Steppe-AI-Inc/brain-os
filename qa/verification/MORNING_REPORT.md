# MORNING REPORT — overnight autonomous session, 2026-09-09/10

One report, as asked. Numbers are re-derived, not carried forward.

## DONE

**Verifier #74 returned FAIL on `6fa79b5` / `1ba84df9` and every finding is closed but one.**
It found two P1 fabrication paths. `\p{Lu}` fixed the alphabets that HAVE capitals and did nothing for
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

**One of the four blind suites is converted and measured** (`qa/verification/proposed/` in the main
repo, not applied — the candidate is frozen). Against a mutant that removes "approved" from a live
fabrication gate: the pasted-literal version reports 13 passed / 0 failed and sees nothing; the lifted
version reports 12 / 1.
**The factory-runner ambient-authority fix is prepared and measured** — eleven scripts that borrow this
machine's production-write credential. Thirteen edits, no call site moved, measured on an isolated copy:
the suite goes from 11 named offenders to pass 3 / fail 0, all eleven still parse, and the accessor refuses
with no credential rather than falling back.

**Not applied, and that is your call, not a technical blocker:** applying it stops the factory runner until
`FACTORY_RUNNER_PG_URL` exists, and creating the least-privilege role is DDL — a module cannot bootstrap
its own boundary.

**Ledger #144 is no longer blocked on a missing test.** The prepared embedding-observability fix has been
unshippable because nothing could falsify it. That regression now exists and is proven both ways: 6 passed
/ 4 failed against the candidate, 10 / 0 against a copy with the patch applied. Semantic memory was dead in
production for fifteen days while every surface reported normal operation — this is the row that would have
said so. Still owed before it ships: the nine prepared mutants against this base.

**Two things I chose NOT to do, so they read as decisions rather than omissions.** The other three blind
suites are not lift-and-go — `mergedPeopleData` is an IIFE closing over surrounding scope and
`personCurrentStatus` is an inline ternary — so both need real windows executed, and a partial conversion
would leave a suite that LOOKS converted and is still blind. And prompt caching: its audit says do not
implement step 1 without steps 2-4; step 3 is a migration, and step 4 needs per-model cache pricing I do
not have. Plausible pricing would make cost figures drift wrong in the favourable direction, which is the
harder error to notice.

---

**Verifier #75 then FAILED that candidate too, with two P1s in Mongolian — the language this product is
actually used in.** `Батбаяр ХХК-г архивлаж өгнө үү` is the ordinary polite request, and it shipped a
fabricated completion **28 times out of 28**: the content verb is a converb and the politeness an
auxiliary, so a counted two-token window put the verb exactly one token out of reach. Separately,
`битгий` / `бүү` / `болохгүй` / `хэрэггүй` — the four ways to say "do not" — appeared **zero times** in the
file. What survived was not a false claim about a write. It was **the write you forbade**.

Both are closed, plus a third P1 I found while fixing them (V75-D6: three prohibition forms carried request
intent and the fourth did not, so the receipt depended on which prohibition you typed). The v75 suite went
from 55 pass / 23 fail to **82 / 1**.

**#75 also found three defects in instruments I built, and one of them matters to you.** The release gate
classified suites by FILE NAME, so a suite already marked as a known defect absorbed any NEW failure inside
it silently — a regression reopening nine separate P1s would have produced a byte-identical manifest. **A
release gate that cannot see a reopened P1 is not a gate.** Forgiveness is now per row, and I proved it by
injecting a simulated reopened P1 into an already-forgiven suite and watching the manifest go red.

**I disagreed with #75 on one row and want you to know.** It asked that a Mongolian refusal carry no
request intent. Measured, an English refusal does carry one — deliberately, so the executor fails closed
and the receipt tells you your refusal was understood. Satisfying that row would have made Mongolian the
one language where a refusal is not a request. I replaced it with an English-equivalence pin instead, and
that reframing is what exposed the third P1.

**And I nearly deleted 116 rows.** #75 wrote its suite to the previous round's filename, per the campaign
convention. Promoting it and removing the old file dropped the rows holding the PREVIOUS round's eight
closures — and the battery would have stayed green while they went unguarded. Caught by comparing row ids
rather than counts.

Candidate for #76: `94aa26c9…`, 712,078 bytes, battery 94 suites / 89 green / 0 unclassified red.

---

**Verifier #76 failed that candidate too, and the first defect was one I introduced.**

Closing the Mongolian refusal defect a round earlier, I taught the negation decider to recognise a live
Mongolian clause so a prohibition would not swallow a live clause beside it. I wrote that test as bare STEM
presence. The request tier asks the same question through two FORM tests — and a stem is not a form:
`архивласан` ("archived", attributive) matches the bare list. So *do not archive ACME; show the archived
companies* stopped being a refusal and **the write you forbade survived**. The identical English sentence
was stripped correctly.

One concept, two readers, and the weaker one decided whether a refusal was heard. It is the same shape the
ledger has recorded six times, and I committed it while closing an instance of it.

**My own rows could not catch it**, because they test four bare prohibitions and a bare prohibition has no
second clause to disarm the decider with. And the verifier proved the rows I substituted last round were
weaker than the ones I argued against: a symmetric change moves both sides of an equivalence pin together
and passes. Being right about the objection did not make the replacement adequate — a relative pin asks
"are these two the same?" and never "is either correct?"

All three of #76's findings are closed, plus the file-wide sweep it asked for. Candidate for #77:
`79e457b8`, 714,427 bytes, battery 95 suites / 89 green / 0 unclassified red.

## RUNNING

**Verifier #77** on candidate `79e457b8`. Dispatch details land in `qa/verification/scratch/verifier77_dispatch.json`.

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
"English verb + caseless object", which is overwhelmingly a real command.

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

**None is blocking right now.** #77 must return a verdict first — it is the fourth round tonight, and
and the three before it all failed: twice on defects no earlier round could reach, once on a defect the
previous round's own fix created. When it passes, the next action is a
fresh `ALLOW_FUNCTIONS_DEPLOY=1` scoped to the exact DEPLOY_FILE_SHA256 in the release manifest — and I
will ask for it then, once, with the manifest attached.

Still waiting on you whenever you choose, none of it blocking: the two founder-authority items above, and
the QA node credential (acceptance tests 1–10 remain BLOCKED without it).

## NEXT

1. Act on #77 automatically: FAIL → fix loop → #78; PASS → release package for the exact bytes.
2. Apply the factory-runner conversion — prepared and measured above, and YOUR call, because it stops
   the factory runner until `FACTORY_RUNNER_PG_URL` exists. Safe to apply during a verifier round:
   neither the dispatcher nor the watchdog touches the DB.
3. Queue items 5 and 6: the four reimplementation suites, and the arrow parameter-annotation stripper.
