---
name: commercial-demo-release
description: The Release Operator's actual release-gate checklist, and the full commercial-demo business-day rehearsal scenario. Use for any final release decision on a Factory Work Order, and for the end-to-end commercial demo acceptance test once the Partner Dashboard and at least Telegram messaging are both live.
---

# Commercial Demo Release

## Release gate checklist (every Factory Work Order, before release-ready)

Run every check for real, in the current release-operator run — never re-trust a prior
report:
1. Build (`npm run build` from `web/`) — clean.
2. Typecheck (`npx tsc --noEmit`) — clean.
3. Lint (`npx eslint` on touched files) — clean.
4. Critical regression tests — the relevant `qa/scenarios-runner/*.sql` scripts run
   live, `all_pass: true`.
5. Security checks — RLS matches the intended pattern, no capability silently
   broadened, `governance/capabilities/CAPABILITY_MATRIX.yaml` updated if a new
   capability was introduced.
6. Migration status — live and verified (real query against production), or explicitly
   `BLOCKED — DB PUSH`, never assumed from the file existing.
7. Verifier status — `brain-os-verifier` has actually run against this Work Order with
   real findings, not skipped.
8. Commercial acceptance criteria — every one the Work Order stated, each with real
   cited evidence.
9. Deployment state — deployed commit matches what's being gated, Edge Functions
   byte-verified.
10. Smoke test — the single most important real user path, run live post-deployment.
11. Rollback readiness — a real, stated way to revert if something goes wrong.

Output exactly one of `PASS`/`CONCERNS`/`FAIL`/`BLOCKED` — never softened language.

## The full commercial demo business-day rehearsal

Run once the Partner Dashboard (Phase 9) and Telegram (Phase 10, at minimum) are both
live. This is the `brain-os-truth-verification` skill's own methodology, run as one
continuous narrative instead of per-feature:

```
founder login → create company → create business unit → create employee
→ create goal → create task → assign employee → employee login
→ verify scoped work → manager login → verify broader scope
→ partner opens revenue dashboard → verify partner isolation
→ customer sends Telegram sales inquiry → Brain links contact → creates lead
→ AI drafts reply → sales employee replies → customer replies
→ conversation stays consistent
→ founder archives/restores business structure → related data follows lifecycle truth
→ fresh Brain chat reports current structure → hard reload/relogin
→ integrity checker
```

Every one of these must be at exactly zero, evidenced not asserted:
```
orphan references            invalid parent references
active→archived contradictions (unless explicitly, consistently allowed)
AI false action claims       unauthorized access
duplicate webhook processing UI ↔ DB contradictions
AI ↔ DB contradictions
```

If any single one of these is nonzero, the commercial demo gate is `FAIL` regardless of
how well any individual feature demoed in isolation — this rehearsal exists specifically
to catch the class of defect that only shows up when features interact, which per-feature
testing cannot.
