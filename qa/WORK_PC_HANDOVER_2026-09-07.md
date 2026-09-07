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
68.4% → **73.7%** executed (73/99). NOT_TESTED 27 → 22. Details in `qa/COVERAGE_LEDGER.json`
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

## 8. Next priorities (untouched today)
Cross-org isolation beyond the manager picker (org switcher + data scoping), BUG-010
regression expansion, issue #5 continuity suite items A–L, 50/100/200-turn runs, remaining
22 NOT_TESTED capabilities, TEAM-READY multi-org/security, exploratory synthetic scenarios.
