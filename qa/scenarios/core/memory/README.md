# core/memory scenarios

Memory (`memories`) is a per-row sensitivity-tiered table (public/internal/confidential),
long-term company knowledge retrieved by `sem-ai-command` via semantic search
(`match_memories`). Its confidential tier was live-broken for a period (GitHub↔production
drift) and fixed in migration 202608270004 — see `qa/KNOWN_FAILURE_MODES.md` #11.

Scenarios covering the memory domain (placed in their primary category, cross-referenced
here):
- **SC-069** (`ai/context_security/`) — confidential memories do not leak to an employee
  via search/snippet/count. Runner: `qa/scenarios-runner/sc069_search_leakage.sql`
  (includes a confidential-memory row, employee sees 0). **PASS 2026-08-27.**
- **SC-055** (`ai/context_security/`) — an employee's natural request for restricted info
  through chat/memory is denied the same as a direct query.
- **SC-119** (`core/organizations/`) — an employee cannot mutate `memory.sensitivity`
  (downgrade) or `memory.company_id`. **PASS 2026-08-27.**
- **SC-068** (`ai/sensitive_inference/`) — the open write-time sensitivity-floor gap
  (`memories.sensitivity` is model-assigned with no floor against source data —
  governance/SECURITY_INVARIANTS.md #7, CAPABILITY_MATRIX.yaml
  `ai.memory.write.sensitivity_floor` enforced:false).

Regression anchor: the confidential-tier fix is a permanent regression per SC-126.
