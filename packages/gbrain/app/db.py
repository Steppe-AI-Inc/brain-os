"""Thin Postgres pool around asyncpg + queries gbrain owns.

Embeddings live directly on `brain.memory.embedding` (pgvector) — there is no
separate vector store to keep in sync. Connection pool is sized small
(min 0 / max 1) because gbrain runs as a serverless function: each invocation
gets its own short-lived pool against Supabase's pooled (Supavisor) endpoint,
not one long-lived pool shared across requests the way a persistent process
would use it.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg

from app.config import settings
from app.models import Scope
from app.scope import build_memory_filter


def _vector_literal(vec: list[float]) -> str:
    """pgvector accepts text input like '[0.1,0.2,...]'::vector — no extra client dep needed."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


class DB:
    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=0,
            max_size=1,
            command_timeout=10,
        )

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("DB pool not initialized — call connect() first")
        return self._pool

    # -- queries ------------------------------------------------------------

    async def insert_memory(
        self,
        *,
        memory_id: UUID,
        org_id: UUID,
        department_id: UUID | None,
        goal_id: UUID | None,
        kind: str,
        title: str | None,
        content: str,
        embedding: list[float],
        visible_to: list[str],
        metadata: dict[str, Any],
    ) -> None:
        await self.pool.execute(
            """
            INSERT INTO brain.memory (
              id, org_id, department_id, goal_id, kind,
              title, content, embedding, visible_to, metadata
            )
            VALUES ($1, $2, $3, $4, $5::brain.memory_kind,
                    $6, $7, $8::vector, $9::core.role_kind[], $10::jsonb)
            """,
            memory_id,
            org_id,
            department_id,
            goal_id,
            kind,
            title,
            content,
            _vector_literal(embedding),
            visible_to,
            json.dumps(metadata),
        )

    async def search_memories(
        self,
        *,
        embedding: list[float],
        kinds: list[str],
        scope: Scope,
        limit: int,
        min_score: float | None,
    ) -> list[dict[str, Any]]:
        where_sql, params = build_memory_filter(scope, start_param=1)

        params.append(kinds)
        kind_param = len(params)

        params.append(_vector_literal(embedding))
        vec_param = len(params)

        score_sql = f"1 - (embedding <=> ${vec_param}::vector)"

        min_score_clause = ""
        if min_score is not None:
            params.append(min_score)
            min_score_clause = f" AND {score_sql} >= ${len(params)}"

        params.append(limit)
        limit_param = len(params)

        rows = await self.pool.fetch(
            f"""
            SELECT id, kind, title, content, metadata, {score_sql} AS score
            FROM brain.memory
            WHERE {where_sql}
              AND kind::text = ANY(${kind_param})
              AND embedding IS NOT NULL
              {min_score_clause}
            ORDER BY embedding <=> ${vec_param}::vector
            LIMIT ${limit_param}
            """,
            *params,
        )

        out: list[dict[str, Any]] = []
        for r in rows:
            md = r["metadata"]
            if isinstance(md, str):
                md = json.loads(md)
            out.append(
                {
                    "id": r["id"],
                    "kind": r["kind"],
                    "title": r["title"],
                    "content": r["content"],
                    "metadata": md or {},
                    "score": float(r["score"]),
                }
            )
        return out

    async def get_memory_for_forget(self, memory_id: UUID, org_id: UUID) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(
            "SELECT id, org_id, kind FROM brain.memory WHERE id = $1 AND org_id = $2",
            memory_id,
            org_id,
        )
        if row is None:
            return None
        return {"id": row["id"], "org_id": row["org_id"], "kind": row["kind"]}

    async def delete_memory(self, memory_id: UUID, org_id: UUID) -> None:
        await self.pool.execute(
            "DELETE FROM brain.memory WHERE id = $1 AND org_id = $2",
            memory_id,
            org_id,
        )

    async def write_audit(
        self,
        *,
        org_id: UUID,
        actor_role: str,
        action: str,
        target_type: str,
        target_id: str,
        metadata: dict[str, Any],
    ) -> None:
        await self.pool.execute(
            """
            INSERT INTO core.audit_log
              (org_id, actor_role, action, target_type, target_id, metadata)
            VALUES ($1, $2::core.role_kind, $3, $4, $5, $6::jsonb)
            """,
            org_id,
            actor_role,
            action,
            target_type,
            target_id,
            json.dumps(metadata),
        )


db = DB()
