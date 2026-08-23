"""Role / department / goal scoping rules.

The filter built here is what stops a `team_member` recall from seeing
an owner-only memory. Every change to this file must keep its tests green.
"""

from __future__ import annotations

from typing import Any

from app.models import RoleKind, Scope

# Default visibility when a memory is written without an explicit `visible_to`.
DEFAULT_VISIBLE_TO: tuple[RoleKind, ...] = (RoleKind.owner, RoleKind.department_lead)


def effective_visible_to(visible_to: list[RoleKind] | None) -> list[RoleKind]:
    """Apply the safe default and de-duplicate while preserving order."""
    pool = list(visible_to) if visible_to else list(DEFAULT_VISIBLE_TO)
    seen: set[RoleKind] = set()
    out: list[RoleKind] = []
    for r in pool:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def can_role_see(role: RoleKind, visible_to: list[RoleKind]) -> bool:
    """Owners always read; auditors always read; otherwise the role must be in `visible_to`."""
    if role in (RoleKind.owner, RoleKind.auditor):
        return True
    return role in visible_to


def build_memory_filter(scope: Scope, start_param: int = 1) -> tuple[str, list[Any]]:
    """Build the SQL WHERE fragment (and its positional params) for a recall.

    Same rules the old Qdrant payload filter enforced:
      - Always require the same `org_id`. Cross-org reads are impossible.
      - If `department_id` is on the scope, restrict to that department OR org-wide
        memories (department_id IS NULL).
      - If `goal_id` is on the scope, allow that goal OR memories not bound to any goal.
      - For non-owner / non-auditor roles, require the role to be in `visible_to`.

    Params are `$N` placeholders starting at `start_param`, so callers can splice
    this fragment into a larger query (kind filter, embedding, limit) that appends
    its own params after this fragment's.
    """
    clauses: list[str] = []
    params: list[Any] = []
    idx = start_param

    clauses.append(f"org_id = ${idx}")
    params.append(scope.org_id)
    idx += 1

    if scope.department_id is not None:
        clauses.append(f"(department_id = ${idx} OR department_id IS NULL)")
        params.append(scope.department_id)
        idx += 1

    if scope.goal_id is not None:
        clauses.append(f"(goal_id = ${idx} OR goal_id IS NULL)")
        params.append(scope.goal_id)
        idx += 1

    if scope.role not in (RoleKind.owner, RoleKind.auditor):
        clauses.append(f"${idx}::core.role_kind = ANY(visible_to)")
        params.append(scope.role.value)
        idx += 1

    return " AND ".join(clauses), params
