# FACTORY V1 AUTO-ENROLLMENT — DURABLE CHECKPOINT (for a fresh Claude Code session)

## 0. RESUME HERE

- **Branch** `factory/auto-enrollment-v1-contract`.
  - Worktree `C:\Users\DELL\dev\brain-os-factory-enroll` (placement DESKTOP-8P5HVAO, implementer).
  - The remote uses a single-branch fetch refspec, so fetch and push with explicit refspecs:
    `git fetch origin refs/heads/factory/auto-enrollment-v1-contract:refs/remotes/origin/factory/auto-enrollment-v1-contract`
    and `git push origin factory/auto-enrollment-v1-contract:factory/auto-enrollment-v1-contract`.
- **Frozen baseline** `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6` is the semantic reference and is never modified.
  - The LIVE LEGACY CHECKOUT `C:\Users\DELL\dev\brain-os-factory-cp` stays detached there.
  - The live task `BrainOS Factory Node` (role verifier, legacy runner.env / direct PG) runs FROM that checkout.
  - Never check out, edit, or run tests that touch it, `~/.brain-factory/runner.env`, the live plane `npvhuoozkbexddnvkqsj`,
    production, master, or the third PC.
- **Governance:**
  - `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`.
  - The Director (DESKTOP-MDPE6FS placement) owns what must be true.
  - Proposals that change it are CRs (`qa/work-orders/change-requests/`) and are not implemented before ratification.
  - The implementer never self-certifies. The phase ends READY FOR INDEPENDENT QA.
- **Contract:**
  - `docs/architecture/features/factory-auto-enrollment.md` (A binding verbatim, B CRs, C engineering).
  - Matrix `…-transport-matrix.md`: every VERDICT is PENDING until its regression passes on the new primitive.
  - States `…states.json`.

## 1. Slice status

| Slice | Status | Commit | Evidence |
|---|---|---|---|
| Step 0 setup (worktree, fetch, memory) | DONE | — | no Director WO material on `origin/qa/work-pc` or `origin/qa/home-pc-handoff` (searched 2026-09-26) |
| Step 1 contract + matrix + ADR + CR-001..004 + checkpoint | this commit | (see git log) | — |
| E1 schema 004/005 | NEXT | | |
| E2 lifecycle core + legacy door + claim.mjs thin | | | |
| E3 eligibility / ranking / priority / verification gate | | | |
| E4 factory_api / factory_admin functions | | | |
| E5 factory-node-api | | | |
| E6 factory-admin-api | | | |
| E7 runtime transport / credential / build-info | | | |
| E8 SEA build | | | |
| E9 persistent runtime (task / watchdog / supervisor) | | | |
| E10 release manifest / upgrade | | | |
| E11 lifecycle (drain / rotate / revoke / archive / telemetry) | | | |
| E12 web Computers | | | |
| E13 coordination ops (director through the API) | | | |
| S1 profiles.role self-escalation (source level) | | | |
| composer + freeze + handoff | | | |

## 2. Boundaries (stop that item, continue the rest)

| Item | Class |
|---|---|
| live-plane migrations | BLOCKED — FOUNDER |
| API roles / secrets (`FACTORY_NODE_DB_URL`, `FACTORY_ADMIN_DB_URL`, `FACTORY_PAIRING_PEPPER`) / seeds | BLOCKED — FOUNDER |
| Edge deploy (`ALLOW_FUNCTIONS_DEPLOY=1?`) | BLOCKED — FOUNDER |
| installer bucket / upload | BLOCKED — FOUNDER |
| Authenticode certificate + production manifest key | BLOCKED — EXTERNAL → FOUNDER |
| feature-branch PR INTO master / merge / production deploy | BLOCKED — FOUNDER |
| legacy retirement | BLOCKED — FOUNDER |
| re-enrollment of the existing nodes | BLOCKED — FOUNDER |
| third PC | not before READY FOR REAL ZERO-TOUCH ACCEPTANCE |
| S1 fix | BLOCKED — FOUNDER |
| CR-001..004 | DIRECTOR DECISION |
