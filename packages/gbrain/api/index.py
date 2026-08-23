"""Vercel Python Function entrypoint — exposes the gbrain FastAPI ASGI app.

Vercel's Python runtime detects the `app` object here and serves it directly;
`vercel.json`'s rewrite sends every path to this one function so FastAPI's own
routing (`/`, `/healthz`, `/remember`, `/recall`, `/forget`) keeps working
unmodified.
"""

from app.main import app  # noqa: F401
