"""Hermes — FastAPI agent adapter."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI

from app import __kind__, __version__
from app.brain import brain
from app.config import require_runtime_config, settings
from app.llm import LLM, make_llm
from app.models import HealthResponse, RunRequest, RunStateResponse, RunStatus
from app.runner import run as run_agent

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)r}',
)
log = logging.getLogger("hermes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("hermes starting version=%s model=%s env=%s", __version__, settings.model, settings.env)
    # Boot guard — refuses to start without Portkey configured. Tests don't
    # run lifespan, so test-only FakeLLM use stays unaffected.
    require_runtime_config()
    llm: LLM = make_llm()
    app.state.llm = llm
    try:
        yield
    finally:
        log.info("hermes shutting down")
        await brain.aclose()


app = FastAPI(
    title="hermes",
    version=__version__,
    description="Blank Collar — general-purpose workforce agent (adapter contract).",
    lifespan=lifespan,
)


@app.get("/", response_model=HealthResponse, tags=["health"])
@app.get("/healthz", response_model=HealthResponse, tags=["health"])
async def healthz() -> HealthResponse:
    llm: LLM = app.state.llm
    return HealthResponse(
        ok=True,
        version=__version__,
        kind=__kind__,
        model=settings.model,
        provider=llm.name,
    )


@app.post("/run", response_model=RunStateResponse, tags=["agent"])
async def post_run(req: RunRequest) -> RunStateResponse:
    """Synchronous adapter contract: the caller gets the terminal state directly.

    No in-memory run registry, no polling — every Hermes call is one bounded
    recall + LLM completion + remember, well within a serverless function's
    timeout, so there is nothing to persist between the request and its reply.
    """
    started_at = datetime.now(UTC)
    try:
        output = await run_agent(req, app.state.llm)
        return RunStateResponse(
            status=RunStatus.succeeded,
            output=output,
            error=None,
            started_at=started_at.isoformat(),
            finished_at=datetime.now(UTC).isoformat(),
        )
    except Exception as e:
        log.exception("hermes run failed")
        return RunStateResponse(
            status=RunStatus.failed,
            output=None,
            error=str(e),
            started_at=started_at.isoformat(),
            finished_at=datetime.now(UTC).isoformat(),
        )
