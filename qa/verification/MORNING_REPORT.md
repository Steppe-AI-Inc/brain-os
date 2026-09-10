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

---

**Verifier #77 failed that candidate too — and found that my mutation proof had been lying all night.**

Its `ALREADY_RED` list named three suites; seven are red. The four regression suites that each hold a
deliberately-open defect were therefore credited with catching every mutant, whatever it did. #77 measured
it by hand: reverting the previous round's own P1 fix is caught by **zero** of the 89 green suites, and my
proof reported "caught by 4".

**So the "0 surviving" figures I reported earlier tonight were partly false.** The instrument is fixed —
the reference set is now derived by running, and an already-red suite counts only if its *output* changes —
and the honest re-run is in the gate evidence.

#77 also found the P1 the previous round reported as closed was not: the Mongolian fix was a **blocklist**
of six ending families where the verbal paradigm has about thirty. 392 generated tokens, 195 still read as
live imperatives. Its rule is the durable one and I have adopted it verbatim: **a false LIVE is the write
you forbade; a false DEAD is a receipt saying nothing happened — so the test must fail toward NOT LIVE, and
only an allowlist does that.**

Closed this round: D1, D3a, H1, H2. **Five defects remain open by #77's own deliberate choice**, each with
a measured reason for not patching it — the obvious fix for one of them fires on 5 of 17 ordinary reads and
reopens a defect from twenty rounds ago. They are classified, not hidden.

Candidate for #78: `e785d6ce`, battery 96 suites / 88 green / 0 unclassified red.

**The corrected mutation proof, re-run honestly: 16 mutants, 0 surviving, 0 ineffective**, every one caught
by at least one genuinely green suite. That figure now means what it says. It took three versions in one
night to get there — a hardcoded exception list that credited four always-red suites with everything, then
a fix that credited any red suite whose output changed (two of them report on machine credentials and
change on every run), and finally a determinism gate. **A differencing test is only as good as the
stability of what it differences.**


---

**The last reimplementation suite is converted, and the class is closed.**

`sem_ai_command_execution_plan_truth` carried hand-maintained copies of `executeActionPlan`'s ordering loop
and `buildExecutionPlanReport` under a header calling them "byte-for-byte". It opened no source at all, so no
change to `index.ts` could turn it red. Both are now lifted from the deploy bytes, with ONE substitution that
is the suite's own design: the real loop ends in `executeOneAction(supabase, action)` and these tests are
about dependency ordering, so that leaf call is replaced by an injected executor -- and the lift THROWS if it
cannot find that call, rather than silently testing a different function.

Proved load-bearing against two mutants in the real source: relax the blocked-dependency rule, and delete
`assign_task`'s operation-aware naming so the report names the person instead of the task. The lift fails two
rows on each; **the hand-copy passes both.** Row set identical to before -- 25 rows, compared by id and not
by count. H6b now reports 0 remaining, by directory scan rather than from a list, and the three regression
suites went green together.

The harness gap I had recorded as "worked around" is also closed: there were **five** parameter-annotation
strippers, each stopping at the first comma, so an ordinary signature
`names: { a: Map<string, unknown>; b: Map<string, unknown> }` came out as `names, unknown>; b, unknown>`. One
balanced stripper now, tracking depth over `()` `[]` `{}` `<>`.

**Then two more instrument defects, both mine.**

I launched the mutation proof in the background and edited a harness file every probe imports. For the length
of that edit the file did not parse, three probes died IDENTICALLY on both runs -- and identical output is
exactly what the effectiveness gate reads as *the product did not react*. It exited 0 and called three
plainly-effective mutants INEFFECTIVE. **A long-running gate re-reads the harness on every spawn; it has no
snapshot.** The gate now treats a fatal crash on the candidate side as a HARNESS FAILURE and exits 1, because
a survivor count computed over runs that did not happen is a claim about a measurement that did not happen.

And escape depth, instance 17. The word boundary in that new gate was typed as a double backslash, the
transport halved it, and a single-escaped `b` inside a single-quoted string is the BACKSPACE escape -- a
literal 0x08 byte went into the file and the pattern matched nothing, so the gate fired on a healthy harness.
Then the comment I wrote explaining that hazard acquired a 0x08 of its own, the same way. **Second time this
campaign a sentence describing the 0x08 hazard has contained one.** Both repaired; the pattern now contains no
backslash at all.

---

## VERIFIER #78 FAILED `e785d6ce` -- three P1s, and it was right about all three

It also refused the prompt where the prompt was stale, for the third round running, and derived the battery
count, the ledger number and its own artefact names from the repository instead. That is the behaviour I want
from it.

**P1 - V78-D1 -- the fix two rounds ago broke the language the product is used in.** The V77-D1 allowlist
closed false-LIVE in the direction it aimed at and turned Mongolian's ORDINARY POLITE REQUEST from live into
dead: **72 of 108 mixed turns swallowed**, against 24 before it landed. `ACME-г битгий архивла, гэхдээ Beta-г
сэргээж өгөөч` -- "don't archive ACME, but please restore Beta" -- became a whole-turn refusal, and the
founder was told "No change was made -- you asked me not to" on a turn in which they asked. The cause is that
the polite request is ANALYTIC: a converb carries the verb and an auxiliary carries the imperative. The
request tier has known that since V75-D1. The decider never did.

**CLOSED.** Its prepared fix applied as given takes 72 to 3. The residue it deliberately left open was
`сэргээнэ үү`, the polite FINITE -- it declined to admit a bare clause-final `уу/үү` because that made three
QUESTIONS live, and that judgement was right. What separates them is POSITION, never the particle: in the
request the mutation stem ITSELF carries the polite finite and the particle follows it directly; in every
question something stands between -- an auxiliary, the passive `-гд-`, the infinitive `-х` -- and that is what
makes it a question. Measured on **#78's own corpora, not mine: FALSE LIVE 0/15, FALSE DEAD 0/5**, and the
392-token paradigm still reads 0 in both directions.

**P1 - V78-S1 -- a real survivor, and the deploy gate said GREEN.** This is the one to read. The mutation
proof erased the source PATH so an echoed filename could not count as an answer, and did not erase the
**sha256 printed beside it**. One suite prints one. So its output differed for every mutant BY CONSTRUCTION
and it was credited with catching all of them -- **V77-H1, the defect I fixed last round, reintroduced one
line from its own fix.** Behind that credit sat a mutant caught by NOTHING: it relaxes a sole-referent bound,
and on a turn that read only project Zeta, "There is no company called Omega." -- true, and about something
the turn never read -- becomes "I could not confirm that from this turn." **A truthful answer destroyed, 0 of
96 suites, release manifest GREEN.**

**CLOSED.** #78's repair adopted; credits to already-red suites drop from *everything* to 3 of 16. The mutant
is now in the proof, and replaying the **manifest's own** row extraction and forgiveness table over it, the
deploy gate is RED. That replay is the question that matters -- the mutation proof is not the deploy gate.

**P1 - V78-D2 -- a comment asserting a property the code does not enforce.** `index.ts` says "only an
allowlist fails toward NOT LIVE". That is false for a stem that is also an ordinary noun: `оноо` is a *score*,
`хаа` is *where*, and the bare imperative IS the noun. `Битгий устга. Түүний оноо хэд вэ?` -- "Don't delete
it. What is its score?" -- stops being a refusal and the model's mutation fields survive. Pre-existing, not a
regression. **OPEN, and it is a product decision** -- see NEXT.

Also closed from that round: **V78-D4**, the manifest forgave two suites WHOLESALE, so a new failure inside
the two suites that guard production write authority was invisible to the deploy gate; a classification with
no named rows is now itself RED. **Three stale forgiveness entries** found by the same replay -- v74/v75/v76
were still forgiven for the H6b row closed hours earlier, so they were green while carrying a description of
the past; a green suite that still carries a forgiveness entry is now RED too. **V78-H8**, a battery suite
wrote a TRACKED file from whatever source it was pointed at, and the copy committed in `924977e4` had been
generated from the rename probe -- it carried identifiers that appear nowhere in the product. And the same
class at scale: 74 generated mutants, 46 MB, all tracked, so every proof run left the tree dirty and
`WORKING_TREE_CLEAN` could never honestly be true after running the gates. Both fixed; a full proof run now
leaves the tree clean.

**V78-H7, confirmed the hard way.** Adding one constant required registering it in THREE separate lists, and
my third attempt added a duplicate that emitted the declaration twice and died as "already declared" inside a
lifted window, far from the list. The list checks itself for duplicates now.

**The mutation proof, re-run clean on the new bytes: 17 mutants, 0 surviving, 0 ineffective, 0 harness
failures** -- and every credit now rests on a behavioural row rather than on a printed hash.

---

## AND THEN I CLOSED ALL OF IT

**Every finding verifier #78 made is closed.** Its suite reads **23 passed, 0 failed**. I want to be exact
about what that does and does not mean: it means the measurements it named now come out the other way, taken
on ITS corpora where it supplied one. It does not mean the candidate is correct, because the session that
closed the findings is the session that was being audited. That is what verifier #79 is for, and its prompt
says so in the first paragraph.

The three that mattered:

**V78-D1** — its prepared fix applied as given takes the swallowed-request count from 72 of 108 to 3. The
residue it deliberately left open was the polite FINITE, `сэргээнэ үү`; it declined to admit a bare
clause-final particle because that made three QUESTIONS live, and it was right to. What separates them is
POSITION, never the particle: in the request the mutation stem itself carries the polite finite and the
particle follows it directly, and in every question something stands between — an auxiliary, the passive
`-гд-`, the infinitive `-х`. Measured on #78's own corpus: **FALSE LIVE 0/15, FALSE DEAD 0/5.**

**V78-D2** — a comment asserting a property the code did not enforce. `оноо` is a *score* and `хаа` is
*where*, and both are also mutation stems, so a refusal whose second clause was plainly a question stopped
being a refusal. No form test can separate a word from itself. What CAN be separated is the clause — and the
product already had a definition of read shape, declared inside the request tier where the decider could not
reach it. Hoisting it was the whole fix.

Then measuring the hoist showed it cost too much: **2 of 4 ordinary requests swallowed**, because one of its
three arms matches an interrogative ANYWHERE and those words double as quantifiers — `хэдэн таскийг Bat-д
онооно уу` is "please assign several tasks". The three arms are named constants now; the decider reads the
two that are clause-level by construction. **Cost after: 0 of 4. Leaks: 0 of 4.** The recomposed pattern is
proved byte-identical to the original, so the request tier cannot have changed.

**V78-S1** — the survivor. It is closed, and the check that matters is not the mutation proof but the DEPLOY
GATE: replaying the manifest's own row extraction and own forgiveness table over that mutant, the gate is now
RED. It was GREEN when #78 found it.

Also closed: D1b (the epenthetic г was written into one arm of a pair and not the other — and it must require
a following vowel, or `архивлагч`, an *archiver*, becomes an imperative), D3 (`NON_EXISTENCE_CLAIM` saw 10 of
28 ordinary absence phrasings; now 19 seen and 17 controls untouched, measured in both directions because
this pattern REWRITES founder-facing text), D4, D5, D6, H2, H4, H6, H8.

**The instruments were wrong twice more, both times in my favour, and both are in the ledger.** I edited a
harness file while the mutation proof was running; the file did not parse for those seconds, three probes died
identically on both sides, and "identical output" is exactly what the effectiveness gate reads as *the
product did not react*. It exited 0 and called three effective mutants INEFFECTIVE. And the word boundary in
the gate I wrote to fix that arrived as a literal 0x08 byte, so it fired on a healthy harness — then the
comment explaining that hazard acquired a 0x08 of its own.

**One thing I did NOT do, and it is a decision rather than an oversight.** The repaired rename probe stopped
skipping already-red suites, and four suites that had been invisible to it turned out to pin a local
identifier of the deploy surface. I fixed three. The fourth — `V78-C5`, in #78's own suite — lifts a window
bounded by two local names and executes it with six more as parameters; making it rename-proof is a rewrite
of the lift, not a re-anchoring. It is a harness-quality defect, not a defect in the deploy surface, and I
was not going to rewrite a working CONTRACT row at the end of a long night. **So one release gate is
deliberately not green**, and it names that one suite.


---

## VERIFIER #79 FAILED `6c1bfca9` — and both P1s were in my closures, from the same mistake

It is worth naming the mistake precisely, because it was the same one twice in two unrelated subjects:
**I measured a change against a corpus that could not exercise the mechanism I had changed, and reported the
result as if it had.**

**The Mongolian read-shape veto.** I kept two of three arms on the argument that they are "clause-level by
construction", and measured the cost at 0 of 4. Every row of that corpus exercised the interrogative-WORD
arm and not one the predicate arm. `байгаа` is the ordinary attributive participle — *pending*, *lagging*,
*inactive* — so an imperative clause routinely contains a read predicate without being a read. Measured
properly: **11 of 20 ordinary requests swallowed, worse than the 7 of 20 before the veto existed.**
`Хүлээгдэж байгаа зөвшөөрлийг цуцла` — "cancel the pending approval" — came back as "you asked me not to,
so nothing was executed".

**`NON_EXISTENCE_CLAIM`.** I widened it and checked the false-positive direction with 17 controls, every one
an assertion of PRESENCE. The actual risk is a truthful assertion of ABSENCE — of a field, an event, a
capability. **16 of 21 truthful sentences matched; 3 of 5 truthful answers were being destroyed.**

Both are closed. The first with #79's own fix — Mongolian is verb-final, so a clause's own predicate is
clause-final, and that is the position the arm now asks for. The second by narrowing four arms.

**Then I checked the direction my own fix could have broken, and it had.** The narrowing excluded the
indefinite article to protect truthful sentences about EVENTS — and swallowed the entity denials that take
one: **3 of 13 genuine fabricated denials escaped the gate**, including "There is no record of a company
called ACME." A narrowing that opens a fabrication path is not a fix. What separates them is not the
article but whether a TYPE is NAMED. Now 13 of 13 seen, 0 of 9 rewritten, and both directions are checked
together by a promoted suite so the pair cannot drift apart again.

## What else closed

**V78-H7 — four lists became one.** Four places kept their own copy of the shared-constant dependency order,
and adding a single constant cost FIVE registrations in one session. Before converging them I checked, as
you asked, that they express the same graph — and **the first probe I wrote to check that was wrong and its
numbers were discarded**: it hand-rolled a fifth declaration scanner that mis-parsed regex literals, so one
function's "declaration" came out as 2,491 lines and it produced 26 violations that were all artifacts. The
shared extractor already had the correct scanner. Re-measured: one graph, so convergence was safe. A
consumer now supplies an unordered REQUEST and the resolver supplies order, closure and deduplication — it
cannot be wrong about order because it no longer expresses order. 12-row ratchet, four deliberate drifts
proved to break it.

**The rename gate is green for the first time in the campaign.** No suite asserts a product property by
naming a local identifier. The window lift that was the last offender now derives its bounds (a canonical
shared constant and the founder-facing sentence it emits), its parameters (the slice's free identifiers) and
its input ROLES (how the slice uses each one) — and all four properties are measured: a 12-identifier rename
leaves it green, a real semantic change turns it red, a removed anchor is a loud harness failure, and the
extraction is runtime-equivalent.

**The deploy gate stopped overstating itself** (V79-H2). It counted suites and never rows, so five
SUPERSEDED stubs that assert nothing counted as coverage — they are their own class now, and `green` means
90 suites that actually assert something rather than 95. It also never mentioned the **67 `.sql` suites it
does not run**; they are named, with the reason. And a header claiming "MODULE-LEVEL CONSTANTS" while 19 of
88 are not is now a checked fact rather than a sentence (V79-H3).

**The mutation proof now refuses counts taken while its own input was changing** — the guard for the mistake
I made earlier, where editing a harness file mid-run made three effective mutants look ineffective. Proving
it took two corrections of my own: the probe testing it used a synchronous call that blocked the event loop,
so it never performed the edit it was testing; and the guard's "before" fingerprint was taken after the
expensive phase, so it compared an already-changed tree with itself.


---

## ROUNDS #80 AND #81

**#80 failed on three P1s, two of them in the fixes I made for #79.** Its table is the one to look at:

    build       ordinary requests swallowed (10)   forbidden writes that survive (12)
    924977e4    4                                  11
    992520d8    7                                  0
    dc27e034    2                                  8      <- mine
    + fix       2                                  0

I traded five swallowed requests for eight forbidden writes — the expensive direction — and my corpus could
not see it, because I had enumerated what may FOLLOW a read predicate and Mongolian has more particles than
anyone enumerates. The fix asks the right question instead: Mongolian is verb-final, so a read predicate is
the clause's own predicate exactly when no LIVE VERB follows it. Derived, so a particle nobody listed cannot
defeat it.

**#81 failed on two P1s that were PRE-EXISTING** — the first round in four whose findings were not
regressions from the previous fix. One of them is worth your attention as a pattern: the comment on the
Mongolian stem vocabulary had said *"a live clause ENDS with one of these"* since the day it was written,
and nothing enforced it. **A comment is a claim, and this one had been false for as long as it existed.**

### The most expensive harness defect of the campaign, and it was not a red

Closing #81 made a CONTRACT row report **195 false-live tokens as a product defect that does not exist.**

The row chose which of two measurements to run by matching the decider's source text character-for-
character. #81's fix changed that line's shape, the match stopped, and the row silently measured the OLD
BLOCKLIST the product had replaced three rounds earlier — then reported its always-present failures as a
CONTRACT failure. The deploy gate classified it as a reopened defect, which is its phrase for the worst
thing it can find.

A suite that pins a spelling goes red and nobody believes a false red for long. **A spelling that selects
between two measurements produces a red that names the product, with a number attached, about a defect that
is not there** — and everything downstream treats it as a finding. Ledger 170. The repair added a row that
asserts the selector selected correctly; there had been nothing.

### Three instrument defects that would have cost an independent verifier its round

* **Every gate read STALE in a fresh worktree** — including one whose only inputs were byte-identical in
  content — because git normalises line endings on checkout and the digest hashed the checkout rather than
  the fact. A verifier starts in a fresh worktree, so it saw six stale gates and would either re-run an hour
  of work or report the staleness as a finding.
* **A battery row read a file git does not track** (mine), so on a clean checkout the deploy gate said
  RED 1 while the recorded evidence said RED 0. A suite whose green depends on a generated artefact is green
  only on the machine that generated it.
* **#81's own FAILED verdict was nearly discarded.** The watchdog filed its complete report as
  BLOCKED — EXECUTION_MODE because the report contains the sentence *"`npx supabase db query --linked`
  requires approval here"* — the verifier REPORTING a coverage limit, which is exactly what it should do. A
  finished report now outranks every text classifier, because a completed report is a fact about the process
  and the classifiers are guesses about it.

## ROUND #82 — the closure met the position the language keeps its nouns in

**#82 failed on three P1s, and the first one is the one to read.**

Round #81 fixed a Mongolian defect by making the rule POSITIONAL: a bare imperative is the sentence's
command exactly when nothing but a sentence-final particle follows it. That closed two thirds of the
problem and measured it — 9 of 9 and 6 of 6 — and opened the third, because **Mongolian is not only
verb-final, it is noun-final**: an ordinary copular sentence has no verb at all and ends with its predicate
noun. So *"Alpha-г битгий устга. Асуудал нь оноо."* — "Don't delete Alpha. The problem is the score." —
stopped being read as a refusal, and **the delete you forbade executed**. 18 of 18, and identical on the
previous build, so it is not a regression: it is the part of the class #81's corpus could not contain.

The English equivalents are 3 of 3 correctly refused. That asymmetry — the gate works in the language the
tests are written in and not in the language the product is used in — is now five rounds old.

The other two: a denial about "companies" was depluralised to "companie" by a second, weaker spelling of a
pluraliser this file has owned since round #72, so **a fabrication shipped on a turn that had actually read
the row it denied** (6 of 21). And **a line break is a clause boundary nowhere in this file** — every arm
of the boundary vocabulary needs punctuation or a conjunction — so a two-line message is one clause and its
three consumers were each wrong in a different direction: your request refused with a false receipt (90 of
90 English, 6 of 6 Mongolian), a TRUE statement about another company deleted, and the truthful half of an
answer thrown away.

All three are closed structurally, from #82's own prepared patch.

### The one I did NOT close, and why that is the honest answer

**V82-D4: 25 ordinary requests are swallowed** — you type *"Beta-г архивла одоо"* ("archive Beta, now")
and are told "you asked me not to". It is a regression #81's closure introduced, and I have now written and
reverted the obvious fix TWICE.

The obvious fix is to stop enumerating what may follow the verb and ask a derived question instead — "does
a real verb follow?". That works for reads because a live-verb test already exists to derive from. There is
no Mongolian verb lexicon in this file, so the derived version read *"Хас нь буурсан"* ("the deduction
dropped") as a live command and **15 of 15 nominal predications went live** — the expensive direction, and
exactly the hole the first fix had just closed. **A derived test needs something to derive from**, and a
fifth position heuristic is not a structural answer.

So it stays red, classified, with its number in the ledger and in #83's prompt. Every one of the 25 errs in
the cheap direction: a request refused with a wrong reason, not a write you forbade. The two errors do not
cost the same, and I would rather hand you the number than trade it away quietly.

### Two instruments that were lying, one of them in my favour

* **A CONTRACT row's LABEL said the exact opposite of what its test checked**, and it was passing green.
  This is ledger 170's class one notch quieter: a red that names the product with a number is the most
  expensive way for a harness to be wrong, and a green whose name misdescribes it is the same thing said
  softly. So the standing question now has two halves — for every RED, could the row be measuring something
  other than what it names; for every GREEN, does its name describe its assertion?
* **Two rows from consecutive verifiers asserted opposite properties of the same digest** and could not
  both pass. That is a decision, not a bug, and I took it in the source rather than by satisfying whichever
  row was louder: normalise the inputs that legitimately differ between checkouts, hash the deploy surface
  RAW — because its bytes are guaranteed everywhere by declaration, and normalising them would leave the
  gate reading VALID after somebody converted the deploy file's line endings, which is a real change to the
  exact thing that layer exists to watch. #81's row is green on the property now, and its name has been
  removed from the release manifest's excuse list, because a classification that keeps naming a green row
  is a standing excuse for a red that is not there.

### The largest open instrument finding in the campaign, which is NOT fixed

**14 of 102 suites cannot see any change to the deploy file at all** — they read the repository copy
instead of the copy under test. Every "the mutation was caught" number in this campaign, mine and the
verifiers', is a statement about 88 suites being reported as a statement about 102. It is named, it is
open, and it is the first thing #83 is told to attack.

## WHILE #83 RUNS — a finding of my own, and it is about how things get found

The guard that catches escape corruption has looked for **one byte** since the day it was written: a
literal backspace, because a backspace is what the corruption left behind that time. I asked it the
question this campaign asks every guard — *what did you decide not to check?* — and scanned for the whole
class instead.

**Seven literal control bytes, two of them in live battery suites.** Every one a separator someone wrote as
an escape whose backslash the tool transport ate.

**And every one of those programs was correct.** In JavaScript the raw byte and the escape are the same
value. Nothing was broken, nothing was going to break, and no test could have found it, because there was
no wrong answer to find.

What it cost is this: **a file containing one of those bytes is BINARY to grep, and grep silently drops its
content.** So every text search over the suite directory read nothing out of those two suites and reported
success. It happened to me twice inside an hour while investigating — the search did not fail, it answered,
and the answer was missing a file.

That is the same shape as the two worst instrument defects of this campaign: a row that measured the wrong
one of two things and reported a product defect that did not exist, and 14 suites that cannot see a change
to the file they are supposed to be testing. **The instrument answers, and its answer is about nothing.** A
red you can see is cheap; a confident, well-formed, incomplete answer is not.

Fixed: the guard now rejects every control character except tab and the line endings, it is a function with
seven fixtures proving it catches what it claims and allows what it must, its scope widened from two
directories to every tree we write source into (1 642 files), and all seven sites were rewritten. Planting
a byte back into a real file turns the row red; removing it turns it green. Ledger 172.

Two more instrument repairs went in beside it: the shared-constant resolver now answers about the source it
was **asked** about rather than the first one it ever read (an instrument built the old way reported
"nothing changed" about a mutation that changed everything), and the backup gate stopped being **stale by
construction** — its own passing evidence had to be committed, and committing it invalidated the evidence,
forever. Every round of this campaign has handed its verifier a stale backup gate for that reason.

## AND THEN I MADE THE SAME MISTAKE, ONE HOUR LATER

Verifier #82 had said **14 of 102 suites cannot see any change to the file they are testing**, which would
mean every "the test caught it" number in this campaign is about a smaller battery than it claims.

I answered that by searching each test for the right variable name and reported that **none** of them had
the problem. That answer is worth nothing, and I had written the entry about instruments that answer
confidently about nothing an hour earlier. A search tells you a name is present. It does not tell you
anything depended on it.

So I measured it instead — **took the file away** and pointed every test at an empty one:

* **83 of 103 failed**, which is what a test that actually reads the file does;
* 10 passed and are about something else entirely (migrations, the web app, the tooling);
* **10 passed while claiming to be about the file.** Five of those are honestly-labelled retired stubs and
  two were mistakes in my own classifier. **Three were real.**

### The one worth your time

One test opens by asking "does this build have the block I guard?" — and if not, prints **NOT APPLICABLE**
and reports success. The reasoning was sound: the old deployed build genuinely has no such block, and
saying so beats passing silently.

But that question is also exactly what a **deleted** block looks like. **Delete the thing that test exists
to protect, and the test reports success.** A guard that goes green precisely when its subject disappears
is worse than no guard, because the battery counts it as coverage.

The other two were passing on an empty file because everything they assert is trivially true of one — no
bad line endings in nothing, no broken patterns in nothing.

Fixed: a missing subject is now a **failure**, and skipping requires the caller to say so explicitly with a
flag — a flag is visible in the command that set it, an inference never is. The other two got a floor:
below a thousand lines the file is treated as missing rather than clean. And this is now a **seventh
release gate**, so the number of tests that can actually see the product is measured every round instead of
estimated. Ledger 173.

## VERIFIER #83 FAILED — and it failed on the guard we said was the whole design

Round #82 made a line break end a sentence, and wrapped that in a guard, and the comment above the guard
says in capitals **THE GUARD IS THE WHOLE DESIGN** and names the exact thing it prevents: *"do not" on one
line and "delete Alpha" on the next must not become a live command.*

**The guard fails in precisely that way.** #83 measured it: a blank line between them, or five spaces, or a
tab, and the refusal stops being a refusal — **7 of 19 phrasings** — and the delete you forbade executes.
All seven refused correctly on the previous build. The cause is a magic number in the guard that stops
looking after four characters and never looks past a newline at all.

Two more, both introduced by the same change:

* **The line break ends the Mongolian clause too**, which removes the marker that round #82's *other* fix
  depends on — so change three reopened change one **inside a single commit**. 4 of 4.
* **8 of 27** places a line can wrap inside an ordinary denial now let a **fabricated** denial ship, on a
  turn that had actually read the row it denies. That was 0 of 27 before.

### The sentence in the report that matters most

> **The battery is byte-identical with these defects present and with them fixed.** 103 suites, 91 green, 0
> red, 4 010 assertion rows — both times. Not one row saw any of this, in either direction.

The deploy gate would have signed it off. That is the third round running where the thing that caught the
defect was the independent verifier and not the battery, and it is the argument for keeping the verifier in
the loop no matter how long it takes.

**In fairness to the change**: the previous build destroyed a truthful two-line answer by rewriting it
wholesale, and the candidate fixes that. Only one side of the trade was measured when it shipped. That is
the recurring error, not the line break.

#83's fix is applied — refusals go from 9/23 to **23/23**, fabricated denials from 8/27 to **5/27** — with
the two residuals it deliberately left open stated with their numbers rather than closed by widening a
guard until the tests go quiet.

### It also found two instrument defects we had missed, an hour after we found two it also found

Both #83 and this session independently discovered the same thing at the same time: **a hygiene test
printing 26 green rows against a completely empty file.** Its fixes and ours merged without conflict, which
is the most reassuring thing in this report.

It found two we did not: a green row whose **name did not describe its assertion** (it forgave a stray
character that no longer exists — a forgiveness that outlived the thing forgiven is a standing permit for
the next one), and a shared text tool that turned an optional parameter into a syntax error.

## RUNNING

**Verifier #83**, campaign 143, dispatching on the freeze built from `ab3fb939` / index.ts
`324230d9c9445709498b3a11e2892e5dd693651228971368a563d392c6594dda`, 748 841 bytes. Needs nothing from you.

Battery: **103 suites — 91 GREEN, 5 GREEN-but-asserts-nothing, 2 BLOCKED - FOUNDER AUTHORITY, 5 OPEN
DEFECT - THIS PC, 0 unclassified RED**, 4 010 assertion rows.

**`harness_rename_probe` is RED ON PURPOSE**, and it is the one number that got worse on purpose. It was
green because its rename set was ten hand-picked identifiers — so "no suite pins a spelling" meant "no suite
pins one of these ten". The set is derived now, and the honest count is 38 suites pinning a spelling plus 26
whose window anchor moves loudly. `RENAME_PIN_BACKLOG.md` records all of it, including where the repair
technique stops and why the rest is a product question. **A green gate that measures ten names is worse than
a red gate that measures 192, because the first one is believed.**

## BLOCKED — FOUNDER AUTHORITY (2, unchanged, correctly red)

1. `person_assignment_scope_authorization` — needs the prepared DB migration
   `supabase/drafts/202609090001_*.sql` applied. No behavioural proof exists and none should be attempted:
   proving it means performing the cross-tenant write that must never succeed.
2. `production_write_authority` — asserts write authority this PC does not hold. Green here would mean the
   Home PC could write production.

#74 independently re-derived both classifications from first principles and confirmed them.

## BLOCKED — EXTERNAL

None.

## OPEN DEFECT - THIS PC (5, every one red on purpose)

The battery reports **0 unclassified red**. Every failure is one somebody decided to leave failing, with the
reason recorded in the deploy gate itself, and forgiven only for the specific rows it is forgiven for — a
suite that fails while naming no row counts as RED.

1. `factory_production_write_inventory` — eleven factory-runner scripts reach the database through
   `supabase db query --linked`, inheriting this machine's CLI credential. The conversion is prepared and
   measured; applying it stops the factory runner until you set `FACTORY_RUNNER_PG_URL`, so it is your call.
2. `v77_regression_additions` — five defects verifier #77 measured and deliberately did not patch. #78
   re-derived them independently and **confirmed every reason holds**, including that the obvious fix for one
   fires on 5 of 17 ordinary reads. It also found that closing V77-D3a WIDENED V77-D4, from 80 leak shapes to
   100.
3. `sem_ai_command_company_restore_truth` — one row. Converting it to read the real source exposed that its
   local copy defaulted a missing `actionType` to `archive` while the product fails closed. **Which behaviour
   is right is a product judgement**, so the row is left failing rather than rewritten to agree.
4. `v81_regression_additions` — one row. The absence gate sees 21 of 38 natural phrasings and rewrites 4 of
   14 sentences that are not absence claims. Widening the exclusion is the FABRICATION direction and the
   structural fix is at the consumer, so #81 measured it and left it as a product decision.
5. `v82_regression_additions` — one row, **V82-D4, the 25 swallowed requests described above**. Kept red so
   it cannot be mistaken for closed.

And one release GATE is red by the same discipline: `harness_rename_probe`, 38 pins and 26 anchors,
described above.

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

**One correction to the record, and #78 established it byte-directly rather than reading it.** It downloaded
the live function: `sem-ai-command` is ACTIVE at **function version 94**, not 92, deployed by CI on
2026-09-08 -- and the bytes it is carrying are the **v92 source**, byte-identical to git `c9dfab5bd433`. Our
own record said "version 92" and so did the launch prompt. The substance is unchanged -- production runs v92
behaviour -- but the version number we had written down was wrong.

## EXACT FOUNDER AUTHORISATION REQUIRED

**Nothing is blocking me right now, and I am not asking for a deploy authorisation.** Five rounds ran
tonight and all five failed -- twice on defects no earlier round could reach, once on a defect the previous
round's own fix created, once on the fix for that, and #78 on all three at once. **Not one of those failures
was a false alarm**, which is the case for the process rather than against it: every round found something
the round before it could not see, and two of the five found the instrument lying rather than the product.

**I said I would put V78-D2 to you, and then I decided it myself. That deserves stating rather than quietly
overwriting.** The earlier version of this report, committed at c1690b35 before #78's findings were closed, listed it as a
product decision and said I would take it on your nod. Then, reading it properly, the fix turned out not to
be a product choice at all: the product ALREADY had a definition of Mongolian read shape, declared inside the
request tier where the negation decider could not see it. Closing the defect meant hoisting that definition
so both tiers ask one question — canonical architecture, which your standing instruction says I should decide
myself. I measured the cost in both directions before and after, and it changes no behaviour you would
recognise except that a refusal followed by a question stays a refusal.

**If you disagree, it is one hoisted constant and one line in the decider.**

So the honest state of the bytes: candidate `eade10fe`, every finding from verifiers #78 through #81
closed, four defects open by decision, five of six gates green and a restore-tested backup. **These bytes
have not been independently verified yet** — #82 is running — **and I am not asking you to authorise them.**

Eight rounds have run and all eight failed. Not one was a false alarm. The shape has changed over the
night: the early rounds found product defects, the middle three found instruments that flattered the
session that built them, and the last one found a comment that had been false since the day it was written
plus a harness row reporting a defect that did not exist. **Every round found something the round before it
could not see**, which is the only argument for the process that matters.

When a round passes, the next action is a fresh `ALLOW_FUNCTIONS_DEPLOY=1` scoped to the exact
DEPLOY_FILE_SHA256 in the release manifest. I will ask for it then, once, with the manifest attached.

### Waiting on you whenever you choose — none of it blocking

1. **The `person_assignments` cross-tenant RLS migration** — `supabase/drafts/202609090001_*.sql`. No
   behavioural proof exists and none should be attempted: proving it means performing the cross-tenant
   write that must never succeed.
2. **The QA node credential** — acceptance tests 1–10 stay BLOCKED without it. The command that would
   start the node is now derived and machine-checked; what is left is authority over a machine, not a
   string.
3. **`FACTORY_RUNNER_PG_URL`** — if you want the factory-runner isolation applied. The conversion is
   prepared and measured; applying it removes ambient production-write authority from eleven scripts and
   stops the factory runner until that variable exists.
4. **One product judgement, and it is genuinely yours.** When a clarification carries no `actionType`,
   the product returns undefined and falls through to the LLM — an explicit fail-closed guard added after
   the stale-actionType-hijack incident. A test asserted the older behaviour, defaulting to `archive`.
   I left that test failing and classified rather than rewriting it to agree with the code, because
   deciding which is correct is not a call I should make by editing an assertion at five in the morning.
## NEXT

1. **Act on #80's verdict automatically** — FAIL, fix loop, #81; PASS, inspect the artifact, confirm it
   tested the exact frozen bytes, classify every observation, and prepare the release package. Nothing in
   that path needs you.
2. **V77-D4** — the last product defect I can reach, and its blocker is now gone. It wants the ONE object
   test hoisted to module scope so both tiers ask the same question; the cluster is self-contained (19
   constants, zero external references) and the four duplicated dependency lists that made every such move
   expensive are converged. #78 measured that closing V77-D3a WIDENED this one, 80 leak shapes to 100, so it
   gets measured against the wider corpus, not the one the fix was written for.
3. **The remaining four #77 defects** — D2, D3b, D5, D6. #78 re-derived every reason independently and
   confirmed all four hold.
4. **The 67 `.sql` suites nobody runs.** They are named now. Making them runnable needs a database, which
   is item G below.

### Three documents written this round that are for you rather than for me

* `PRODUCTION_WRITE_AUTHORITY_MAP.md` — the exact map, seven routes, two closed and five open, **with the
  dependency between them**: the Vercel session regenerates the key one route protects, and the Credential
  Manager entry is why the CLI credential survives environment scrubbing. The order is B → C → D → E → F.
* `PERSON_ASSIGNMENTS_RLS_STATUS.md` — plus the rollback SQL, which did not exist. It restores the original
  policy copied byte-for-byte from the migration rather than from a description of it, and its header says
  plainly that applying it reopens the finding.
* `BLOCKED_AND_RED_BASELINE.md` — re-derived: it is **five** classified reds, not three. The "three" is the
  founder ACTIONS, which is a different set, and conflating them is how a red suite once got attributed to
  your authority when it was ours.

