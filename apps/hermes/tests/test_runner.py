"""Tests for the Hermes runner.

These bypass FastAPI and exercise the runner against a fake LLM and a fake
gbrain client (monkey-patched). They prove the loop's contract: recall →
complete → remember → return the output synchronously.
"""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest

from app.llm import FakeLLM
from app.models import RoleKind, RunRequest, Scope
from app.runner import run as run_agent


class FakeBrain:
    def __init__(self) -> None:
        self.recalled_with: list[dict] = []
        self.remembered: list[dict] = []

    async def recall(self, **kwargs):
        self.recalled_with.append(kwargs)
        return [
            {"kind": "fact", "title": "Pricing", "content": "Pro is $29/mo."},
        ]

    async def remember(self, **kwargs):
        self.remembered.append(kwargs)
        return "00000000-0000-0000-0000-000000000999"

    async def aclose(self):
        return


@pytest.fixture(autouse=True)
def patch_brain(monkeypatch):
    fake = FakeBrain()
    import app.runner as runner_mod

    monkeypatch.setattr(runner_mod, "brain", fake)
    return fake


def _req() -> RunRequest:
    return RunRequest(
        goal_id=uuid4(),
        run_id=uuid4(),
        scope=Scope(org_id=uuid4(), role=RoleKind.agent),
        input={
            "subtask": {
                "index": 0,
                "title": "Outline a plan",
                "description": "Outline three steps to grow signups.",
                "input": {"target": 1000, "timeframe": "by July"},
            }
        },
    )


async def test_run_succeeds_and_writes_episode(patch_brain: FakeBrain) -> None:
    req = _req()
    llm = FakeLLM()
    output = await run_agent(req, llm)

    assert output["agent_kind"] == "hermes"
    assert output["model"] == "fake"
    assert output["memory_id"] == "00000000-0000-0000-0000-000000000999"
    assert output["memories_used"] == 1
    assert "FAKE-LLM" in output["summary"]

    # Brain side-effects
    assert len(patch_brain.recalled_with) == 1
    assert "Outline a plan" in patch_brain.recalled_with[0]["query"]
    assert len(patch_brain.remembered) == 1
    assert patch_brain.remembered[0]["kind"] == "episode"
    assert "Hermes:" in patch_brain.remembered[0]["title"]


async def test_llm_timeout_propagates(patch_brain: FakeBrain) -> None:
    """A stuck LLM call should raise (the FastAPI layer turns this into a failed response)."""

    class StuckFake(FakeLLM):
        async def complete(self, *, system: str, user: str) -> str:  # type: ignore[override]
            await asyncio.sleep(999)
            return "should not arrive"

    req = _req()
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(run_agent(req, StuckFake()), timeout=0.2)
