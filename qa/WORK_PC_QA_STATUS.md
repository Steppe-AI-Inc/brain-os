# Work-PC QA Status Dashboard

All numbers computed by `qa/runner/compute-coverage.mjs` — never hand-typed.

**Session ended 2026-08-31** (founder left office / connectivity cut). Everything below is
pushed to `origin/qa/work-pc`. **The campaign is resumable from repository state alone** —
no chat history needed. Next session starts at `qa/runner/QA_DIRECTOR_BOOT.md`.

---

## Verdict

> ## QA FAILED — 4 defects (2× P1, 2× P2)

| | |
|---|---|
| **Campaign** | `C001` — CHECKPOINTED_SESSION_END |
| **Deployed SHA under test** | `8521b0e` (Vercel-API verified) |
| **QA artifact SHA** | `89b549f` on `qa/work-pc` |
| **Release state** | **FAILED** |
| **Platform state** | AUTONOMOUS QA PLATFORM — PARTIALLY VERIFIED |

```
63 capabilities | PASS 22 | FAIL 9 | FLAKY 1 | BLOCKED 4 | NOT_TESTED 27
50.8% executed  ->  FAILED
```

> ⚠️ The denominator is a **floor**. The per-page control inventory has not run, so the true
> total is higher. See `QA_COVERAGE_GAPS.md` §1.

---

## Open defects — Home-PC priority order

| Bug | Sev | Title | Regression |
|---|---|---|---|
| [BUG-004](bugs/BUG-004.md) | **P1** | Any self-registered user can write into the company brain; unscoped memories bypass every sensitivity tier | `memories_null_company_scope_not_a_bypass.sql` |
| [BUG-002](bugs/BUG-002.md) | **P1** | Brain Chat fabricates success for unsupported ops — **product-wide class** (approvals, departments, projects) | `chat_must_not_fabricate_approval_decision.md` |
| [BUG-003](bugs/BUG-003.md) | P2 | Dashboard "Companies" counts archived — 18 shown vs 8 active (125% overstatement) | `dashboard_company_count_excludes_archived.sql` |
| [BUG-001](bugs/BUG-001.md) | P2 | Archived-parent descendants shown unmarked — 24/24 join sites omit `companies.status` | `departments_hide_or_mark_archived_parent.sql` |

All four regressions are **EXPECTED_FAIL by design** — they assert correct behavior, not
current behavior.

---

## What held (recorded so the failures aren't misread)

- **Company-scoped RLS holds.** A zero-membership account read 0 from approvals, documents,
  `financial_reports`, `product_lines`, `sales_leads`, projects. BUG-004 is the null-scope
  escape hatch specifically, not a general RLS failure.
- **The governance gate holds.** Despite BUG-002's fabricated "has been approved", no approval
  was ever actually decided and no linked task resumed.
- **Archived enforcement holds where it matters.** 6/6 pickers exclude archived; chat refuses
  to create under, or move a person into, an archived company.
- **Context truncation is honest** (§6): *"25 tasks total. You're seeing 15 of them."*
- **Archive/restore round-trips cleanly** with all descendants preserved.

---

## Three false leads caught and NOT filed

1. A stale in-test read that looked like a restore failure — fresh load disproved it.
2. "Email silently dropped" — my own selector filled the wrong input.
3. A regression that passed **for the wrong reason** (`archive_company()` silently no-opped
   without founder impersonation) — now guarded by an explicit precondition assertion.

---

## Deployment discipline

Production redeployed **5×** mid-campaign (`256f183 → 7df9656 → 266f86a → 8c33527 →
8521b0e`). Evidence was checkpointed rather than re-stamped, and both defect surfaces were
proven byte-identical across the range via `git diff`, so findings are build-independent.

---

## Remaining C001 work (next session)

Org Business Units (dual-model), Projects CRUD, Goals, Tasks edit, multi-action commands,
remaining cascade attacks, reload/fresh-session truth. Then the supervisor/auto-start.

## Blocked (4) — explicit reasons

- Live QA dashboard ×3 — needs Home-PC `QA-PLATFORM-REALTIME-CONTROL-PLANE`.
- Distinct browser personas ×1 — **investigation advanced this session**: public signup is
  open and *is* a viable path; the real blocker is the lack of a test inbox for OTP, not
  absence of capability. Recorded accurately rather than as "impossible".
