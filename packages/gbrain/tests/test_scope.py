"""Tests for the role-scope filter — the security-critical pure function in gbrain."""

from __future__ import annotations

from uuid import uuid4

from app.models import RoleKind, Scope
from app.scope import (
    DEFAULT_VISIBLE_TO,
    build_memory_filter,
    can_role_see,
    effective_visible_to,
)

# ---------- effective_visible_to -------------------------------------------


def test_default_when_none() -> None:
    assert effective_visible_to(None) == list(DEFAULT_VISIBLE_TO)


def test_default_when_empty() -> None:
    assert effective_visible_to([]) == list(DEFAULT_VISIBLE_TO)


def test_dedupes_preserving_order() -> None:
    out = effective_visible_to(
        [RoleKind.team_member, RoleKind.owner, RoleKind.team_member]
    )
    assert out == [RoleKind.team_member, RoleKind.owner]


# ---------- can_role_see ---------------------------------------------------


def test_owner_always_sees() -> None:
    assert can_role_see(RoleKind.owner, [])
    assert can_role_see(RoleKind.owner, [RoleKind.team_member])


def test_auditor_always_sees() -> None:
    assert can_role_see(RoleKind.auditor, [])
    assert can_role_see(RoleKind.auditor, [RoleKind.owner])


def test_team_member_blocked_by_default() -> None:
    assert not can_role_see(RoleKind.team_member, list(DEFAULT_VISIBLE_TO))


def test_team_member_allowed_when_listed() -> None:
    assert can_role_see(
        RoleKind.team_member,
        [RoleKind.owner, RoleKind.department_lead, RoleKind.team_member],
    )


def test_agent_inherits_only_when_listed() -> None:
    assert not can_role_see(RoleKind.agent, list(DEFAULT_VISIBLE_TO))
    assert can_role_see(RoleKind.agent, [RoleKind.agent])


# ---------- build_memory_filter (SQL fragment assertions) ------------------


def _scope(role: RoleKind, *, dept: bool = False, goal: bool = False) -> Scope:
    return Scope(
        org_id=uuid4(),
        department_id=uuid4() if dept else None,
        goal_id=uuid4() if goal else None,
        role=role,
    )


def test_filter_always_pins_org() -> None:
    s = _scope(RoleKind.owner)
    sql, params = build_memory_filter(s)
    assert "org_id = $1" in sql
    assert params[0] == s.org_id


def test_filter_owner_does_not_check_visible_to() -> None:
    s = _scope(RoleKind.owner)
    sql, _ = build_memory_filter(s)
    assert "visible_to" not in sql


def test_filter_auditor_does_not_check_visible_to() -> None:
    s = _scope(RoleKind.auditor)
    sql, _ = build_memory_filter(s)
    assert "visible_to" not in sql


def test_filter_team_member_checks_visible_to() -> None:
    s = _scope(RoleKind.team_member)
    sql, params = build_memory_filter(s)
    assert "visible_to" in sql
    assert params[-1] == RoleKind.team_member.value


def test_filter_agent_checks_visible_to() -> None:
    s = _scope(RoleKind.agent)
    sql, params = build_memory_filter(s)
    assert "visible_to" in sql
    assert params[-1] == RoleKind.agent.value


def test_filter_department_scope_includes_nullable_branch() -> None:
    s = _scope(RoleKind.team_member, dept=True)
    sql, params = build_memory_filter(s)
    assert "department_id = $2 OR department_id IS NULL" in sql
    assert s.department_id in params


def test_filter_goal_scope_includes_nullable_branch() -> None:
    s = _scope(RoleKind.team_member, goal=True)
    sql, params = build_memory_filter(s)
    assert "goal_id = $2 OR goal_id IS NULL" in sql
    assert s.goal_id in params


def test_filter_no_dept_no_goal_omits_those_keys() -> None:
    s = _scope(RoleKind.team_member)
    sql, _ = build_memory_filter(s)
    assert "department_id" not in sql
    assert "goal_id" not in sql


def test_filter_param_indices_are_contiguous() -> None:
    """Every $N placeholder in the SQL must have a matching positional param."""
    s = _scope(RoleKind.team_member, dept=True, goal=True)
    sql, params = build_memory_filter(s, start_param=1)
    assert len(params) == 4  # org_id, department_id, goal_id, role
    for i in range(1, len(params) + 1):
        assert f"${i}" in sql


def test_filter_start_param_offsets_placeholders() -> None:
    s = _scope(RoleKind.owner)
    sql, _ = build_memory_filter(s, start_param=3)
    assert "org_id = $3" in sql
