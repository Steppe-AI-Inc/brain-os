"""Business logic: remember / recall / forget."""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.db import db
from app.embeddings import Embedder
from app.graphiti_bridge import push_to_graphiti
from app.models import (
    ForgetRequest,
    ForgetResponse,
    RecallHit,
    RecallRequest,
    RememberRequest,
    RememberResponse,
)
from app.scope import can_role_see, effective_visible_to

log = logging.getLogger("gbrain.memory")


async def remember(req: RememberRequest, embedder: Embedder) -> RememberResponse:
    visible = effective_visible_to(req.visible_to)
    visible_strs = [r.value for r in visible]

    memory_id = uuid4()
    vector = await embedder.embed(req.content)

    await db.insert_memory(
        memory_id=memory_id,
        org_id=req.scope.org_id,
        department_id=req.scope.department_id,
        goal_id=req.scope.goal_id,
        kind=req.kind.value,
        title=req.title,
        content=req.content,
        embedding=vector,
        visible_to=visible_strs,
        metadata=req.metadata,
    )

    await db.write_audit(
        org_id=req.scope.org_id,
        actor_role=req.scope.role.value,
        action="memory.remember",
        target_type="memory",
        target_id=str(memory_id),
        metadata={
            "kind": req.kind.value,
            "department_id": str(req.scope.department_id) if req.scope.department_id else None,
            "goal_id": str(req.scope.goal_id) if req.scope.goal_id else None,
        },
    )

    # Best-effort fan-out to graphiti (temporal knowledge graph). Fire-and-
    # forget; never blocks /remember and never raises.
    asyncio.create_task(  # noqa: RUF006 — intentional fire-and-forget
        push_to_graphiti(
            title=req.title,
            content=req.content,
            org_id=req.scope.org_id,
            department_id=req.scope.department_id,
            goal_id=req.scope.goal_id,
            role=req.scope.role.value,
            metadata={**req.metadata, "memory_id": str(memory_id), "kind": req.kind.value},
        )
    )

    return RememberResponse(memory_id=memory_id)


async def recall(req: RecallRequest, embedder: Embedder) -> list[RecallHit]:
    kinds = [k.value for k in req.kinds] if req.kinds else ["fact", "episode", "document", "conversation"]
    vec = await embedder.embed(req.query)

    rows = await db.search_memories(
        embedding=vec,
        kinds=kinds,
        scope=req.scope,
        limit=req.k,
        min_score=req.min_score,
    )

    return [
        RecallHit(
            memory_id=UUID(str(row["id"])),
            score=row["score"],
            content=row["content"],
            kind=row["kind"],
            title=row["title"],
            metadata=row["metadata"],
        )
        for row in rows
    ]


async def forget(req: ForgetRequest) -> ForgetResponse:
    row = await db.get_memory_for_forget(req.memory_id, req.scope.org_id)
    if row is None:
        raise HTTPException(status_code=404, detail="memory not found")

    await db.delete_memory(req.memory_id, req.scope.org_id)

    await db.write_audit(
        org_id=req.scope.org_id,
        actor_role=req.scope.role.value,
        action="memory.forget",
        target_type="memory",
        target_id=str(req.memory_id),
        metadata={"reason": req.reason},
    )

    return ForgetResponse(ok=True)


# Defensive helper — referenced from routes for symmetry / future use.
__all__ = ["can_role_see", "forget", "recall", "remember"]
