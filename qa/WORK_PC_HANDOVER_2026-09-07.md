# Work-PC Independent QA — Handover, 2026-09-07

**Role of this document:** conclusion of today's independent production acceptance on
`https://brain.open-spot.ai`, written for (a) third-party verification and (b) the Home PC
implementation handoff. Every claim below is backed by a browser observation on the live
deployment, DB truth established by full-page reload (PostgREST rows, RLS-scoped as founder),
and — where it matters — a Brain Chat cross-check. Nothing here was inferred from code.

**Build under test (re-probed live, unchanged all day):** `sem-ai-command` **v92**, ACTIVE,
`ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, deployed
2026-09-01T05:15Z. origin/master `f6fa26a`. Chat model at test time: Claude Haiku 4.5.
Because the build never changed, previously recorded C002 retests were **not** re-run.

**Boundaries kept:** synthetic registered fixtures only; no production fixes; no deploy; no
migrations; no infrastructure write paths. Pushes only to `qa/work-pc`.

---

## 1. Defects filed today (all reproduced, evidenced, with regression requirements)

| ID | Sev | One line | Blast radius |
|---|---|---|---|
| **BUG-010** | **P1** | A fabricated mutation claim **contaminates the same channel's later reads** — asked for the "exact current title as stored in the database right now", Brain returned its own earlier false claim. Identical question in a fresh channel returned the DB truth. | Zero mutation |
| **BUG-014** | **P1** | Company **restore fails both ways**: fresh channel says the archived company "does not appear to exist — may have been permanently deleted"; the archive channel says "restored." while DB stays archived. UI has **no** restore path. | Shared fixture company **stuck archived** |
| BUG-012 | P2 | Chat **reassigns a manager correctly but receipts it as a company move** ("reassigned to \<company\>"). Right action, wrong description. | Data correct |
| BUG-013 | P2 | Archiving a company **does not cascade**: children get the Archived badge but people stay actively attached, manager links persist, Set-manager/invite/onboarding stay live, project stays `active`. The charter's named failure pattern. | Synthetic only |
| BUG-011 | P3 | Set-manager sheet: silent empty picker when no eligible manager; never shows the current manager it says it will replace. | Display only |
| BUG-002 | P1 (reconfirmed) | "Rename project" via chat → "Project renamed…" with DB unchanged — reproduced on the current build against a **synthetic** fixture. | Zero mutation |

### Why BUG-010 matters most
Same account, same build, same model, minutes apart — the *only* variable was channel history.
That isolates the fault to grounding precedence at prompt assembly and **excludes** the DB read
path (provably correct in the control channel). An explicit anti-guess instruction did **not**
rescue it (unlike BUG-005 Class A), so it cannot be patched with prompt wording. The path a
careful user takes to *verify* a suspicious claim is exactly the path that lies.

### Why BUG-014 matters
The Class B misbinding already showed a bare "yes" can archive a company. Today shows the
founder could then be **unable to restore it** and would be **told it was permanently
deleted**. Note: the same restore command on the same company **worked on 2026-09-02 on this
same build** (BUG-005 evidence) — so this is nondeterministic/state-dependent, not a build
regression; the Home PC must not assume the earlier pass still holds.

## 2. What passed (positive evidence, same rigor)

- **Projects UI CRUD** — create and edit persisted across reload; no duplicate rows.
- **Manager assignment AND reassignment via UI** — replace semantics, prior manager
  released, persisted, Brain Chat agreed with UI and DB including the released manager.
  (The inventory's premise that reassignment was chat-only was **wrong**: `/people` has a
  per-row "Set manager" control.)
- **Cross-org isolation of the manager picker** — with the company holding only the
  subject, the picker offered **0** candidates, none of the 15 people from the other 10
  orgs; then exactly the same-org people, never the subject.
- **Company archive via chat** — real, immediate, receipt == mutation; dashboard count
  11→10 (BUG-003 fix holds); Archived badges on `/people` and `/projects` (BUG-001 fix holds
  on those two surfaces).
- **Brain Chat grounding on a fresh entity** — correct name, status and parent for a
  just-created-and-renamed project (in a clean channel).

## 3. Coverage movement
68.4% → **77.0%** executed (77/100). NOT_TESTED 27 → 19. PASS 45 → 51, FAIL 21 → 25. Details in `qa/COVERAGE_LEDGER.json`
(computed, never hand-edited).

## 4. Fixture state the Home PC must know
`QA-SWARM-TEST-CO-VIA-CHAT` (`7ba01ff2-6404-4c06-8bc5-4449b50df5de`) is **archived and stuck**
(BUG-014) with 3 registered people (`QA-SWARM-PERSON-001-EDITED` managed by
`QA-C002-MGR-PERSON-02`; `QA-C002-MGR-PERSON-03`) and 1 registered project
(`QA-C002-PROJ-EDITED-01`) under it. Work PC will not restore it via infrastructure paths.
Please restore through a product path once BUG-014 is addressed, or advise.

## 5. Handoff rules (unchanged)
Only an independent Work-PC rerun closes a bug. `ready_for_retest` is an input, not a
verdict. The implementation PC may not self-certify BUG-010/012/013/014. Every regression
requirement is in `qa/BUG_QUEUE.json` under the bug.

## 6. Suggested verification questions for a third party
1. Does the BUG-010 A/B control (contaminated channel `e7fd21c6…` vs fresh `1ea479c7…`)
   really isolate channel history as the only variable? (Yes: same account/build/model/query.)
2. Is BUG-014 a regression? (No — same build passed on 09-02; it is nondeterministic.)
3. Is BUG-013 a display bug? (No — display is correct; state and controls do not cascade.)
4. Were any real records mutated? (No — every mutation targeted registered synthetic fixtures;
   row counts and unrelated rows were re-read after each step.)

## 7. Evidence pointers
`qa/BUG_QUEUE.json` (BUG-010…014, BUG-002.reconfirmed_2026_09_07),
`qa/CAPABILITY_INVENTORY.json`, `qa/FIXTURE_REGISTRY.json`, `qa/HANDOFF_STATE.json`
(`work_pc_session_2026_09_07`). Channels: e7fd21c6, 1ea479c7, 0e47b58d, f32e9d70,
8f74aef6, 3c4dfaef. Commits on `qa/work-pc`: f1a9ff3, 44d344a, 2a565ab, plus this one.

## 8. Next priorities (as of the morning session)
Cross-org isolation beyond the manager picker (org switcher + data scoping), BUG-010
regression expansion, issue #5 continuity suite items A–L, 50/100/200-turn runs, remaining
22 NOT_TESTED capabilities, TEAM-READY multi-org/security, exploratory synthetic scenarios.

---

# Session 2 addendum (11:23–12:13Z) — same build, v92 unchanged

**Coverage 73.7% → 92.2% (94/102).** NOT_TESTED is now **0**: every capability is executed
or explicitly BLOCKED with a reason. Commits on `qa/work-pc` up to this one.

## New defects (all reproduced, evidenced, regression requirement in `BUG_QUEUE.json`)

| ID | Sev | One line |
|---|---|---|
| **BUG-018** | **P1** | "undo that" after a chat rename → *"Renaming X back to Y."* — **no mutation** (DB unchanged at +10s/+44s); an explicit rename of the same company in a fresh channel executed in 10s. Fabricated execution on the undo verb, correct target. |
| **BUG-020** | **P1** | Chat cannot resolve an **active** company on the BU-create and archive command paths that it resolves for questions, renames and project-create — deterministic (2/2 fresh channels), and it offers **real companies** (or already-archived ones) as substitutes. Sole BU-parent path in the product. |
| **BUG-021** | **P1** | "X is a business unit of Y" **half-applies** (type flips to Business unit, no parent link) with a **self-contradicting receipt** — a system failure line followed by "X is now recorded as a business unit of Y". |
| BUG-015 | P2 | Org selector scopes /people, /projects, /goals but **not** /companies, half the dashboard, or Brain Chat ("I don't have a way to determine which organization you have selected"). View filter, not a boundary. |
| BUG-017 | P2 | Task named exactly in a command is invisible when outside the 15-of-32 context window — no named-task lookup (same class as the companies/people fix). |
| BUG-019 | P2 | Ending a person's employment leaves them the **live manager** of active reports; unflagged; Brain states the stale link as fact. |
| BUG-016 | P3 | Edit-task dialog shows "No company" for a task whose company is archived (value intact, display lies). |
| BUG-022 | P3 | /companies row action labelled **"Delete"** performs an **archive** (its own dialog says so). |

## Corrections to the morning handover — read these
- **BUG-014:** the claim "unrecoverable by the founder / UI has no restore path" is **withdrawn**.
  `/companies/archived` has Restore and Permanently delete; I restored the stuck fixture through
  it at 12:00:33Z. What stands, still P1: the fresh-channel *"may have been permanently deleted"*
  and the in-channel fabricated *"restored."* — neither reply pointed to the UI path.
- **BUG-013** is reframed: the product's archive dialog *declares* "nothing attached is touched",
  so non-cascade is design, not omission → `DESIGN_DECISION_REQUIRED`. Still a defect: live
  Set-manager/invite/onboarding controls on people of an archived company.
- **Fixture alert RESOLVED** — `QA-SWARM-TEST-CO-VIA-CHAT` is active again. No Home-PC action.
- My 11:12Z probe "no UI archive path" was **wrong** (archive is the mislabelled "Delete");
  recorded as a Work-PC error under `CAP-COMPANY-ARCHIVE-UI-MISSING`.

## Passed (same rigor)
Multi-action chat (one turn, two creates, receipt == mutations); department update via chat;
project/department/task/goal UI edits and deletes; person end + restore employment (state
symmetric); company archive via chat and restore via UI (round-trip symmetric, badges cleared,
manager link intact); entity-resolution **Class A** (real, read-only, data matched UI); issue #5
**Class B bare-"yes" regression PASS** (partial-name archive → clarification, "yes" did not bind).

## Blocked (with reasons in the inventory)
Permanent delete + delete-cascade (**session permission layer denied the irreversible click on
a synthetic fixture — founder decision needed**); approval decide (no way to raise a synthetic
approval; the 8 pending are real); fresh-session truth and multi-user persona (need a second
credential).

## Late additions (12:13–12:25Z)
- **BUG-023 (P1)** — the issue #5 founder transcript, new outcome: the clarification offered a
  **wrong** company (BUG-020), the pending action **survived navigation** (item F passes), a bare
  "yes" **bound to the substitute** (item D fails), the assign **half-applied** (person created with
  no company), and the receipt claimed a company *and an invented parent* (item L fails). No
  archive fired — the Class B fix holds for its own vector. Orphan fixture `QA-C002-PENDING-01`.
- **BUG-010 reproducibility bound:** three expansion attempts (relationship claim, assignment
  claim, and a re-run of the original rename shape) did **not** contaminate; the model cited
  structured fields and answered correctly. Contamination has reproduced **1 time in 4** — real,
  severe when it fires, but **intermittent**, and so far only on a fabricated *new name*. The
  regression must repeat the shape N times, not once.
- **BUG-002 determinism:** fabricated project rename **3 of 3** today.
- **BUG-017 sharper:** a task created 8 minutes earlier was already outside the 15-of-34 chat
  window — the capped list is not newest-first.

## Production readiness — unchanged verdict, sharper reasons
Single-founder use with UI verification of every Brain claim: usable now. Team use: **not yet**.
Seven open P1s, all execution-truth (BUG-002, 005, 010, 014, 018, 020, 021). The
org selector is not a tenant boundary (BUG-015) and persona-level isolation is untestable
from this seat. Gate = those P1s closed by independent Work-PC retest + a persona isolation sweep.
