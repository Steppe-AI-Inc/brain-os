# qa/contracts — contract-driven QA layer (added 2026-09-07)

**What this is:** the smallest useful implementation of

```
PRODUCT CONTRACT → TEST OBLIGATIONS → UNIVERSAL TEST PATTERNS → FEATURE-SPECIFIC TESTS
→ IMPACT-BASED REGRESSION → DEPLOYED WORK-PC ACCEPTANCE → GENERATIVE SCENARIO EXPANSION
```

layered **on top of** the existing Work-PC QA system. Nothing was replaced, reset or
rewritten. `CAPABILITY_INVENTORY.json`, `COVERAGE_LEDGER.json` (denominator, formula,
headline, release-state rule), `BUG_QUEUE.json`, `FIXTURE_REGISTRY.json`, `qa/scenarios/**`,
`qa/scenarios-runner/**`, `qa/runner/**`, C001/C002 evidence and the 50/100/200-turn strategy
are all intact. Work-PC browser/adversarial acceptance remains the final authority.

## Files

| File | Role |
|---|---|
| `UNIVERSAL_TEST_PATTERNS.json` | 26 reusable, entity-agnostic acceptance patterns. Each declares its `oracle_source` and which bugs/capabilities already instantiate it. |
| `CAPABILITY_CONTRACTS.json` | Feature contracts (states, transitions, inverse, flags, affected surfaces, `policy_status`, feature-specific tests) + `derivation_rules` (flag → obligations). |
| `CAPABILITY_IMPACT_REGISTRY.json` | Shared primitive → affected contracts/capabilities → regression families, with `file_path_hints` so a fix report without `changed_primitives` can still be mapped. Includes the scheduling order. |
| `CONTINUITY_INVARIANTS.json` | The 50/100/200-turn, compaction, navigation, channel-identity, pending-action and turn-binding tests as named invariants with probes and oracles. |
| `DEFECT_CLASS_MAP.json` | MANIFESTATION → DEFECT CLASS → PRIMITIVE → REGRESSION FAMILY index over `BUG_QUEUE.json`. |
| `../runner/lib/contracts.mjs` | `loadContracts`, `deriveObligations`, `obligationsForAll`, `inferChangedPrimitives`, `impactPlan`, `generateScenarios`, `dimensionCoverage`. |
| `../runner/contracts-selftest.mjs` | Deterministic proof of the above on the real files (`node qa/runner/contracts-selftest.mjs`). |

## Integration points (both additive)

- `qa/runner/compute-coverage.mjs` now appends `dimensions` (state / transition / role /
  tenant / surface / invariant / regression coverage). The capability headline is unchanged
  so the historical trend stays comparable.
- `qa/runner/lib/scheduler.mjs` gained branch **3b — impact regression**: after P0/P1
  retests and before the campaign queue, when `ctx.buildChanged` and fix reports are present,
  it maps changed primitives to regression families and schedules them first. If nothing can
  be inferred it falls through to the standing order. It records `last_impact_plan_key` in
  `HANDOFF_STATE.json` so a plan is not rescheduled for the same build.

## The oracle rule (§8 of the directive)

Expected behaviour comes only from: `governance/BRAIN_OS_CONSTITUTION.md` and its
`capabilities/`, `roles/`, `policies/`, `SECURITY_INVARIANTS.md`, `ACTION_RISK_LEVELS.md`,
`DATA_CLASSIFICATION.md`; `CLAUDE.md` §§0–28; the issue #5 founder suite (A–L); and
founder-approved product policy. **As of 2026-09-07 governance defines authorization and
data classification but no lifecycle semantics** (archive cascade, ended-manager links, BU
parenting, org-selector meaning). Those contracts carry
`BLOCKED - PRODUCT POLICY UNDEFINED`; generated scenarios for them are emitted with
`verdict_policy: BLOCKED_POLICY_UNDEFINED` and the Work PC records observed behaviour without
judging it. The product's own dialog copy is cited only as *declared implementation
behaviour*, never as the oracle.

## Honesty about the asset list in the directive

These directive-named files **exist** and are integrated: `CAPABILITY_INVENTORY.json`,
`COVERAGE_LEDGER.json`, `BUG_QUEUE.json`, `FIXTURE_REGISTRY.json`, `qa/runner/**`,
`qa/playwright/regression/`, `qa/scenarios/**` (incl. `CAPABILITY_MATRIX.md`, `personas/`),
`SECURITY_MATRIX.md`, `TEST_PERSONAS.md`, `SYNTHETIC_CLONE_MAP.json`.

These directive-named files **do not exist** in the repository and were **not** fabricated:
`HUMAN_QA_MASTER_MATRIX.md`, `AI_UI_CAPABILITY_MATRIX.md`, `SCENARIO_CATALOG.json`,
`SYNTHETIC_WORLDS.json`, `ROLE_TENANT_ACCESS_MATRIX.json`. Their nearest real equivalents are
`qa/scenarios/CAPABILITY_MATRIX.md` + `governance/capabilities/CAPABILITY_MATRIX.yaml`
(role/tenant access), `qa/scenarios/**` (scenario catalogue), and `SYNTHETIC_CLONE_MAP.json` +
`FIXTURE_REGISTRY.json` (synthetic worlds). If the founder wants those exact files, they
should be generated from these sources, not hand-typed.

## Ask for the Home PC

Add `changed_primitives: [...]` (keys from `CAPABILITY_IMPACT_REGISTRY.json`) and
`files_changed: [...]` to every fix report in `qa/home-pc-handoff/fixes/`. Until then the
scheduler infers primitives from `file_path_hints` matched against the report text, and
schedules nothing impact-based when it cannot infer.
