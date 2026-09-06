# Brain OS — what is actually done, and how strongly it is evidenced

Written 2026-09-06 for week planning. Every row carries an **evidence level**, because "done" has
meant three different things in this project and the difference decides what is safe to build on.

| Level | Meaning |
|---|---|
| **LIVE VERIFIED** | Exercised against the real production database or the deployed function, and re-queried afterwards. |
| **INDEPENDENTLY VERIFIED** | A separate verifier process, starting from committed state only, confirmed it. |
| **SOURCE VERIFIED** | Proven by executing the real shipped code out of its source file. Not exercised through the live UI or the deployed function. |
| **BUILT, NOT VERIFIED** | Written and self-tested. No independent confirmation. |
| **BLOCKED** | Finished on our side, waiting on something only you can provide. |

---

## 1. SHIPPED AND WORKING IN PRODUCTION

| # | Capability | Evidence |
|---|---|---|
| 1 | **Plugin registry** — `plugin_sources`, `plugin_components`, `agent_plugin_attachments`, with a real attach → dispatch → raw-log proof → detach → reattach cycle against production | LIVE VERIFIED |
| 2 | **Capability-routed scheduler** — parallel dispatch, dependency blocking, capability routing, heartbeat staleness | LIVE VERIFIED |
| 3 | **Realtime control centre** — live refresher and notification panel on a live Supabase publication | LIVE VERIFIED |
| 4 | **Founder notification model** — typed events, end to end | LIVE VERIFIED |
| 5 | **Security fix: unauthenticated notification insert** — an `anon` caller could insert into `founder_notifications`. Closed by migrations `202608310001-03` | LIVE VERIFIED |
| 6 | **Security fix: privileged RPCs exposed to `anon`/`public`** — five functions including connector-secret and assignment RPCs. Closed by `202608310004`; grants re-queried live | LIVE VERIFIED |
| 7 | **Beehive DAG execution** — a real 4-task branching and fan-in DAG with genuinely overlapping parallel runs, plus three adversarial scenarios (failed branch blocks fan-in; stale worker detected once and never re-dispatched; scheduler cold-restart produces no duplicate runs) | INDEPENDENTLY VERIFIED |
| 8 | **Agent dispatchability fixes** — Product Architect and Release Operator were undispatchable through missing frontmatter | INDEPENDENTLY VERIFIED |
| 9 | **Cross-checkout hash stability** — agent definition hashes differed by machine until line endings were pinned | INDEPENDENTLY VERIFIED |
| 10 | **Deployed `sem-ai-command` v92** — live, serving, `ezbr_sha256 33255b31…`, byte-traced to commit `c9dfab5b` | LIVE (production state) |

**Everything above is live and independent of the two streams below.** Nothing in this document's
open work can break it, because neither stream has written to production.

---

## 2. THE EDGE TRUTHFULNESS CAMPAIGN — LARGE, NOT SHIPPED

Ten consecutive independent verifiers (#30–#39) have failed the candidate. **Nothing is deployed.**
Production still runs v92. This is the single biggest body of work in flight.

### What the campaign is fixing

The AI command function replaces prose it believes is a false completion claim with a canned refusal,
**and persists that replacement to `work_orders.output`** — so a wrong decision survives a reload and
is read back by the next turn. Two failure directions:

- **shipping a fabrication** — the founder is told something happened that did not;
- **destroying a truthful answer** — a correct answer is replaced by "I can't actually do that from
  chat", which is itself false. This is the worse direction and the campaign treats it that way.

### Measured against the deployed version, on the current candidate

| Property | Result |
|---|---|
| Truthful answers rescued that production destroys | **200+** across verifier corpora |
| Fabrications caught that production misses | **80+** |
| Fabrications shipped that production corrects | **0** on every committed gate |
| Truthful answers destroyed that production preserves | **0** on every committed gate |
| Historical production incidents still closed | 26 of 26 |

### Why it has not shipped

Each verifier found real defects the previous round introduced or missed. The recurring cause, now
recorded five times: **a suite was green only because its corpus never generated the shape.** The
worst instance, found by verifier #39, is worth stating plainly — an arm the deployed version does not
have was reading an ordinary sentence that merely *begins with a gerund* as a claim, and destroyed
**28 of 29** ordinary product-help answers, for example:

> "Archiving a company from chat is handled on the Companies page."

That was live-shaped behaviour, invisible to ten verifiers, because the only two tests covering that
code both used the same sentence with the gerund in the middle where the code cannot see it.

### Test infrastructure built (this is durable regardless of the outcome)

| Asset | State |
|---|---|
| 35 suites in the battery (29 asserting, 5 superseded stubs, 1 helper) | SOURCE VERIFIED |
| 8 verifier gate files, each re-runnable against any build | SOURCE VERIFIED |
| Generative adversarial suite, 25 properties generated from grammar rather than enumerated | SOURCE VERIFIED, proven to fail on 5 historical builds |
| Labelled differential sweep, 3,760 rows carrying intended truth values | SOURCE VERIFIED, proven to fail on 3 historical builds |
| 100 ledger entries recording every defect, fix, retraction and dead end | — |

### Open, disclosed, not fixed

Four sentence shapes that no pattern rule can separate without destroying a true answer. All four are
written down with their minimal pairs in the ledger. Two more were found today and handed to the
running verifier.

### Agreed next step

Both the verifiers and this session independently concluded the same thing: **pattern matching is at
its ceiling.** The next durable gain is deciding against structured evidence — the workspace's own
entity list is already loaded on every turn and can confirm that a capitalised phrase is a real
company name. The first regression test for that design is already written and failing on purpose.

---

## 3. DATABASE BATCH A/B/D — READY, BLOCKED ON YOU

Repository `brain-os-bug006`, commit `f6fa26a`, pushed. **Nothing applied.**

| Migration | Contents | State |
|---|---|---|
| `202609020001` (A) | durable chat channel state | authorized, ready |
| `202609020002` (B) | set person assignment, clear manager | authorized, ready |
| `202609030001` (D) | agent run capacity and retry | authorized, ready |
| `202609020003` (C) | messaging transport foundation | **excluded** |
| `202609040001` | chat channels creator immutable | **excluded** |

Two tools are built, committed and self-tested:

- a **read-only live preflight** that verifies each migration's functions, security-definer flags,
  triggers, policies, row-level security, grants and revokes against the live database, gives a
  per-migration verdict, and asserts the excluded migrations are untouched;
- a **selective apply script** that is dry-run by default, checks the migration bytes against the
  reviewed package, and **refuses to push unless the apply set is exactly A, B and D**. It never
  treats the push command's exit status as evidence.

**The only missing input is your credentials.** The approved batch is non-contiguous, which is why a
plain push is unsafe and this tooling exists. Two read-only commands you can run are in
`qa/verification/HANDOFF_STATE.md` §10.

---

## 4. KNOWN DEBT, NOT STARTED

| Item | Note |
|---|---|
| Scheduler cannot distinguish "waiting" from "permanently blocked" | Detection is written and tested but never called. Dispatch behaviour is correct today. |
| No automatic recovery for a stale agent run | Recovery is manual. Confirmed by repo-wide search. |
| Phase 6 plugin lifecycle, and phases 7–11 | Not started. Phase 6 needs a gated schema change first. |

---

## 5. HONEST NOTE ON WHAT "VERIFIED" DOES NOT MEAN HERE

The Edge campaign's evidence is **source-level**. Verifier sessions could not download the deployed
bundle or drive a browser, so the link from git to the running function rests on the deploy record and
timestamps rather than on hashing the deployed bytes. No verifier claimed more than that, and neither
does this document. **Before any deploy is called done, the function should be re-downloaded, hashed
against the certified bytes, and exercised through live chat.**

---

## 6. SUGGESTED WEEK SHAPE

1. **Unblock the database batch** — it is the only item finished on our side and waiting purely on
   credentials, and it is a short, well-guarded task.
2. **Let the Edge campaign reach a verifier pass, then decide.** It is close on measurements but the
   last two rounds each found a real user-facing defect, so a pass should not be assumed. When it
   passes, the deploy question comes to you once.
3. **Start the structured-evidence work** if the campaign stalls again. Both the verifiers and this
   session agree it is where the remaining gains are, and the first test already exists.
4. **Pick up the two scheduler debt items** — small, well understood, and independent of everything
   above.
